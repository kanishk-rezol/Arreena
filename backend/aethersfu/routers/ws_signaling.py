import json
import logging
import time
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from aethersfu.db.snowflake import generate_snowflake_id

logger = logging.getLogger("aethersfu.signaling")

router = APIRouter(tags=["WebSocket Signaling"])

# Ephemeral in-memory connection manager for signaling relay
# (Will be backed by Redis PubSub when scaled horizontally)
class SignalingManager:
    def __init__(self):
        # room_code -> Dict[session_token, WebSocket]
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, room_code: str, session_token: str, websocket: WebSocket):
        await websocket.accept()
        if room_code not in self.rooms:
            self.rooms[room_code] = {}
        self.rooms[room_code][session_token] = websocket
        logger.info(f"Client {session_token[:8]} connected to room {room_code}")

        # Broadcast participant-joined event to others in room
        await self.broadcast(
            room_code=room_code,
            sender_token=session_token,
            message={
                "type": "peer-joined",
                "peer_id": session_token[:8],
                "sender_token": session_token
            }
        )

    def disconnect(self, room_code: str, session_token: str):
        if room_code in self.rooms and session_token in self.rooms[room_code]:
            del self.rooms[room_code][session_token]
            if not self.rooms[room_code]:
                del self.rooms[room_code]
            logger.info(f"Client {session_token[:8]} disconnected from room {room_code}")

    async def broadcast(self, room_code: str, sender_token: str, message: dict):
        if room_code not in self.rooms:
            return
        payload = json.dumps(message)
        for token, ws in list(self.rooms[room_code].items()):
            if token != sender_token:
                try:
                    await ws.send_text(payload)
                except Exception as e:
                    logger.error(f"Error sending to {token[:8]}: {e}")

    async def send_to_peer(self, room_code: str, target_token: str, message: dict):
        if room_code in self.rooms and target_token in self.rooms[room_code]:
            try:
                await self.rooms[room_code][target_token].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending targeted msg to {target_token[:8]}: {e}")


signaling_manager = SignalingManager()


@router.websocket("/ws/rooms/{room_code}/signaling")
async def websocket_signaling_endpoint(
    websocket: WebSocket,
    room_code: str,
    session_token: str
):
    """
    Anonymous WebSocket signaling channel for SDP offers, answers, and ICE candidate exchange.
    """
    await signaling_manager.connect(room_code, session_token, websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                msg_type = data.get("type")
                target_token = data.get("target_token")

                # Inject sender metadata
                data["sender_token"] = session_token
                data["sender_peer_id"] = session_token[:8]

                if msg_type == "chat-message":
                    if not data.get("message_id"):
                        data["message_id"] = generate_snowflake_id()
                    if not data.get("timestamp"):
                        data["timestamp"] = time.time()

                if target_token:
                    # Targeted P2P / SFU negotiation message
                    await signaling_manager.send_to_peer(room_code, target_token, data)
                else:
                    # Broadcast message to room peers
                    await signaling_manager.broadcast(room_code, session_token, data)

            except json.JSONDecodeError:
                logger.warning("Received invalid JSON payload on signaling socket")
    except WebSocketDisconnect:
        signaling_manager.disconnect(room_code, session_token)
        await signaling_manager.broadcast(
            room_code=room_code,
            sender_token=session_token,
            message={
                "type": "peer-left",
                "peer_id": session_token[:8],
                "sender_token": session_token
            }
        )
