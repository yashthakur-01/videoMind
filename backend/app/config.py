import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

load_dotenv(ENV_PATH, override=False)


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _get_optional_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _parse_frontend_origins(value: str | None) -> list[str]:
    if not value:
        return DEFAULT_FRONTEND_ORIGINS.copy()

    origins = [origin.strip() for origin in value.split(",") if origin.strip()]

    # Browsers reject allow_credentials=True when CORS origin is "*".
    sanitized = [origin for origin in origins if origin != "*"]
    return sanitized or DEFAULT_FRONTEND_ORIGINS.copy()


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    encryption_key: str | None
    redis_url: str
    youtube_data_api_key: str | None
    frontend_origins: list[str]


settings = Settings(
    supabase_url=_get_required_env("SUPABASE_URL"),
    supabase_anon_key=_get_required_env("SUPABASE_ANON_KEY"),
    supabase_service_role_key=_get_required_env("SUPABASE_SERVICE_ROLE_KEY"),
    encryption_key=_get_optional_env("ENCRYPTION_KEY"),
    redis_url=_get_optional_env("REDIS_URL") or "redis://localhost:6379/0",
    youtube_data_api_key=_get_optional_env("YOUTUBE_DATA_API_KEY"),
    frontend_origins=_parse_frontend_origins(_get_optional_env("FRONTEND_ORIGINS")),
)
