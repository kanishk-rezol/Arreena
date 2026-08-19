import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Shield, Copy, Check, Signal, Activity, Users, MessageSquare } from 'lucide-react';
import { SignalingClient, SignalingMessage } from '../services/signaling';
import { JoinRoomResponse } from '../services/api';
import { PeerConnectionManager, ConnectionState } from '../services/webrtc';
import { ParticipantRoster, RosterItem } from './ParticipantRoster';
import { ChatDrawer, ChatItem } from './ChatDrawer';

interface ParticipantStream {
  peerId: string;
  stream: MediaStream;
  connectionState: ConnectionState;
  isAudioMuted: boolean;
  isVideoOff: boolean;
}

interface MeetingRoomProps {
  sessionInfo: JoinRoomResponse;
  localStream: MediaStream | null;
  onLeaveCall: () => void;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ sessionInfo, localStream, onLeaveCall }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(localStream);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, ParticipantStream>>(new Map());
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatItem[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const peerManagers = useRef<Map<string, PeerConnectionManager>>(new Map());
  const signalingClient = useRef<SignalingClient | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  // Fallback stream acquisition if localStream is null or has ended tracks
  useEffect(() => {
    async function ensureStream() {
      let current = localStream;
      if (!current || current.getTracks().length === 0 || current.getTracks().every((t) => t.readyState === 'ended')) {
        try {
          current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
          try {
            current = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (e2) {
            try {
              current = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e3) {
              console.warn('Could not acquire local camera or microphone stream:', e3);
            }
          }
        }
      }

      if (current) {
        setActiveStream(current);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = current;
        }
        // Update all active peer managers with local stream tracks
        peerManagers.current.forEach((pm) => {
          pm.addLocalStream(current!);
        });
      }
    }

    ensureStream();

    // Initialize WebRTC Signaling Client
    signalingClient.current = new SignalingClient(
      sessionInfo.room_code,
      sessionInfo.session_token,
      handleSignalingMessage
    );
    signalingClient.current.connect();

    return () => {
      signalingClient.current?.disconnect();
      peerManagers.current.forEach((pm) => pm.close());
      peerManagers.current.clear();
    };
  }, []);

  const getOrCreatePeerManager = (peerToken: string, isPolite: boolean): PeerConnectionManager => {
    if (peerManagers.current.has(peerToken)) {
      return peerManagers.current.get(peerToken)!;
    }

    const manager = new PeerConnectionManager(
      peerToken,
      isPolite,
      sessionInfo.ice_servers,
      {
        onTrack: (remoteStream) => {
          setRemoteParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerToken) || {
              peerId: peerToken,
              stream: remoteStream,
              connectionState: 'connecting',
              isAudioMuted: false,
              isVideoOff: false,
            };
            existing.stream = remoteStream;
            next.set(peerToken, existing);
            return next;
          });
        },
        onIceCandidate: (candidate) => {
          signalingClient.current?.send({
            type: 'ice-candidate',
            candidate,
            target_token: peerToken,
          });
        },
        onConnectionStateChange: (state) => {
          setRemoteParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerToken);
            if (existing) {
              existing.connectionState = state;
              next.set(peerToken, existing);
            }
            return next;
          });
        },
        onNegotiationNeeded: (offer) => {
          signalingClient.current?.send({
            type: 'offer',
            sdp: offer,
            target_token: peerToken,
          });
        },
      }
    );

    const streamToUse = activeStream || localStream;
    if (streamToUse) {
      manager.addLocalStream(streamToUse);
    }

    peerManagers.current.set(peerToken, manager);
    return manager;
  };

  const handleSignalingMessage = async (msg: SignalingMessage) => {
    if (msg.type === 'peer-joined') {
      getOrCreatePeerManager(msg.sender_token, false);
      signalingClient.current?.send({
        type: 'user-state-change',
        is_audio_muted: isAudioMuted,
        is_video_off: isVideoOff,
      });
    } else if (msg.type === 'offer') {
      const manager = getOrCreatePeerManager(msg.sender_token, true);
      const answer = await manager.handleOffer(msg.sdp);
      if (answer) {
        signalingClient.current?.send({
          type: 'answer',
          sdp: answer,
          target_token: msg.sender_token,
        });
      }
    } else if (msg.type === 'answer') {
      const manager = peerManagers.current.get(msg.sender_token);
      if (manager) {
        await manager.handleAnswer(msg.sdp);
      }
    } else if (msg.type === 'ice-candidate') {
      const manager = peerManagers.current.get(msg.sender_token);
      if (manager && msg.candidate) {
        await manager.handleIceCandidate(msg.candidate);
      }
    } else if (msg.type === 'user-state-change') {
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        const existing = next.get(msg.sender_token);
        if (existing) {
          existing.isAudioMuted = msg.is_audio_muted;
          existing.isVideoOff = msg.is_video_off;
          next.set(msg.sender_token, existing);
        }
        return next;
      });
    } else if (msg.type === 'peer-left') {
      const manager = peerManagers.current.get(msg.sender_token);
      if (manager) {
        manager.close();
        peerManagers.current.delete(msg.sender_token);
      }
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        next.delete(msg.sender_token);
        return next;
      });
    } else if (msg.type === 'chat-message') {
      const newMsg: ChatItem = {
        id: msg.message_id || `msg_${Date.now()}`,
        senderToken: msg.sender_token,
        senderName: msg.sender_name || `Guest_${msg.sender_token.slice(0, 6)}`,
        text: msg.text,
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      };
      setChatMessages((prev) => [...prev, newMsg]);

      // If drawer is closed, increment unread badge count
      if (!isChatOpen) {
        setUnreadChatCount((prev) => prev + 1);
      }
    }
  };

  const handleSendChatMessage = (text: string) => {
    if (!text.trim()) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const selfMsgId = `self_${Date.now()}`;
    const selfItem: ChatItem = {
      id: selfMsgId,
      senderToken: sessionInfo.session_token,
      senderName: sessionInfo.display_name || 'You',
      text: text.trim(),
      timestamp: nowSec,
    };
    setChatMessages((prev) => [...prev, selfItem]);

    signalingClient.current?.send({
      type: 'chat-message',
      text: text.trim(),
      display_name: sessionInfo.display_name,
    });
  };

  const toggleAudio = () => {
    const stream = activeStream || localStream;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuted = !audioTrack.enabled;
        setIsAudioMuted(newMuted);
        signalingClient.current?.send({
          type: 'user-state-change',
          is_audio_muted: newMuted,
          is_video_off: isVideoOff,
        });
      }
    }
  };

  const toggleVideo = () => {
    const stream = activeStream || localStream;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newVideoOff = !videoTrack.enabled;
        setIsVideoOff(newVideoOff);
        signalingClient.current?.send({
          type: 'user-state-change',
          is_audio_muted: isAudioMuted,
          is_video_off: newVideoOff,
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        peerManagers.current.forEach((manager) => {
          manager.replaceVideoTrack(screenTrack, screenStream);
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Notify remote participants that video is active
        signalingClient.current?.send({
          type: 'user-state-change',
          is_audio_muted: isAudioMuted,
          is_video_off: false,
        });

        screenTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.error('Failed to share screen:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    const stream = activeStream || localStream;
    if (stream) {
      const cameraTrack = stream.getVideoTracks()[0];
      peerManagers.current.forEach((manager) => {
        manager.replaceVideoTrack(cameraTrack || null, stream);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }

    signalingClient.current?.send({
      type: 'user-state-change',
      is_audio_muted: isAudioMuted,
      is_video_off: isVideoOff,
    });

    setIsScreenSharing(false);
  };

  const copyRoomLink = () => {
    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${sessionInfo.room_code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const participantsList = Array.from(remoteParticipants.values());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Header Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--bg-card-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="Arreena Logo" style={{ height: '32px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
              Room Code: <span style={{ color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>{sessionInfo.room_code}</span>
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Multi-Party Call • {participantsList.length + 1} Connected
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-icon"
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              setUnreadChatCount(0);
            }}
            title="Meeting Chat"
            style={{ position: 'relative' }}
          >
            <MessageSquare size={20} />
            {unreadChatCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--accent-rose)',
                  border: '2px solid var(--bg-card)',
                }}
              />
            )}
          </button>
          <button className="btn-icon" onClick={() => setIsRosterOpen(!isRosterOpen)} title="View Roster">
            <Users size={20} />
          </button>
          <button className="btn-primary" onClick={copyRoomLink} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            {copiedLink ? <Check size={16} /> : <Copy size={16} />}
            {copiedLink ? 'Copied Link!' : 'Copy Room Link'}
          </button>
        </div>
      </header>

      <ParticipantRoster
        isOpen={isRosterOpen}
        onClose={() => setIsRosterOpen(false)}
        currentSessionToken={sessionInfo.session_token}
        roster={[
          {
            session_token: sessionInfo.session_token,
            peer_id: sessionInfo.session_token.slice(0, 8),
            display_name: sessionInfo.display_name,
            joined_at: Date.now() / 1000,
            is_audio_muted: isAudioMuted,
            is_video_off: isVideoOff,
            tracks_count: 2,
          },
          ...participantsList.map((p) => ({
            session_token: p.peerId,
            peer_id: p.peerId.slice(0, 8),
            display_name: `Guest_${p.peerId.slice(0, 6)}`,
            joined_at: Date.now() / 1000,
            is_audio_muted: p.isAudioMuted,
            is_video_off: p.isVideoOff,
            tracks_count: 2,
          })),
        ]}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentSessionToken={sessionInfo.session_token}
        displayName={sessionInfo.display_name}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
      />

      {/* Main Video Tile Grid */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="video-grid">
          {/* Local User Tile */}
          <div className="video-tile">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video-element"
              style={{ display: isVideoOff && !isScreenSharing ? 'none' : 'block' }}
            />
            {isVideoOff && !isScreenSharing && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <VideoOff size={48} />
                <span style={{ fontSize: '0.85rem', marginTop: '8px' }}>Camera is Off</span>
              </div>
            )}
            <div className="video-overlay">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isAudioMuted ? <MicOff size={14} color="var(--accent-rose)" /> : <Mic size={14} color="var(--accent-emerald)" />}
                {sessionInfo.display_name} (You)
              </span>
              {isScreenSharing && <span style={{ color: 'var(--accent-cyan)' }}>[Screen Sharing]</span>}
            </div>
          </div>

          {/* Remote Participants Tiles */}
          {participantsList.map((p) => (
            <RemoteVideoTile key={p.peerId} participant={p} />
          ))}
        </div>
      </main>

      {/* Bottom Floating Control Bar */}
      <footer
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--bg-card-border)',
        }}
      >
        <button className={`btn-icon ${isAudioMuted ? 'active-off' : ''}`} onClick={toggleAudio}>
          {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button className={`btn-icon ${isVideoOff ? 'active-off' : ''}`} onClick={toggleVideo}>
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <button className={`btn-icon ${isScreenSharing ? 'active-off' : ''}`} onClick={toggleScreenShare} title="Share Screen">
          <Monitor size={20} />
        </button>
        <button
          className="btn-icon"
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            setUnreadChatCount(0);
          }}
          title="Meeting Chat"
          style={{ position: 'relative' }}
        >
          <MessageSquare size={20} />
          {unreadChatCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'var(--accent-rose)',
                border: '2px solid var(--bg-card)',
              }}
            />
          )}
        </button>
        <button className="btn-danger" onClick={onLeaveCall}>
          <PhoneOff size={20} /> Leave Call
        </button>
      </footer>
    </div>
  );
};

const RemoteVideoTile: React.FC<{ participant: ParticipantStream }> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch((e) => console.log('Auto-play info:', e));
    }
  }, [participant.stream, participant.isVideoOff]);

  useEffect(() => {
    if (!participant.stream) return;
    const handleTrackChange = () => {
      if (videoRef.current && participant.stream) {
        videoRef.current.srcObject = participant.stream;
        videoRef.current.play().catch(() => {});
      }
    };

    const tracks = participant.stream.getVideoTracks();
    tracks.forEach((t) => t.addEventListener('unmute', handleTrackChange));
    participant.stream.addEventListener('addtrack', handleTrackChange);

    return () => {
      tracks.forEach((t) => t.removeEventListener('unmute', handleTrackChange));
      participant.stream?.removeEventListener('addtrack', handleTrackChange);
    };
  }, [participant.stream]);

  const stateBadgeColor =
    participant.connectionState === 'connected-p2p'
      ? 'var(--accent-emerald)'
      : participant.connectionState === 'connected-turn'
      ? 'var(--accent-cyan)'
      : 'var(--accent-rose)';

  const stateLabel =
    participant.connectionState === 'connected-p2p'
      ? 'P2P Direct'
      : participant.connectionState === 'connected-turn'
      ? 'TURN Relayed'
      : 'Connecting...';

  return (
    <div className="video-tile">
      <video ref={videoRef} autoPlay playsInline className="video-element" style={{ display: participant.isVideoOff ? 'none' : 'block' }} />

      {participant.isVideoOff && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <VideoOff size={48} />
        </div>
      )}

      <div className="video-overlay">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {participant.isAudioMuted ? <MicOff size={14} color="var(--accent-rose)" /> : <Mic size={14} color="var(--accent-emerald)" />}
          Guest_{participant.peerId.slice(0, 6)}
        </span>
        <span style={{ color: stateBadgeColor, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Signal size={12} /> {stateLabel}
        </span>
      </div>
    </div>
  );
};
