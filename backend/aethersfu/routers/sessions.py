from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List

from aethersfu.db.database import get_db
from aethersfu.services.room_service import RoomService
from aethersfu.services.credential_service import CredentialService

router = APIRouter(prefix="/api/v1/rooms", tags=["Sessions & Credentials"])


class JoinRoomRequest(BaseModel):
    display_name: str = Field("Anonymous Guest", min_length=1, max_length=64)


class JoinRoomResponse(BaseModel):
    room_id: str
    room_code: str
    session_token: str
    display_name: str
    sfu_transport_token: str
    ice_servers: List[Dict[str, Any]]


@router.post("/{code}/join", response_model=JoinRoomResponse)
async def join_room(
    code: str,
    req: JoinRoomRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Joins an anonymous room. Generates a temporary session token, backend-issued TURN credentials,
    and internal SFU transport parameters.
    """
    room = await RoomService.get_room_by_code(db, code)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found or inactive"
        )

    session = await RoomService.create_anonymous_session(
        db=db,
        room_id=room.id,
        display_name=req.display_name
    )

    turn_creds = CredentialService.generate_turn_credentials(username=session.id)
    sfu_token = CredentialService.generate_sfu_transport_token(
        room_code=room.code,
        session_token=session.session_token
    )

    return JoinRoomResponse(
        room_id=room.id,
        room_code=room.code,
        session_token=session.session_token,
        display_name=session.display_name,
        sfu_transport_token=sfu_token,
        ice_servers=turn_creds["ice_servers"]
    )
