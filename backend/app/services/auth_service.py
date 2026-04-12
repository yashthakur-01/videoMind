from __future__ import annotations

from fastapi import HTTPException, status
from supabase import Client, create_client

from app.config import settings


class AuthService:
    def __init__(self) -> None:
        self.client: Client = create_client(settings.supabase_url, settings.supabase_anon_key)

    def get_user_id(self, authorization_header: str | None) -> str:
        if not authorization_header or not authorization_header.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")

        token = authorization_header.removeprefix("Bearer ").strip()
        user_response = self.client.auth.get_user(token)
        user = user_response.user

        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token")

        return user.id
