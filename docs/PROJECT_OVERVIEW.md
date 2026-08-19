# Arreena - Project Architecture & Technical Specification

## 1. Executive Summary

**Arreena** is an ultra-low latency, anonymous WebRTC video conferencing platform designed and engineered without reliance on pre-packaged third-party SFUs (such as LiveKit or Mediasoup wrappers). 

The system features:
* **Custom Control Plane**: Built with Python, FastAPI, and SQLAlchemy 2.0 (Async).
* **Distributed ID System**: 64-bit time-ordered Snowflake IDs (`SnowflakeGenerator`) ensuring high-throughput, sorted primary key generation across distributed nodes.
* **Elastic Multi-Party SFU (`RoomManager`)**: Supports dynamic participant capacity (3, 10, 25, 50, 100+ participants) with thread-safe `asyncio.Lock()` concurrency guards.
* **WebRTC Signaling Engine**: Real-time WebSocket signaling gateway supporting the **Perfect Negotiation** pattern (`polite`/`impolite` peer connection roles).
* **Python `aiortc` Media Lab**: Ingests and benchmarks publisher audio/video packet rates, frame counts, and live bitrates at the server layer.
* **TURN/STUN Traversal & Telemetry**: Ephemeral HMAC-SHA1 credential generation for Coturn NAT traversal with candidate pair inspection (`P2P Direct` vs. `TURN Relayed`).

---

## 2. Engineering Roadmap (Steps 1 - 5)

```
+-------------------------------------------------------------------------------+
|                        AetherSFU Engineering Roadmap                          |
+-------------------------------------------------------------------------------+
|  Step 1: FastAPI Control Plane & Anonymous Database Models                    |
|  Step 2: WebSockets Signaling Engine (Perfect Negotiation Pattern)            |
|  Step 3: Server-Side Media Ingest & Relay Benchmark (aiortc Engine)           |
|  Step 4: Coturn STUN/TURN Infrastructure & Traversal Telemetry                |
|  Step 5: Elastic Multi-Party RoomManager (3, 10, 25, 50, 100+ Participants)   |
+-------------------------------------------------------------------------------+
```

### Step 1: FastAPI Control Plane & Anonymous Database Models
* Created asynchronous database layer powered by SQLAlchemy 2.0 and `aiosqlite` / `asyncpg`.
* Implemented unguessable room code generation (`abc-defg-hij`) and anonymous session token creation (`sess_<token>`).
* Database schemas: `rooms`, `anonymous_sessions`, `call_history`, and `lifecycle_events`.

### Step 2: WebSockets Signaling Engine
* Real-time WebSocket gateway at `/api/v1/ws/signaling/{room_code}/{session_token}`.
* Implemented **Perfect Negotiation** state machine:
  * Existing participants act as `impolite` peers.
  * New joiners act as `polite` peers to resolve SDP offer/answer collisions seamlessly.
* Broadcasts real-time mute/unmute and video state changes (`user-state-change`).

### Step 3: Server-Side Media Ingest (`aiortc` Engine)
* Server-side media lab endpoint at `/api/v1/media/ingest/offer`.
* Integrates Python `aiortc` to terminate WebRTC media streams, decode packets, and expose real-time metrics (`total_bitrate_kbps`, `audio_packets`, `video_packets`).

### Step 4: Coturn STUN/TURN Infrastructure & Traversal Telemetry
* Implemented time-limited HMAC-SHA1 TURN credential generation (`/api/v1/sessions/credentials/turn`).
* Added WebRTC candidate pair telemetry in the React client, displaying real-time badges (`P2P Direct` vs. `TURN Relayed`).

### Step 5: Elastic Multi-Party RoomManager
* Dynamic room roster management (`MultiPartyRoomManager` and `RoomState`).
* Exposes `GET /api/v1/sfu/rooms/{code}/state` for real-time roster and track counts.
* Exposes `DELETE /api/v1/sfu/rooms/{code}/participants/{token}` for participant ejection and track release.
* React `ParticipantRoster` drawer and adaptive multi-tile CSS video grid.

### Step 6: Real-Time In-Meeting Chat System
* Real-time WebSocket chat message broadcasting with 64-bit Snowflake message IDs (`generate_snowflake_id()`).
* Slide-out glassmorphism `ChatDrawer` component with auto-scrolling message history, sender badges (`(You)`, `Alice`), formatted timestamps, and enter-to-send input.
* Header & footer control bar integration with unread chat message badge count dot indicator.

---

## 3. Selective Forwarding Unit (SFU) Architecture

In this platform, **SFU** stands for **Selective Forwarding Unit**. Here is exactly how the SFU is designed and used in the codebase:

### A. The Core Concept of SFU
Instead of making every browser connect to every other browser directly (which melts client bandwidth when 5–100+ people join), the SFU acts as an intelligent media router:

```text
               +----------------------------------+
               |        AetherSFU Engine          |
               | (RoomManager + aiortc Forwarder) |
               +----------------------------------+
                   ^          |          |
    1 Upload Stream|          |Forward   |Forward
                   |          v          v
               [ User A ]  [ User B ]  [ User C ] ... [ User N ]
```

* **Publisher (Upload)**: User A uploads their camera & microphone stream **only ONCE** to the SFU server.
* **SFU Router (Forwarding)**: The AetherSFU server receives User A's packets and selectively forwards them to User B, User C, User D, etc.
* **Subscribers (Download)**: Other users download the stream from the SFU server without needing direct connections to User A.

### B. Codebase Implementation
Your platform implements SFU routing across core services in `backend/`:

1. **Multi-Party Room State & Roster ([`backend/aethersfu/services/room_manager.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/services/room_manager.py))**:
   * `MultiPartyRoomManager` tracks active published media tracks per room:
     ```python
     published_tracks: Dict[str, str] # track_id -> kind ("audio" or "video")
     ```
   * Ensures thread-safe concurrency using `asyncio.Lock()` so rapid reconnects or new joiners do not create stale state or ghost tracks.

2. **Server Media Ingest & Relay ([`backend/aethersfu/services/media_relay.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/services/media_relay.py) & [`aiortc_ingest.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/services/aiortc_ingest.py))**:
   * Uses Python's `aiortc` (an asynchronous WebRTC media engine) to receive media tracks directly at the server level.
   * Measures live packet counts, packet loss, and server-side bitrates (`audio_bitrate_kbps`, `video_bitrate_kbps`, `total_bitrate_kbps`).
   * Proxies media tracks down to subscriber client peer connections.

3. **Control Plane REST & WebSocket API ([`backend/aethersfu/routers/sfu_relay.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/routers/sfu_relay.py) & [`room_manager_api.py`](file:///d:/video%20conferencing%20tool/backend/aethersfu/routers/room_manager_api.py))**:
   * `GET /api/v1/sfu/rooms/{code}/state`: Returns live room capacity, participant roster, and total published tracks count.
   * `DELETE /api/v1/sfu/rooms/{code}/participants/{token}`: Ejects participants and releases their SFU tracks.

### C. Summary: P2P Mode vs. SFU Mode in Arreena

| Feature | **1:1 Call (P2P Mode)** | **Multi-Party Call (SFU Mode)** |
| :--- | :--- | :--- |
| **Participants** | 2 Users | **3, 10, 25, 50, 100+ Users** |
| **Media Route** | Direct Browser-to-Browser | **Relayed via Arreena SFU Server** |
| **Client Upload** | Uploads 1 stream directly to peer | **Uploads 1 stream to SFU server** |
| **Client Download** | Downloads 1 stream directly from peer | **Downloads streams from SFU downlinks** |
| **Scale Limit** | Max 2–3 users | **Elastic scaling to 100+ participants** |

### D. Architectural Clarification: WebRTC vs. Control Plane vs. SFU & gRPC

#### 1. WebRTC vs. Control Plane vs. SFU
* **WebRTC Engine**: Open W3C standard protocol built directly into modern web browsers (Chrome, Firefox, Safari, Edge) that provides camera capture (`getUserMedia`), codecs (VP8/H.264/Opus), and network encryption (DTLS-SRTP).
* **Control Plane (`backend/`)**: Built with FastAPI, handling Room management, Anonymous sessions, Snowflake 64-bit IDs, database storage, TURN credentials, and WebSocket signaling.
* **SFU Engine (`room_manager.py` & `aiortc`)**: Media routing component that receives 1 camera upload from a publisher and relays it to 3–100+ subscribers.

#### 2. Local In-Process Mode vs. Scaled Production gRPC Mode
```text
=============================================================================
1. LOCAL DEVELOPMENT MODE (Port 8000)
=============================================================================
+-----------------------------------------------------------------+
|                   Single FastAPI App (Port 8000)                |
|                                                                 |
|   • REST APIs & DB             (FastAPI)                        |
|   • Snowflake 64-Bit IDs       (snowflake.py)                   |
|   • WebSocket Signaling        (ws_signaling.py)                |
|   • Media Ingest & Routing     (In-Process Python aiortc)       |
+-----------------------------------------------------------------+

=============================================================================
2. SCALED PRODUCTION MICROSERVICES (FastAPI + gRPC Port 50051)
=============================================================================
+------------------------------+     gRPC (Port 50051)     +------------------------------+
| FastAPI Control Plane        | ------------------------> | SFU Media Node (C++/Rust)    |
| (Auth, Rooms, Database, WS)  |   SFU_API_KEY Auth        | (Routes 10,000+ RTP packets) |
+------------------------------+                           +------------------------------+
```

* **Local Development**: Runs in a single Python process on Port `8000` using `aiortc` for local WebRTC media packet routing. Port `50051` is not required locally.
* **Production Deployment**: FastAPI uses high-speed **gRPC** (`SFU_GRPC_ENDPOINT="localhost:50051"`, authenticated by `SFU_API_KEY`) over HTTP/2 to command external dedicated media nodes running in cloud clusters.

---

## 4. Technology Stack

### Frontend Client (`frontend/`)
* **Framework**: React 18 + TypeScript + Vite.
* **Icons**: `lucide-react`.
* **Design & Branding**: Modern Dual-Action Hero layout with official **Arreena** logo badge, bold headline typography, centered 2-column split Device Preview lobby with live Web Audio API input level meter, borderless element styling, and pure **White Light Theme**.
* **Page & Connection Separation**: Isolated step routes (`/`, `?page=preview`, `?page=room`, `?page=lab`) with direct share link auto-routing (`?room=CODE` automatically opens meeting lobby preview) and full browser history synchronization (`popstate`), ensuring camera/microphone tracks and WebRTC WebSocket signaling connections are explicitly destroyed when leaving any page.
* **WebRTC APIs**: Native `RTCPeerConnection`, `navigator.mediaDevices.getUserMedia`, `navigator.mediaDevices.getDisplayMedia` (Screen Sharing).

### Control Plane Backend (`backend/`)
* **Framework**: FastAPI (Python 3.10+).
* **Server**: Uvicorn.
* **ORM & DB**: SQLAlchemy 2.0 (Async) + `aiosqlite` (Dev) / `asyncpg` (Prod).
* **ID Generator**: 64-bit Snowflake ID Generator (`SnowflakeGenerator`).
* **Media Ingest**: `aiortc` WebRTC engine.
* **Testing**: Pytest + `pytest-asyncio` + `httpx`.

### Infrastructure (`infra/`)
* **TURN/STUN**: Coturn Server (`turn:localhost:3478`).
* **Cache/Broker**: Redis (`redis:6379`).
* **Database**: PostgreSQL 16 (`postgresql:5432`).
* **Containerization**: Docker Compose (`infra/docker-compose.yml`).
