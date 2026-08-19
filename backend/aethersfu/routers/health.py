from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "aethersfu-control"}


@router.get("/ready")
async def readiness_check():
    return {"status": "ready", "database": "connected"}
