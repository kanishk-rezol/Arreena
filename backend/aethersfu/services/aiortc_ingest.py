import asyncio
import time
import logging
import secrets
from typing import Dict, Any, Optional

from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack

logger = logging.getLogger("aethersfu.aiortc_ingest")


class IngestSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.pc = RTCPeerConnection()
        self.start_time = time.time()

        self.audio_bytes = 0
        self.video_bytes = 0
        self.audio_packets = 0
        self.video_packets = 0
        self.last_sample_time = time.time()
        self.audio_bitrate_kbps = 0.0
        self.video_bitrate_kbps = 0.0
        self.total_bitrate_kbps = 0.0

        self.active_tracks: Dict[str, str] = {}  # track_id -> track_kind
        self.connection_state = "new"
        self._monitor_task: Optional[asyncio.Task] = None

        self.setup_listeners()

    def setup_listeners(self):
        @self.pc.on("track")
        def on_track(track: MediaStreamTrack):
            logger.info(f"[{self.session_id[:8]}] Server received {track.kind} track {track.id}")
            self.active_tracks[track.id] = track.kind

            # Start recording track packets in background loop
            asyncio.create_task(self.consume_track(track))

        @self.pc.on("connectionstatechange")
        def on_connectionstatechange():
            self.connection_state = self.pc.connectionState
            logger.info(f"[{self.session_id[:8]}] Ingest PC state: {self.pc.connectionState}")
            if self.pc.connectionState in ["closed", "failed"]:
                asyncio.create_task(self.cleanup())

    async def consume_track(self, track: MediaStreamTrack):
        """
        Continuously pulls frames from the track to simulate active server ingest
        and measures packet byte counters for bandwidth calculation.
        """
        try:
            while True:
                frame = await track.recv()
                # Estimate uncompressed/compressed frame byte weight for stats
                estimated_bytes = 1000 if track.kind == "video" else 160
                if track.kind == "video":
                    self.video_bytes += estimated_bytes
                    self.video_packets += 1
                else:
                    self.audio_bytes += estimated_bytes
                    self.audio_packets += 1
        except Exception:
            # Track ended or connection closed
            pass

    def start_stats_monitor(self):
        self._monitor_task = asyncio.create_task(self._stats_loop())

    async def _stats_loop(self):
        last_time = time.time()
        last_audio_bytes = 0
        last_video_bytes = 0

        while self.connection_state not in ["closed", "failed"]:
            await asyncio.sleep(1.0)
            now = time.time()
            elapsed = now - last_time
            if elapsed > 0:
                audio_diff = self.audio_bytes - last_audio_bytes
                video_diff = self.video_bytes - last_video_bytes

                self.audio_bitrate_kbps = round((audio_diff * 8) / (elapsed * 1000), 2)
                self.video_bitrate_kbps = round((video_diff * 8) / (elapsed * 1000), 2)
                self.total_bitrate_kbps = round(self.audio_bitrate_kbps + self.video_bitrate_kbps, 2)

                last_audio_bytes = self.audio_bytes
                last_video_bytes = self.video_bytes
                last_time = now

    def get_stats(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "connection_state": self.pc.connectionState,
            "duration_seconds": round(time.time() - self.start_time, 1),
            "tracks_count": len(self.active_tracks),
            "tracks": self.active_tracks,
            "audio_packets": self.audio_packets,
            "video_packets": self.video_packets,
            "audio_bitrate_kbps": self.audio_bitrate_kbps,
            "video_bitrate_kbps": self.video_bitrate_kbps,
            "total_bitrate_kbps": self.total_bitrate_kbps,
        }

    async def cleanup(self):
        if self._monitor_task:
            self._monitor_task.cancel()
        await self.pc.close()


class MediaIngestManager:
    def __init__(self):
        self.sessions: Dict[str, IngestSession] = {}

    async def handle_offer(self, sdp_offer: str, type_: str = "offer") -> Dict[str, Any]:
        session_id = f"ingest_{secrets.token_hex(6)}"
        session = IngestSession(session_id)
        self.sessions[session_id] = session

        offer = RTCSessionDescription(sdp=sdp_offer, type=type_)
        await session.pc.setRemoteDescription(offer)

        answer = await session.pc.createAnswer()
        await session.pc.setLocalDescription(answer)

        session.start_stats_monitor()

        return {
            "session_id": session_id,
            "sdp": session.pc.localDescription.sdp,
            "type": session.pc.localDescription.type,
        }

    def get_session_stats(self, session_id: str) -> Optional[Dict[str, Any]]:
        session = self.sessions.get(session_id)
        return session.get_stats() if session else None

    async def close_session(self, session_id: str) -> bool:
        session = self.sessions.pop(session_id, None)
        if session:
            await session.cleanup()
            return True
        return False


ingest_manager = MediaIngestManager()
