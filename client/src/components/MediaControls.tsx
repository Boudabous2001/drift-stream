import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Film,
  Image,
  PenSquare,
  Trash2,
  Plus,
  Lock,
  Upload,
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

const MAX_LOCAL_IMAGE_MB = 8;
const MAX_LOCAL_VIDEO_MB = 45;

export function MediaControls({ media, isOwner, onSetMedia, onRemoveMedia }: Props) {
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOwner) {
    return (
      <div className="media-bar guest">
        <Lock size={14} />
        <span>{guestMediaLabel(media)}</span>
      </div>
    );
  }

  function loadUrl() {
    const src = url.trim();
    if (!src) return;
    const kind = inferMediaKind(src);
    onSetMedia({ kind, src });
    toast.success(kind === 'image' ? 'Image chargee pour la salle' : 'Video chargee pour la salle');
    setUrl('');
  }

  function loadLocalFile(file: File) {
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      toast.error('Choisissez une image ou une video');
      return;
    }

    const maxMb = file.type.startsWith('image/') ? MAX_LOCAL_IMAGE_MB : MAX_LOCAL_VIDEO_MB;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Fichier trop lourd pour le partage direct (${maxMb} Mo max)`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;
      const kind = file.type.startsWith('image/') ? 'image' : 'video';
      onSetMedia({ kind, src, title: file.name });
      toast.success(`${kind === 'image' ? 'Image' : 'Video'} locale chargee`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => toast.error('Impossible de lire ce fichier');
    reader.readAsDataURL(file);
  }

  const wbActive = media?.kind === 'whiteboard';
  const wbBackground = media?.background ?? 'white';

  return (
    <div className="media-bar">
      <span className="media-bar-label">
        {media?.kind === 'image' ? <Image size={15} /> : <Film size={15} />} Media
      </span>

      <div className="media-url">
        <input
          value={url}
          placeholder="URL video ou image (.mp4, .webm, .jpg, .png)..."
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
        />
        <button className="media-load" onClick={loadUrl} disabled={!url.trim()}>
          <Plus size={15} /> Charger
        </button>
      </div>

      <input
        ref={fileInputRef}
        className="media-file-input"
        type="file"
        accept="video/*,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadLocalFile(file);
        }}
      />

      <button
        className="chip upload"
        type="button"
        title="Choisir une image ou une video depuis ce PC"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={14} /> Depuis le PC
      </button>

      <div className="media-samples">
        {SAMPLES.map((s) => (
          <button
            key={s.src}
            className={`chip ${media?.kind === 'video' && media.src === s.src ? 'active' : ''}`}
            onClick={() => {
              onSetMedia({ kind: 'video', src: s.src, title: s.label });
              toast.success(`"${s.label}" chargee`);
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
            title="Retirer le media"
            onClick={() => {
              onRemoveMedia();
              toast('Media retire');
            }}
          >
            <Trash2 size={14} /> Retirer
          </button>
        )}
      </div>
    </div>
  );
}

function inferMediaKind(src: string): 'video' | 'image' {
  if (/^data:image\//i.test(src) || /\.(avif|gif|jpe?g|png|webp|svg)(\?.*)?$/i.test(src)) {
    return 'image';
  }
  return 'video';
}

function guestMediaLabel(media: Media | null): string {
  if (!media) return 'En attente du media (proprietaire)';
  if (media.kind === 'video') return 'Video definie par le proprietaire';
  if (media.kind === 'image') return 'Image definie par le proprietaire';
  return 'Tableau blanc partage';
}
