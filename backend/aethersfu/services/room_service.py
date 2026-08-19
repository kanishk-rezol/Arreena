import secrets
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from aethersfu.db.models import Room, AnonymousSession, LifecycleEvent


class RoomService:

    @staticmethod
    def generate_room_code() -> str:
        """
        Generates an unguessable room code formatted like 'abc-defg-hij'.
        """
        part1 = secrets.token_hex(2)
        part2 = secrets.token_hex(2)
        part3 = secrets.token_hex(2)
        return f"{part1}-{part2}-{part3}"

    @staticmethod
    def generate_session_token() -> str:
        """
        Generates an unguessable session token for an anonymous participant.
        """
        return f"sess_{secrets.token_urlsafe(32)}"

    @classmethod
    async def create_room(cls, db: AsyncSession, name: str = "Anonymous Room") -> Room:
        code = cls.generate_room_code()
        room = Room(code=code, name=name, is_active=True)
        db.add(room)
        await db.commit()
        await db.refresh(room)

        event = LifecycleEvent(
            room_id=room.id,
            event_type="room_created",
            details=f"Room created with code {code}"
        )
        db.add(event)
        await db.commit()
        return room

    @classmethod
    async def get_room_by_code(cls, db: AsyncSession, code: str) -> Optional[Room]:
        stmt = select(Room).where(Room.code == code, Room.is_active == True)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def create_anonymous_session(
        cls, db: AsyncSession, room_id: str, display_name: str
    ) -> AnonymousSession:
        token = cls.generate_session_token()
        session = AnonymousSession(
            session_token=token,
            room_id=room_id,
            display_name=display_name
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        event = LifecycleEvent(
            room_id=room_id,
            event_type="participant_joined",
            details=f"Participant {display_name} joined (Session {session.id})"
        )
        db.add(event)
        await db.commit()
        return session
