from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status

from app.models.schemas import ProviderSettingsResponse, ProviderSettingsUpdateRequest
from app.services.auth_service import AuthService
from app.services.rag_pipeline import normalize_provider
from app.services.supabase_service import SupabaseService

router = APIRouter(tags=["settings"])
auth_service = AuthService()
supabase_service = SupabaseService()


def _to_response(row: dict | None) -> ProviderSettingsResponse:
    if not row:
        return ProviderSettingsResponse(
            active_provider="openai",
            active_model="gpt-4o",
            has_openai_key=False,
            has_gemini_key=False,
        )
    return ProviderSettingsResponse(
        active_provider=str(row.get("active_provider", "openai")),
        active_model=str(row.get("active_model", "gpt-4o")),
        has_openai_key=bool(row.get("openai_api_key")),
        has_gemini_key=bool(row.get("gemini_api_key")),
    )


@router.get("/settings/provider", response_model=ProviderSettingsResponse)
async def get_provider_settings(authorization: str | None = Header(default=None)) -> ProviderSettingsResponse:
    user_id = auth_service.get_user_id(authorization)
    row = supabase_service.get_user_provider_settings(user_id)
    return _to_response(row)


@router.put("/settings/provider", response_model=ProviderSettingsResponse)
async def update_provider_settings(
    payload: ProviderSettingsUpdateRequest,
    authorization: str | None = Header(default=None),
) -> ProviderSettingsResponse:
    user_id = auth_service.get_user_id(authorization)
    provider = normalize_provider(payload.active_provider)
    api_key = payload.api_key.strip() if payload.api_key else None

    existing = supabase_service.get_user_provider_settings(user_id)
    if api_key is None and not supabase_service.get_provider_api_key(existing, provider):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No saved API key exists for provider '{provider}'. Please provide one.",
        )

    row = supabase_service.upsert_user_provider_settings(
        user_id=user_id,
        active_provider=provider,
        active_model=payload.active_model.strip(),
        api_key=api_key,
    )
    return _to_response(row)


@router.delete("/settings/provider", response_model=ProviderSettingsResponse)
async def delete_provider_settings(authorization: str | None = Header(default=None)) -> ProviderSettingsResponse:
    user_id = auth_service.get_user_id(authorization)
    supabase_service.delete_user_provider_settings(user_id)
    return _to_response(None)
