# Arreena Documentation Portal

Welcome to the **Arreena Platform Documentation**. This portal provides comprehensive design specifications, system architecture diagrams, database schemas, API references, and deployment guides for the platform.

---

## 📚 Documentation Index

1. 📖 **[Project Architecture & Roadmap (`PROJECT_OVERVIEW.md`)](PROJECT_OVERVIEW.md)**
   * Core design philosophy & technology stack.
   * **SFU (Selective Forwarding Unit) Architecture** concept, ASCII flow diagram, and WebRTC vs. Control Plane vs. SFU & gRPC breakdown.
   * Detailed breakdown of the 6-Step Engineering Roadmap (FastAPI Control Plane, WebSockets Signaling, `aiortc` Ingest, Coturn STUN/TURN, Elastic `RoomManager`, In-Meeting Chat).

2. 🔌 **[API Reference Guide (`API_REFERENCE.md`)](API_REFERENCE.md)**
   * Complete REST API specification (Rooms, Anonymous Sessions, STUN/TURN Credential Generation, Multi-Party Room State & Ejection).
   * WebSocket signaling message format reference.
   * Server-side `aiortc` Media Ingest Lab endpoints.

3. 🗄️ **[Data Model & Snowflake ID Spec (`DATA_MODEL.md`)](DATA_MODEL.md)**
   * Distributed 64-bit Snowflake ID Generator specification (`SnowflakeGenerator`).
   * Database table schemas (`rooms`, `anonymous_sessions`, `call_history`, `lifecycle_events`).
   * Timestamp extraction utility (`parse_snowflake_timestamp`).

4. 🚀 **[Deployment & Operations Guide (`DEPLOYMENT_GUIDE.md`)](DEPLOYMENT_GUIDE.md)**
   * Local development instructions (Backend Uvicorn + Frontend Vite).
   * Production Docker Compose infrastructure (FastAPI + Coturn + Redis + PostgreSQL).
   * Publishing `aethersfu-control` package to PyPI.

---

## 🎨 System Architecture Diagrams

* 📐 **[System Architecture Overview](architecture/system-architecture.svg)**: High-level overview of control plane, WebRTC media flow, Coturn TURN server, and database layer.
* 🔄 **[Participant Join Sequence Flow](architecture/participant-join-flow.svg)**: WebRTC Perfect Negotiation sequence diagram (`polite` vs `impolite` roles).
