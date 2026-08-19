# Arreena - WebRTC Selective Forwarding Unit (SFU) & Control Plane

Arreena is a production-grade, ultra-low-latency video conferencing platform built with a custom Python SFU media router, a FastAPI control plane, and a React + TypeScript web client.

The platform provides anonymous, instant video meetings using time-ordered 64-bit Snowflake IDs, selective forwarding unit (SFU) packet relaying, Coturn NAT traversal, and real-time WebSocket chat broadcasting without requiring user accounts or sign-ups.

---

## Technical Features

* Custom SFU Packet Router: Relays video and audio streams by taking 1 camera upload per publisher and selectively forwarding stream downlinks to subscribers, reducing client CPU and bandwidth overhead.
* Anonymous Session Management: Generates short-lived, unguessable room codes (e.g. `b36d-80c2-8be8`) using 64-bit time-ordered Snowflake IDs.
* Device Preview Lobby: Modern 2-column split lobby interface with a live Web Audio API input level meter, audio/video toggles, and device selector dropdowns.
* Adaptive Multi-Tile Video Grid: Dynamic tile matrix with active speaker highlight glow and native browser screen sharing.
* Real-Time In-Meeting Chat: Slide-out drawer broadcasting messages with 64-bit Snowflake message IDs, sender tags, auto-scroll history, and unread badge count indicators.
* Publishable Package Architecture:
  * Backend Package: Published on PyPI as `arreena-sfu` (`pip install arreena-sfu`).
  * Frontend Package: Published on npm as `@rezol7/arreena-react` (`npm install @rezol7/arreena-react`).

---

## System Architecture

```text
================================================================================
                            ARREENA ARCHITECTURE
================================================================================

 [ Client Browser ] <------ WebSockets (Signaling) ------> [ FastAPI Control Plane ]
 [ React Client   ] <------ HTTP REST API (Rooms) --------> [ Port 8000           ]
        |                                                           |
        | WebRTC Media Stream (UDP/RTP)                             | gRPC Control
        v                                                           v (Port 50051)
 +------------------------------------------------------------------------------+
 |                  Arreena Selective Forwarding Unit (SFU)                     |
 |        • MultiPartyRoomManager thread-safe state                             |
 |        • Python aiortc MediaRelay proxy forwarding                           |
 |        • Real-time packet, packet loss & bitrate telemetry                   |
 +------------------------------------------------------------------------------+
```

### Architectural Breakdown: WebRTC vs. Control Plane vs. SFU

1. WebRTC Engine: Built into modern web browsers (Chrome, Firefox, Safari, Edge), providing media capture (`getUserMedia`), audio/video codecs (VP8, H.264, Opus), and DTLS-SRTP encryption.
2. Control Plane (`backend/aethersfu/`): Built with FastAPI, handling room creation, session tokens, Snowflake 64-bit ID generation, database storage, TURN credential generation, and WebSocket signaling.
3. SFU Engine (`backend/aethersfu/services/`): Selective Forwarding Unit implemented using Python `aiortc` and `MultiPartyRoomManager`. Subscribes to published media tracks and proxies packets to room participants.

### Deployment Modes: Local In-Process vs. Scaled Production gRPC

```text
1. LOCAL DEVELOPMENT MODE (Port 8000)
+-----------------------------------------------------------------+
|                   Single FastAPI App (Port 8000)                |
|   • REST APIs & DB             (FastAPI)                        |
|   • Snowflake 64-Bit IDs       (snowflake.py)                   |
|   • WebSocket Signaling        (ws_signaling.py)                |
|   • Media Ingest & Routing     (In-Process Python aiortc)       |
+-----------------------------------------------------------------+

2. SCALED PRODUCTION MICROSERVICES (FastAPI + gRPC Port 50051)
+------------------------------+     gRPC (Port 50051)     +------------------------------+
| FastAPI Control Plane        | ------------------------> | SFU Media Node (C++/Rust)    |
| (Auth, Rooms, Database, WS)  |   SFU_API_KEY Auth        | (Routes 10,000+ RTP packets) |
+------------------------------+                           +------------------------------+
```

* Local Development: Runs in a single Python process on Port 8000 using `aiortc` for local WebRTC media packet routing. Port 50051 is not required locally.
* Production Microservices: FastAPI uses high-speed gRPC over HTTP/2 (`SFU_GRPC_ENDPOINT="localhost:50051"`, authenticated by `SFU_API_KEY`) to orchestrate external dedicated media nodes across cloud regions.

---

## 64-Bit Snowflake ID Generator

Arreena generates time-ordered 64-bit Snowflake IDs (`SnowflakeGenerator`) for rooms, session tokens, and chat messages.

### Structure of 64-Bit Snowflake ID
```text
 +-----------------------------------------------------------------------------+
 | 1 Bit (Unused) | 41 Bits (Timestamp ms) | 10 Bits (Node ID) | 12 Bits (Seq) |
 +-----------------------------------------------------------------------------+
```
* Bit 63: 1 unused sign bit (always 0).
* Bits 22-62 (41 bits): Timestamp in milliseconds since custom epoch (January 1, 2024 UTC).
* Bits 12-21 (10 bits): Machine / Node ID (supports up to 1,024 cluster nodes).
* Bits 0-11 (12 bits): Sequence counter (allows up to 4,096 unique IDs per millisecond per node).

---

## Database Schemas & Models

The Control Plane uses SQLAlchemy 2.0 Async (`aiosqlite` in development, `asyncpg` in production).

### 1. Rooms Table (`rooms`)
* `id` (String, Primary Key): 64-bit Snowflake ID.
* `room_code` (String, Unique, Index): Formatted code (e.g. `b36d-80c2-8be8`).
* `max_participants` (Integer): Maximum allowed concurrent connections (default: 50).
* `is_active` (Boolean): Active state flag.
* `created_at` (DateTime): UTC creation timestamp.
* `updated_at` (DateTime): UTC update timestamp.

### 2. Anonymous Sessions Table (`anonymous_sessions`)
* `id` (String, Primary Key): 64-bit Snowflake ID.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `session_token` (String, Unique, Index): Ephemeral token string.
* `display_name` (String): Anonymous display name (e.g. `Guest User`).
* `expires_at` (DateTime): Token expiration UTC timestamp.
* `created_at` (DateTime): UTC creation timestamp.

### 3. Call History Table (`call_history`)
* `id` (String, Primary Key): 64-bit Snowflake ID.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `duration_seconds` (Integer): Total call duration in seconds.
* `peak_participants` (Integer): Maximum concurrent participants during call.
* `ended_at` (DateTime): UTC end timestamp.

### 4. Lifecycle Events Table (`lifecycle_events`)
* `id` (String, Primary Key): 64-bit Snowflake ID.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `event_type` (String): Event description (`ROOM_CREATED`, `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `ROOM_CLOSED`).
* `payload` (JSON / Text): Event metadata JSON payload.
* `created_at` (DateTime): UTC creation timestamp.

---

## API & Signaling Specification

### REST Endpoints

#### 1. System Health Check
`GET /api/v1/health`
* Response: `{ "status": "healthy", "app_name": "Arreena Control Plane", "environment": "development" }`

#### 2. Create Meeting Room
`POST /api/v1/rooms/create`
* Request Body: `{ "max_participants": 50 }`
* Response: `{ "room_code": "b36d-80c2-8be8", "max_participants": 50, "created_at": "2026-08-20T01:00:00Z" }`

#### 3. Join Meeting Room Anonymously
`POST /api/v1/rooms/join`
* Request Body: `{ "room_code": "b36d-80c2-8be8", "display_name": "Guest Developer" }`
* Response: `{ "session_token": "<snowflake_token>", "room_code": "b36d-80c2-8be8", "display_name": "Guest Developer" }`

#### 4. Generate STUN/TURN Credentials
`POST /api/v1/sessions/credentials`
* Request Body: `{ "session_token": "<snowflake_token>" }`
* Response: `{ "ice_servers": [ { "urls": "stun:stun.l.google.com:19302" }, { "urls": "turn:localhost:3478", "username": "<token>", "credential": "<secret>" } ] }`

#### 5. Get SFU Room State
`GET /api/v1/sfu/rooms/{room_code}/state`
* Response: `{ "room_code": "b36d-80c2-8be8", "active_participants_count": 3, "published_tracks_count": 6, "participants": [ { "session_token": "<token>", "display_name": "Alice" } ] }`

#### 6. Eject Participant
`DELETE /api/v1/sfu/rooms/{room_code}/participants/{session_token}`
* Response: `{ "status": "ejected", "room_code": "b36d-80c2-8be8", "session_token": "<token>" }`

---

### WebSocket Signaling Protocol

Connection URL: `ws://localhost:8000/ws/signaling/{room_code}/{session_token}`

#### 1. Join Room (`join-room`)
```json
{
  "type": "join-room",
  "room_code": "b36d-80c2-8be8",
  "session_token": "<token>",
  "display_name": "Guest User"
}
```

#### 2. WebRTC SDP Offer (`offer`)
```json
{
  "type": "offer",
  "target_token": "<remote_token>",
  "sdp": "v=0\r\no=- 12345 2 IN IP4 127.0.0.1..."
}
```

#### 3. WebRTC SDP Answer (`answer`)
```json
{
  "type": "answer",
  "target_token": "<remote_token>",
  "sdp": "v=0\r\no=- 54321 2 IN IP4 127.0.0.1..."
}
```

#### 4. WebRTC ICE Candidate (`ice-candidate`)
```json
{
  "type": "ice-candidate",
  "target_token": "<remote_token>",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2013266431 192.168.1.5 54321 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### 5. Chat Message Broadcast (`chat-message`)
```json
{
  "type": "chat-message",
  "text": "Hello world!"
}
```
Enriched outbound payload broadcast by server:
```json
{
  "type": "chat-message",
  "message_id": "<snowflake_id>",
  "sender_token": "<token>",
  "sender_name": "Alice",
  "text": "Hello world!",
  "timestamp": 1787184000.0
}
```

---

## Package Installation & Usage

### 1. Python Backend Package (`arreena-sfu`)

Install via PyPI:
```bash
pip install arreena-sfu
```

Usage in Python / FastAPI:
```python
from fastapi import FastAPI
from aethersfu.main import app as arreena_app

app = FastAPI(title="Company Video Platform")
app.mount("/video", arreena_app)
```

### 2. React Frontend SDK (`@rezol7/arreena-react`)

Install via npm:
```bash
npm install @rezol7/arreena-react
```

Usage in React / TypeScript:
```tsx
import { MeetingRoom, DevicePreview } from '@rezol7/arreena-react';

function App() {
  return (
    <MeetingRoom 
      roomCode="b36d-80c2-8be8" 
      displayName="Guest Developer" 
    />
  );
}
```

---

## Development & Deployment

### Quickstart

#### Backend Setup
```powershell
cd backend
pip install -e .[dev]
python -m pytest tests
python -m uvicorn aethersfu.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

### Docker Infrastructure

The repository includes container specifications in `infra/docker-compose.yml`:
* Control Plane Backend (FastAPI on Port 8000)
* Coturn STUN/TURN Server (UDP/TCP Port 3478)
* PostgreSQL Database (Postgres 16 on Port 5432)
* Redis Cache & Pub/Sub (Redis 6 on Port 6379)

Run Docker infrastructure:
```bash
cd infra
docker-compose up -d
```

---

## Repository File Tree

```text
video-conferencing-tool/
├── backend/                         # FastAPI Control Plane & SFU Server
│   ├── pyproject.toml               # PyPI package configuration (arreena-sfu)
│   ├── aethersfu/                   # Backend source modules
│   │   ├── db/                      # Database models & Snowflake generator
│   │   ├── routers/                 # REST APIs, WebSockets & SFU endpoints
│   │   └── services/                # RoomManager & aiortc MediaRelay engine
│   └── tests/                       # Pytest integration suite
├── frontend/                        # React + TypeScript + Vite Web Client
│   ├── package.json                 # npm package configuration (@rezol7/arreena-react)
│   └── src/                         # React UI components, state & signaling
├── infra/                           # Docker infrastructure & Coturn TURN config
│   ├── docker-compose.yml
│   └── coturn/turnserver.conf
└── README.md
```

---

## License

This project is licensed under the MIT License.
