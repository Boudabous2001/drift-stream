import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Film,
  PenSquare,
  Trash2,
  Plus,
  Lock,
} from 'lucide-react';
import type { Media } from '../lib/types';

interface Props {
  media: Media | null;
  isOwner: boolean;
  onSetMedia: (m: Media) => void;
  onRemoveMedia: () => void;
}

const SAMPLES: { label: string; src: string }[] = [
  {
    label: 'Big Buck Bunny',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    label: 'Elephants Dream',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    label: 'For Bigger Blazes',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];

/**
 * Owner-only media CRUD bar. Lets the room owner load a video (by URL or from a
 * sample), switch to a blank whiteboard, or remove the current media. Guests see
 * a read-only indicator instead.
 */
export function MediaControls({ media, isOwner, onSetMedia, onRemoveMedia }: Props) {
  const [url, setUrl] = useState('');

  if (!isOwner) {
    return (
      <div className="media-bar guest">
        <Lock size={14} />
        <span>
          {media
            ? media.kind === 'video'
              ? 'Vidéo définie par le propriétaire'
              : 'Tableau blanc partagé'
            : 'En attente du média (propriétaire)'}
        </span>
      </div>
    );
  }

  function loadUrl() {
    const src = url.trim();
    if (!src) return;
    onSetMedia({ kind: 'video', src });
    toast.success('Vidéo chargée pour la salle');
    setUrl('');
  }

  const wbActive = media?.kind === 'whiteboard';
  const wbBackground = media?.background ?? 'white';

  return (
    <div className="media-bar">
      <span className="media-bar-label">
        <Film size={15} /> Média
      </span>

      <div className="media-url">
        <input
          value={url}
          placeholder="URL d’une vidéo (.mp4 / .webm)…"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
        />
        <button className="media-load" onClick={loadUrl} disabled={!url.trim()}>
          <Plus size={15} /> Charger
        </button>
      </div>

      <div className="media-samples">
        {SAMPLES.map((s) => (
          <button
            key={s.src}
            className={`chip ${media?.kind === 'video' && media.src === s.src ? 'active' : ''}`}
            onClick={() => {
              onSetMedia({ kind: 'video', src: s.src, title: s.label });
              toast.success(`« ${s.label} » chargée`);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="media-actions">
        <button
          className={`chip wb ${wbActive ? 'active' : ''}`}
          title="Dessiner sur une feuille blanche"
          onClick={() =>
            onSetMedia({
              kind: 'whiteboard',
              background: wbActive && wbBackground === 'white' ? 'dark' : 'white',
            })
          }
        >
          <PenSquare size={14} />
          {wbActive ? `Tableau (${wbBackground === 'white' ? 'clair' : 'sombre'})` : 'Tableau blanc'}
        </button>

        {media && (
          <button
            className="chip danger"
            title="Retirer le média"
            onClick={() => {
              onRemoveMedia();
              toast('Média retiré', { icon: '🗑' });
            }}
          >
            <Trash2 size={14} /> Retirer
          </button>
        )}
      </div>
    </div>
  );
}
