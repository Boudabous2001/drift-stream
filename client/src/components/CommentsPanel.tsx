import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, Send, Trash2, Clock } from 'lucide-react';
import type { Comment, Peer } from '../lib/types';
import { formatTime } from '../lib/annotations';

interface Props {
  comments: Comment[];
  self: Peer | null;
  currentTime: number;
  hasTimeline: boolean;
  onAdd: (text: string, atCurrentTime: boolean) => void;
  onDelete: (id: string) => void;
  onSeek: (time: number) => void;
}

export function CommentsPanel({
  comments,
  self,
  currentTime,
  hasTimeline,
  onAdd,
  onDelete,
  onSeek,
}: Props) {
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (hasTimeline) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [hasTimeline]);

  const sorted = useMemo(
    () =>
      [...comments].sort((a, b) =>
        hasTimeline ? a.time - b.time : (a.createdAt ?? 0) - (b.createdAt ?? 0),
      ),
    [comments, hasTimeline],
  );

  const activeId = useMemo(() => {
    if (!hasTimeline) return null;
    let best: Comment | null = null;
    for (const c of sorted) {
      if (c.time <= currentTime + 0.25) best = c;
    }
    return best?.id ?? null;
  }, [sorted, currentTime, hasTimeline]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAdd(text, true);
    setDraft('');
    if (!hasTimeline) setNow(Date.now());
  }

  return (
    <aside className="comments-panel">
      <header className="comments-header">
        <h2>
          <MessageSquare size={16} /> Commentaires
        </h2>
        <span className="badge">{comments.length}</span>
      </header>

      <div className="comments-list">
        {sorted.length === 0 && (
          <div className="empty">
            <MessageSquare size={26} strokeWidth={1.5} />
            <p>
              Aucun commentaire pour l'instant.
              <br />
              Ajoutez une remarque horodatee.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {sorted.map((c) => (
            <motion.article
              key={c.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`comment ${c.id === activeId ? 'active' : ''}`}
              style={{ ['--c' as string]: c.color }}
            >
              {hasTimeline ? (
                <button
                  className="comment-time"
                  onClick={() => onSeek(c.time)}
                  title="Aller a ce moment"
                >
                  <Clock size={12} />
                  {formatTime(c.time)}
                </button>
              ) : (
                <span className="comment-time" title="Heure d'envoi">
                  <Clock size={12} />
                  {formatClock(c.createdAt)}
                </span>
              )}
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="dot" style={{ background: c.color }} />
                  <strong>{c.authorName ?? 'Invite'}</strong>
                </div>
                <p>{c.text}</p>
              </div>
              {self && c.authorId === self.id && (
                <button
                  className="comment-del"
                  title="Supprimer"
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      <form className="comment-form" onSubmit={submit}>
        <div className="comment-form-time">
          <Clock size={12} /> a {hasTimeline ? formatTime(currentTime) : formatClock(now)}
        </div>
        <div className="comment-input-row">
          <textarea
            value={draft}
            placeholder="Commenter cet instant...  (Entree pour envoyer)"
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button type="submit" disabled={!draft.trim()} title="Envoyer">
            <Send size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}

function formatClock(value?: number): string {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
