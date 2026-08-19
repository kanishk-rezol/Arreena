import React from 'react';
import { X, Users, Mic, MicOff, Video, VideoOff, Shield } from 'lucide-react';

export interface RosterItem {
  session_token: string;
  peer_id: string;
  display_name: string;
  joined_at: number;
  is_audio_muted: boolean;
  is_video_off: boolean;
  tracks_count: number;
}

interface ParticipantRosterProps {
  isOpen: boolean;
  onClose: () => void;
  roster: RosterItem[];
  currentSessionToken: string;
}

export const ParticipantRoster: React.FC<ParticipantRosterProps> = ({
  isOpen,
  onClose,
  roster,
  currentSessionToken,
}) => {
  if (!isOpen) return null;

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '320px',
        background: 'var(--bg-drawer)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--bg-card-border)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-drawer)',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--bg-card-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <Users size={20} color="var(--primary)" /> Meeting Roster ({roster.length})
        </h3>
        <button className="btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {roster.map((p) => {
          const isYou = p.session_token === currentSessionToken;
          return (
            <div
              key={p.session_token}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--bg-item)',
                marginBottom: '8px',
                border: isYou ? '1px solid var(--primary)' : '1px solid var(--bg-card-border)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: isYou ? 'var(--primary)' : 'var(--text-main)' }}>
                  {p.display_name} {isYou && '(You)'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {p.peer_id}</div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {p.is_audio_muted ? <MicOff size={16} color="var(--accent-rose)" /> : <Mic size={16} color="var(--accent-emerald)" />}
                {p.is_video_off ? <VideoOff size={16} color="var(--accent-rose)" /> : <Video size={16} color="var(--accent-emerald)" />}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
