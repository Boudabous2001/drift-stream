/** Shared domain types for Drift Stream. */

export type ShapeTool = 'arrow' | 'rect' | 'ellipse' | 'freehand' | 'text';
export type Tool = ShapeTool | 'select' | 'eraser';

/** A point expressed in normalized coordinates (0..1) relative to the video frame. */
export interface NPoint {
  x: number;
  y: number;
}

/**
 * A drawn annotation, pinned to a moment of the video (`time`, in seconds).
 * Geometry is stored normalized so it survives any player size / resize.
 */
export interface Annotation {
  id: string;
  tool: ShapeTool;
  time: number;
  color: string;
  strokeWidth: number;
  /** Endpoints for arrow/rect/ellipse (normalized). */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** Path for freehand (normalized). */
  points?: NPoint[];
  /** Text content + anchor for the text tool. */
  text?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** A timestamped comment, anchored to a video time and optionally to an annotation. */
export interface Comment {
  id: string;
  text: string;
  time: number;
  annotationId?: string | null;
  authorId?: string;
  authorName?: string;
  color?: string;
  createdAt?: number;
}

/** A connected collaborator. */
export interface Peer {
  id: string;
  name: string;
  color: string;
}

export type MediaKind = 'video' | 'whiteboard';

/** The room's shared media surface (owner-managed). */
export interface Media {
  kind: MediaKind;
  /** Video source URL (when kind === 'video'). */
  src?: string;
  title?: string;
  /** Whiteboard background (when kind === 'whiteboard'): 'white' | 'dark'. */
  background?: 'white' | 'dark';
}

/** Live (ephemeral) cursor position broadcast by a peer. */
export interface RemoteCursor {
  peerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  ts: number;
}

/** Shape of the exported deliverable (annotations + comments as JSON). */
export interface ExportBundle {
  schema: 'drift-stream/review-export';
  version: 1;
  exportedAt: string;
  room: string;
  media: (Media & { duration?: number }) | null;
  annotations: Annotation[];
  comments: Comment[];
}
