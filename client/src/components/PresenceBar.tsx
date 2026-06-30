import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { Peer } from '../lib/types';

interface Props {
  peers: Peer[];
  self: Peer | null;
  status: 'connecting' | 'online' | 'offline';
}

/** Avatars of connected collaborators + connection status pill. */
export function PresenceBar({ peers, self, status }: Props) {
  const label =
    status === 'online'
      ? `En direct · ${peers.length}`
      : status === 'connecting'
        ? 'Connexion…'
        : 'Hors ligne';

  const Icon =
    status === 'online' ? Wifi : status === 'connecting' ? Loader2 : WifiOff;

  return (
    <div className="presence">
      <span className={`status-pill ${status}`}>
        <Icon size={13} className={status === 'connecting' ? 'spin' : ''} />
        {label}
      </span>
      <div className="avatars">
        <AnimatePresence mode="popLayout">
          {peers.map((p) => (
            <motion.span
              key={p.id}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 28 }}
              className="avatar"
              style={{ background: p.color }}
              title={p.id === self?.id ? `${p.name} (vous)` : p.name}
            >
              {initials(p.name)}
              {p.id === self?.id && <span className="avatar-you" />}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
