import React, { useEffect, useRef, useState } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Settings, AlertCircle, Copy, Check } from 'lucide-react';

interface DevicePreviewProps {
  roomCode: string;
  onMediaStreamReady: (stream: MediaStream, audioDevice: string, videoDevice: string) => void;
  onJoinClicked: () => void;
  displayName: string;
  setDisplayName: (val: string) => void;
}

export const DevicePreview: React.FC<DevicePreviewProps> = ({
  roomCode,
  onMediaStreamReady,
  onJoinClicked,
  displayName,
  setDisplayName,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mediaError, setMediaError] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');

  const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const copyRoomLink = () => {
    navigator.clipboard.writeText(roomLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function setupDevices() {
      try {
        setMediaError('');
        let stream: MediaStream | null = null;

        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e: any) {
          // Fallback if combined audio+video fails (e.g., no camera attached, or mic only)
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (e2) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e3: any) {
              throw new Error('Camera and Microphone access was denied or no devices were found.');
            }
          }
        }

        activeStream = stream;
        setLocalStream(stream);

        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');

        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        const defaultAudio = audioInputs[0]?.deviceId || '';
        const defaultVideo = videoInputs[0]?.deviceId || '';
        if (defaultAudio) setSelectedAudio(defaultAudio);
        if (defaultVideo) setSelectedVideo(defaultVideo);

        if (stream) {
          onMediaStreamReady(stream, defaultAudio, defaultVideo);
        }
      } catch (err: any) {
        console.error('Error accessing camera/mic:', err);
        setMediaError(err.message || 'Permission denied or device error.');
      }
    }

    setupDevices();
  }, []);

  const handleDeviceChange = async (audioId: string, videoId: string) => {
    try {
      setSelectedAudio(audioId);
      setSelectedVideo(videoId);

      const constraints: MediaStreamConstraints = {
        audio: audioId ? { deviceId: { exact: audioId } } : true,
        video: videoId ? { deviceId: { exact: videoId } } : true,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      setLocalStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      onMediaStreamReady(newStream, audioId, videoId);
    } catch (err: any) {
      console.error('Failed to change media device:', err);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Live Audio Level Visualizer
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!localStream || isAudioMuted) {
      setAudioLevel(0);
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled) {
      setAudioLevel(0);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn('Audio level analyzer error:', e);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [localStream, isAudioMuted]);

  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '32px 24px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* 2-Column Split Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '40px',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Left Column: Video Preview & Audio Visualizer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          {mediaError && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid var(--accent-rose)',
                padding: '12px 16px',
                borderRadius: '8px',
                color: 'var(--accent-rose)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} />
              <span>{mediaError}</span>
            </div>
          )}

          {/* Video Preview Frame */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '16px',
              overflow: 'hidden',
              backgroundColor: '#0f172a',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.12)',
              border: '1px solid var(--bg-card-border)',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isVideoOff || mediaError ? 'none' : 'block',
              }}
            />

            {(isVideoOff || mediaError) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  gap: '12px',
                }}
              >
                <VideoOff size={48} />
                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                  {mediaError ? 'No Camera Access' : 'Camera is turned off'}
                </span>
              </div>
            )}

            {/* Media Controls Bar Overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '12px',
                background: 'rgba(15, 23, 42, 0.75)',
                padding: '8px 16px',
                borderRadius: '30px',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <button className={`btn-icon ${isAudioMuted ? 'active-off' : ''}`} onClick={toggleAudio} title="Toggle Mic">
                {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button className={`btn-icon ${isVideoOff ? 'active-off' : ''}`} onClick={toggleVideo} title="Toggle Camera">
                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            </div>
          </div>

          {/* Live Audio Input Meter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 0',
            }}
          >
            <Mic size={18} color={isAudioMuted ? 'var(--accent-rose)' : 'var(--accent-emerald)'} />
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)', minWidth: '80px' }}>
              Mic Input:
            </span>
            <div
              style={{
                flex: 1,
                height: '8px',
                borderRadius: '4px',
                background: 'rgba(0, 0, 0, 0.08)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${isAudioMuted ? 0 : audioLevel}%`,
                  background: 'linear-gradient(90deg, var(--accent-emerald), var(--accent-cyan))',
                  transition: 'width 0.1s ease-out',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Hardware Settings & Join Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px', letterSpacing: '-0.02em' }}>
              Meeting Lobby Preview
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Check your audio & camera before joining the room anonymously.
            </p>
          </div>

          {/* Room Code & Invite Link Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Room Code
              </span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>
                {roomCode}
              </strong>
            </div>

            <button
              className="btn-primary"
              onClick={copyRoomLink}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              {copiedLink ? 'Copied Link!' : 'Copy Invite Link'}
            </button>
          </div>

          {/* Form Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-main)' }}>
                Your Display Name (Anonymous)
              </label>
              <input
                type="text"
                className="custom-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Guest Developer"
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-main)' }}>
                <Mic size={16} color="var(--primary)" /> Microphone
              </label>
              <select
                className="custom-input"
                value={selectedAudio}
                onChange={(e) => handleDeviceChange(e.target.value, selectedVideo)}
              >
                {audioDevices.length === 0 ? (
                  <option value="">No microphone found</option>
                ) : (
                  audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-main)' }}>
                <Camera size={16} color="var(--primary)" /> Camera
              </label>
              <select
                className="custom-input"
                value={selectedVideo}
                onChange={(e) => handleDeviceChange(selectedAudio, e.target.value)}
              >
                {videoDevices.length === 0 ? (
                  <option value="">No camera found</option>
                ) : (
                  videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={onJoinClicked}
              style={{
                marginTop: '12px',
                justifyContent: 'center',
                padding: '14px 20px',
                fontSize: '1.05rem',
                fontWeight: '600',
                boxShadow: '0 8px 24px var(--primary-glow)',
              }}
            >
              Join Room Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

