import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, Mic, Video, Server, CheckCircle2, ShieldAlert } from 'lucide-react';

interface IngestStats {
  session_id: string;
  connection_state: string;
  duration_seconds: number;
  tracks_count: number;
  audio_packets: number;
  video_packets: number;
  audio_bitrate_kbps: number;
  video_bitrate_kbps: number;
  total_bitrate_kbps: number;
}

interface MediaIngestTestProps {
  onBack: () => void;
}

export const MediaIngestTest: React.FC<MediaIngestTestProps> = ({ onBack }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('Initializing local stream...');

  useEffect(() => {
    let activeSessionId: string | null = null;
    let peerConnection: RTCPeerConnection | null = null;
    let statsInterval: any = null;

    async function startIngestTest() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        peerConnection = new RTCPeerConnection();
        setPc(peerConnection);

        stream.getTracks().forEach((track) => {
          peerConnection!.addTrack(track, stream);
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        setStatusMsg('Sending WebRTC offer to aiortc server media lab...');
        const res = await fetch('/api/v1/media/ingest/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        });

        if (!res.ok) {
          throw new Error('Failed to connect to aiortc media ingest server');
        }

        const data = await res.json();
        activeSessionId = data.session_id;
        setSessionId(data.session_id);

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription({ type: data.type, sdp: data.sdp })
        );

        setStatusMsg('Connected to Python aiortc server media engine!');

        // Poll server-side stats every 1 second
        statsInterval = setInterval(async () => {
          if (activeSessionId) {
            try {
              const sRes = await fetch(`/api/v1/media/ingest/stats/${activeSessionId}`);
              if (sRes.ok) {
                const sData = await sRes.json();
                setStats(sData);
              }
            } catch (err) {
              console.error('Error fetching server ingest stats:', err);
            }
          }
        }, 1000);
      } catch (err: any) {
        setStatusMsg(`Error: ${err.message}`);
      }
    }

    startIngestTest();

    return () => {
      if (statsInterval) clearInterval(statsInterval);
      if (activeSessionId) {
        fetch(`/api/v1/media/ingest/${activeSessionId}`, { method: 'DELETE' });
      }
      if (peerConnection) peerConnection.close();
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px' }} className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button className="btn-icon" onClick={onBack} title="Back to Lobby">
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server color="var(--accent-cyan)" size={24} /> Python aiortc Ingest Lab Benchmark
        </h2>
      </div>

      <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>
        {statusMsg}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Local Stream View */}
        <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', position: 'relative' }}>
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div className="video-overlay">
            <span>Publisher Stream (Browser)</span>
          </div>
        </div>

        {/* Server Metrics Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--bg-card-border)' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={16} color="var(--accent-emerald)" /> Server-Side Live Ingest Bitrate
            </h3>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--accent-emerald)' }}>
              {stats ? `${stats.total_bitrate_kbps} kbps` : 'Calculating...'}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>Audio: {stats?.audio_bitrate_kbps || 0} kbps</span>
              <span>Video: {stats?.video_bitrate_kbps || 0} kbps</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid var(--bg-card-border)', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Ingest Session ID:</span>
              <span style={{ fontFamily: 'monospace' }}>{sessionId ? sessionId.slice(0, 12) : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Server Connection:</span>
              <span style={{ color: stats?.connection_state === 'completed' || stats?.connection_state === 'connected' ? 'var(--accent-emerald)' : 'var(--accent-cyan)' }}>
                {stats?.connection_state || 'connecting'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Received Audio Packets:</span>
              <span>{stats?.audio_packets || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Received Video Packets:</span>
              <span>{stats?.video_packets || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
