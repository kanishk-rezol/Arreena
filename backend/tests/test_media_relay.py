import pytest
from aiortc import RTCPeerConnection

@pytest.mark.asyncio
async def test_media_relay_publish_and_subscribe(client):
    room_code = "test-relay-room"

    # 1. Create Publisher A uplink offer
    pc_pub = RTCPeerConnection()
    pub_offer = await pc_pub.createOffer()

    pub_resp = await client.post(
        f"/api/v1/sfu/rooms/{room_code}/publish",
        json={"sdp": pub_offer.sdp, "type": pub_offer.type}
    )
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()
    assert "publisher_id" in pub_data
    publisher_id = pub_data["publisher_id"]

    # 2. Create Subscriber B downlink offer
    pc_sub = RTCPeerConnection()
    sub_offer = await pc_sub.createOffer()

    sub_resp = await client.post(
        f"/api/v1/sfu/rooms/{room_code}/subscribe",
        json={"sdp": sub_offer.sdp, "type": sub_offer.type}
    )
    assert sub_resp.status_code == 200
    sub_data = sub_resp.json()
    assert "subscriber_id" in sub_data
    subscriber_id = sub_data["subscriber_id"]

    # 3. Teardown publisher and subscriber downlinks
    del_sub = await client.delete(f"/api/v1/sfu/rooms/{room_code}/subscribe/{subscriber_id}")
    assert del_sub.status_code == 200

    del_pub = await client.delete(f"/api/v1/sfu/rooms/{room_code}/publish/{publisher_id}")
    assert del_pub.status_code == 200

    await pc_pub.close()
    await pc_sub.close()
