import hmac
import hashlib
import base64
import time
import secrets
from typing import Dict, Any
from aethersfu.config import settings


class CredentialService:
    """
    Generates temporary backend-issued credentials for WebRTC transport (Coturn TURN)
    and internal SFU node connection parameters. No user authentication is involved.
    """

    @staticmethod
    def generate_turn_credentials(username: str | None = None) -> Dict[str, Any]:
        """
        Generates dynamic short-lived TURN credentials using HMAC-SHA1 signature.
        Used by coturn with `use-auth-secret`.
        """
        if not username:
            username = f"anon_{secrets.token_hex(6)}"

        expiry_timestamp = int(time.time()) + settings.TURN_CREDENTIAL_TTL_SECONDS
        turn_username = f"{expiry_timestamp}:{username}"

        # HMAC-SHA1 hashing of turn_username using TURN_SECRET
        dig = hmac.new(
            settings.TURN_SECRET.encode("utf-8"),
            turn_username.encode("utf-8"),
            hashlib.sha1
        ).digest()

        password = base64.b64encode(dig).decode("utf-8")

        return {
            "ice_servers": [
                {
                    "urls": [settings.STUN_SERVER_URL]
                },
                {
                    "urls": [settings.TURN_SERVER_URL],
                    "username": turn_username,
                    "credential": password
                }
            ],
            "ttl_seconds": settings.TURN_CREDENTIAL_TTL_SECONDS
        }

    @staticmethod
    def generate_sfu_transport_token(room_code: str, session_token: str) -> str:
        """
        Generates an internal signed token for connecting the browser client to AetherSFU.
        """
        raw = f"{room_code}:{session_token}:{int(time.time())}"
        signature = hmac.new(
            settings.SFU_API_KEY.encode("utf-8"),
            raw.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return f"{raw}:{signature}"
