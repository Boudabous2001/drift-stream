/**
 * Drift Stream — WebSocket collaboration server
 * Hackathon ESTIAM x 42C 2026 — Pôle 1 / Sujet A "Lecteur de Revue Augmenté"
 *
 * Responsibilities:
 *   - Room-based collaboration (a review session = a room).
 *   - Real-time broadcast of canvas annotations and timestamped comments.
 *   - Presence (who is in the room, live cursors).
 *   - State sync: a peer joining a room receives the full current state.
 *
 * The server is intentionally in-memory and dependency-light (only `ws`):
 * it must be reproducible locally with `npm install && npm start`.
 */

import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;

/**
 * @typedef {Object} Room
 * @property {Map<string, object>} annotations  id -> annotation
 * @property {Array<object>}       comments      ordered list of comments
 * @property {Map<import('ws').WebSocket, object>} peers  socket -> peer meta
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

const COLORS = [
  '#ff5c7c', '#36c5f0', '#2eb67d', '#ecb22e',
  '#a970ff', '#ff8c42', '#19c3b1', '#f15bb5',
];

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      annotations: new Map(),
      comments: [],
      peers: new Map(),
      ownerId: null, // first joiner becomes owner; promoted on owner leave
      media: null, // { kind: 'video'|'whiteboard', src?, title?, background? }
    };
    rooms.set(roomId, room);
  }
  return room;
}

/** Sanitize a media descriptor sent by a client (owner). */
function sanitizeMedia(media) {
  if (!media || typeof media !== 'object') return null;
  if (media.kind === 'whiteboard') {
    const bg = ['white', 'dark'].includes(media.background)
      ? media.background
      : 'white';
    return { kind: 'whiteboard', background: bg };
  }
  if (media.kind === 'video') {
    const src = String(media.src || '').slice(0, 2000);
    if (!src) return null;
    return { kind: 'video', src, title: String(media.title || '').slice(0, 120) };
  }
  return null;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/** Broadcast to everyone in the room, optionally excluding one socket. */
function broadcast(room, payload, except) {
  const data = JSON.stringify(payload);
  for (const peerWs of room.peers.keys()) {
    if (peerWs !== except && peerWs.readyState === peerWs.OPEN) {
      peerWs.send(data);
    }
  }
}

function roster(room) {
  return [...room.peers.values()].map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }));
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  /** Per-connection state, populated on `join`. */
  ws.meta = { id: randomUUID(), roomId: null };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed frames
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => handleLeave(ws));
  ws.on('error', () => handleLeave(ws));
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'join':
      return handleJoin(ws, msg);
    case 'annotation:add':
    case 'annotation:update':
      return handleAnnotationUpsert(ws, msg);
    case 'annotation:delete':
      return handleAnnotationDelete(ws, msg);
    case 'annotation:clear':
      return handleAnnotationClear(ws);
    case 'media:set':
      return handleMediaSet(ws, msg);
    case 'media:remove':
      return handleMediaRemove(ws);
    case 'comment:add':
      return handleCommentAdd(ws, msg);
    case 'comment:delete':
      return handleCommentDelete(ws, msg);
    case 'cursor':
      return handleCursor(ws, msg);
    case 'playback':
      return handlePlayback(ws, msg);
    default:
      // Unknown type: ignore but stay connected.
      return;
  }
}

function handleJoin(ws, msg) {
  const roomId = String(msg.roomId || 'lobby');
  const room = getRoom(roomId);
  const color = COLORS[room.peers.size % COLORS.length];
  const peer = {
    id: ws.meta.id,
    name: (msg.name && String(msg.name).slice(0, 40)) || 'Invité',
    color,
  };
  ws.meta.roomId = roomId;
  room.peers.set(ws, peer);

  // The first participant in a fresh room becomes its owner.
  if (!room.ownerId) room.ownerId = peer.id;

  // 1) Acknowledge the joiner with its identity + full room state.
  send(ws, {
    type: 'welcome',
    self: peer,
    roomId,
    ownerId: room.ownerId,
    media: room.media,
    annotations: [...room.annotations.values()],
    comments: room.comments,
    peers: roster(room),
  });

  // 2) Tell everyone else about the new peer + updated roster.
  broadcast(room, { type: 'presence', peers: roster(room), ownerId: room.ownerId }, ws);
  broadcast(room, { type: 'peer:joined', peer }, ws);
}

function isOwner(ws, room) {
  return room && room.ownerId === ws.meta?.id;
}

function handleMediaSet(ws, msg) {
  const room = currentRoom(ws);
  if (!room || !isOwner(ws, room)) return; // owner-only
  const media = sanitizeMedia(msg.media);
  if (!media) return;
  room.media = media;
  // Switching the source invalidates the previous annotations/comments.
  room.annotations.clear();
  room.comments = [];
  broadcast(room, { type: 'media:update', media: room.media });
  broadcast(room, { type: 'annotation:clear' });
}

function handleMediaRemove(ws) {
  const room = currentRoom(ws);
  if (!room || !isOwner(ws, room)) return; // owner-only
  room.media = null;
  room.annotations.clear();
  room.comments = [];
  broadcast(room, { type: 'media:update', media: null });
  broadcast(room, { type: 'annotation:clear' });
}

function currentRoom(ws) {
  if (!ws.meta?.roomId) return null;
  return rooms.get(ws.meta.roomId) || null;
}

function handleAnnotationUpsert(ws, msg) {
  const room = currentRoom(ws);
  if (!room || !msg.annotation || !msg.annotation.id) return;
  const peer = room.peers.get(ws);
  const annotation = {
    ...msg.annotation,
    authorId: peer?.id,
    authorName: peer?.name,
    color: msg.annotation.color || peer?.color,
    updatedAt: Date.now(),
  };
  room.annotations.set(annotation.id, annotation);
  broadcast(room, { type: 'annotation:upsert', annotation });
}

function handleAnnotationDelete(ws, msg) {
  const room = currentRoom(ws);
  if (!room || !msg.id) return;
  room.annotations.delete(msg.id);
  broadcast(room, { type: 'annotation:delete', id: msg.id });
}

function handleAnnotationClear(ws) {
  const room = currentRoom(ws);
  if (!room) return;
  room.annotations.clear();
  broadcast(room, { type: 'annotation:clear' });
}

function handleCommentAdd(ws, msg) {
  const room = currentRoom(ws);
  if (!room || !msg.comment) return;
  const peer = room.peers.get(ws);
  const comment = {
    id: msg.comment.id || randomUUID(),
    text: String(msg.comment.text || '').slice(0, 2000),
    time: Number(msg.comment.time) || 0, // video timestamp (seconds)
    annotationId: msg.comment.annotationId || null,
    authorId: peer?.id,
    authorName: peer?.name,
    color: peer?.color,
    createdAt: Date.now(),
  };
  if (!comment.text) return;
  room.comments.push(comment);
  room.comments.sort((a, b) => a.time - b.time);
  broadcast(room, { type: 'comment:add', comment });
}

function handleCommentDelete(ws, msg) {
  const room = currentRoom(ws);
  if (!room || !msg.id) return;
  room.comments = room.comments.filter((c) => c.id !== msg.id);
  broadcast(room, { type: 'comment:delete', id: msg.id });
}

function handleCursor(ws, msg) {
  const room = currentRoom(ws);
  if (!room) return;
  const peer = room.peers.get(ws);
  if (!peer) return;
  // Live cursors are ephemeral; never stored, broadcast to others only.
  broadcast(
    room,
    {
      type: 'cursor',
      peerId: peer.id,
      name: peer.name,
      color: peer.color,
      x: msg.x,
      y: msg.y,
    },
    ws,
  );
}

function handlePlayback(ws, msg) {
  // Optional "follow the presenter" hint: relay play/pause/seek to peers.
  const room = currentRoom(ws);
  if (!room) return;
  const peer = room.peers.get(ws);
  broadcast(
    room,
    { type: 'playback', peerId: peer?.id, action: msg.action, time: msg.time },
    ws,
  );
}

function handleLeave(ws) {
  const room = currentRoom(ws);
  if (!room) return;
  const peer = room.peers.get(ws);
  room.peers.delete(ws);

  // If the owner left, promote the next (oldest) remaining participant.
  if (peer && room.ownerId === peer.id) {
    const next = room.peers.values().next().value;
    room.ownerId = next ? next.id : null;
  }

  if (peer) {
    broadcast(room, { type: 'presence', peers: roster(room), ownerId: room.ownerId });
    broadcast(room, { type: 'peer:left', peerId: peer.id });
  }
  // Garbage-collect empty rooms after a short grace period so refreshes
  // don't wipe annotations instantly.
  if (room.peers.size === 0) {
    setTimeout(() => {
      const r = rooms.get(ws.meta.roomId);
      if (r && r.peers.size === 0) rooms.delete(ws.meta.roomId);
    }, 5 * 60 * 1000);
  }
}

// eslint-disable-next-line no-console
console.log(`🎬 Drift Stream collab server listening on ws://localhost:${PORT}`);
