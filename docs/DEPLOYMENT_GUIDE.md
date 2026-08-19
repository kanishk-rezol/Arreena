# AetherSFU Deployment & Operations Guide

## 1. Local Development Setup

### Prerequisites
* Python 3.10+
* Node.js 18+ and npm
* Git

### Step-by-Step Instructions

1. **Backend Server Setup**:
   ```powershell
   cd "d:\video conferencing tool\backend"

   # Create & activate virtual environment (optional)
   python -m venv venv
   .\venv\Scripts\activate

   # Install dependencies in editable mode
   pip install -e .[dev]

   # Start backend API & signaling server
   python -m uvicorn aethersfu.main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Frontend Web Client Setup**:
   ```powershell
   cd "d:\video conferencing tool\frontend"

   # Install dependencies (already installed)
   npm install

   # Start Vite dev server
   npm run dev
   ```

3. **Verify Installation**:
   * Open `http://localhost:3000` in your browser.
   * Run automated tests:
     ```powershell
     python -m pytest backend/tests
     ```

---

## 2. Production Containerized Deployment (Docker Compose)

The repository includes a complete container infrastructure specification in [`infra/docker-compose.yml`](file:///d:/video%20conferencing%20tool/infra/docker-compose.yml).

### Services Included
* **Control Plane Backend** (`fastapi` on port `8000`)
* **Coturn STUN/TURN Server** (`coturn` on UDP/TCP port `3478`)
* **PostgreSQL Database** (`postgres:16` on port `5432`)
* **Redis Cache & Pub/Sub** (`redis:6` on port `6379`)

### Running Docker Infrastructure

```bash
# Navigate to infra directory
cd infra

# Launch container stack in detached mode
docker-compose up -d

# View container logs
docker-compose logs -f
```

---

## 3. Publishing Packages (PyPI & npm)

### A. Publishing the Python Backend Package to PyPI (`arreena-sfu`)

The backend is configured in `backend/pyproject.toml` as a publishable Python package.

```powershell
cd "d:\video conferencing tool\backend"

# 1. Install build & twine tools
pip install build twine

# 2. Build distribution wheel & source tarball
python -m build

# 3. Upload package to PyPI (Python Package Index)
twine upload dist/*
```

Once uploaded to PyPI, anyone can install your server engine using:
```bash
pip install arreena-sfu
```

---

### B. Publishing the React Frontend Package to npm (`@arreena/react`)

```powershell
cd "d:\video conferencing tool\frontend"

# 1. Login to npm registry
npm login

# 2. Publish package to npm
npm publish --access public
```

Once uploaded to npm, any frontend developer can install your UI components using:
```bash
npm install @arreena/react
```
