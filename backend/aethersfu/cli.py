import argparse
import uvicorn
from aethersfu.config import settings


def main():
    parser = argparse.ArgumentParser(description="Arreena Control Plane CLI Server")
    parser.add_argument("--host", type=str, default=settings.HOST, help="Host interface to bind")
    parser.add_argument("--port", type=int, default=settings.PORT, help="Port to bind")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for dev mode")

    args = parser.parse_args()

    uvicorn.run(
        "aethersfu.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload
    )


if __name__ == "__main__":
    main()
