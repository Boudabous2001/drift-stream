import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Crown,
  Sun,
  Moon,
  Plus,
  LogIn,
} from 'lucide-react';
import { ReviewPlayer } from './components/ReviewPlayer';
import { ParticipantsPanel } from './components/ParticipantsPanel';
import { useCollab, type CollabEvents } from './lib/useCollab';
import type { Peer } from './lib/types';

interface Session {
  name: string;
  room: string;
}

type Theme = 'dark' | 'light';

export default function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('ds:theme') as Theme) || 'dark',
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ds:theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return <JoinScreen onJoin={setSession} theme={theme} onToggleTheme={toggleTheme} />;
  }
  return (
    <ReviewRoom
      session={session}
      onLeave={() => setSession(null)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

// --- the live review room -------------------------------------------------

function ReviewRoom({
  session,
  onLeave,
  theme,
  onToggleTheme,
}: {
  session: Session;
  onLeave: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const events = useMemo<CollabEvents>(
    () => ({
      onRoleRequest: (peer) =>
        toast(`${peer.name} demande le rôle propriétaire`, { icon: '🙋' }),
      onRoleGranted: (by) =>
        toast.success(
          by ? `${by} vous a donné le rôle propriétaire` : 'Vous êtes propriétaire',
        ),
      onRoleRevoked: () =>
        toast('Votre rôle propriétaire a été retiré', { icon: 'ℹ️' }),
    }),
    [],
  );

  const collab = useCollab(session.room, session.name, events);
  const [copied, setCopied] = useState(false);

  usePeerToasts(collab.peers, collab.self);

  const copyLink = useCallback(() => {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(
      session.room,
    )}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      toast.success('Lien de la salle copié — partagez-le à vos amis');
      setTimeout(() => setCopied(false), 1800);
    });
  }, [session.room]);

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
          {collab.isOwner && (
            <span className="owner-chip" title="Vous êtes propriétaire de la salle">
              <Crown size={13} /> Propriétaire
            </span>
          )}

          <ParticipantsPanel
            peers={collab.peers}
            self={collab.self}
            isOwner={collab.isOwner}
            roleRequests={collab.roleRequests}
            onGrant={collab.grantRole}
            onRevoke={collab.revokeRole}
            onRequest={() => {
              collab.requestRole();
              toast('Demande envoyée aux propriétaires', { icon: '📨' });
            }}
            onDismissRequest={collab.dismissRequest}
          />

          <button className="icon-btn" onClick={onToggleTheme} title="Thème clair / sombre">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
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
        room={session.room}
        media={collab.media}
        isOwner={collab.isOwner}
        onSetMedia={collab.setMedia}
        onRemoveMedia={collab.removeMedia}
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

function randomRoom(): string {
  const words = ['revue', 'studio', 'sprint', 'demo', 'cut', 'plan'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.random().toString(36).slice(2, 6)}`;
}

function JoinScreen({
  onJoin,
  theme,
  onToggleTheme,
}: {
  onJoin: (s: Session) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const invited = params.get('room');
  const [mode, setMode] = useState<'create' | 'join'>(invited ? 'join' : 'create');
  const [name, setName] = useState('');
  const [room, setRoom] = useState(invited || '');
  const [createRoom, setCreateRoom] = useState(() => randomRoom());

  useEffect(() => {
    const saved = localStorage.getItem('ds:name');
    if (saved) setName(saved);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const finalName = name.trim() || 'Invité';
    localStorage.setItem('ds:name', finalName);
    const finalRoom =
      mode === 'create'
        ? createRoom.trim() || randomRoom()
        : room.trim();
    if (!finalRoom) return;
    onJoin({ name: finalName, room: finalRoom });
  }

  return (
    <div className="join">
      <div className="join-aurora" aria-hidden />

      <button className="theme-fab" onClick={onToggleTheme} title="Thème clair / sombre">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

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

        <div className="mode-tabs" role="tablist">
          <button
            type="button"
            className={`mode-tab ${mode === 'create' ? 'active' : ''}`}
            onClick={() => setMode('create')}
          >
            <Plus size={15} /> Créer une salle
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'join' ? 'active' : ''}`}
            onClick={() => setMode('join')}
          >
            <LogIn size={15} /> Rejoindre
          </button>
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

        {mode === 'create' ? (
          <label>
            Nom de votre salle
            <div className="room-create">
              <input
                value={createRoom}
                onChange={(e) => setCreateRoom(e.target.value)}
                placeholder="ma-salle"
              />
              <button
                type="button"
                className="dice"
                title="Générer un nom"
                onClick={() => setCreateRoom(randomRoom())}
              >
                🎲
              </button>
            </div>
          </label>
        ) : (
          <label>
            Code / nom de la salle
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="revue-demo"
            />
          </label>
        )}

        <motion.button
          type="submit"
          className="join-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {mode === 'create' ? 'Créer et entrer' : 'Rejoindre la salle'}{' '}
          <ArrowRight size={18} />
        </motion.button>

        <div className="feature-row">
          <span><PenTool size={14} /> Annoter</span>
          <span><MessageSquare size={14} /> Commenter</span>
          <span><Users size={14} /> En direct</span>
        </div>

        <p className="share-hint">
          {mode === 'create'
            ? 'Vous créez la salle et en devenez le propriétaire : invitez vos amis et gérez leurs accès.'
            : 'Rejoignez la salle d’un ami avec son nom/code. Vous pourrez demander le rôle propriétaire une fois dedans.'}
        </p>
      </motion.form>
    </div>
  );
}
