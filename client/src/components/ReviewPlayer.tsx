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
  Film,
  Image,
  PenSquare,
} from 'lucide-react';
import type {
  Annotation,
  Comment,
  Media,
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
import { MediaControls } from './MediaControls';
import { AIMetadataPanel } from './AIMetadataPanel';
import { useHLSPlayer, isHlsSource } from '../hooks/useHLSPlayer';

export interface ReviewPlayerProps {
  room: string;
  media: Media | null;
  isOwner: boolean;
  onSetMedia: (m: Media) => void;
  onRemoveMedia: () => void;
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
 * Phantom Frame — Lecteur de Revue Augmenté.
 *
 * Review surface that renders the room's shared media — a video (with timeline)
 * or a blank whiteboard — with a Canvas annotation overlay, timestamped
 * comments, live cursors and a one-click JSON export. The media itself is
 * managed by the room owner via <MediaControls>.
 */
export function ReviewPlayer(props: ReviewPlayerProps) {
  const {
    room,
    media,
    isOwner,
    onSetMedia,
    onRemoveMedia,
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
  const imageRef = useRef<HTMLImageElement>(null);
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

  const isVideo = media?.kind === 'video';
  const isImage = media?.kind === 'image';
  const isWhiteboard = media?.kind === 'whiteboard';
  const isHls = isVideo && isHlsSource(media?.src);

  // Pôle 2 — attach hls.js on the video ref when the source is an encrypted
  // HLS stream (no-op for plain MP4).
  useHLSPlayer(videoRef, isVideo ? media?.src : null);

  // --- video element wiring (only relevant in video mode) ----------------

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
  }, [isVideo, media?.src]);

  // Reset transport state whenever the media changes.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [media?.kind, media?.src]);

  // Keep the canvas exactly the size of the rendered surface.
  useEffect(() => {
    const el = isVideo ? videoRef.current : isImage ? imageRef.current : stageRef.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [isVideo, isImage, isWhiteboard, media?.src]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return; // no-op for whiteboard / no media
    if (v.paused) {
      // play() returns a promise that rejects if there is no playable source.
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      v.pause();
    }
  }, [isVideo]);

  const seek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v || !isVideo) return;
      v.currentTime = Math.max(0, Math.min(time, v.duration || time));
      setCurrentTime(v.currentTime);
    },
    [isVideo],
  );

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
        case 'g':
          setTool('eraser');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, currentTime, toggleFullscreen, toggleMute]);

  // --- derived data -------------------------------------------------------

  // On images and whiteboards there is no timeline, so every annotation is always shown.
  const visibleAnnotations = useMemo(
    () =>
      isImage || isWhiteboard
        ? annotations
        : annotations.filter((a) => isVisibleAt(a, currentTime)),
    [annotations, currentTime, isImage, isWhiteboard],
  );

  const cursorList = useMemo(() => {
    const now = Date.now();
    return Object.values(cursors).filter(
      (c) => c.peerId !== self?.id && now - c.ts < 4000,
    );
  }, [cursors, self]);

  // --- actions ------------------------------------------------------------

  function handleCreate(a: Annotation) {
    if (isVideo) videoRef.current?.pause();
    onCreateAnnotation(a);
  }

  function handleAddComment(text: string) {
    const mediaTime = isVideo && Number.isFinite(currentTime) ? currentTime : 0;
    const c: Comment = {
      id: uid('c'),
      text,
      time: mediaTime,
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
    const bundle = buildExport({ room, media, duration, annotations, comments });
    const safeRoom = room.replace(/[^a-z0-9-_]+/gi, '-');
    downloadJSON(bundle, `phantom-frame_${safeRoom}_${Date.now()}.json`);
    toast.success(
      `Export JSON · ${annotations.length} annotation(s), ${comments.length} commentaire(s)`,
    );
  }

  const annotationCount = annotations.length;
  const VolIcon = muted || volume === 0 ? VolumeX : Volume2;
  const canAnnotate = Boolean(media);

  return (
    <div className="review-player">
      <div className="stage-col">
        <MediaControls
          media={media}
          isOwner={isOwner}
          onSetMedia={onSetMedia}
          onRemoveMedia={onRemoveMedia}
        />

        {canAnnotate && (
          <Toolbar
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            onClear={handleClear}
          />
        )}

        <div
          className={`stage ${fullscreen ? 'is-fullscreen' : ''} ${
            isWhiteboard ? `whiteboard ${media?.background ?? 'white'}` : ''
          }`}
          ref={stageRef}
        >
          {isVideo && (
            <video
              ref={videoRef}
              className="video"
              /* For HLS, hls.js sets the source via attachMedia — not the src attr. */
              src={isHls ? undefined : media!.src}
              playsInline
            />
          )}

          {isImage && (
            <img
              ref={imageRef}
              className="media-image"
              src={media!.src}
              alt={media?.title || 'Media de revue'}
            />
          )}

          {canAnnotate ? (
            <AnnotationCanvas
              width={size.w}
              height={size.h}
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              currentTime={currentTime}
              annotations={visibleAnnotations}
              cursors={cursorList}
              alwaysVisible={isImage || isWhiteboard}
              onBeginTextEdit={() => {
                if (isVideo) videoRef.current?.pause();
              }}
              onCreate={handleCreate}
              onUpdate={onCreateAnnotation}
              onDelete={onDeleteAnnotation}
              onCursorMove={onCursorMove}
            />
          ) : (
            <MediaPlaceholder isOwner={isOwner} />
          )}

          {isVideo && visibleAnnotations.length > 0 && (
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

          {isWhiteboard && (
            <div className="frame-badge">
              <PenSquare size={13} /> <span>Tableau blanc partagé</span>
            </div>
          )}

          {isImage && (
            <div className="frame-badge">
              <Image size={13} /> <span>Image partagee</span>
            </div>
          )}

          {isVideo && !playing && (
            <button className="big-play" onClick={togglePlay} aria-label="Lecture">
              <Play size={30} fill="currentColor" />
            </button>
          )}
        </div>

        {isVideo && (
          <div className="timeline">
            <button
              className="play-btn"
              onClick={togglePlay}
              title={playing ? 'Pause (espace)' : 'Lecture (espace)'}
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
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
        )}

        {canAnnotate && (
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
        )}

        {!canAnnotate && (
          <div className="actions-bar">
            <PresenceBar peers={peers} self={self} status={status} />
          </div>
        )}
      </div>

      <div className="right-col">
        <AIMetadataPanel
          videoUrl={isVideo && !isHls ? media!.src ?? null : null}
          onSeek={seek}
          onChaptersReady={(anns) => anns.forEach((a) => onCreateAnnotation(a))}
        />
        <CommentsPanel
          comments={comments}
          self={self}
          currentTime={currentTime}
          hasTimeline={isVideo}
          onAdd={(text) => handleAddComment(text)}
          onDelete={onDeleteComment}
          onSeek={seek}
        />
      </div>
    </div>
  );
}

// --- empty state when no media is set -------------------------------------

function MediaPlaceholder({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="media-placeholder">
      <div className="media-placeholder-icons">
        <Film size={30} />
        <PenSquare size={30} />
      </div>
      <h3>Aucun média dans la salle</h3>
      <p>
        {isOwner
          ? 'Chargez une vidéo ou démarrez un tableau blanc depuis la barre ci-dessus.'
          : 'Le propriétaire de la salle n’a pas encore choisi de média.'}
      </p>
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
