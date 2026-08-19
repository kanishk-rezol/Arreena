export interface SFUPublisherResult {
  publisher_id: string;
  sdp: string;
  type: string;
}

export interface SFUSubscriberResult {
  subscriber_id: string;
  sdp: string;
  type: string;
  attached_tracks_count: number;
}

export class SFUClient {
  public roomCode: string;
  public publisherPc: RTCPeerConnection | null = null;
  public subscriberPc: RTCPeerConnection | null = null;
  public publisherId: string | null = null;
  public subscriberId: string | null = null;

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  async publishLocalStream(stream: MediaStream, iceServers: RTCConfiguration['iceServers']): Promise<SFUPublisherResult> {
    this.publisherPc = new RTCPeerConnection({ iceServers });

    stream.getTracks().forEach((track) => {
      this.publisherPc!.addTrack(track, stream);
    });

    const offer = await this.publisherPc.createOffer();
    await this.publisherPc.setLocalDescription(offer);

    const res = await fetch(`/api/v1/sfu/rooms/${this.roomCode}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
    });

    if (!res.ok) {
      throw new Error('Failed to establish SFU publisher uplink');
    }

    const data: SFUPublisherResult = await res.json();
    this.publisherId = data.publisher_id;

    await this.publisherPc.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
    );

    return data;
  }

  async subscribeRemoteStreams(
    iceServers: RTCConfiguration['iceServers'],
    onTrack: (remoteStream: MediaStream) => void
  ): Promise<SFUSubscriberResult> {
    this.subscriberPc = new RTCPeerConnection({ iceServers });

    this.subscriberPc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        onTrack(remoteStream);
      }
    };

    const offer = await this.subscriberPc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await this.subscriberPc.setLocalDescription(offer);

    const res = await fetch(`/api/v1/sfu/rooms/${this.roomCode}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
    });

    if (!res.ok) {
      throw new Error('Failed to establish SFU subscriber downlink');
    }

    const data: SFUSubscriberResult = await res.json();
    this.subscriberId = data.subscriber_id;

    await this.subscriberPc.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
    );

    return data;
  }

  async close() {
    if (this.publisherId) {
      await fetch(`/api/v1/sfu/rooms/${this.roomCode}/publish/${this.publisherId}`, { method: 'DELETE' });
    }
    if (this.subscriberId) {
      await fetch(`/api/v1/sfu/rooms/${this.roomCode}/subscribe/${this.subscriberId}`, { method: 'DELETE' });
    }

    if (this.publisherPc) this.publisherPc.close();
    if (this.subscriberPc) this.subscriberPc.close();
  }
}
