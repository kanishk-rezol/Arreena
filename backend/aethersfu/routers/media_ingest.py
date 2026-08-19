from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from aethersfu.services.aiortc_ingest import ingest_manager

router = APIRouter(prefix="/api/v1/media/ingest", tags=["Media Ingest Reference Path"])


class IngestOfferRequest(BaseModel):
    sdp: str
    type: str = "offer"


class IngestOfferResponse(BaseModel):
    session_id: str
    sdp: str
    type: str = "answer"


@router.post("/offer", response_model=IngestOfferResponse)
async def process_media_offer(req: IngestOfferRequest):
    """
    Browser-to-server media ingest endpoint. Receives WebRTC SDP offer, attaches server
    RTCPeerConnection receivers, and returns server SDP answer.
    """
    try:
        res = await ingest_manager.handle_offer(sdp_offer=req.sdp, type_=req.type)
        return IngestOfferResponse(
            session_id=res["session_id"],
            sdp=res["sdp"],
            type=res["type"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process SDP offer: {str(e)}"
        )


@router.get("/stats/{session_id}")
async def get_ingest_stats(session_id: str):
    """
    Queries live server-side ingest performance metrics (bitrate, packet counts, active tracks).
    """
    stats = ingest_manager.get_session_stats(session_id)
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingest session not found or closed"
        )
    return stats


@router.delete("/{session_id}")
async def close_ingest_session(session_id: str):
    """
    Closes server RTCPeerConnection and releases media receivers.
    """
    success = await ingest_manager.close_session(session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingest session not found"
        )
    return {"status": "closed", "session_id": session_id}
