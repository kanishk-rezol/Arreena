# Arreena - WebRTC Selective Forwarding Unit (SFU) & Control Plane

Arreena is an enterprise-grade, ultra-low-latency video conferencing platform engineered with a custom Python Selective Forwarding Unit (SFU) media router, a FastAPI control plane, and a React + TypeScript web application.

The system provides anonymous, instant video conferencing using time-ordered 64-bit Snowflake IDs, selective forwarding unit (SFU) packet relaying, Coturn NAT/firewall traversal, and real-time WebSocket chat broadcasting without requiring user registrations or logins.

---

## 1. Core Architecture & System Concepts

### What is a Selective Forwarding Unit (SFU)?

In video conferencing architectures, there are three primary models for multi-party media routing:

1. Peer-to-Peer (P2P Mesh): Every participant sends their audio and video directly to every other participant. For N participants, each client must upload N-1 video streams and download N-1 video streams. On a call with 10 participants, each client uploads 9 streams and downloads 9 streams, quickly exhausting client CPU and upload bandwidth.
2. Multipoint Control Unit (MCU): The server receives all video streams, decodes them, composites them into a single video grid layout on the server CPU, re-encodes the composited video stream, and sends 1 combined stream to each client. While this minimizes client download bandwidth, it introduces severe server-side CPU encoding latency and costs.
3. Selective Forwarding Unit (SFU) - Used in Arreena: The publisher uploads their video and audio stream **only once** to the central SFU server. The SFU server does not decode or re-encode video frames; instead, it inspects RTP packet headers and selectively routes/forwards individual packet streams to all subscribed participants.

```text
================================================================================
                          SFU PACKET FORWARDING FLOW
================================================================================

                     +----------------------------------+
                     |         Arreena SFU Server       |
                     |  (RoomManager + aiortc Forward)  |
                     +----------------------------------+
                         ^          |          |
          1 Upload Stream|          |Forward   |Forward
          (Camera + Mic) |          v          v
                     [ User A ]  [ User B ]  [ User C ] ... [ User N ]
```

#### Advantages of Arreena's SFU Architecture:
* Minimal Client Upload Bandwidth: Each participant uploads 1 stream regardless of how many people join.
* Ultra-Low Latency: Server packet forwarding introduces ~25ms of latency because media frames are relayed at the RTP packet level without CPU re-encoding delays.
* Client-Side Layout Flexibility: Each client receives individual video tracks and renders custom responsive CSS layouts locally.

---

### What is WebRTC and How Does It Work in Arreena?

WebRTC (Web Real-Time Communication) is an open W3C/IETF standard protocol built into modern browsers (Chrome, Firefox, Safari, Edge) that enables real-time peer-to-peer or client-to-server video, audio, and data streaming.

Key WebRTC Building Blocks Used in Arreena:
1. `navigator.mediaDevices.getUserMedia()`: Captures raw camera and microphone MediaStreams from the user's hardware.
2. `navigator.mediaDevices.getDisplayMedia()`: Captures raw screen sharing video tracks from the operating system.
3. `RTCPeerConnection`: Manages media transport, codec selection (VP8, H.264, Opus), DTLS-SRTP packet encryption, and network socket lifecycle.
4. SDP (Session Description Protocol) Offer/Answer: A structured text format describing media codecs, transport protocols, and IP addresses exchanged between clients and the Arreena signaling gateway.
5. ICE (Interactive Connectivity Establishment) & STUN/TURN: Protocols that discover public IP addresses and relay packets through firewalls and NAT routers.

---

### Component Separation: WebRTC vs. Control Plane vs. SFU

```text
================================================================================
                     ARREENA COMPONENT SEPARATION
================================================================================

 1. FRONTEND WEB CLIENT (React 18 + TypeScript + Vite)
    • Renders Landing Page, Device Preview Lobby, Meeting Room, and Chat.
    • Interacts with browser MediaDevices and native RTCPeerConnection APIs.

 2. CONTROL PLANE BACKEND (FastAPI + SQLAlchemy 2.0 Async + SQLite/PostgreSQL)
    • Manages room lifecycles, anonymous session tokens, and Snowflake 64-bit IDs.
    • Provides REST APIs, ephemeral TURN credentials, and WebSocket signaling gateway.

 3. SELECTIVE FORWARDING UNIT (Python aiortc + MultiPartyRoomManager)
    • Manages published media tracks and subscriber downlinks per room.
    • Provides server-side WebRTC ingest, packet relaying, and telemetry.
```

---

### Deployment Architecture: Local Dev Mode vs. Scaled Production gRPC

```text
1. LOCAL DEVELOPMENT ARCHITECTURE (Port 8000)
+-----------------------------------------------------------------+
|                   Single FastAPI App (Port 8000)                |
|                                                                 |
|   • REST APIs & DB             (FastAPI)                        |
|   • Snowflake 64-Bit IDs       (snowflake.py)                   |
|   • WebSocket Signaling        (ws_signaling.py)                |
|   • Media Ingest & Routing     (In-Process Python aiortc)       |
+-----------------------------------------------------------------+

2. SCALED PRODUCTION MICROSERVICES ARCHITECTURE (FastAPI + gRPC Port 50051)
+------------------------------+     gRPC (Port 50051)     +------------------------------+
| FastAPI Control Plane        | ------------------------> | SFU Media Node (C++/Rust)    |
| (Auth, Rooms, Database, WS)  |   SFU_API_KEY Auth        | (Routes 10,000+ RTP packets) |
+------------------------------+                           +------------------------------+
```

1. Local Development Mode: Runs in a single Python process on Port 8000 using Python `aiortc` for in-process WebRTC media routing. Port 50051 is reserved and not required locally.
2. Scaled Production Microservices: The FastAPI Control Plane communicates with external dedicated media router nodes over high-speed gRPC on Port 50051 using HTTP/2 binary Protocol Buffers (`proto3`) authenticated by a shared `SFU_API_KEY`.

---

## 2. Distributed 64-Bit Snowflake ID Generator

Arreena uses time-ordered 64-bit Snowflake IDs (`SnowflakeGenerator`) to identify rooms, anonymous session tokens, call records, and chat messages.

### Structure of 64-Bit Snowflake ID
```text
 +-----------------------------------------------------------------------------+
 | 1 Bit (Unused) | 41 Bits (Timestamp ms) | 10 Bits (Node ID) | 12 Bits (Seq) |
 +-----------------------------------------------------------------------------+
```
* Bit 63: 1 unused sign bit (always set to 0 for positive integer compatibility).
* Bits 22-62 (41 bits): Timestamp in milliseconds relative to a custom epoch (January 1, 2024 00:00:00 UTC). Supports ~69 years of unique IDs.
* Bits 12-21 (10 bits): Machine / Node ID (supports up to 1,024 cluster nodes).
* Bits 0-11 (12 bits): Sequence counter (allows up to 4,096 unique IDs per millisecond per node).

### Why Snowflake IDs are Superior to UUIDv4 for Video Conferencing
* Time-Ordered Indexing: IDs sort naturally by creation time, eliminating database B-Tree index fragmentation.
* Compact Storage: 64-bit integers occupy 8 bytes in database indexes compared to 36-byte UUID text strings.
* Zero Lock Contention: Distributed microservice nodes generate unique IDs independently without inter-node locks or database queries.

---

## 3. Database Schemas & Models

The Control Plane uses SQLAlchemy 2.0 Async (`aiosqlite` in development, `asyncpg` in production).

### 1. Rooms Table (`rooms`)
* `id` (String, Primary Key): 64-bit Snowflake ID string.
* `room_code` (String, Unique, Index): Formatted unguessable code (e.g. `b36d-80c2-8be8`).
* `max_participants` (Integer): Maximum allowed concurrent connections (default: 50).
* `is_active` (Boolean): Active meeting room flag.
* `created_at` (DateTime): UTC creation timestamp.
* `updated_at` (DateTime): UTC update timestamp.

### 2. Anonymous Sessions Table (`anonymous_sessions`)
* `id` (String, Primary Key): 64-bit Snowflake ID string.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `session_token` (String, Unique, Index): Ephemeral token string.
* `display_name` (String): Anonymous participant name (e.g. `Guest Developer`).
* `expires_at` (DateTime): Token expiration UTC timestamp.
* `created_at` (DateTime): UTC creation timestamp.

### 3. Call History Table (`call_history`)
* `id` (String, Primary Key): 64-bit Snowflake ID string.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `duration_seconds` (Integer): Total call duration in seconds.
* `peak_participants` (Integer): Maximum concurrent participants during call.
* `ended_at` (DateTime): UTC end timestamp.

### 4. Lifecycle Events Table (`lifecycle_events`)
* `id` (String, Primary Key): 64-bit Snowflake ID string.
* `room_id` (String, Foreign Key -> `rooms.id`): Associated room ID.
* `event_type` (String): Event code (`ROOM_CREATED`, `PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `ROOM_CLOSED`).
* `payload` (JSON / Text): Event metadata JSON payload.
* `created_at` (DateTime): UTC creation timestamp.

---

## 4. User Interface & Page Workflows

The frontend application (`frontend/src/`) manages step routes and browser history states (`popstate`):

### 1. Home Landing Page (`step === 'LANDING'`)
* Dual-Action Hero Bar: Inline controls allowing users to create an instant room with one click or enter an existing room code (`b36d-80c2-8be8`).
* Direct Share Link Auto-Routing: Opening URLs with `?room=CODE` automatically opens the lobby preview.

### 2. Device Preview Lobby (`step === 'PREVIEW'`)
* 2-Column Centered Split Layout: Left column renders high-definition camera viewport with media overlay buttons and live Web Audio API input level visualizer meter; right column renders Room Code badge with `Copy Invite Link` button, display name input, and hardware dropdown selectors (`Microphone`, `Camera`).

### 3. Meeting Room (`step === 'ROOM'`)
* Adaptive Video Grid: CSS grid matrix displaying local and remote video streams with active speaker glow indicators.
* Control Toolbar: Bottom floating bar with Microphone Mute, Video Off, Screen Share, Participant Roster drawer toggle, Chat drawer toggle, and Leave Meeting button.
* Participant Roster Drawer: Slide-out panel listing connected participants with audio/video status icons.
* Real-Time In-Meeting Chat Drawer: Slide-out panel broadcasting messages with 64-bit Snowflake message IDs, sender tags, auto-scroll history, and unread badge count indicators.

---

## 5. API & Signaling Specification

### REST Endpoints

#### 1. System Health Check
`GET /api/v1/health`
```json
{
  "status": "healthy",
  "app_name": "Arreena Control Plane",
  "environment": "development"
}
```

#### 2. Create Meeting Room
`POST /api/v1/rooms/create`
* Request:
```json
{
  "max_participants": 50
}
```
* Response:
```json
{
  "room_code": "b36d-80c2-8be8",
  "max_participants": 50,
  "created_at": "2026-08-20T01:00:00Z"
}
```

#### 3. Join Meeting Room Anonymously
`POST /api/v1/rooms/join`
* Request:
```json
{
  "room_code": "b36d-80c2-8be8",
  "display_name": "Guest Developer"
}
```
* Response:
```json
{
  "session_token": "178718400012345678",
  "room_code": "b36d-80c2-8be8",
  "display_name": "Guest Developer"
}
```

#### 4. Generate STUN/TURN Credentials
`POST /api/v1/sessions/credentials`
* Request:
```json
{
  "session_token": "178718400012345678"
}
```
* Response:
```json
{
  "ice_servers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "turn:localhost:3478", "username": "178718400012345678", "credential": "secret_key_hash" }
  ]
}
```

#### 5. Get SFU Room State
`GET /api/v1/sfu/rooms/b36d-80c2-8be8/state`
* Response:
```json
{
  "room_code": "b36d-80c2-8be8",
  "active_participants_count": 3,
  "published_tracks_count": 6,
  "participants": [
    { "session_token": "178718400012345678", "display_name": "Alice" },
    { "session_token": "178718400087654321", "display_name": "Bob" }
  ]
}
```

#### 6. Eject Participant
`DELETE /api/v1/sfu/rooms/b36d-80c2-8be8/participants/178718400087654321`
* Response:
```json
{
  "status": "ejected",
  "room_code": "b36d-80c2-8be8",
  "session_token": "178718400087654321"
}
```

---

### WebSocket Signaling Protocol

Connection Endpoint: `ws://localhost:8000/ws/signaling/{room_code}/{session_token}`

#### 1. Join Room (`join-room`)
```json
{
  "type": "join-room",
  "room_code": "b36d-80c2-8be8",
  "session_token": "178718400012345678",
  "display_name": "Guest Developer"
}
```

#### 2. WebRTC SDP Offer (`offer`)
```json
{
  "type": "offer",
  "target_token": "178718400087654321",
  "sdp": "v=0\r\no=- 12345678 2 IN IP4 127.0.0.1..."
}
```

#### 3. WebRTC SDP Answer (`answer`)
```json
{
  "type": "answer",
  "target_token": "178718400087654321",
  "sdp": "v=0\r\no=- 87654321 2 IN IP4 127.0.0.1..."
}
```

#### 4. WebRTC ICE Candidate (`ice-candidate`)
```json
{
  "type": "ice-candidate",
  "target_token": "178718400087654321",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2013266431 192.168.1.5 54321 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### 5. Chat Message Inbound (`chat-message`)
```json
{
  "type": "chat-message",
  "text": "Hello everyone!"
}
```

#### 6. Chat Message Outbound Broadcast (`chat-message`)
```json
{
  "type": "chat-message",
  "message_id": "178718499900011122",
  "sender_token": "178718400012345678",
  "sender_name": "Guest Developer",
  "text": "Hello everyone!",
  "timestamp": 1787184000.0
}
```

---

## 6. Package Installation & Usage

### 1. Python Backend Package (`arreena-sfu`)

Published on PyPI as `arreena-sfu`.

#### Installation
```bash
pip install arreena-sfu
```

#### Usage in Python / FastAPI
```python
from fastapi import FastAPI
from aethersfu.main import app as arreena_app
from aethersfu.services.room_manager import MultiPartyRoomManager
from aethersfu.db.snowflake import SnowflakeGenerator

app = FastAPI(title="Company Video Platform")

# Mount Arreena SFU application
app.mount("/video", arreena_app)

# Use Snowflake generator directly
generator = SnowflakeGenerator(node_id=1)
snowflake_id = generator.generate()
```

---

### 2. React Frontend SDK (`@rezol7/arreena-react`)

Published on npm as `@rezol7/arreena-react`.

#### Installation
```bash
npm install @rezol7/arreena-react
```

#### Usage in React / TypeScript
```tsx
import React from 'react';
import { MeetingRoom, DevicePreview } from '@rezol7/arreena-react';

function App() {
  return (
    <div>
      <MeetingRoom 
        roomCode="b36d-80c2-8be8" 
        displayName="Guest Developer" 
      />
    </div>
  );
}

export default App;
```

---

## 7. Development & Testing Guide

### Prerequisites
* Python 3.10+
* Node.js 18+ and npm

### 1. Local Development Setup

#### Backend Setup
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate

# Install dependencies in editable mode with dev suite
pip install -e .[dev]

# Start FastAPI server
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

### 2. Automated Testing Suite

#### Backend Pytest Suite
```powershell
python -m pytest backend/tests
```
Verifies health checks, media ingest, media relay, room manager concurrency, room REST APIs, and WebSocket chat broadcasting.

#### Frontend TypeScript Compilation
```powershell
cd frontend
npx tsc --noEmit
```

---

## 8. Production Container Infrastructure (Docker Compose)

The repository includes container infrastructure specifications in `infra/docker-compose.yml`:
* Control Plane Backend: FastAPI on Port 8000.
* Coturn STUN/TURN Server: UDP/TCP Port 3478.
* PostgreSQL Database: Postgres 16 on Port 5432.
* Redis Cache & Pub/Sub: Redis 6 on Port 6379.

Launch Docker Infrastructure:
```bash
cd infra
docker-compose up -d
```

---

## 9. Repository Structure

```text
video-conferencing-tool/
├── backend/                         # FastAPI Control Plane & SFU Server
│   ├── pyproject.toml               # PyPI package configuration (arreena-sfu)
│   ├── Dockerfile                   # Production backend container image
│   ├── aethersfu/                   # Backend package source modules
│   │   ├── db/                      # Database models & 64-bit Snowflake generator
│   │   ├── routers/                 # REST APIs, WebSockets & SFU endpoints
│   │   └── services/                # RoomManager & aiortc MediaRelay engine
│   └── tests/                       # Pytest integration suite
├── frontend/                        # React + TypeScript + Vite Web Client
│   ├── package.json                 # npm package configuration (@rezol7/arreena-react)
│   └── src/                         # React UI components, state & WebRTC signaling
├── infra/                           # Docker infrastructure & Coturn TURN config
│   ├── docker-compose.yml
│   └── coturn/turnserver.conf
└── README.md
```

---

## 10. License

This project is licensed under the MIT License.
