import { useEffect, useRef } from 'react';
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
  onCreate: (a: Annotation) => void;
  onCursorMove: (x: number, y: number) => void;
  /** Notify parent that a text annotation needs a label (returns text or null). */
  promptText: () => string | null;
}

/**
 * Canvas overlay sitting on top of the <video>. Handles:
 *   - rendering visible annotations + remote cursors (Canvas 2D API),
 *   - capturing pointer input to draw new shapes,
 *   - emitting normalized geometry so drawings track the video on resize.
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
  onCreate,
  onCursorMove,
  promptText,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Annotation | null>(null);
  const drawingRef = useRef(false);

  // Redraw whenever inputs change.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, annotations, cursors, currentTime, color, strokeWidth, alwaysVisible]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle HiDPI crispness.
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const a of annotations) {
      const alpha = alwaysVisible ? 1 : visibilityAlpha(a, currentTime);
      if (alpha <= 0) continue;
      drawAnnotation(ctx, a, width, height, alpha);
    }

    if (draftRef.current) {
      drawAnnotation(ctx, draftRef.current, width, height, 1);
    }

    for (const c of cursors) {
      drawCursor(ctx, c, width, height);
    }
  }

  // --- pointer handling ---------------------------------------------------

  function eventPoint(e: React.PointerEvent): NPoint {
    const rect = canvasRef.current!.getBoundingClientRect();
    return toNormalized(e.clientX, e.clientY, rect);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (tool === 'select') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = eventPoint(e);

    if (tool === 'text') {
      const text = promptText();
      if (text) {
        onCreate({
          id: uid(),
          tool: 'text',
          time: currentTime,
          color,
          strokeWidth,
          x1: p.x,
          y1: p.y,
          text,
        });
      }
      return;
    }

    drawingRef.current = true;
    const base: Annotation = {
      id: uid(),
      tool: tool as ShapeTool,
      time: currentTime,
      color,
      strokeWidth,
    };
    if (tool === 'freehand') {
      base.points = [p];
    } else {
      base.x1 = p.x;
      base.y1 = p.y;
      base.x2 = p.x;
      base.y2 = p.y;
    }
    draftRef.current = base;
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = eventPoint(e);
    onCursorMove(p.x, p.y);

    if (!drawingRef.current || !draftRef.current) return;
    const d = draftRef.current;
    if (d.tool === 'freehand') {
      d.points = [...(d.points ?? []), p];
    } else {
      d.x2 = p.x;
      d.y2 = p.y;
    }
    draw();
  }

  function onPointerUp() {
    if (!drawingRef.current || !draftRef.current) {
      drawingRef.current = false;
      return;
    }
    drawingRef.current = false;
    const d = draftRef.current;
    draftRef.current = null;

    if (isMeaningful(d)) {
      onCreate(d);
    } else {
      draw(); // discard the tiny/empty draft
    }
  }

  const interactive = tool !== 'select';

  return (
    <canvas
      ref={canvasRef}
      className="annotation-canvas"
      style={{
        width,
        height,
        cursor: interactive ? 'crosshair' : 'default',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
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
      ctx.strokeRect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1),
      );
      break;
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.abs(x2 - x1) / 2,
        Math.abs(y2 - y1) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case 'arrow':
      drawArrow(ctx, x1, y1, x2, y2, a.strokeWidth);
      break;
    case 'freehand': {
      const pts = a.points ?? [];
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      const fontSize = Math.max(14, a.strokeWidth * 6);
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const tx = x1;
      const ty = y1;
      const metrics = ctx.measureText(a.text ?? '');
      const padX = 8;
      const padY = 5;
      // chip background for legibility
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = 'rgba(10,12,20,0.78)';
      roundRect(
        ctx,
        tx - padX,
        ty - padY,
        metrics.width + padX * 2,
        fontSize + padY * 2,
        6,
      );
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = a.color;
      ctx.fillText(a.text ?? '', tx, ty);
      break;
    }
    default:
      break;
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
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  c: RemoteCursor,
  w: number,
  h: number,
) {
  const x = clamp01(c.x) * w;
  const y = clamp01(c.y) * h;
  ctx.save();
  // pointer triangle
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x + 5, y + 11);
  ctx.lineTo(x + 11, y + 11);
  ctx.closePath();
  ctx.fill();
  // name label
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
