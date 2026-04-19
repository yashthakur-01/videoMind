from __future__ import annotations

import json

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import StreamingResponse

from app.models.schemas import ChatRequest
from app.services.auth_service import AuthService
from app.services.pipeline_state import chat_service, rag_adapter
from app.services.redis_service import RedisService
from app.services.supabase_service import SupabaseService

router = APIRouter(tags=["chat"])
auth_service = AuthService()
redis_service = RedisService()
supabase_service = SupabaseService()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _chat_error(code: str, message: str, details: str | None = None) -> dict:
    payload = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return payload


def _chat_error_payload(error: Exception) -> dict:
    text = str(error).strip()
    lowered = text.lower()
    if any(term in lowered for term in ("resource_exhausted", "quota", "rate limit", "too many requests", "429", "limit exceeded")):
        return _chat_error(
            "API_LIMIT_REACHED",
            "Provider API rate limit or quota has been reached. Please try again later.",
            text,
        )
    return _chat_error("CHAT_FAILED", "Chat failed due to a server error.", text)


@router.post("/chat")
async def chat(
    payload: ChatRequest,
    authorization: str | None = Header(default=None),
    x_provider_api_key: str | None = Header(default=None),
) -> StreamingResponse:
    user_id = auth_service.get_user_id(authorization)
    video = supabase_service.get_video(user_id=user_id, video_id=payload.video_id)
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_chat_error("VIDEO_NOT_FOUND", "Video not found."),
        )

    section_id = str(payload.section_id or "").strip() or None
    if section_id:
        section_row = supabase_service.get_section_by_id(user_id=user_id, video_id=payload.video_id, section_id=section_id)
        if section_row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=_chat_error("SECTION_NOT_FOUND", "Selected section not found."),
            )

    provider = str(video.get("provider", "")).strip()
    settings_row = supabase_service.get_user_provider_settings(user_id)
    provider_api_key = x_provider_api_key or supabase_service.get_provider_api_key(settings_row, provider)
    if not provider_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_chat_error(
                "PROVIDER_API_KEY_MISSING",
                f"No saved API key found for provider '{provider}'. Update your settings first.",
            ),
        )

    # Chat-time retrieval and generation must use the provider/model selected for
    # this video together with the API key supplied by the current user request.
    rag_adapter.configure_runtime(
        provider=provider,
        model=str(video.get("model", "")).strip(),
        provider_api_key=provider_api_key,
    )

    sections = await rag_adapter.get_sections_with_cache(user_id=user_id, video_id=payload.video_id)
    await rag_adapter.ensure_docstore_cache(user_id=user_id, video_id=payload.video_id, sections=sections)

    supabase_service.append_chat_message(
        user_id=user_id,
        video_id=payload.video_id,
        role="user",
        content=payload.query,
        sources=[],
        metadata={"selected_section_id": section_id},
    )

    async def event_stream():
        try:
            prepared_turn = await chat_service.prepare_turn(
                query=payload.query,
                sections=sections,
                user_id=user_id,
                video_id=payload.video_id,
                section_id=section_id,
            )
        except Exception as error:
            yield _sse("error", _chat_error_payload(error))
            return

        yield _sse(
            "meta",
            {
                "mode": prepared_turn.get("mode", "video"),
                "cache_hit": prepared_turn.get("cache_hit", False),
                "sources": prepared_turn.get("sources", []),
            },
        )

        final_answer = ""
        try:
            if prepared_turn.get("mode") == "cache":
                # Cache hits skip generation and return immediately.
                final_answer = prepared_turn.get("answer", "")
                if final_answer:
                    yield _sse("token", {"text": final_answer})
            else:
                async for chunk in chat_service.stream_prepared_turn(prepared_turn):
                    final_answer += chunk
                    yield _sse("token", {"text": chunk})
        except Exception as error:
            yield _sse("error", _chat_error_payload(error))
            return
        else:
            if prepared_turn.get("mode") == "video" and not prepared_turn.get("cache_hit", False):
                await redis_service.cache_query_result(
                    user_id=user_id,
                    video_id=payload.video_id,
                    query=payload.query,
                    answer=final_answer,
                    sources=prepared_turn.get("sources", []),
                    retrieved_context=prepared_turn.get("retrieved_context", []),
                )
            supabase_service.append_chat_message(
                user_id=user_id,
                video_id=payload.video_id,
                role="assistant",
                content=final_answer,
                sources=prepared_turn.get("sources", []),
                metadata={
                    "cache_hit": prepared_turn.get("cache_hit", False),
                    "retrieved_context": prepared_turn.get("retrieved_context", []),
                    "route_reason": prepared_turn.get("route_reason", ""),
                    "cache_match_score": prepared_turn.get("cache_match_score", 0.0),
                    "selected_section_id": prepared_turn.get("selected_section_id"),
                },
            )
            yield _sse(
                "done",
                {
                    "answer": final_answer,
                    "sources": prepared_turn.get("sources", []),
                    "cache_hit": prepared_turn.get("cache_hit", False),
                },
            )

    # SSE keeps the connection open while the assistant streams new tokens.
    return StreamingResponse(event_stream(), media_type="text/event-stream")
