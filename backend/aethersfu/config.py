from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB = (BASE_DIR / "aethersfu.db").as_posix()


class Settings(BaseSettings):
    APP_NAME: str = "Arreena Control Plane"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Database Settings (SQLite fallback for dev, PostgreSQL for production)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DEFAULT_DB}"
    
    # Redis Settings (Optional for single node, required for horizontal scale)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Coturn TURN/STUN Settings
    TURN_SERVER_URL: str = "turn:localhost:3478"
    STUN_SERVER_URL: str = "stun:stun.l.google.com:19302"
    TURN_SECRET: str = "aethersfu_dev_turn_secret_key_change_in_prod"
    TURN_CREDENTIAL_TTL_SECONDS: int = 86400  # 24 hours

    # SFU Endpoint Settings
    SFU_GRPC_ENDPOINT: str = "localhost:50051"
    SFU_API_KEY: str = "dev_sfu_secret_key"

    # CORS Origins
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173", "*"]

    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }


settings = Settings()
