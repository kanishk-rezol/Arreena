export type SignalingMessage = 
  | { type: 'peer-joined'; peer_id: string; sender_token: string }
  | { type: 'peer-left'; peer_id: string; sender_token: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; target_token?: string; sender_token: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; target_token?: string; sender_token: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; target_token?: string; sender_token: string }
  | { type: 'user-state-change'; is_audio_muted: boolean; is_video_off: boolean; sender_token: string }
  | { type: 'chat-message'; message_id?: string; text: string; sender_name?: string; sender_token: string; timestamp?: number };

export class SignalingClient {
  private ws: WebSocket | null = null;
  private roomCode: string;
  private sessionToken: string;
  private onMessageCallback: (msg: SignalingMessage) => void;

  constructor(roomCode: string, sessionToken: string, onMessage: (msg: SignalingMessage) => void) {
    this.roomCode = roomCode;
    this.sessionToken = sessionToken;
    this.onMessageCallback = onMessage;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/rooms/${this.roomCode}/signaling?session_token=${this.sessionToken}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[Signaling] WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data);
        this.onMessageCallback(msg);
      } catch (err) {
        console.error('[Signaling] Failed to parse message:', err);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[Signaling] Socket error:', err);
    };

    this.ws.onclose = () => {
      console.log('[Signaling] WebSocket closed');
    };
  }

  send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[Signaling] Socket not open. Cannot send:', msg);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
