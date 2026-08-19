import pytest
import json
from fastapi.testclient import TestClient
from aethersfu.main import create_app
from aethersfu.db.database import Base, get_db
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
def sync_client():
    app = create_app()
    with TestClient(app) as client:
        yield client


def test_websocket_signaling_flow(sync_client):
    # 1. Create a room
    room_resp = sync_client.post("/api/v1/rooms", json={"name": "Signaling Room"})
    assert room_resp.status_code == 201
    room_code = room_resp.json()["code"]

    # 2. Join session for Participant A
    join_a = sync_client.post(f"/api/v1/rooms/{room_code}/join", json={"display_name": "Participant A"})
    token_a = join_a.json()["session_token"]

    # 3. Join session for Participant B
    join_b = sync_client.post(f"/api/v1/rooms/{room_code}/join", json={"display_name": "Participant B"})
    token_b = join_b.json()["session_token"]

    # 4. Connect Participant A WebSocket
    with sync_client.websocket_connect(f"/ws/rooms/{room_code}/signaling?session_token={token_a}") as ws_a:
        # 5. Connect Participant B WebSocket
        with sync_client.websocket_connect(f"/ws/rooms/{room_code}/signaling?session_token={token_b}") as ws_b:
            # Participant A should receive 'peer-joined' notification for B
            msg_for_a = json.loads(ws_a.receive_text())
            assert msg_for_a["type"] == "peer-joined"
            assert msg_for_a["sender_token"] == token_b

            # Participant B sends SDP offer targeted to A
            offer_payload = {
                "type": "offer",
                "sdp": {"type": "offer", "sdp": "v=0\r\no=- 123 456 IN IP4 127.0.0.1..."},
                "target_token": token_a
            }
            ws_b.send_text(json.dumps(offer_payload))

            # Participant A receives the SDP offer
            received_offer = json.loads(ws_a.receive_text())
            assert received_offer["type"] == "offer"
            assert received_offer["sender_token"] == token_b
            assert received_offer["sdp"]["type"] == "offer"

            # Participant A sends SDP answer back to B
            answer_payload = {
                "type": "answer",
                "sdp": {"type": "answer", "sdp": "v=0\r\no=- 789 101 IN IP4 127.0.0.1..."},
                "target_token": token_b
            }
            ws_a.send_text(json.dumps(answer_payload))

            # Participant B receives the SDP answer
            received_answer = json.loads(ws_b.receive_text())
            assert received_answer["type"] == "answer"
            assert received_answer["sender_token"] == token_a
            assert received_answer["sdp"]["type"] == "answer"

        # Participant B disconnected -> Participant A should receive 'peer-left'
        left_msg = json.loads(ws_a.receive_text())
        assert left_msg["type"] == "peer-left"
        assert left_msg["sender_token"] == token_b


def test_websocket_chat_message_broadcast(sync_client):
    # 1. Create room and join sessions
    room_resp = sync_client.post("/api/v1/rooms", json={"name": "Chat Room"})
    room_code = room_resp.json()["code"]

    join_a = sync_client.post(f"/api/v1/rooms/{room_code}/join", json={"display_name": "Alice"})
    token_a = join_a.json()["session_token"]

    join_b = sync_client.post(f"/api/v1/rooms/{room_code}/join", json={"display_name": "Bob"})
    token_b = join_b.json()["session_token"]

    with sync_client.websocket_connect(f"/ws/rooms/{room_code}/signaling?session_token={token_a}") as ws_a:
        with sync_client.websocket_connect(f"/ws/rooms/{room_code}/signaling?session_token={token_b}") as ws_b:
            # Drain 'peer-joined' event on A
            ws_a.receive_text()

            # Participant A sends a chat message
            chat_payload = {
                "type": "chat-message",
                "display_name": "Alice",
                "text": "Hello Bob!"
            }
            ws_a.send_text(json.dumps(chat_payload))

            # Participant B should receive the broadcasted chat message
            received = json.loads(ws_b.receive_text())
            assert received["type"] == "chat-message"
            assert received["sender_token"] == token_a
            assert received["text"] == "Hello Bob!"
            assert "message_id" in received
            assert "timestamp" in received
