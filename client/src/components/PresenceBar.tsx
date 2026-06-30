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
      ? `En ligne · ${peers.length}`
      : status === 'connecting'
        ? 'Connexion…'
        : 'Hors ligne (local)';

  return (
    <div className="presence">
      <span className={`status-pill ${status}`}>{label}</span>
      <div className="avatars">
        {peers.map((p) => (
          <span
            key={p.id}
            className="avatar"
            style={{ background: p.color }}
            title={p.id === self?.id ? `${p.name} (vous)` : p.name}
          >
            {initials(p.name)}
          </span>
        ))}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
