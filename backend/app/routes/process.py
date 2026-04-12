from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status

from app.models.schemas import ChatMessage, ProcessRequest, ProcessResponse, Section, VideoDetailResponse, VideoHistoryItem
from app.services.auth_service import AuthService
from app.services.pipeline_state import rag_adapter
from app.services.redis_service import RedisService
from app.services.supabase_service import SupabaseService

router = APIRouter(tags=["processing"])
auth_service = AuthService()
supabase_service = SupabaseService()
redis_service = RedisService()


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
                detail="No saved provider settings found. Save your provider, model, and API key first.",
            )
        normalized_provider = str(settings_row.get("active_provider", "")).strip().lower()
        selected_model = str(settings_row.get("active_model", "")).strip()

    provider_api_key = x_provider_api_key or supabase_service.get_provider_api_key(settings_row, normalized_provider)
    if not provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing API key for provider '{normalized_provider}'. Save it in settings or send it in the header.",
        )

    try:
        sections_raw = await rag_adapter.build_sections(
            youtube_url=payload.youtube_url,
            provider=normalized_provider,
            model=selected_model,
            provider_api_key=provider_api_key,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    video_metadata = {
        "sections_count": len(sections_raw),
        "status": "processed",
    }

    video = supabase_service.create_video_record(
        user_id=user_id,
        youtube_url=payload.youtube_url,
        provider=normalized_provider,
        model=selected_model,
        metadata=video_metadata,
    )
    video_id = video["id"]

    inserted = supabase_service.insert_sections(video_id=video_id, user_id=user_id, sections=sections_raw)

    sections: list[Section] = []
    redis_rows = []
    for row in inserted:
        start_seconds = int(row["start_seconds"])
        end_seconds = int(row["end_seconds"])
        start_time = row["start_time"]
        end_time = row["end_time"]
        section = Section(
            id=row["id"],
            title=row["title"],
            summary=row["summary"],
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            start_time=start_time,
            end_time=end_time,
            metadata=row.get("metadata") or {},
        )
        sections.append(section)
        redis_rows.append(section.model_dump())

    rag_status = rag_adapter.warmup_retriever(
        user_id=user_id,
        video_id=video_id,
        sections=sections_raw,
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

    return ProcessResponse(video_id=video_id, sections=sections, rag_status=rag_status)


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    rows = supabase_service.get_sections(user_id=user_id, video_id=video_id)
    sections = [
        Section(
            id=row["id"],
            title=row["title"],
            summary=row["summary"],
            start_seconds=int(row["start_seconds"]),
            end_seconds=int(row["end_seconds"]),
            start_time=row["start_time"],
            end_time=row["end_time"],
            metadata=row.get("metadata") or {},
        )
        for row in rows
    ]

    redis_payload = [item.model_dump() for item in sections]
    await redis_service.warmup_sections(user_id=user_id, video_id=video_id, sections=redis_payload)

    chat_rows = supabase_service.get_conversation_history(user_id=user_id, video_id=video_id)
    chat_messages = [ChatMessage(**row) for row in chat_rows]
    return VideoDetailResponse(video=VideoHistoryItem(**video), sections=sections, chat_messages=chat_messages)
