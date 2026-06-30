import { useCallback, useEffect, useRef, useState } from 'react';
import type { Annotation, Comment, Peer, RemoteCursor } from './types';

export interface CollabState {
  status: 'connecting' | 'online' | 'offline';
  self: Peer | null;
  peers: Peer[];
  annotations: Annotation[];
  comments: Comment[];
  cursors: Record<string, RemoteCursor>;
}

export interface CollabApi extends CollabState {
  upsertAnnotation: (a: Annotation) => void;
  deleteAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  addComment: (c: Comment) => void;
  deleteComment: (id: string) => void;
  sendCursor: (x: number, y: number) => void;
}

/** Resolve the collab server URL (dev proxy by default, overridable via env). */
function resolveUrl(): string {
  const env = import.meta.env?.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Dev: Vite proxies `/ws` to the Node server (see vite.config.ts).
  return `${proto}://${location.host}/ws`;
}

/**
 * Real-time collaboration over WebSockets.
 *
 * The hook keeps a local mirror of annotations/comments and applies optimistic
 * updates so the UI stays responsive even before the server echoes a change.
 * If the server is unreachable the player still works fully offline (status
 * "offline"); state simply isn't shared.
 */
export function useCollab(roomId: string, name: string): CollabApi {
  const [state, setState] = useState<CollabState>({
    status: 'connecting',
    self: null,
    peers: [],
    annotations: [],
    comments: [],
    cursors: {},
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorThrottle = useRef(0);
  const aliveRef = useRef(true);

  const sendRaw = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    function connect() {
      let ws: WebSocket;
      try {
        ws = new WebSocket(resolveUrl());
      } catch {
        setState((s) => ({ ...s, status: 'offline' }));
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setState((s) => ({ ...s, status: 'online' }));
        ws.send(JSON.stringify({ type: 'join', roomId, name }));
      };

      ws.onclose = () => {
        if (!aliveRef.current) return;
        setState((s) => ({ ...s, status: 'offline' }));
        reconnectRef.current = setTimeout(connect, 1500);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        applyServerMessage(msg, setState);
      };
    }

    connect();

    return () => {
      aliveRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [roomId, name]);

  // --- Optimistic, server-broadcast actions -------------------------------

  const upsertAnnotation = useCallback(
    (a: Annotation) => {
      setState((s) => ({ ...s, annotations: upsert(s.annotations, a) }));
      sendRaw({ type: 'annotation:add', annotation: a });
    },
    [sendRaw],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      setState((s) => ({
        ...s,
        annotations: s.annotations.filter((a) => a.id !== id),
      }));
      sendRaw({ type: 'annotation:delete', id });
    },
    [sendRaw],
  );

  const clearAnnotations = useCallback(() => {
    setState((s) => ({ ...s, annotations: [] }));
    sendRaw({ type: 'annotation:clear' });
  }, [sendRaw]);

  const addComment = useCallback(
    (c: Comment) => {
      setState((s) => ({ ...s, comments: sortByTime([...s.comments, c]) }));
      sendRaw({ type: 'comment:add', comment: c });
    },
    [sendRaw],
  );

  const deleteComment = useCallback(
    (id: string) => {
      setState((s) => ({
        ...s,
        comments: s.comments.filter((c) => c.id !== id),
      }));
      sendRaw({ type: 'comment:delete', id });
    },
    [sendRaw],
  );

  const sendCursor = useCallback(
    (x: number, y: number) => {
      const now = performance.now();
      if (now - cursorThrottle.current < 40) return; // ~25 fps
      cursorThrottle.current = now;
      sendRaw({ type: 'cursor', x, y });
    },
    [sendRaw],
  );

  return {
    ...state,
    upsertAnnotation,
    deleteAnnotation,
    clearAnnotations,
    addComment,
    deleteComment,
    sendCursor,
  };
}

// --- pure helpers ---------------------------------------------------------

function upsert(list: Annotation[], a: Annotation): Annotation[] {
  const i = list.findIndex((x) => x.id === a.id);
  if (i === -1) return [...list, a];
  const next = list.slice();
  next[i] = a;
  return next;
}

function sortByTime<T extends { time: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.time - b.time);
}

function applyServerMessage(
  msg: any,
  setState: React.Dispatch<React.SetStateAction<CollabState>>,
) {
  switch (msg.type) {
    case 'welcome':
      setState((s) => ({
        ...s,
        self: msg.self,
        peers: msg.peers ?? [],
        annotations: msg.annotations ?? [],
        comments: sortByTime(msg.comments ?? []),
      }));
      break;
    case 'presence':
      setState((s) => ({ ...s, peers: msg.peers ?? [] }));
      break;
    case 'annotation:upsert':
      setState((s) => ({ ...s, annotations: upsert(s.annotations, msg.annotation) }));
      break;
    case 'annotation:delete':
      setState((s) => ({
        ...s,
        annotations: s.annotations.filter((a) => a.id !== msg.id),
      }));
      break;
    case 'annotation:clear':
      setState((s) => ({ ...s, annotations: [] }));
      break;
    case 'comment:add':
      setState((s) => {
        if (s.comments.some((c) => c.id === msg.comment.id)) return s;
        return { ...s, comments: sortByTime([...s.comments, msg.comment]) };
      });
      break;
    case 'comment:delete':
      setState((s) => ({
        ...s,
        comments: s.comments.filter((c) => c.id !== msg.id),
      }));
      break;
    case 'cursor':
      setState((s) => ({
        ...s,
        cursors: {
          ...s.cursors,
          [msg.peerId]: {
            peerId: msg.peerId,
            name: msg.name,
            color: msg.color,
            x: msg.x,
            y: msg.y,
            ts: Date.now(),
          },
        },
      }));
      break;
    case 'peer:left':
      setState((s) => {
        const cursors = { ...s.cursors };
        delete cursors[msg.peerId];
        return { ...s, cursors };
      });
      break;
    default:
      break;
  }
}
