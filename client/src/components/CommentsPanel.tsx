import { useMemo, useState } from 'react';
import type { Comment, Peer } from '../lib/types';
import { formatTime } from '../lib/annotations';

interface Props {
  comments: Comment[];
  self: Peer | null;
  currentTime: number;
  onAdd: (text: string, atCurrentTime: boolean) => void;
  onDelete: (id: string) => void;
  onSeek: (time: number) => void;
}

/**
 * Timestamped comments thread. Each comment is anchored to a video time;
 * clicking it seeks the player there. New comments default to the current
 * playback position (the core "review" interaction).
 */
export function CommentsPanel({
  comments,
  self,
  currentTime,
  onAdd,
  onDelete,
  onSeek,
}: Props) {
  const [draft, setDraft] = useState('');

  const sorted = useMemo(
    () => [...comments].sort((a, b) => a.time - b.time),
    [comments],
  );

  // Which comment is "active" relative to the playhead.
  const activeId = useMemo(() => {
    let best: Comment | null = null;
    for (const c of sorted) {
      if (c.time <= currentTime + 0.25) best = c;
    }
    return best?.id ?? null;
  }, [sorted, currentTime]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAdd(text, true);
    setDraft('');
  }

  return (
    <aside className="comments-panel">
      <header className="comments-header">
        <h2>Commentaires</h2>
        <span className="badge">{comments.length}</span>
      </header>

      <div className="comments-list">
        {sorted.length === 0 && (
          <p className="empty">
            Aucun commentaire. Mettez la vidéo en pause et ajoutez une remarque
            horodatée 👇
          </p>
        )}
        {sorted.map((c) => (
          <article
            key={c.id}
            className={`comment ${c.id === activeId ? 'active' : ''}`}
          >
            <button
              className="comment-time"
              style={{ color: c.color }}
              onClick={() => onSeek(c.time)}
              title="Aller à ce moment"
            >
              {formatTime(c.time)}
            </button>
            <div className="comment-body">
              <div className="comment-meta">
                <span className="dot" style={{ background: c.color }} />
                <strong>{c.authorName ?? 'Invité'}</strong>
              </div>
              <p>{c.text}</p>
            </div>
            {self && c.authorId === self.id && (
              <button
                className="comment-del"
                title="Supprimer"
                onClick={() => onDelete(c.id)}
              >
                ×
              </button>
            )}
          </article>
        ))}
      </div>

      <form className="comment-form" onSubmit={submit}>
        <div className="comment-form-time">@ {formatTime(currentTime)}</div>
        <textarea
          value={draft}
          placeholder="Ajouter un commentaire à cet instant…"
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <button type="submit" disabled={!draft.trim()}>
          Commenter
        </button>
      </form>
    </aside>
  );
}
