export type ConnectionState = 'new' | 'connecting' | 'connected-p2p' | 'connected-turn' | 'disconnected' | 'failed';

export interface PeerManagerCallbacks {
  onTrack: (stream: MediaStream) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: ConnectionState) => void;
  onNegotiationNeeded: (offer: RTCSessionDescriptionInit) => void;
}

export class PeerConnectionManager {
  public pc: RTCPeerConnection;
  public peerToken: string;
  public isPolite: boolean;
  private callbacks: PeerManagerCallbacks;

  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    peerToken: string,
    isPolite: boolean,
    iceServers: RTCConfiguration['iceServers'],
    callbacks: PeerManagerCallbacks
  ) {
    this.peerToken = peerToken;
    this.isPolite = isPolite;
    this.callbacks = callbacks;

    this.pc = new RTCPeerConnection({ iceServers });
    this.setupListeners();
  }

  private setupListeners() {
    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        const offer = await this.pc.createOffer();
        if (this.pc.signalingState !== 'stable') return;
        await this.pc.setLocalDescription(offer);
        this.callbacks.onNegotiationNeeded(this.pc.localDescription!);
      } catch (err) {
        console.error(`[WebRTC] Negotiation offer error for ${this.peerToken.slice(0, 6)}:`, err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate(event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.callbacks.onTrack(remoteStream);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this.evaluateConnectionState();
    };

    this.pc.onconnectionstatechange = () => {
      this.evaluateConnectionState();
    };
  }

  private async evaluateConnectionState() {
    const state = this.pc.connectionState || this.pc.iceConnectionState;
    if (state === 'connected') {
      try {
        const stats = await this.pc.getStats();
        let isRelayed = false;
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const localCand = stats.get(report.localCandidateId);
            const remoteCand = stats.get(report.remoteCandidateId);
            if (localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay') {
              isRelayed = true;
            }
          }
        });
        this.callbacks.onConnectionStateChange(isRelayed ? 'connected-turn' : 'connected-p2p');
      } catch {
        this.callbacks.onConnectionStateChange('connected-p2p');
      }
    } else if (state === 'connecting') {
      this.callbacks.onConnectionStateChange('connecting');
    } else if (state === 'disconnected' || state === 'closed') {
      this.callbacks.onConnectionStateChange('disconnected');
    } else if (state === 'failed') {
      this.callbacks.onConnectionStateChange('failed');
    }
  }

  public addLocalStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => {
      const existingSender = this.pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (!existingSender) {
        this.pc.addTrack(track, stream);
      } else if (existingSender.track !== track) {
        existingSender.replaceTrack(track);
      }
    });
  }

  public async replaceVideoTrack(newTrack: MediaStreamTrack | null, stream?: MediaStream): Promise<void> {
    const senders = this.pc.getSenders();
    const videoSender = senders.find((s) => s.track?.kind === 'video');
    if (videoSender) {
      await videoSender.replaceTrack(newTrack);
    } else if (newTrack && stream) {
      this.pc.addTrack(newTrack, stream);
    }
  }

  public async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    const offerCollision =
      this.makingOffer || this.pc.signalingState !== 'stable';
    
    this.ignoreOffer = !this.isPolite && offerCollision;
    if (this.ignoreOffer) {
      console.log(`[WebRTC] Impolite peer ignoring colliding offer from ${this.peerToken.slice(0, 6)}`);
      return null;
    }

    this.isSettingRemoteAnswerPending = sdp.type === 'answer';
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.isSettingRemoteAnswerPending = false;

    await this.drainPendingCandidates();

    if (sdp.type === 'offer') {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      return this.pc.localDescription!;
    }
    return null;
  }

  public async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (this.pc.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainPendingCandidates();
    }
  }

  public async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (err) {
      if (!this.ignoreOffer) {
        console.error(`[WebRTC] Error adding ICE candidate:`, err);
      }
    }
  }

  private async drainPendingCandidates() {
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      if (cand) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.error('[WebRTC] Error draining ICE candidate:', e);
        }
      }
    }
  }

  public close() {
    this.pc.close();
  }
}
