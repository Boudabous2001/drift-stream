import { useEffect, useMemo, useState } from 'react';
import { ReviewPlayer } from './components/ReviewPlayer';
import { useCollab } from './lib/useCollab';

/** A small set of royalty-free sample clips so the app is usable out of the box. */
const SAMPLE_VIDEOS: { label: string; src: string }[] = [
  {
    label: 'Big Buck Bunny (sample)',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    label: 'Elephants Dream (sample)',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    label: 'For Bigger Blazes (sample)',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];

interface Session {
  name: string;
  room: string;
  src: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return <JoinScreen onJoin={setSession} />;
  }
  return <ReviewRoom session={session} onLeave={() => setSession(null)} />;
}

// --- the live review room -------------------------------------------------

function ReviewRoom({
  session,
  onLeave,
}: {
  session: Session;
  onLeave: () => void;
}) {
  const collab = useCollab(session.room, session.name);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">▶</span>
          <div>
            <h1>Drift Stream</h1>
            <p>Lecteur de Revue Augmenté · salle « {session.room} »</p>
          </div>
        </div>
        <button className="leave-btn" onClick={onLeave}>
          Quitter la salle
        </button>
      </header>

      <ReviewPlayer
        src={session.src}
        room={session.room}
        annotations={collab.annotations}
        comments={collab.comments}
        peers={collab.peers}
        self={collab.self}
        cursors={collab.cursors}
        status={collab.status}
        onCreateAnnotation={collab.upsertAnnotation}
        onDeleteAnnotation={collab.deleteAnnotation}
        onClearAnnotations={collab.clearAnnotations}
        onAddComment={collab.addComment}
        onDeleteComment={collab.deleteComment}
        onCursorMove={collab.sendCursor}
      />

      <footer className="app-footer">
        Hackathon ESTIAM × 42C 2026 · Pôle 1 / Sujet A — React · WebSockets ·
        Canvas API
      </footer>
    </div>
  );
}

// --- join / lobby screen --------------------------------------------------

function JoinScreen({ onJoin }: { onJoin: (s: Session) => void }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [name, setName] = useState('');
  const [room, setRoom] = useState(params.get('room') || 'revue-demo');
  const [srcChoice, setSrcChoice] = useState(SAMPLE_VIDEOS[0].src);
  const [customSrc, setCustomSrc] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('ds:name');
    if (saved) setName(saved);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name.trim() || 'Invité';
    localStorage.setItem('ds:name', finalName);
    const src = customSrc.trim() || srcChoice;
    onJoin({ name: finalName, room: room.trim() || 'lobby', src });
  }

  const shareUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(
    room.trim(),
  )}`;

  return (
    <div className="join">
      <form className="join-card" onSubmit={submit}>
        <div className="join-brand">
          <span className="logo big">▶</span>
          <h1>Drift Stream</h1>
          <p className="tagline">Lecteur de Revue Augmenté</p>
          <p className="sub">
            Annotez la vidéo (flèches, formes, dessin), commentez à l’horodatage
            près, en temps réel — à plusieurs.
          </p>
        </div>

        <label>
          Votre nom
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Selyess"
            autoFocus
          />
        </label>

        <label>
          Salle de revue
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="revue-demo"
          />
        </label>

        <label>
          Vidéo à reviewer
          <select
            value={srcChoice}
            onChange={(e) => {
              setSrcChoice(e.target.value);
              setCustomSrc('');
            }}
          >
            {SAMPLE_VIDEOS.map((v) => (
              <option key={v.src} value={v.src}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          …ou une URL personnalisée
          <input
            value={customSrc}
            onChange={(e) => setCustomSrc(e.target.value)}
            placeholder="https://…/ma-video.mp4"
          />
        </label>

        <button type="submit" className="join-btn">
          Entrer dans la salle →
        </button>

        <p className="share-hint">
          Partagez ce lien pour reviewer ensemble :<br />
          <code>{shareUrl}</code>
        </p>
      </form>
    </div>
  );
}
