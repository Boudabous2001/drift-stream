import { useEffect, useRef, useState } from 'react';
import type { Annotation, NPoint, RemoteCursor, ShapeTool, Tool } from '../lib/types';
import { toNormalized, visibilityAlpha, uid, clamp01 } from '../lib/annotations';

interface Props {
  width: number;
  height: number;
  tool: Tool;
  color: string;
  strokeWidth: number;
  currentTime: number;
  /** Annotations currently visible at `currentTime`. */
  annotations: Annotation[];
  /** All cursors from remote peers. */
  cursors: RemoteCursor[];
  /** When true, every annotation is fully opaque (whiteboard mode, no timeline). */
  alwaysVisible?: boolean;
  onBeginTextEdit?: () => void;
  onCreate: (a: Annotation) => void;
  onUpdate: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
}

type HandleId = 'p1' | 'p2' | 'tl' | 'tr' | 'bl' | 'br';

interface Interaction {
  type: 'draw' | 'move' | 'resize' | 'erase';
  handle?: HandleId;
  startX: number; // normalized pointer at press
  startY: number;
  orig?: Annotation; // clone of the annotation being manipulated
}

interface EditingText {
  id: string | null; // null => creating a new text
  nx: number;
  ny: number;
  value: string;
  color: string;
  strokeWidth: number;
  time: number;
}

const HANDLE_PX = 9; // half-size of a resize handle hit area

/**
 * Canvas overlay sitting on top of the media. Handles:
 *   - rendering visible annotations, the selection outline and remote cursors,
 *   - drawing new shapes (arrow / rect / ellipse / freehand),
 *   - selecting an existing shape to move or resize it (real-time),
 *   - erasing shapes,
 *   - an inline, Canva-style text editor (no browser prompt).
 */
export function AnnotationCanvas({
  width,
  height,
  tool,
  color,
  strokeWidth,
  currentTime,
  annotations,
  cursors,
  alwaysVisible = false,
  onBeginTextEdit,
  onCreate,
  onUpdate,
  onDelete,
  onCursorMove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Annotation | null>(null);
  const overrideRef = useRef<Annotation | null>(null); // live move/resize preview
  const interactionRef = useRef<Interaction | null>(null);
  const erasedRef = useRef<Set<string>>(new Set());
  const lastSentRef = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingText | null>(null);

  // Clear selection when leaving the select tool.
  useEffect(() => {
    if (tool !== 'select') setSelectedId(null);
  }, [tool]);

  // Redraw whenever inputs change.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, annotations, cursors, currentTime, color, strokeWidth, alwaysVisible, selectedId, tool]);

  // Delete the selected annotation with the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /input|textarea/i.test(t.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        onDelete(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onDelete]);

  /** Resolve the on-screen geometry for an annotation (live override wins). */
  function effective(a: Annotation): Annotation {
    const o = overrideRef.current;
    return o && o.id === a.id ? o : a;
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const raw of annotations) {
      const a = effective(raw);
      const alpha = alwaysVisible ? 1 : visibilityAlpha(a, currentTime);
      if (alpha <= 0) continue;
      // The text being edited is hidden behind the textarea overlay.
      if (editing && editing.id === a.id) continue;
      drawAnnotation(ctx, a, width, height, alpha);
    }

    if (draftRef.current) drawAnnotation(ctx, draftRef.current, width, height, 1);

    if (tool === 'select' && selectedId) {
      const sel = annotations.find((a) => a.id === selectedId);
      if (sel) drawSelection(ctx, effective(sel), width, height);
    }

    for (const c of cursors) drawCursor(ctx, c, width, height);
  }

  // --- pointer geometry helpers ------------------------------------------

  function pointFromXY(clientX: number, clientY: number): NPoint {
    const rect = canvasRef.current!.getBoundingClientRect();
    return toNormalized(clientX, clientY, rect);
  }

  function eventPoint(e: React.PointerEvent): NPoint {
    return pointFromXY(e.clientX, e.clientY);
  }

  /** Topmost annotation under a normalized point, or null. */
  function hitTest(p: NPoint): Annotation | null {
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (annotationHit(effective(annotations[i]), p, width, height)) {
        return annotations[i];
      }
    }
    return null;
  }

  /** Which resize handle of the selected annotation is under the point, if any. */
  function handleHit(a: Annotation, p: NPoint): HandleId | null {
    const px = p.x * width;
    const py = p.y * height;
    for (const h of handlePoints(a, width, height)) {
      if (Math.abs(px - h.x) <= HANDLE_PX + 2 && Math.abs(py - h.y) <= HANDLE_PX + 2) {
        return h.id;
      }
    }
    return null;
  }

  // --- pointer handlers ---------------------------------------------------

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = eventPoint(e);

    if (tool === 'eraser') {
      erasedRef.current = new Set();
      const hit = hitTest(p);
      if (hit) {
        erasedRef.current.add(hit.id);
        onDelete(hit.id);
      }
      interactionRef.current = { type: 'erase', startX: p.x, startY: p.y };
      return;
    }

    if (tool === 'select') {
      // 1) handle of the currently selected shape => resize
      if (selectedId) {
        const sel = annotations.find((a) => a.id === selectedId);
        if (sel) {
          const h = handleHit(effective(sel), p);
          if (h) {
            interactionRef.current = {
              type: 'resize',
              handle: h,
              startX: p.x,
              startY: p.y,
              orig: { ...effective(sel) },
            };
            return;
          }
        }
      }
      // 2) body of some shape => select + move
      const hit = hitTest(p);
      if (hit) {
        setSelectedId(hit.id);
        interactionRef.current = {
          type: 'move',
          startX: p.x,
          startY: p.y,
          orig: { ...effective(hit) },
        };
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === 'text') {
      // Open the inline editor at the click position (Canva-style).
      onBeginTextEdit?.();
      openTextEditor(null, p.x, p.y);
      return;
    }

    // drawing tools
    const base: Annotation = {
      id: uid(),
      tool: tool as ShapeTool,
      time: currentTime,
      color,
      strokeWidth,
    };
    if (tool === 'freehand') base.points = [p];
    else {
      base.x1 = p.x;
      base.y1 = p.y;
      base.x2 = p.x;
      base.y2 = p.y;
    }
    draftRef.current = base;
    interactionRef.current = { type: 'draw', startX: p.x, startY: p.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = eventPoint(e);
    onCursorMove(p.x, p.y);

    const it = interactionRef.current;
    if (!it) return;

    if (it.type === 'draw' && draftRef.current) {
      const d = draftRef.current;
      if (d.tool === 'freehand') d.points = [...(d.points ?? []), p];
      else {
        d.x2 = p.x;
        d.y2 = p.y;
      }
      draw();
      return;
    }

    if (it.type === 'erase') {
      const hit = hitTest(p);
      if (hit && !erasedRef.current.has(hit.id)) {
        erasedRef.current.add(hit.id);
        onDelete(hit.id);
      }
      return;
    }

    if ((it.type === 'move' || it.type === 'resize') && it.orig) {
      const dx = p.x - it.startX;
      const dy = p.y - it.startY;
      const next =
        it.type === 'move'
          ? translate(it.orig, dx, dy)
          : resize(it.orig, it.handle!, p);
      overrideRef.current = next;
      draw();
      // Throttle network/optimistic updates while keeping local preview smooth.
      const now = performance.now();
      if (now - lastSentRef.current > 45) {
        lastSentRef.current = now;
        onUpdate(next);
      }
    }
  }

  function onPointerUp() {
    const it = interactionRef.current;
    interactionRef.current = null;

    if (it?.type === 'draw' && draftRef.current) {
      const d = draftRef.current;
      draftRef.current = null;
      if (isMeaningful(d)) {
        onCreate(d);
        if (tool === 'select') setSelectedId(d.id);
      } else {
        draw();
      }
      return;
    }

    if ((it?.type === 'move' || it?.type === 'resize') && overrideRef.current) {
      onUpdate(overrideRef.current);
      overrideRef.current = null;
      // props will reflect the final geometry on the next render
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== 'select') return;
    const p = pointFromXY(e.clientX, e.clientY);
    const hit = hitTest(p);
    if (hit && hit.tool === 'text') {
      onBeginTextEdit?.();
      openTextEditor(hit.id, hit.x1 ?? p.x, hit.y1 ?? p.y, hit.text ?? '', hit.color, hit.strokeWidth);
    }
  }

  // --- inline text editor -------------------------------------------------

  function openTextEditor(
    id: string | null,
    nx: number,
    ny: number,
    value = '',
    c = color,
    sw = strokeWidth,
  ) {
    setEditing({ id, nx, ny, value, color: c, strokeWidth: sw, time: currentTime });
  }

  function commitText() {
    const e = editing;
    if (!e) return;
    setEditing(null);
    const value = e.value.trim();
    if (!value) {
      if (e.id) onDelete(e.id); // cleared text => remove
      return;
    }
    if (e.id) {
      const orig = annotations.find((a) => a.id === e.id);
      onUpdate({
        ...(orig ?? {}),
        id: e.id,
        tool: 'text',
        time: orig?.time ?? e.time,
        color: e.color,
        strokeWidth: e.strokeWidth,
        x1: e.nx,
        y1: e.ny,
        text: value,
      });
    } else {
      onCreate({
        id: uid(),
        tool: 'text',
        time: e.time,
        color: e.color,
        strokeWidth: e.strokeWidth,
        x1: e.nx,
        y1: e.ny,
        text: value,
      });
    }
  }

  const interactive = true;
  const cursorStyle =
    tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair';
  const fontSize = editing ? Math.max(16, editing.strokeWidth * 6) : 16;
  const editorBox = editing
    ? getTextEditorBox(editing.nx, editing.ny, width, height, fontSize)
    : null;

  return (
    <div className="annotation-layer" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className="annotation-canvas"
        style={{
          width,
          height,
          cursor: cursorStyle,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDoubleClick}
      />

      {editing && (
        <textarea
          className="text-editor"
          autoFocus
          value={editing.value}
          style={{
            left: editorBox?.x ?? editing.nx * width,
            top: editorBox?.y ?? editing.ny * height,
            color: editing.color,
            fontSize,
            width: editorBox?.w,
            maxWidth: editorBox?.w,
            minHeight: editorBox?.h,
          }}
          onChange={(ev) => setEditing({ ...editing, value: ev.target.value })}
          onBlur={commitText}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              commitText();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              setEditing(null);
            }
          }}
          placeholder="Écrire…"
        />
      )}
    </div>
  );
}

// --- geometry: translate / resize -----------------------------------------

function translate(a: Annotation, dx: number, dy: number): Annotation {
  if (a.tool === 'freehand') {
    return {
      ...a,
      points: (a.points ?? []).map((p) => ({
        x: clamp01(p.x + dx),
        y: clamp01(p.y + dy),
      })),
    };
  }
  return {
    ...a,
    x1: clamp01((a.x1 ?? 0) + dx),
    y1: clamp01((a.y1 ?? 0) + dy),
    x2: a.x2 !== undefined ? clamp01(a.x2 + dx) : undefined,
    y2: a.y2 !== undefined ? clamp01(a.y2 + dy) : undefined,
  };
}

function resize(a: Annotation, handle: HandleId, p: NPoint): Annotation {
  const x = clamp01(p.x);
  const y = clamp01(p.y);
  const next = { ...a };
  switch (handle) {
    case 'p1':
      next.x1 = x;
      next.y1 = y;
      break;
    case 'p2':
      next.x2 = x;
      next.y2 = y;
      break;
    case 'tl':
      next.x1 = x;
      next.y1 = y;
      break;
    case 'tr':
      next.x2 = x;
      next.y1 = y;
      break;
    case 'bl':
      next.x1 = x;
      next.y2 = y;
      break;
    case 'br':
      next.x2 = x;
      next.y2 = y;
      break;
  }
  return next;
}

function getTextEditorBox(nx: number, ny: number, width: number, height: number, fontSize: number) {
  const margin = 12;
  const preferredWidth = Math.min(360, Math.max(180, width * 0.36));
  const editorHeight = Math.max(56, fontSize * 2.6);
  const rawX = nx * width;
  const rawY = ny * height;

  return {
    x: Math.max(margin, Math.min(rawX, width - preferredWidth - margin)),
    y: Math.max(margin, Math.min(rawY, height - editorHeight - margin)),
    w: Math.max(140, Math.min(preferredWidth, width - margin * 2)),
    h: editorHeight,
  };
}

/** Handle positions (in px) for the selection of an annotation. */
function handlePoints(
  a: Annotation,
  w: number,
  h: number,
): { id: HandleId; x: number; y: number }[] {
  if (a.tool === 'arrow') {
    return [
      { id: 'p1', x: (a.x1 ?? 0) * w, y: (a.y1 ?? 0) * h },
      { id: 'p2', x: (a.x2 ?? 0) * w, y: (a.y2 ?? 0) * h },
    ];
  }
  if (a.tool === 'rect' || a.tool === 'ellipse') {
    const x1 = (a.x1 ?? 0) * w;
    const y1 = (a.y1 ?? 0) * h;
    const x2 = (a.x2 ?? 0) * w;
    const y2 = (a.y2 ?? 0) * h;
    return [
      { id: 'tl', x: x1, y: y1 },
      { id: 'tr', x: x2, y: y1 },
      { id: 'bl', x: x1, y: y2 },
      { id: 'br', x: x2, y: y2 },
    ];
  }
  return []; // freehand / text => move only
}

// --- hit testing ----------------------------------------------------------

function annotationHit(a: Annotation, p: NPoint, w: number, h: number): boolean {
  const tol = 8; // px
  const px = p.x * w;
  const py = p.y * h;
  switch (a.tool) {
    case 'arrow':
      return (
        distToSegment(px, py, (a.x1 ?? 0) * w, (a.y1 ?? 0) * h, (a.x2 ?? 0) * w, (a.y2 ?? 0) * h) <=
        tol + a.strokeWidth
      );
    case 'rect':
    case 'ellipse':
      return pointInRect(px, py, (a.x1 ?? 0) * w, (a.y1 ?? 0) * h, (a.x2 ?? 0) * w, (a.y2 ?? 0) * h, tol);
    case 'text': {
      const fs = Math.max(14, a.strokeWidth * 6);
      const tw = (a.text?.length ?? 0) * fs * 0.6 + 16;
      const x = (a.x1 ?? 0) * w;
      const y = (a.y1 ?? 0) * h;
      return px >= x - 8 && px <= x + tw && py >= y - 6 && py <= y + fs + 8;
    }
    case 'freehand': {
      const pts = a.points ?? [];
      for (let i = 1; i < pts.length; i++) {
        if (
          distToSegment(px, py, pts[i - 1].x * w, pts[i - 1].y * h, pts[i].x * w, pts[i].y * h) <=
          tol + a.strokeWidth
        ) {
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}

function pointInRect(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tol: number,
): boolean {
  const minX = Math.min(x1, x2) - tol;
  const maxX = Math.max(x1, x2) + tol;
  const minY = Math.min(y1, y2) - tol;
  const maxY = Math.max(y1, y2) + tol;
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Reject degenerate shapes (a click without a drag). */
function isMeaningful(a: Annotation): boolean {
  if (a.tool === 'freehand') return (a.points?.length ?? 0) > 1;
  if (a.tool === 'text') return Boolean(a.text);
  const dx = (a.x2 ?? 0) - (a.x1 ?? 0);
  const dy = (a.y2 ?? 0) - (a.y1 ?? 0);
  return Math.hypot(dx, dy) > 0.01;
}

// --- rendering primitives -------------------------------------------------

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  w: number,
  h: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const x1 = (a.x1 ?? 0) * w;
  const y1 = (a.y1 ?? 0) * h;
  const x2 = (a.x2 ?? 0) * w;
  const y2 = (a.y2 ?? 0) * h;

  switch (a.tool) {
    case 'rect':
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, x1, y1, x2, y2, a.strokeWidth);
      break;
    case 'freehand': {
      const pts = a.points ?? [];
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      ctx.stroke();
      break;
    }
    case 'text': {
      const fontSize = Math.max(14, a.strokeWidth * 6);
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const text = a.text ?? '';
      const available = Math.max(80, w - x1 - 16);
      const clipped = clipText(ctx, text, available);
      const metrics = ctx.measureText(clipped);
      const padX = 8;
      const padY = 5;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = 'rgba(10,12,20,0.78)';
      roundRect(ctx, x1 - padX, y1 - padY, metrics.width + padX * 2, fontSize + padY * 2, 6);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = a.color;
      ctx.fillText(clipped, x1, y1);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, a: Annotation, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);

  // bounding outline
  let minX: number, minY: number, maxX: number, maxY: number;
  if (a.tool === 'freehand') {
    const pts = a.points ?? [];
    const xs = pts.map((p) => p.x * w);
    const ys = pts.map((p) => p.y * h);
    minX = Math.min(...xs);
    maxX = Math.max(...xs);
    minY = Math.min(...ys);
    maxY = Math.max(...ys);
  } else if (a.tool === 'text') {
    const fs = Math.max(14, a.strokeWidth * 6);
    const tw = (a.text?.length ?? 0) * fs * 0.6 + 16;
    minX = (a.x1 ?? 0) * w - 8;
    minY = (a.y1 ?? 0) * h - 6;
    maxX = minX + tw + 8;
    maxY = minY + fs + 14;
  } else {
    const x1 = (a.x1 ?? 0) * w;
    const y1 = (a.y1 ?? 0) * h;
    const x2 = (a.x2 ?? 0) * w;
    const y2 = (a.y2 ?? 0) * h;
    minX = Math.min(x1, x2);
    maxX = Math.max(x1, x2);
    minY = Math.min(y1, y2);
    maxY = Math.max(y1, y2);
  }
  ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);

  // handles
  ctx.setLineDash([]);
  for (const hpt of handlePoints(a, w, h)) {
    ctx.beginPath();
    ctx.rect(hpt.x - HANDLE_PX / 2, hpt.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
) {
  const headLen = Math.max(12, strokeWidth * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawCursor(ctx: CanvasRenderingContext2D, c: RemoteCursor, w: number, h: number) {
  const x = clamp01(c.x) * w;
  const y = clamp01(c.y) * h;
  ctx.save();
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x + 5, y + 11);
  ctx.lineTo(x + 11, y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  const label = c.name;
  const wlabel = ctx.measureText(label).width + 12;
  ctx.fillStyle = c.color;
  roundRect(ctx, x + 12, y + 8, wlabel, 18, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 18, y + 18);
  ctx.restore();
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '...';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
