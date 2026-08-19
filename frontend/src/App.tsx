import React, { useState, useEffect, useCallback } from 'react';
import { Video, Shield, Plus, LogIn, Activity, Zap, Lock, Cpu, Sparkles, Globe } from 'lucide-react';
import { createRoom, joinRoom, getRoom, JoinRoomResponse } from './services/api';
import { DevicePreview } from './components/DevicePreview';
import { MeetingRoom } from './components/MeetingRoom';
import { MediaIngestTest } from './components/MediaIngestTest';

type AppStep = 'LOBBY' | 'PREVIEW' | 'ROOM' | 'INGEST_TEST';

export function App() {
  const [step, setStep] = useState<AppStep>('LOBBY');
  const [roomCode, setRoomCode] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('Guest User');
  const [sessionInfo, setSessionInfo] = useState<JoinRoomResponse | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const stopActiveMediaTracks = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });
      setLocalStream(null);
    }
  }, [localStream]);

  // Synchronize Page & Connection State from URL Parameters
  const syncStateFromURL = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room') || '';
    const pageParam = params.get('page') || '';

    if (code) {
      setRoomCode(code);
    }

    if (pageParam === 'lab') {
      stopActiveMediaTracks();
      setStep('INGEST_TEST');
    } else if (pageParam === 'room' && code && sessionInfo) {
      setStep('ROOM');
    } else if (code) {
      // Auto-route any direct share link (e.g. ?room=abc-defg-hij) to the Device Preview Lobby
      setStep('PREVIEW');
    } else {
      stopActiveMediaTracks();
      setSessionInfo(null);
      setStep('LOBBY');
    }
  }, [sessionInfo, stopActiveMediaTracks]);

  useEffect(() => {
    syncStateFromURL();
    window.addEventListener('popstate', syncStateFromURL);
    return () => {
      window.removeEventListener('popstate', syncStateFromURL);
    };
  }, [syncStateFromURL]);

  const handleCreateRoom = async () => {
    try {
      setErrorMsg('');
      stopActiveMediaTracks();
      const room = await createRoom('Anonymous Room');
      setRoomCode(room.code);
      const targetUrl = `?page=preview&room=${room.code}`;
      window.history.pushState({ page: 'preview', room: room.code }, '', targetUrl);
      setStep('PREVIEW');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room');
    }
  };

  const handleJoinLobby = async () => {
    if (!roomCode.trim()) {
      setErrorMsg('Please enter a valid room code');
      return;
    }
    try {
      setErrorMsg('');
      stopActiveMediaTracks();
      const cleanCode = roomCode.trim();
      await getRoom(cleanCode);
      const targetUrl = `?page=preview&room=${cleanCode}`;
      window.history.pushState({ page: 'preview', room: cleanCode }, '', targetUrl);
      setStep('PREVIEW');
    } catch (err: any) {
      setErrorMsg('Room not found or inactive');
    }
  };

  const handleEnterMeeting = async () => {
    try {
      setErrorMsg('');
      const info = await joinRoom(roomCode, displayName);
      setSessionInfo(info);
      const targetUrl = `?page=room&room=${roomCode}`;
      window.history.pushState({ page: 'room', room: roomCode }, '', targetUrl);
      setStep('ROOM');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join meeting room');
    }
  };

  const handleLeaveCall = () => {
    stopActiveMediaTracks();
    setSessionInfo(null);
    window.history.pushState({ page: 'lobby' }, '', window.location.pathname);
    setStep('LOBBY');
  };

  const handleOpenIngestTest = () => {
    stopActiveMediaTracks();
    window.history.pushState({ page: 'lab' }, '', '?page=lab');
    setStep('INGEST_TEST');
  };

  // --- Render Separate Page Components ---

  // Page 4: Media Ingest Test Benchmark Page
  if (step === 'INGEST_TEST') {
    return (
      <MediaIngestTest
        onBack={() => {
          stopActiveMediaTracks();
          window.history.pushState({ page: 'lobby' }, '', window.location.pathname);
          setStep('LOBBY');
        }}
      />
    );
  }

  // Page 3: Dedicated Meeting Room Page (WebSocket & SFU WebRTC Session)
  if (step === 'ROOM' && sessionInfo) {
    return (
      <MeetingRoom
        sessionInfo={sessionInfo}
        localStream={localStream}
        onLeaveCall={handleLeaveCall}
      />
    );
  }

  // Page 2: Dedicated Device Preview Lobby Page (Local Media Hardware Check)
  if (step === 'PREVIEW') {
    return (
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-dark)', padding: '24px 0' }}>
        <DevicePreview
          roomCode={roomCode}
          onMediaStreamReady={(stream) => setLocalStream(stream)}
          onJoinClicked={handleEnterMeeting}
          displayName={displayName}
          setDisplayName={setDisplayName}
        />
      </div>
    );
  }

  // Page 1: Main Instant Meeting Landing Page
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
      {/* Top Navigation Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 48px',
          background: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="/logo.png"
            alt="Arreena Logo"
            style={{
              height: '44px',
              objectFit: 'contain',
            }}
          />
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Arreena
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DIY WebRTC Video Platform</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-item)',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid var(--bg-card-border)',
              fontSize: '0.8rem',
              fontWeight: '600',
              color: 'var(--text-main)',
            }}
          >
            <span className="status-dot" /> SFU Operational
          </div>

          <button
            onClick={handleOpenIngestTest}
            style={{
              background: 'transparent',
              border: '1px solid var(--bg-card-border)',
              color: 'var(--accent-cyan)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Activity size={16} /> Test the connection
          </button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main
        style={{
          flex: 1,
          padding: '48px',
          width: '100%',
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '48px',
          alignItems: 'center',
        }}
      >
        {/* Left Column: Hero Copy & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1
            style={{
              fontSize: '2.75rem',
              fontWeight: '800',
              lineHeight: '1.15',
              color: 'var(--text-main)',
              marginBottom: '16px',
              letterSpacing: '-0.03em',
              textAlign: 'left',
            }}
          >
            Instant, Secure Video Meetings for Everyone
          </h1>

          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '32px', textAlign: 'left' }}>
            Ultra-fast, anonymous video conferencing. Connect with anyone, anywhere — no accounts, downloads, or tracking required.
          </p>

          {errorMsg && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid var(--accent-rose)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '24px',
                color: 'var(--accent-rose)',
                fontSize: '0.9rem',
                fontWeight: '500',
                width: '100%',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Quick Action Container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', width: '100%' }}>
              <button
                className="btn-primary"
                onClick={handleCreateRoom}
                style={{
                  padding: '14px 24px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  boxShadow: '0 8px 24px var(--primary-glow)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Plus size={20} /> Start Instant Room
              </button>

              <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-muted)' }}>or</span>

              <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
                <input
                  type="text"
                  className="custom-input"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  placeholder="Enter Room Code (e.g. abc-defg-hij)"
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleJoinLobby} style={{ whiteSpace: 'nowrap', padding: '12px 18px' }}>
                  <LogIn size={18} /> Join
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Interactive Hero Card */}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <div
            className="glass-card"
            style={{
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              borderRadius: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
              border: '1px solid var(--bg-card-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot" />
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '0.05em' }}>
                  LIVE SFU MEETING DEMO
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: '600', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                4 Peers • 1080p
              </span>
            </div>

            {/* Visual Logo / Video Grid Preview */}
            <div
              style={{
                width: '100%',
                borderRadius: '16px',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4)',
              }}
            >
              <img
                src="/logo.png"
                alt="Arreena Live Room Preview"
                style={{ height: '140px', objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Packet Forwarding: <strong style={{ color: 'var(--accent-cyan)' }}>Active</strong></span>
              <span>Bitrate: <strong style={{ color: 'var(--text-main)' }}>2.4 Mbps</strong></span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
