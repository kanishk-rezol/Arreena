import pytest
from aethersfu.services.room_manager import multi_party_room_manager

@pytest.mark.asyncio
async def test_room_manager_multi_party_capacity(client):
    room_code = "multi-party-test-room"

    # 1. Simulate 10 participants joining elastically
    participant_tokens = [f"sess_token_{i}" for i in range(10)]

    for i, token in enumerate(participant_tokens):
        p = await multi_party_room_manager.join_room(
            room_code=room_code,
            session_token=token,
            display_name=f"Participant #{i+1}"
        )
        assert p.display_name == f"Participant #{i+1}"
        # Register audio and video tracks for each participant
        room = await multi_party_room_manager.get_or_create_room(room_code)
        await room.register_track(token, f"audio_track_{i}", "audio")
        await room.register_track(token, f"video_track_{i}", "video")

    # 2. Query room state endpoint via REST
    resp = await client.get(f"/api/v1/sfu/rooms/{room_code}/state")
    assert resp.status_code == 200
    state = resp.json()

    assert state["participant_count"] == 10
    assert state["total_published_tracks"] == 20
    assert len(state["roster"]) == 10

    # 3. Eject 3 participants and verify capacity updates cleanly
    for i in range(3):
        eject_resp = await client.delete(f"/api/v1/sfu/rooms/{room_code}/participants/{participant_tokens[i]}")
        assert eject_resp.status_code == 200

    updated_resp = await client.get(f"/api/v1/sfu/rooms/{room_code}/state")
    assert updated_resp.status_code == 200
    updated_state = updated_resp.json()

    assert updated_state["participant_count"] == 7
    assert updated_state["total_published_tracks"] == 14

    # 4. Clean up remaining participants
    for token in participant_tokens[3:]:
        await multi_party_room_manager.leave_room(room_code, token)

    empty_resp = await client.get(f"/api/v1/sfu/rooms/{room_code}/state")
    assert empty_resp.status_code == 404
