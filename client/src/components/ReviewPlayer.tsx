import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  PenLine,
  X,
} from 'lucide-react';
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
  src: string;
  room: string;
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
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // --- video element wiring ----------------------------------------------

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('volumechange', onVol);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('volumechange', onVol);
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

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
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

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const setVol = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  // Keyboard shortcuts.
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
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
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
  }, [togglePlay, seek, currentTime, toggleFullscreen, toggleMute]);

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
    toast.success('Commentaire ajouté');
  }

  function handleClear() {
    if (annotations.length === 0) return;
    onClearAnnotations();
    toast('Annotations effacées', { icon: '🧹' });
  }

  function handleExport() {
    const bundle = buildExport({ room, src, duration, annotations, comments });
    const safeRoom = room.replace(/[^a-z0-9-_]+/gi, '-');
    downloadJSON(bundle, `drift-stream_${safeRoom}_${Date.now()}.json`);
    toast.success(
      `Export JSON · ${annotations.length} annotation(s), ${comments.length} commentaire(s)`,
    );
  }

  const annotationCount = annotations.length;
  const VolIcon = muted || volume === 0 ? VolumeX : Volume2;

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
          onClear={handleClear}
        />

        <div className={`stage ${fullscreen ? 'is-fullscreen' : ''}`} ref={stageRef}>
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
            <motion.div
              className="frame-badge"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <PenLine size={13} />
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
                <X size={13} />
              </button>
            </motion.div>
          )}

          {!playing && (
            <button className="big-play" onClick={togglePlay} aria-label="Lecture">
              <Play size={30} fill="currentColor" />
            </button>
          )}
        </div>

        <div className="timeline">
          <button
            className="play-btn"
            onClick={togglePlay}
            title={playing ? 'Pause (espace)' : 'Lecture (espace)'}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>

          <button className="ctrl-btn" onClick={() => seek(currentTime - 5)} title="-5s (←)">
            <Rewind size={17} />
          </button>
          <button className="ctrl-btn" onClick={() => seek(currentTime + 5)} title="+5s (→)">
            <FastForward size={17} />
          </button>

          <Track
            duration={duration}
            currentTime={currentTime}
            annotations={annotations}
            comments={comments}
            onSeek={seek}
          />

          <div className="time-label">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div className="volume">
            <button className="ctrl-btn" onClick={toggleMute} title="Muet (M)">
              <VolIcon size={17} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
            />
          </div>

          <button className="ctrl-btn" onClick={toggleFullscreen} title="Plein écran (F)">
            {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>

        <div className="actions-bar">
          <PresenceBar peers={peers} self={self} status={status} />
          <div className="actions-right">
            <span className="counter" title="Annotations dans la revue">
              <PenLine size={14} /> {annotationCount}
            </span>
            <motion.button
              className="export-btn"
              onClick={handleExport}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Download size={16} /> Exporter JSON
            </motion.button>
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

// --- scrub track with annotation + comment markers ------------------------

interface TrackProps {
  duration: number;
  currentTime: number;
  annotations: Annotation[];
  comments: Comment[];
  onSeek: (t: number) => void;
}

function Track({ duration, currentTime, annotations, comments, onSeek }: TrackProps) {
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
            title={`${c.authorName ?? ''} @ ${formatTime(c.time)}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSeek(c.time);
            }}
          />
        ))}
    </div>
  );
}
