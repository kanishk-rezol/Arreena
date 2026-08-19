from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from aethersfu.services.media_relay import room_relay_manager

router = APIRouter(prefix="/api/v1/sfu/rooms", tags=["SFU Media Relay"])


class OfferRequest(BaseModel):
    sdp: str
    type: str = "offer"


class PublisherResponse(BaseModel):
    publisher_id: str
    sdp: str
    type: str = "answer"


class SubscriberResponse(BaseModel):
    subscriber_id: str
    sdp: str
    type: str = "answer"
    attached_tracks_count: int


@router.post("/{code}/publish", response_model=PublisherResponse)
async def create_publisher_uplink(code: str, req: OfferRequest):
    """
    Establishes publisher WebRTC uplink to the AetherSFU server relay.
    Registers incoming tracks with aiortc.MediaRelay for server fan-out.
    """
    try:
        res = await room_relay_manager.create_publisher(code, req.sdp)
        return PublisherResponse(
            publisher_id=res["publisher_id"],
            sdp=res["sdp"],
            type=res["type"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create publisher uplink: {str(e)}"
        )


@router.post("/{code}/subscribe", response_model=SubscriberResponse)
async def create_subscriber_downlink(code: str, req: OfferRequest):
    """
    Establishes subscriber WebRTC downlink from the AetherSFU server relay.
    Attaches all active room proxy tracks to the subscriber stream.
    """
    try:
        res = await room_relay_manager.create_subscriber(code, req.sdp)
        return SubscriberResponse(
            subscriber_id=res["subscriber_id"],
            sdp=res["sdp"],
            type=res["type"],
            attached_tracks_count=res["attached_tracks_count"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create subscriber downlink: {str(e)}"
        )


@router.delete("/{code}/publish/{publisher_id}")
async def close_publisher_uplink(code: str, publisher_id: str):
    success = await room_relay_manager.close_publisher(code, publisher_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Publisher uplink not found"
        )
    return {"status": "closed", "publisher_id": publisher_id}


@router.delete("/{code}/subscribe/{subscriber_id}")
async def close_subscriber_downlink(code: str, subscriber_id: str):
    success = await room_relay_manager.close_subscriber(code, subscriber_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscriber downlink not found"
        )
    return {"status": "closed", "subscriber_id": subscriber_id}
