from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from aethersfu.config import settings
from aethersfu.db.database import init_db
from aethersfu.routers import health, rooms, sessions, ws_signaling, media_ingest, sfu_relay, room_manager_api

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("aethersfu")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Arreena Control Plane...")
    await init_db()
    logger.info("Database initialized.")
    yield
    logger.info("Shutting down Arreena Control Plane...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        description="FastAPI Control Plane for DIY WebRTC SFU Platform",
        lifespan=lifespan
    )

    # Enable CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include Routers
    app.include_router(health.router)
    app.include_router(rooms.router)
    app.include_router(sessions.router)
    app.include_router(ws_signaling.router)
    app.include_router(media_ingest.router)
    app.include_router(sfu_relay.router)
    app.include_router(room_manager_api.router)

    return app


app = create_app()
