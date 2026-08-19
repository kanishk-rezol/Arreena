# Arreena — Ultra-Fast, Anonymous WebRTC Video Conferencing Platform

[![npm version](https://img.shields.io/npm/v/@rezol7/arreena-react?color=00f2fe&style=flat-square)](https://www.npmjs.com/package/@rezol7/arreena-react)
[![Python Package](https://img.shields.io/badge/pypi-arreena--sfu-4facfe?style=flat-square)](https://pypi.org/project/arreena-sfu/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Arreena** is a production-grade, ultra-low-latency video conferencing platform built with a **custom Python SFU media router**, a **FastAPI control plane**, and a **React + TypeScript frontend**.

No sign-ups, no tracking. Powered by custom WebRTC packet forwarding, time-ordered 64-bit Snowflake IDs, Coturn NAT traversal, and real-time WebSocket chat broadcasting.

---

## 🌟 Key Features

* ⚡ **Ultra-Low Latency SFU Packet Forwarding**: Receives 1 camera upload per publisher and forwards stream downlinks selectively to subscribers without melting client bandwidth.
* 🔒 **100% Anonymous & Zero Sign-ups**: Short-lived, unguessable room codes (`b36d-80c2-8be8`) generated using time-ordered 64-bit Snowflake IDs (`SnowflakeGenerator`).
* 🎙️ **Device Preview Lobby**: 2-column split lobby with live Web Audio API input level visualizer meter, camera/mic toggles, and hardware device selectors.
* 📺 **Adaptive Video Grid & Screen Sharing**: Dynamic multi-participant video tile matrix with active speaker highlight glow and native browser screen sharing.
* 💬 **Real-Time In-Meeting Chat Drawer**: Slide-out glassmorphism drawer with 64-bit Snowflake message IDs, sender tags, auto-scroll history, and unread badge count indicators.
* 📦 **Publishable Packages**:
  * **Backend Engine**: Published to PyPI as [`arreena-sfu`](https://pypi.org/project/arreena-sfu/) (`pip install arreena-sfu`)
  * **Frontend SDK**: Published to npm as [`@rezol7/arreena-react`](https://www.npmjs.com/package/@rezol7/arreena-react) (`npm install @rezol7/arreena-react`)

---

## 🏗️ System Architecture

```text
================================================================================
                            ARREENA PLATFORM ARCHITECTURE
================================================================================

 [ Client Browser ] <------ WebSockets (Signaling) ------> [ FastAPI Control Plane ]
 [ React Client   ] <------ HTTP REST API (Rooms) --------> [ Port 8000           ]
        |                                                           |
        | WebRTC Media Stream (UDP/RTP)                             | gRPC Control
        v                                                           v (Port 50051)
 +------------------------------------------------------------------------------+
 |                  Arreena Selective Forwarding Unit (SFU)                     |
 |        • MultiPartyRoomManager concurrency lock                              |
 |        • Python aiortc MediaRelay proxy forwarding                           |
 |        • Real-time packet, packet loss & bitrate telemetry                   |
 +------------------------------------------------------------------------------+
```

### WebRTC vs. Control Plane vs. SFU
* **WebRTC**: Built directly into modern browsers (Chrome/Firefox/Safari) providing camera capture (`getUserMedia`), codecs (VP8/Opus), and network encryption (DTLS-SRTP).
* **Control Plane (`backend/`)**: Built with FastAPI, handling Room management, Anonymous session tokens, 64-bit Snowflake IDs, database storage, and WebSocket signaling.
* **SFU Engine (`backend/aethersfu/services/`)**: Media routing engine that takes 1 upload stream from a publisher and selectively relays it to 3–100+ participants.

---

## 📦 Package Installation & Usage

### 1. Python Backend (`pip install arreena-sfu`)

Install the backend package in any Python web project:

```bash
pip install arreena-sfu
```

Mount Arreena directly into an existing FastAPI application:

```python
from fastapi import FastAPI
from aethersfu.main import app as arreena_app

app = FastAPI(title="My Platform")
app.mount("/video", arreena_app)
```

### 2. React Frontend (`npm install @rezol7/arreena-react`)

Install the frontend UI package in any React / Next.js app:

```bash
npm install @rezol7/arreena-react
```

Import and use the meeting components:

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

## 🚀 Quickstart Guide

### Prerequisites
* **Node.js** 18+ & **npm**
* **Python** 3.10+

### 1. Launch Backend Server

```powershell
cd backend

# Install dependencies in editable mode
pip install -e .[dev]

# Run tests
python -m pytest tests

# Start FastAPI Uvicorn server
python -m uvicorn aethersfu.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Launch Frontend Client

```powershell
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:3000` in your browser to create or join a meeting!

---

## 📁 Repository Structure

```text
video-conferencing-tool/
├── backend/                         # FastAPI Control Plane & SFU Server
│   ├── pyproject.toml               # PyPI package build configuration
│   ├── aethersfu/                   # Backend source code
│   │   ├── db/                      # SQLAlchemy models & Snowflake generator
│   │   ├── routers/                 # REST APIs, WebSockets & SFU endpoints
│   │   └── services/                # RoomManager & aiortc MediaRelay engine
│   └── tests/                       # Pytest integration suite
├── frontend/                        # React + TypeScript + Vite Web Client
│   ├── package.json                 # npm package configuration (@rezol7/arreena-react)
│   └── src/                         # React UI components, state & signaling
├── docs/                            # Arreena System Documentation Portal
│   ├── PROJECT_OVERVIEW.md          # Architecture specs & 6-step roadmap
│   ├── API_REFERENCE.md             # REST APIs & WebSocket protocol reference
│   ├── DATA_MODEL.md                # Snowflake 64-bit ID spec & database schemas
│   └── DEPLOYMENT_GUIDE.md          # Docker Compose & Package publishing guide
└── README.md
```

---

## 📚 Complete Documentation Portal

For deep-dive architectural specifications, API reference, schemas, and container deployment guides, visit the **[`docs/`](docs/README.md)** portal:

* 📖 **[Project Architecture Specs (`docs/PROJECT_OVERVIEW.md`)](docs/PROJECT_OVERVIEW.md)**
* 🔌 **[API & Signaling Reference (`docs/API_REFERENCE.md`)](docs/API_REFERENCE.md)**
* 🗄️ **[Database Schemas & Snowflake IDs (`docs/DATA_MODEL.md`)](docs/DATA_MODEL.md)**
* 🚀 **[Deployment & Package Guide (`docs/DEPLOYMENT_GUIDE.md`)](docs/DEPLOYMENT_GUIDE.md)**

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
