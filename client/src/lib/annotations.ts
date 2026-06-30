import type { Annotation, ExportBundle, Comment, Media, NPoint } from './types';

/** Window (seconds) around an annotation's time during which it is rendered. */
export const ANNOTATION_WINDOW = 3;

let counter = 0;
/** Best-effort unique id (crypto.randomUUID when available). */
export function uid(prefix = 'a'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Format seconds as m:ss (or h:mm:ss past an hour). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Is this annotation visible at the given playback time? */
export function isVisibleAt(annotation: Annotation, time: number): boolean {
  return Math.abs(annotation.time - time) <= ANNOTATION_WINDOW;
}

/** Opacity ramp so annotations fade in/out around their moment. */
export function visibilityAlpha(annotation: Annotation, time: number): number {
  const d = Math.abs(annotation.time - time);
  if (d > ANNOTATION_WINDOW) return 0;
  // Full opacity within 60% of the window, linear fade for the outer 40%.
  const inner = ANNOTATION_WINDOW * 0.6;
  if (d <= inner) return 1;
  return 1 - (d - inner) / (ANNOTATION_WINDOW - inner);
}

/** Convert a pointer event to normalized [0..1] coords inside a rect. */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): NPoint {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return { x: clamp01(x), y: clamp01(y) };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Build the JSON deliverable bundle — the standalone component's primary
 * output per the brief ("Composant autonome exportant les annotations en JSON").
 */
export function buildExport(args: {
  room: string;
  media: Media | null;
  duration: number;
  annotations: Annotation[];
  comments: Comment[];
}): ExportBundle {
  return {
    schema: 'phontom-frame/review-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    room: args.room,
    media: args.media
      ? { ...args.media, duration: args.media.kind === 'video' ? args.duration : undefined }
      : null,
    annotations: [...args.annotations].sort((a, b) => a.time - b.time),
    comments: [...args.comments].sort((a, b) => a.time - b.time),
  };
}

/** Trigger a browser download of the export bundle. */
export function downloadJSON(bundle: ExportBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
