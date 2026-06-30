import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  Comment,
  Peer,
  RemoteCursor,
  Tool,
} from '../lib/types';
import {
  ANNOTATION_WINDOW,
  buildExport,
  downloadJSON,
  formatTime,
  isVisibleAt,
  uid,
} from '../lib/annotations';
import { AnnotationCanvas } from './AnnotationCanvas';
import { Toolbar } from './Toolbar';
import { CommentsPanel } from './CommentsPanel';
import { PresenceBar } from './PresenceBar';

export interface ReviewPlayerProps {
  /** Video source URL (mp4, webm…). */
  src: string;
  /** Room / session identifier (used for export + collab). */
  room: string;
  /** Collaboration data + actions (injected; the component itself is UI-only). */
  annotations: Annotation[];
  comments: Comment[];
  peers: Peer[];
  self: Peer | null;
  cursors: Record<string, RemoteCursor>;
  status: 'connecting' | 'online' | 'offline';
  onCreateAnnotation: (a: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onClearAnnotations: () => void;
  onAddComment: (c: Comment) => void;
  onDeleteComment: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
}

/**
 * Drift Stream — Lecteur de Revue Augmenté.
 *
 * Self-contained review surface: an HTML5 video with a Canvas annotation
 * overlay, timestamped comments, live collaboration cursors, and a one-click
 * JSON export of the whole review (the brief's deliverable).
 *
 * It is intentionally presentational: all shared state arrives via props so the
 * same component can run standalone (local arrays) or wired to the WebSocket
 * collaboration layer.
 */
export function ReviewPlayer(props: ReviewPlayerProps) {
  const {
    src,
    room,
    annotations,
    comments,
    peers,
    self,
    cursors,
    status,
    onCreateAnnotation,
    onDeleteAnnotation,
    onClearAnnotations,
    onAddComment,
    onDeleteComment,
    onCursorMove,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#ff5c7c');
  const [strokeWidth, setStrokeWidth] = useState(3);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [size, setSize] = useState({ w: 640, h: 360 });

  // --- video element wiring ----------------------------------------------

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, []);

  // Keep the canvas exactly the size of the rendered video.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: v.clientWidth, h: v.clientHeight });
    });
    ro.observe(v);
    setSize({ w: v.clientWidth, h: v.clientHeight });
    return () => ro.disconnect();
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || time));
    setCurrentTime(v.currentTime);
  }, []);

  // Keyboard shortcuts: space=play/pause, ←/→ frame-ish seek, tool hotkeys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /input|textarea/i.test(target.tagName)) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seek(currentTime - 5);
          break;
        case 'ArrowRight':
          seek(currentTime + 5);
          break;
        case 'v':
          setTool('select');
          break;
        case 'a':
          setTool('arrow');
          break;
        case 'r':
          setTool('rect');
          break;
        case 'e':
          setTool('ellipse');
          break;
        case 'p':
          setTool('freehand');
          break;
        case 't':
          setTool('text');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, currentTime]);

  // --- derived data -------------------------------------------------------

  const visibleAnnotations = useMemo(
    () => annotations.filter((a) => isVisibleAt(a, currentTime)),
    [annotations, currentTime],
  );

  const cursorList = useMemo(() => {
    const now = Date.now();
    return Object.values(cursors).filter(
      (c) => c.peerId !== self?.id && now - c.ts < 4000,
    );
  }, [cursors, self]);

  // --- actions ------------------------------------------------------------

  function handleCreate(a: Annotation) {
    // Pause so the annotation pins to a stable frame, and auto-switch to select.
    videoRef.current?.pause();
    onCreateAnnotation(a);
  }

  function handleAddComment(text: string) {
    const c: Comment = {
      id: uid('c'),
      text,
      time: currentTime,
      authorId: self?.id,
      authorName: self?.name,
      color: self?.color,
      createdAt: Date.now(),
    };
    onAddComment(c);
  }

  function handleExport() {
    const bundle = buildExport({
      room,
      src,
      duration,
      annotations,
      comments,
    });
    const safeRoom = room.replace(/[^a-z0-9-_]+/gi, '-');
    downloadJSON(bundle, `drift-stream_${safeRoom}_${Date.now()}.json`);
  }

  const annotationCount = annotations.length;

  return (
    <div className="review-player">
      <div className="stage-col">
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          onClear={onClearAnnotations}
        />

        <div className="stage" ref={stageRef}>
          <video
            ref={videoRef}
            className="video"
            src={src}
            playsInline
            onClick={() => tool === 'select' && togglePlay()}
          />
          <AnnotationCanvas
            width={size.w}
            height={size.h}
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            currentTime={currentTime}
            annotations={visibleAnnotations}
            cursors={cursorList}
            onCreate={handleCreate}
            onCursorMove={onCursorMove}
            promptText={() => window.prompt('Texte de l’annotation :')}
          />
          {visibleAnnotations.length > 0 && (
            <div className="frame-badge">
              <span>
                {visibleAnnotations.length} annotation
                {visibleAnnotations.length > 1 ? 's' : ''} · ±{ANNOTATION_WINDOW}s
              </span>
              <button
                className="frame-badge-del"
                title="Effacer les annotations de cet instant"
                onClick={() =>
                  visibleAnnotations.forEach((a) => onDeleteAnnotation(a.id))
                }
              >
                ×
              </button>
            </div>
          )}
        </div>

        <Timeline
          duration={duration}
          currentTime={currentTime}
          playing={playing}
          annotations={annotations}
          comments={comments}
          onTogglePlay={togglePlay}
          onSeek={seek}
        />

        <div className="actions-bar">
          <PresenceBar peers={peers} self={self} status={status} />
          <div className="actions-right">
            <span className="counter" title="Annotations dans la revue">
              ✎ {annotationCount}
            </span>
            <button className="export-btn" onClick={handleExport}>
              ⬇ Exporter JSON
            </button>
          </div>
        </div>
      </div>

      <CommentsPanel
        comments={comments}
        self={self}
        currentTime={currentTime}
        onAdd={(text) => handleAddComment(text)}
        onDelete={onDeleteComment}
        onSeek={seek}
      />
    </div>
  );
}

// --- timeline / scrub bar with annotation + comment markers ---------------

interface TimelineProps {
  duration: number;
  currentTime: number;
  playing: boolean;
  annotations: Annotation[];
  comments: Comment[];
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
}

function Timeline({
  duration,
  currentTime,
  playing,
  annotations,
  comments,
  onTogglePlay,
  onSeek,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  function seekFromEvent(clientX: number) {
    const el = trackRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  return (
    <div className="timeline">
      <button
        className="play-btn"
        onClick={onTogglePlay}
        title={playing ? 'Pause (espace)' : 'Lecture (espace)'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <div
        className="track"
        ref={trackRef}
        onPointerDown={(e) => seekFromEvent(e.clientX)}
      >
        <div className="track-fill" style={{ width: `${pct}%` }} />
        <div className="track-head" style={{ left: `${pct}%` }} />

        {duration > 0 &&
          annotations.map((a) => (
            <span
              key={a.id}
              className="marker annotation"
              style={{ left: `${(a.time / duration) * 100}%`, background: a.color }}
              title={`Annotation @ ${formatTime(a.time)}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSeek(a.time);
              }}
            />
          ))}

        {duration > 0 &&
          comments.map((c) => (
            <span
              key={c.id}
              className="marker comment"
              style={{ left: `${(c.time / duration) * 100}%` }}
              title={`💬 ${c.authorName ?? ''} @ ${formatTime(c.time)}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSeek(c.time);
              }}
            />
          ))}
      </div>

      <div className="time-label">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}
