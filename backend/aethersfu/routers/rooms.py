from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from aethersfu.db.database import get_db
from aethersfu.services.room_service import RoomService

router = APIRouter(prefix="/api/v1/rooms", tags=["Rooms"])


class CreateRoomRequest(BaseModel):
    name: Optional[str] = Field("Anonymous Meeting", description="Display name for the room")


class RoomResponse(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(req: CreateRoomRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates an anonymous video conferencing room with an unguessable code.
    No login or authentication required.
    """
    room = await RoomService.create_room(db, name=req.name or "Anonymous Meeting")
    return RoomResponse(
        id=room.id,
        code=room.code,
        name=room.name,
        is_active=room.is_active,
        created_at=room.created_at.isoformat()
    )


@router.get("/{code}", response_model=RoomResponse)
async def get_room(code: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieves metadata for an active room by its unguessable code.
    """
    room = await RoomService.get_room_by_code(db, code)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found or no longer active"
        )
    return RoomResponse(
        id=room.id,
        code=room.code,
        name=room.name,
        is_active=room.is_active,
        created_at=room.created_at.isoformat()
    )
