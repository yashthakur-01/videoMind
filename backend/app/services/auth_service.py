from __future__ import annotations

from fastapi import HTTPException, status
from supabase import Client, create_client

from app.config import settings


class AuthService:
    def __init__(self) -> None:
        self.client: Client = create_client(settings.supabase_url, settings.supabase_anon_key)

    @staticmethod
    def _auth_error(code: str, message: str, *, status_code: int, details: str | None = None) -> HTTPException:
        payload = {"code": code, "message": message}
        if details:
            payload["details"] = details
        return HTTPException(status_code=status_code, detail=payload)

    def get_user_id(self, authorization_header: str | None) -> str:
        if not authorization_header or not authorization_header.startswith("Bearer "):
            raise self._auth_error(
                "AUTH_TOKEN_MISSING",
                "Missing Bearer token.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        token = authorization_header.removeprefix("Bearer ").strip()
        try:
            user_response = self.client.auth.get_user(token)
        except Exception as error:
            raise self._auth_error(
                "AUTH_PROVIDER_UNAVAILABLE",
                "Authentication provider is unavailable.",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                details=str(error),
            ) from error
        user = user_response.user

        if user is None:
            raise self._auth_error(
                "AUTH_TOKEN_INVALID",
                "Invalid auth token.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        return user.id
