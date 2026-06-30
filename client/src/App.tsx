import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Play,
  LogOut,
  Users,
  Link2,
  Check,
  ArrowRight,
  PenTool,
  MessageSquare,
  Radio,
} from 'lucide-react';
import { ReviewPlayer } from './components/ReviewPlayer';
import { useCollab } from './lib/useCollab';
import type { Peer } from './lib/types';

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
  if (!session) return <JoinScreen onJoin={setSession} />;
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
  const [copied, setCopied] = useState(false);

  usePeerToasts(collab.peers, collab.self);

  function copyLink() {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(
      session.room,
    )}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      toast.success('Lien de la salle copié');
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">
            <Play size={18} fill="currentColor" />
          </span>
          <div>
            <h1>Drift Stream</h1>
            <p>Lecteur de Revue Augmenté</p>
          </div>
        </div>

        <div className="header-room">
          <span className="room-chip">
            <Radio size={13} /> {session.room}
          </span>
          <button className="ghost-btn" onClick={copyLink}>
            {copied ? <Check size={15} /> : <Link2 size={15} />}
            {copied ? 'Copié' : 'Inviter'}
          </button>
          <button className="ghost-btn danger" onClick={onLeave}>
            <LogOut size={15} /> Quitter
          </button>
        </div>
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

/** Toast when peers (other than self) join or leave. */
function usePeerToasts(peers: Peer[], self: Peer | null) {
  const prev = useRef<Set<string>>(new Set());
  const ready = useRef(false);
  useEffect(() => {
    const current = new Set(peers.map((p) => p.id));
    if (ready.current) {
      for (const p of peers) {
        if (!prev.current.has(p.id) && p.id !== self?.id) {
          toast(`${p.name} a rejoint la revue`, { icon: '👋' });
        }
      }
      for (const id of prev.current) {
        if (!current.has(id) && id !== self?.id) {
          toast('Un participant a quitté', { icon: '👋' });
        }
      }
    }
    prev.current = current;
    if (self) ready.current = true;
  }, [peers, self]);
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

  return (
    <div className="join">
      <div className="join-aurora" aria-hidden />

      <motion.form
        className="join-card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="join-brand">
          <motion.span
            className="logo big"
            initial={{ rotate: -12, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
          >
            <Play size={26} fill="currentColor" />
          </motion.span>
          <h1>Drift Stream</h1>
          <p className="tagline">Lecteur de Revue Augmenté</p>
        </div>

        <div className="feature-row">
          <span><PenTool size={14} /> Annoter</span>
          <span><MessageSquare size={14} /> Commenter</span>
          <span><Users size={14} /> En direct</span>
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

        <motion.button
          type="submit"
          className="join-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Entrer dans la salle <ArrowRight size={18} />
        </motion.button>

        <p className="share-hint">
          Partagez la même salle pour reviewer la vidéo à plusieurs, en temps réel.
        </p>
      </motion.form>
    </div>
  );
}
