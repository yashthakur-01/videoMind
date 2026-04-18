from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    encryption_key: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    youtube_data_api_key: str | None = None
    frontend_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def _parse_frontend_origins(cls, value: object) -> list[str]:
        if value is None:
            return ["http://localhost:5173", "http://127.0.0.1:5173"]
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return [str(value).strip()]

    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")


settings = Settings()
