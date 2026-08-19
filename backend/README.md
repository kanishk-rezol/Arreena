# AetherSFU Control Plane (`aethersfu-control`)

FastAPI backend control plane and WebRTC signaling server for the DIY Video Conferencing Platform.

## Installation

```bash
# Local development installation
pip install -e .[dev]

# Production installation from PyPI
pip install aethersfu-control
```

## Running the Server

```bash
# Using CLI entrypoint
aethersfu-server --host 0.0.0.0 --port 8000

# Or via Uvicorn directly
uvicorn aethersfu.main:app --reload --port 8000
```
