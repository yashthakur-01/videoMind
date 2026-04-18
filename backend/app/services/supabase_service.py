from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from supabase import Client, create_client

from app.config import settings


class SupabaseService:
    def __init__(self) -> None:
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def create_video_record(
        self,
        user_id: str,
        youtube_url: str,
        youtube_video_id: str | None,
        video_title: str | None,
        channel_name: str | None,
        duration_seconds: int | None,
        duration_label: str | None,
        thumbnail_url: str | None,
        embed_url: str | None,
        provider: str,
        model: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        video_id = str(uuid4())
        payload = {
            "id": video_id,
            "user_id": user_id,
            "youtube_url": youtube_url,
            "youtube_video_id": youtube_video_id,
            "video_title": video_title,
            "channel_name": channel_name,
            "duration_seconds": duration_seconds,
            "duration_label": duration_label,
            "thumbnail_url": thumbnail_url,
            "embed_url": embed_url,
            "provider": provider,
            "model": model,
            "metadata": metadata or {},
        }
        result = self.client.table("video_history").insert(payload).execute()
        if not result.data:
            raise ValueError("Failed to create video record")
        return result.data[0]

    def create_generation_job(
        self,
        user_id: str,
        youtube_url: str,
        provider: str,
        model: str,
    ) -> dict[str, Any]:
        payload = {
            "id": str(uuid4()),
            "user_id": user_id,
            "youtube_url": youtube_url,
            "provider": provider,
            "model": model,
            "status": "pending",
            "progress_stage": "queued",
            "error_message": None,
            "video_id": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        result = self.client.table("video_generation_jobs").insert(payload).execute()
        if not result.data:
            raise ValueError("Failed to create generation job")
        return result.data[0]

    def update_generation_job(
        self,
        job_id: str,
        user_id: str,
        *,
        status: str,
        progress_stage: str | None = None,
        video_id: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any] | None:
        payload: dict[str, Any] = {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if progress_stage is not None:
            payload["progress_stage"] = progress_stage
        if video_id is not None:
            payload["video_id"] = video_id
        if error_message is not None or status == "completed":
            payload["error_message"] = error_message

        result = (
            self.client.table("video_generation_jobs")
            .update(payload)
            .eq("id", job_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def get_generation_job(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("video_generation_jobs")
            .select("id,youtube_url,provider,model,status,progress_stage,video_id,error_message,created_at,updated_at")
            .eq("user_id", user_id)
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def get_active_generation_job(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("video_generation_jobs")
            .select("id,youtube_url,provider,model,status,progress_stage,video_id,error_message,created_at,updated_at")
            .eq("user_id", user_id)
            .in_("status", ["pending", "processing"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def insert_sections(self, video_id: str, user_id: str, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = []
        for index, section in enumerate(sections):
            rows.append(
                {
                    "video_id": video_id,
                    "user_id": user_id,
                    "position": index,
                    "title": section["title"],
                    "summary": section["summary"],
                    "start_seconds": section["start_seconds"],
                    "end_seconds": section["end_seconds"],
                    "start_time": section["start_time"],
                    "end_time": section["end_time"],
                    "metadata": section.get("metadata", {}),
                }
            )
        if not rows:
            return []
        result = self.client.table("video_sections").insert(rows).execute()
        return result.data or []

    def delete_sections(self, video_id: str, user_id: str) -> None:
        self.client.table("video_sections").delete().eq("video_id", video_id).eq("user_id", user_id).execute()

    def update_video_record(self, video_id: str, user_id: str, metadata: dict[str, Any]) -> None:
        self.client.table("video_history").update({"metadata": metadata}).eq("id", video_id).eq("user_id", user_id).execute()

    def get_sections(self, user_id: str, video_id: str) -> list[dict[str, Any]]:
        result = (
            self.client.table("video_sections")
            .select("id,title,summary,start_seconds,end_seconds,start_time,end_time,metadata,position")
            .eq("user_id", user_id)
            .eq("video_id", video_id)
            .order("position")
            .execute()
        )
        return result.data or []

    def get_section_by_id(self, user_id: str, video_id: str, section_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("video_sections")
            .select("id,title,summary,start_seconds,end_seconds,start_time,end_time,metadata,position")
            .eq("user_id", user_id)
            .eq("video_id", video_id)
            .eq("id", section_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def get_section_by_id(self, user_id: str, video_id: str, section_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("video_sections")
            .select("id,title,summary,start_seconds,end_seconds,start_time,end_time,metadata,position")
            .eq("user_id", user_id)
            .eq("video_id", video_id)
            .eq("id", section_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def list_videos(self, user_id: str) -> list[dict[str, Any]]:
        result = (
            self.client.table("video_history")
            .select("id,youtube_url,youtube_video_id,video_title,channel_name,duration_seconds,duration_label,thumbnail_url,embed_url,provider,model,metadata,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def get_video(self, user_id: str, video_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("video_history")
            .select("id,youtube_url,youtube_video_id,video_title,channel_name,duration_seconds,duration_label,thumbnail_url,embed_url,provider,model,metadata,created_at")
            .eq("user_id", user_id)
            .eq("id", video_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def append_chat_message(
        self,
        user_id: str,
        video_id: str,
        role: str,
        content: str,
        sources: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = {
            "user_id": user_id,
            "video_id": video_id,
            "role": role,
            "content": content,
            "sources": sources or [],
            "metadata": metadata or {},
        }
        result = self.client.table("conversation_history").insert(payload).execute()
        if not result.data:
            raise ValueError("Failed to persist chat message")
        return result.data[0]

    def get_conversation_history(self, user_id: str, video_id: str) -> list[dict[str, Any]]:
        result = (
            self.client.table("conversation_history")
            .select("id,role,content,sources,metadata,created_at")
            .eq("user_id", user_id)
            .eq("video_id", video_id)
            .order("created_at")
            .execute()
        )
        return result.data or []

    def get_recent_conversation_history(self, user_id: str, video_id: str, limit: int = 7) -> list[dict[str, Any]]:
        # We fetch the latest messages in descending order for efficiency, then reverse
        # them so prompts receive conversation context in natural chronological order.
        result = (
            self.client.table("conversation_history")
            .select("id,role,content,sources,metadata,created_at")
            .eq("user_id", user_id)
            .eq("video_id", video_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
        rows.reverse()
        return rows

    def get_user_provider_settings(self, user_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("user_provider_settings")
            .select("user_id,active_provider,active_model,openai_api_key,gemini_api_key,updated_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    def upsert_user_provider_settings(
        self,
        user_id: str,
        active_provider: str,
        active_model: str,
        api_key: str | None = None,
    ) -> dict[str, Any]:
        existing = self.get_user_provider_settings(user_id)
        payload: dict[str, Any] = {
            "user_id": user_id,
            "active_provider": active_provider,
            "active_model": active_model,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing:
            payload.update(
                {
                    "openai_api_key": existing.get("openai_api_key"),
                    "gemini_api_key": existing.get("gemini_api_key"),
                }
            )
        if api_key is not None:
            payload[f"{active_provider}_api_key"] = api_key

        result = self.client.table("user_provider_settings").upsert(payload).execute()
        if not result.data:
            raise ValueError("Failed to persist provider settings")
        return result.data[0]

    @staticmethod
    def get_provider_api_key(settings_row: dict[str, Any] | None, provider: str) -> str | None:
        if not settings_row:
            return None
        return settings_row.get(f"{provider}_api_key")
