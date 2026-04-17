from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status

from app.models.schemas import ChatMessage, ProcessRequest, ProcessResponse, Section, VideoDetailResponse, VideoHistoryItem
from app.services.auth_service import AuthService
from app.services.pipeline_state import rag_adapter
from app.services.redis_service import RedisService
from app.services.supabase_service import SupabaseService
from app.services.transcript import get_video_metadata

router = APIRouter(tags=["processing"])
auth_service = AuthService()
supabase_service = SupabaseService()
redis_service = RedisService()


def _error_payload(code: str, message: str, details: str | None = None) -> dict:
    payload = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return payload


def _to_section(row: dict) -> Section:
    return Section(
        id=row["id"],
        title=row["title"],
        summary=row["summary"],
        start_seconds=int(row["start_seconds"]),
        end_seconds=int(row["end_seconds"]),
        start_time=row["start_time"],
        end_time=row["end_time"],
        metadata=row.get("metadata") or {},
    )


def _raise_processing_http_exception(error: Exception) -> None:
    if isinstance(error, ValueError):
        detail_text = str(error).strip()
        if "no transcript" in detail_text.lower():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=_error_payload(
                    "TRANSCRIPT_UNAVAILABLE",
                    "Unable to fetch transcript for this video.",
                    details=detail_text,
                ),
            ) from error

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error_payload("PROCESSING_INPUT_INVALID", detail_text or "Invalid processing request."),
        ) from error

    error_text = str(error).strip()
    lowered = error_text.lower()
    if any(term in lowered for term in ("quota", "rate limit", "too many requests", "429", "limit exceeded")):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_error_payload(
                "API_LIMIT_REACHED",
                "Provider API rate limit or quota has been reached. Please try again later.",
                details=error_text,
            ),
        ) from error

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=_error_payload(
            "PROCESSING_FAILED",
            "Failed to process the video due to a server error.",
            details=error_text,
        ),
    ) from error


@router.post("/process", response_model=ProcessResponse)
async def process_video(
    payload: ProcessRequest,
    authorization: str | None = Header(default=None),
    x_provider_api_key: str | None = Header(default=None),
) -> ProcessResponse:
    user_id = auth_service.get_user_id(authorization)
    settings_row = supabase_service.get_user_provider_settings(user_id)

    normalized_provider = (payload.provider or "").strip().lower()
    selected_model = (payload.model or "").strip()
    if not normalized_provider or not selected_model:
        if not settings_row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_error_payload(
                    "PROVIDER_SETTINGS_MISSING",
                    "No saved provider settings found. Save your provider, model, and API key first.",
                ),
            )
        normalized_provider = str(settings_row.get("active_provider", "")).strip().lower()
        selected_model = str(settings_row.get("active_model", "")).strip()

    provider_api_key = x_provider_api_key or supabase_service.get_provider_api_key(settings_row, normalized_provider)
    if not provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error_payload(
                "PROVIDER_API_KEY_MISSING",
                f"Missing API key for provider '{normalized_provider}'. Save it in settings or send it in the header.",
            ),
        )

    sections_raw: list[dict] = []
    video_overview: dict | None = None
    try:
        build_result = await rag_adapter.build_sections(
            youtube_url=payload.youtube_url,
            provider=normalized_provider,
            model=selected_model,
            provider_api_key=provider_api_key,
        )
        sections_raw = build_result.get("sections", [])
        video_overview = build_result.get("video_overview")
    except Exception as error:
        _raise_processing_http_exception(error)

    video_info = get_video_metadata(payload.youtube_url)

    video_metadata = {
        "sections_count": len(sections_raw),
        "status": "processed",
        "video_overview_summary": (video_overview or {}).get("summary"),
        "video_overview_topics": (video_overview or {}).get("topics"),
        "video_overview_people_involved": (video_overview or {}).get("people_involved"),
    }

    video = supabase_service.create_video_record(
        user_id=user_id,
        youtube_url=payload.youtube_url,
        youtube_video_id=video_info.get("youtube_video_id"),
        video_title=video_info.get("video_title"),
        channel_name=video_info.get("channel_name"),
        duration_seconds=video_info.get("duration_seconds"),
        duration_label=video_info.get("duration_label"),
        thumbnail_url=video_info.get("thumbnail_url"),
        embed_url=video_info.get("embed_url"),
        provider=normalized_provider,
        model=selected_model,
        metadata=video_metadata,
    )
    video_id = video["id"]

    inserted = supabase_service.insert_sections(video_id=video_id, user_id=user_id, sections=sections_raw)

    sections: list[Section] = []
    redis_rows = []
    for row in inserted:
        section = _to_section(row)
        sections.append(section)
        redis_rows.append(section.model_dump())

    rag_status = rag_adapter.warmup_retriever(
        user_id=user_id,
        video_id=video_id,
        sections=sections_raw,
        video_overview=video_overview,
        provider=normalized_provider,
        model=selected_model,
        provider_api_key=provider_api_key,
    )
    supabase_service.update_video_record(
        video_id=video_id,
        user_id=user_id,
        metadata={
            **video_metadata,
            "rag_status": rag_status,
        },
    )

    await redis_service.warmup_sections(user_id=user_id, video_id=video_id, sections=redis_rows)

    return ProcessResponse(video_id=video_id, video=VideoHistoryItem(**video), sections=sections, rag_status=rag_status)


@router.post("/videos/{video_id}/regenerate-sections", response_model=VideoDetailResponse)
async def regenerate_sections_for_video(
    video_id: str,
    authorization: str | None = Header(default=None),
    x_provider_api_key: str | None = Header(default=None),
) -> VideoDetailResponse:
    user_id = auth_service.get_user_id(authorization)

    video = supabase_service.get_video(user_id=user_id, video_id=video_id)
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error_payload("VIDEO_NOT_FOUND", "Video not found."),
        )

    provider = str(video.get("provider", "")).strip().lower()
    model = str(video.get("model", "")).strip()
    youtube_url = str(video.get("youtube_url", "")).strip()

    settings_row = supabase_service.get_user_provider_settings(user_id)
    provider_api_key = x_provider_api_key or supabase_service.get_provider_api_key(settings_row, provider)
    if not provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_error_payload(
                "PROVIDER_API_KEY_MISSING",
                f"Missing API key for provider '{provider}'. Save it in settings or send it in the header.",
            ),
        )

    sections_raw: list[dict] = []
    video_overview: dict | None = None
    try:
        build_result = await rag_adapter.build_sections(
            youtube_url=youtube_url,
            provider=provider,
            model=model,
            provider_api_key=provider_api_key,
        )
        sections_raw = build_result.get("sections", [])
        video_overview = build_result.get("video_overview")
    except Exception as error:
        _raise_processing_http_exception(error)

    supabase_service.delete_sections(video_id=video_id, user_id=user_id)
    inserted = supabase_service.insert_sections(video_id=video_id, user_id=user_id, sections=sections_raw)
    sections = [_to_section(row) for row in inserted]

    rag_status = rag_adapter.warmup_retriever(
        user_id=user_id,
        video_id=video_id,
        sections=sections_raw,
        video_overview=video_overview,
        provider=provider,
        model=model,
        provider_api_key=provider_api_key,
    )

    current_metadata = video.get("metadata") or {}
    supabase_service.update_video_record(
        video_id=video_id,
        user_id=user_id,
        metadata={
            **current_metadata,
            "sections_count": len(sections_raw),
            "status": "processed",
            "rag_status": rag_status,
            "regenerated": True,
            "video_overview_summary": (video_overview or {}).get("summary"),
            "video_overview_topics": (video_overview or {}).get("topics"),
            "video_overview_people_involved": (video_overview or {}).get("people_involved"),
        },
    )

    await redis_service.warmup_sections(
        user_id=user_id,
        video_id=video_id,
        sections=[item.model_dump() for item in sections],
    )

    refreshed_video = supabase_service.get_video(user_id=user_id, video_id=video_id)
    if refreshed_video is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_error_payload("PROCESSING_FAILED", "Video refresh failed after section regeneration."),
        )
    chat_rows = supabase_service.get_conversation_history(user_id=user_id, video_id=video_id)
    chat_messages = [ChatMessage(**row) for row in chat_rows]
    return VideoDetailResponse(
        video=VideoHistoryItem(**refreshed_video),
        sections=sections,
        chat_messages=chat_messages,
    )


@router.get("/videos", response_model=list[VideoHistoryItem])
async def list_processed_videos(authorization: str | None = Header(default=None)) -> list[VideoHistoryItem]:
    user_id = auth_service.get_user_id(authorization)
    rows = supabase_service.list_videos(user_id=user_id)
    return [VideoHistoryItem(**row) for row in rows]


@router.get("/videos/{video_id}", response_model=VideoDetailResponse)
async def get_video_details(video_id: str, authorization: str | None = Header(default=None)) -> VideoDetailResponse:
    user_id = auth_service.get_user_id(authorization)

    video = supabase_service.get_video(user_id=user_id, video_id=video_id)
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_error_payload("VIDEO_NOT_FOUND", "Video not found."),
        )

    rows = supabase_service.get_sections(user_id=user_id, video_id=video_id)
    sections = [_to_section(row) for row in rows]

    redis_payload = [item.model_dump() for item in sections]
    await redis_service.warmup_sections(user_id=user_id, video_id=video_id, sections=redis_payload)

    chat_rows = supabase_service.get_conversation_history(user_id=user_id, video_id=video_id)
    chat_messages = [ChatMessage(**row) for row in chat_rows]
    return VideoDetailResponse(video=VideoHistoryItem(**video), sections=sections, chat_messages=chat_messages)
