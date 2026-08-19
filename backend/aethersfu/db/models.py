from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from aethersfu.db.database import Base
from aethersfu.db.snowflake import generate_snowflake_id


def current_utc_time() -> datetime:
    return datetime.now(timezone.utc)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_snowflake_id)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time, onupdate=current_utc_time)
    closed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    sessions: Mapped[list["AnonymousSession"]] = relationship("AnonymousSession", back_populates="room")


class AnonymousSession(Base):
    __tablename__ = "anonymous_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_snowflake_id)
    session_token: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    room_id: Mapped[str] = mapped_column(String(64), ForeignKey("rooms.id"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time, onupdate=current_utc_time)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    left_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    room: Mapped["Room"] = relationship("Room", back_populates="sessions")


class CallHistory(Base):
    __tablename__ = "call_history"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_snowflake_id)
    room_id: Mapped[str] = mapped_column(String(64), nullable=False)
    participant_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time, onupdate=current_utc_time)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=generate_snowflake_id)
    room_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)  # participant_joined, participant_left, media_node_assigned
    details: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=current_utc_time, onupdate=current_utc_time)
