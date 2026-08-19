import pytest
from aiortc import RTCPeerConnection

@pytest.mark.asyncio
async def test_media_ingest_offer_and_stats(client):
    # Create real WebRTC SDP offer using aiortc client
    pc = RTCPeerConnection()
    offer = await pc.createOffer()

    # 1. Post offer to media ingest endpoint
    response = await client.post(
        "/api/v1/media/ingest/offer",
        json={"sdp": offer.sdp, "type": offer.type}
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["type"] == "answer"
    session_id = data["session_id"]

    # 2. Get live ingest stats
    stats_resp = await client.get(f"/api/v1/media/ingest/stats/{session_id}")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["session_id"] == session_id
    assert "audio_bitrate_kbps" in stats
    assert "total_bitrate_kbps" in stats

    # 3. Teardown session
    close_resp = await client.delete(f"/api/v1/media/ingest/{session_id}")
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "closed"
    await pc.close()
