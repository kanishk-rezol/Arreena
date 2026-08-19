# AetherSFU API Reference Guide

## Base URLs
* **Local Development Backend**: `http://127.0.0.1:8000`
* **WebSocket Gateway**: `ws://127.0.0.1:8000`
* **Interactive Swagger UI**: `http://127.0.0.1:8000/docs`

---

## 1. Health Endpoints

### `GET /api/v1/health`
Checks control plane service status.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "app_name": "AetherSFU Control Plane",
  "environment": "development"
}
```

---

## 2. Room Management Endpoints

### `POST /api/v1/rooms`
Creates a new anonymous video call room.

**Request Body:**
```json
{
  "name": "Team Sync Room"
}
```

**Response (201 Created):**
```json
{
  "id": "82919093006635008",
  "code": "a5ca-4ba5-0344",
  "name": "Team Sync Room",
  "is_active": true,
  "created_at": "2026-08-18T01:04:46.840Z"
}
```

### `GET /api/v1/rooms/{code}`
Retrieves room details by its unguessable room code.

**Response (200 OK):**
```json
{
  "id": "82919093006635008",
  "code": "a5ca-4ba5-0344",
  "name": "Team Sync Room",
  "is_active": true,
  "created_at": "2026-08-18T01:04:46.840Z"
}
```

---

## 3. Session & Credential Endpoints

### `POST /api/v1/sessions/join`
Joins a room anonymously and returns ICE server configuration.

**Request Body:**
```json
{
  "room_code": "a5ca-4ba5-0344",
  "display_name": "Alice Developer"
}
```

**Response (200 OK):**
```json
{
  "session_token": "sess_4qZn6RiiDgu618mdEMl7sQBk83N-OUZMgQCPBkiG9Tw",
  "room_code": "a5ca-4ba5-0344",
  "display_name": "Alice Developer",
  "ice_servers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    {
      "urls": ["turn:localhost:3478"],
      "username": "1767312000:sess_4qZn",
      "credential": "generated_hmac_secret"
    }
  ]
}
```

### `GET /api/v1/sessions/credentials/turn`
Generates time-limited Coturn TURN credentials.

**Response (200 OK):**
```json
{
  "urls": ["turn:localhost:3478"],
  "username": "1767312000:anonymous_user",
  "credential": "generated_hmac_secret",
  "ttl_seconds": 86400
}
```

---

## 4. Multi-Party SFU Room Manager Endpoints

### `GET /api/v1/sfu/rooms/{code}/state`
Retrieves live room participant roster, track telemetry, and capacity stats.

**Response (200 OK):**
```json
{
  "room_code": "a5ca-4ba5-0344",
  "participant_count": 2,
  "total_published_tracks": 4,
  "created_at": 1767225600.0,
  "roster": [
    {
      "session_token": "sess_4qZn6RiiDgu61...",
      "peer_id": "sess_4qZ",
      "display_name": "Alice Developer",
      "joined_at": 1767225610.5,
      "is_audio_muted": false,
      "is_video_off": false,
      "tracks_count": 2,
      "tracks": {
        "track_audio_1": "audio",
        "track_video_1": "video"
      }
    }
  ]
}
```

### `DELETE /api/v1/sfu/rooms/{code}/participants/{session_token}`
Ejects a participant and releases all published tracks.

**Response (200 OK):**
```json
{
  "status": "ejected",
  "session_token": "sess_4qZn6RiiDgu61..."
}
```

---

## 5. WebSockets Signaling Gateway

**Endpoint**: `WS /api/v1/ws/signaling/{room_code}/{session_token}`

### Inbound Signaling Messages (Client -> Server)
* **WebRTC SDP Offer**:
  ```json
  { "type": "offer", "sdp": { "type": "offer", "sdp": "v=0..." }, "target_token": "sess_target..." }
  ```
* **WebRTC SDP Answer**:
  ```json
  { "type": "answer", "sdp": { "type": "answer", "sdp": "v=0..." }, "target_token": "sess_target..." }
  ```
* **ICE Candidate**:
  ```json
  { "type": "ice-candidate", "candidate": { "candidate": "..." }, "target_token": "sess_target..." }
  ```
* **User Mute / Video State Update**:
  ```json
  { "type": "user-state-change", "is_audio_muted": true, "is_video_off": false }
  ```
* **In-Meeting Chat Message**:
  ```json
  { "type": "chat-message", "text": "Hello everyone!", "display_name": "Alice" }
  ```

### Outbound Broadcast Messages (Server -> Client)
* **Broadcast Chat Message**:
  ```json
  { "type": "chat-message", "message_id": "82919093006635009", "sender_token": "sess_4qZn...", "sender_name": "Alice", "text": "Hello everyone!", "timestamp": 1767225600.0 }
  ```
* **Peer Joined Notice**:
  ```json
  { "type": "peer-joined", "sender_token": "sess_new_joiner..." }
  ```
* **Peer Left Notice**:
  ```json
  { "type": "peer-left", "sender_token": "sess_leaving_user..." }
  ```

---

## 6. Media Ingest Lab Endpoints (`aiortc`)

### `POST /api/v1/media/ingest/offer`
Submits WebRTC offer to the Python `aiortc` media engine for benchmark testing.

### `GET /api/v1/media/ingest/stats/{session_id}`
Returns live server-side packet count and bitrate metrics.

**Response (200 OK):**
```json
{
  "session_id": "ingest_session_123",
  "connection_state": "connected",
  "duration_seconds": 45,
  "tracks_count": 2,
  "audio_packets": 2250,
  "video_packets": 13500,
  "audio_bitrate_kbps": 64,
  "video_bitrate_kbps": 1250,
  "total_bitrate_kbps": 1314
}
```
