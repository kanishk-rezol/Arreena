import asyncio
import logging
import time
from typing import Dict, List, Optional, Set

logger = logging.getLogger("aethersfu.room_manager")


class ParticipantInfo:
    def __init__(self, session_token: str, display_name: str):
        self.session_token = session_token
        self.display_name = display_name
        self.joined_at = time.time()
        self.is_audio_muted = False
        self.is_video_off = False
        self.published_tracks: Dict[str, str] = {}  # track_id -> kind

    def to_dict(self) -> dict:
        return {
            "session_token": self.session_token,
            "peer_id": self.session_token[:8],
            "display_name": self.display_name,
            "joined_at": round(self.joined_at, 1),
            "is_audio_muted": self.is_audio_muted,
            "is_video_off": self.is_video_off,
            "tracks_count": len(self.published_tracks),
            "tracks": self.published_tracks,
        }


class RoomState:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.created_at = time.time()
        self.participants: Dict[str, ParticipantInfo] = {}  # session_token -> ParticipantInfo
        self.lock = asyncio.Lock()

    async def add_participant(self, session_token: str, display_name: str) -> ParticipantInfo:
        async with self.lock:
            if session_token not in self.participants:
                p = ParticipantInfo(session_token, display_name)
                self.participants[session_token] = p
                logger.info(f"[{self.room_code}] Added participant {display_name} ({session_token[:8]})")
            return self.participants[session_token]

    async def remove_participant(self, session_token: str) -> Optional[ParticipantInfo]:
        async with self.lock:
            p = self.participants.pop(session_token, None)
            if p:
                logger.info(f"[{self.room_code}] Removed participant {p.display_name} ({session_token[:8]})")
            return p

    async def register_track(self, session_token: str, track_id: str, kind: str):
        async with self.lock:
            p = self.participants.get(session_token)
            if p:
                p.published_tracks[track_id] = kind
                logger.info(f"[{self.room_code}] Registered {kind} track {track_id} for {p.display_name}")

    async def update_participant_state(self, session_token: str, is_muted: bool, is_video_off: bool):
        async with self.lock:
            p = self.participants.get(session_token)
            if p:
                p.is_audio_muted = is_muted
                p.is_video_off = is_video_off

    async def get_snapshot(self) -> dict:
        async with self.lock:
            roster = [p.to_dict() for p in self.participants.values()]
            total_tracks = sum(len(p.published_tracks) for p in self.participants.values())
            return {
                "room_code": self.room_code,
                "participant_count": len(self.participants),
                "total_published_tracks": total_tracks,
                "created_at": round(self.created_at, 1),
                "roster": roster,
            }


class MultiPartyRoomManager:
    def __init__(self):
        self.rooms: Dict[str, RoomState] = {}
        self._global_lock = asyncio.Lock()

    async def get_or_create_room(self, room_code: str) -> RoomState:
        async with self._global_lock:
            if room_code not in self.rooms:
                self.rooms[room_code] = RoomState(room_code)
            return self.rooms[room_code]

    async def join_room(self, room_code: str, session_token: str, display_name: str) -> ParticipantInfo:
        room = await self.get_or_create_room(room_code)
        return await room.add_participant(session_token, display_name)

    async def leave_room(self, room_code: str, session_token: str) -> Optional[ParticipantInfo]:
        async with self._global_lock:
            room = self.rooms.get(room_code)
            if not room:
                return None
            res = await room.remove_participant(session_token)
            if len(room.participants) == 0:
                del self.rooms[room_code]
                logger.info(f"[{room_code}] Closed empty room state")
            return res

    async def get_room_state(self, room_code: str) -> Optional[dict]:
        async with self._global_lock:
            room = self.rooms.get(room_code)
            if not room:
                return None
            return await room.get_snapshot()


multi_party_room_manager = MultiPartyRoomManager()
