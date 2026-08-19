import pytest

@pytest.mark.asyncio
async def test_create_and_join_room(client):
    # 1. Create anonymous room
    create_resp = await client.post("/api/v1/rooms", json={"name": "Engineering Sync"})
    assert create_resp.status_code == 201
    room_data = create_resp.json()
    assert "code" in room_data
    assert room_data["name"] == "Engineering Sync"
    room_code = room_data["code"]

    # 2. Get room by code
    get_resp = await client.get(f"/api/v1/rooms/{room_code}")
    assert get_resp.status_code == 200
    assert get_resp.json()["code"] == room_code

    # 3. Join anonymous room
    join_resp = await client.post(f"/api/v1/rooms/{room_code}/join", json={"display_name": "Alice"})
    assert join_resp.status_code == 200
    join_data = join_resp.json()
    assert join_data["display_name"] == "Alice"
    assert "session_token" in join_data
    assert "sfu_transport_token" in join_data
    assert len(join_data["ice_servers"]) >= 1
