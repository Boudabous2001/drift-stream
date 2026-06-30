import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users,
  Crown,
  ShieldPlus,
  ShieldMinus,
  Hand,
  Check,
  X,
} from 'lucide-react';
import type { Peer } from '../lib/types';

interface Props {
  peers: Peer[];
  self: Peer | null;
  isOwner: boolean;
  roleRequests: Peer[];
  onGrant: (peerId: string) => void;
  onRevoke: (peerId: string) => void;
  onRequest: () => void;
  onDismissRequest: (peerId: string) => void;
}

/**
 * Header popover listing participants with their role. Owners can promote a
 * guest to owner or demote a co-owner, and approve/deny pending owner-role
 * requests. Guests get a "request owner access" button.
 */
export function ParticipantsPanel({
  peers,
  self,
  isOwner,
  roleRequests,
  onGrant,
  onRevoke,
  onRequest,
  onDismissRequest,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const ownerCount = peers.filter((p) => p.isOwner).length;
  const pending = isOwner ? roleRequests.length : 0;

  return (
    <div className="participants" ref={ref}>
      <button
        className="ghost-btn"
        onClick={() => setOpen((o) => !o)}
        title="Participants & rôles"
      >
        <Users size={15} /> {peers.length}
        {pending > 0 && <span className="req-dot">{pending}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="participants-pop"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            <header>
              <span>Participants</span>
              <span className="muted">
                {ownerCount} proprio{ownerCount > 1 ? 's' : ''} · {peers.length} en
                ligne
              </span>
            </header>

            {/* Pending owner-role requests (owners only) */}
            {isOwner && roleRequests.length > 0 && (
              <div className="req-section">
                <p className="req-title">Demandes de rôle propriétaire</p>
                {roleRequests.map((r) => (
                  <div className="req-row" key={r.id}>
                    <span className="who">
                      <span className="dot" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <div className="req-actions">
                      <button
                        className="mini ok"
                        title="Accepter"
                        onClick={() => onGrant(r.id)}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="mini no"
                        title="Refuser"
                        onClick={() => onDismissRequest(r.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <ul className="people">
              {peers.map((p) => {
                const me = p.id === self?.id;
                return (
                  <li key={p.id}>
                    <span className="who">
                      <span className="avatar sm" style={{ background: p.color }}>
                        {initials(p.name)}
                      </span>
                      <span className="nm">
                        {p.name}
                        {me && <span className="you-tag">vous</span>}
                      </span>
                    </span>

                    <span className="role">
                      {p.isOwner ? (
                        <span className="role-badge owner">
                          <Crown size={12} /> Propriétaire
                        </span>
                      ) : (
                        <span className="role-badge guest">Invité</span>
                      )}

                      {/* Owner controls over OTHER participants */}
                      {isOwner && !me && !p.isOwner && (
                        <button
                          className="mini grant"
                          title="Donner le rôle propriétaire"
                          onClick={() => onGrant(p.id)}
                        >
                          <ShieldPlus size={14} />
                        </button>
                      )}
                      {isOwner && !me && p.isOwner && ownerCount > 1 && (
                        <button
                          className="mini revoke"
                          title="Retirer le rôle propriétaire"
                          onClick={() => onRevoke(p.id)}
                        >
                          <ShieldMinus size={14} />
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Guest: request owner access */}
            {!isOwner && (
              <button className="request-btn" onClick={onRequest}>
                <Hand size={15} /> Demander le rôle propriétaire
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
