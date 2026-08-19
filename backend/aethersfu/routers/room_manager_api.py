from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any

from aethersfu.services.room_manager import multi_party_room_manager

router = APIRouter(prefix="/api/v1/sfu/rooms", tags=["Multi-Party Room Manager"])


class ParticipantStateRequest(BaseModel):
    is_audio_muted: bool
    is_video_off: bool


@router.get("/{code}/state")
async def get_room_state(code: str):
    """
    Returns live room snapshot including participant roster, active tracks, and capacity stats.
    """
    state = await multi_party_room_manager.get_room_state(code)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not active or has no participants"
        )
    return state


@router.delete("/{code}/participants/{session_token}")
async def eject_participant(code: str, session_token: str):
    """
    Ejects participant from room state and releases associated tracks.
    """
    res = await multi_party_room_manager.leave_room(code, session_token)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant not found in room"
        )
    return {"status": "ejected", "session_token": session_token}
