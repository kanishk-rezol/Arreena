import asyncio
import logging
import secrets
from typing import Dict, List, Optional
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaRelay

logger = logging.getLogger("aethersfu.media_relay")


class PublisherSession:
    def __init__(self, room_code: str, publisher_id: str):
        self.room_code = room_code
        self.publisher_id = publisher_id
        self.pc = RTCPeerConnection()
        self.relayed_tracks: List[MediaStreamTrack] = []
        self._setup_listeners()

    def _setup_listeners(self):
        @self.pc.on("connectionstatechange")
        def on_connectionstatechange():
            logger.info(f"[Relay Pub {self.publisher_id[:8]}] Connection state: {self.pc.connectionState}")

    def add_incoming_track(self, track: MediaStreamTrack, relay: MediaRelay):
        # Create lightweight forwardable proxy track
        proxy_track = relay.subscribe(track)
        self.relayed_tracks.append(proxy_track)
        logger.info(f"[Relay Pub {self.publisher_id[:8]}] Created proxy track for {track.kind} ({track.id})")

    async def close(self):
        await self.pc.close()


class SubscriberSession:
    def __init__(self, room_code: str, subscriber_id: str):
        self.room_code = room_code
        self.subscriber_id = subscriber_id
        self.pc = RTCPeerConnection()
        self._setup_listeners()

    def _setup_listeners(self):
        @self.pc.on("connectionstatechange")
        def on_connectionstatechange():
            logger.info(f"[Relay Sub {self.subscriber_id[:8]}] Connection state: {self.pc.connectionState}")

    def attach_proxy_tracks(self, proxy_tracks: List[MediaStreamTrack]):
        for track in proxy_tracks:
            self.pc.addTrack(track)
            logger.info(f"[Relay Sub {self.subscriber_id[:8]}] Attached proxy track {track.kind} ({track.id})")

    async def close(self):
        await self.pc.close()


class RoomRelayManager:
    def __init__(self):
        self.relay = MediaRelay()
        # room_code -> Dict[publisher_id, PublisherSession]
        self.publishers: Dict[str, Dict[str, PublisherSession]] = {}
        # room_code -> Dict[subscriber_id, SubscriberSession]
        self.subscribers: Dict[str, Dict[str, SubscriberSession]] = {}

    async def create_publisher(self, room_code: str, sdp_offer: str) -> dict:
        publisher_id = f"pub_{secrets.token_hex(6)}"
        session = PublisherSession(room_code, publisher_id)

        if room_code not in self.publishers:
            self.publishers[room_code] = {}
        self.publishers[room_code][publisher_id] = session

        @session.pc.on("track")
        def on_track(track: MediaStreamTrack):
            session.add_incoming_track(track, self.relay)

        offer = RTCSessionDescription(sdp=sdp_offer, type="offer")
        await session.pc.setRemoteDescription(offer)

        answer = await session.pc.createAnswer()
        await session.pc.setLocalDescription(answer)

        return {
            "publisher_id": publisher_id,
            "sdp": session.pc.localDescription.sdp,
            "type": session.pc.localDescription.type,
        }

    async def create_subscriber(self, room_code: str, sdp_offer: str) -> dict:
        subscriber_id = f"sub_{secrets.token_hex(6)}"
        session = SubscriberSession(room_code, subscriber_id)

        if room_code not in self.subscribers:
            self.subscribers[room_code] = {}
        self.subscribers[room_code][subscriber_id] = session

        # Attach all existing proxy tracks in the room to this subscriber's downlink
        proxy_tracks = []
        if room_code in self.publishers:
            for pub in self.publishers[room_code].values():
                proxy_tracks.extend(pub.relayed_tracks)

        session.attach_proxy_tracks(proxy_tracks)

        offer = RTCSessionDescription(sdp=sdp_offer, type="offer")
        await session.pc.setRemoteDescription(offer)

        answer = await session.pc.createAnswer()
        await session.pc.setLocalDescription(answer)

        return {
            "subscriber_id": subscriber_id,
            "sdp": session.pc.localDescription.sdp,
            "type": session.pc.localDescription.type,
            "attached_tracks_count": len(proxy_tracks),
        }

    async def close_publisher(self, room_code: str, publisher_id: str) -> bool:
        if room_code in self.publishers and publisher_id in self.publishers[room_code]:
            session = self.publishers[room_code].pop(publisher_id)
            await session.close()
            if not self.publishers[room_code]:
                del self.publishers[room_code]
            return True
        return False

    async def close_subscriber(self, room_code: str, subscriber_id: str) -> bool:
        if room_code in self.subscribers and subscriber_id in self.subscribers[room_code]:
            session = self.subscribers[room_code].pop(subscriber_id)
            await session.close()
            if not self.subscribers[room_code]:
                del self.subscribers[room_code]
            return True
        return False


room_relay_manager = RoomRelayManager()
