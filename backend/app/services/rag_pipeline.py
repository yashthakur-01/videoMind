from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING
from typing import Any, Literal

if TYPE_CHECKING:
    from app.services.redis_service import RedisService
    from app.services.supabase_service import SupabaseService


def to_timestamp(seconds: int) -> str:
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def mmss_to_seconds(value: str) -> int:
    parts = value.strip().split(":")
    if len(parts) != 2:
        return 0
    minutes, seconds = parts
    return int(minutes) * 60 + int(float(seconds))


def normalize_provider(provider: str) -> Literal["openai", "gemini"]:
    value = provider.strip().lower()
    if value == "openai":
        return "openai"
    if value == "gemini":
        return "gemini"
    raise ValueError("Unsupported provider. Use OpenAI or Gemini.")


def ensure_yt_path() -> None:
    yt_path = Path(__file__).resolve().parents[4] / "yt"
    candidate = str(yt_path)
    if candidate not in sys.path:
        sys.path.insert(0, candidate)


class RagPreprocessingAdapter:
    def __init__(self, redis_service: "RedisService" | None = None, supabase_service: "SupabaseService" | None = None) -> None:
        self.redis_service = redis_service
        self.supabase_service = supabase_service

    @staticmethod
    def _rows_to_cached_sections(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sections: list[dict[str, Any]] = []
        for row in rows:
            start_seconds = int(row["start_seconds"])
            end_seconds = int(row["end_seconds"])
            sections.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "summary": row["summary"],
                    "start_seconds": start_seconds,
                    "end_seconds": end_seconds,
                    "start_time": row.get("start_time") or to_timestamp(start_seconds),
                    "end_time": row.get("end_time") or to_timestamp(end_seconds),
                    "metadata": row.get("metadata") or {},
                }
            )
        return sections

    @staticmethod
    def _to_retriever_inputs(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        inputs: list[dict[str, Any]] = []
        for section in sections:
            metadata = section.get("metadata") or {}
            inputs.append(
                {
                    "section_id": section.get("id", ""),
                    "transcript_uuid": metadata.get("transcript_uuid", ""),
                    "start_time": section.get("start_time", "00:00"),
                    "end_time": section.get("end_time", "00:00"),
                    "title": section.get("title", "Untitled"),
                    "summary": section.get("summary", ""),
                    "topics": metadata.get("topics", ""),
                    "raw_transcript": metadata.get("raw_transcript", ""),
                    "entry_type": metadata.get("entry_type", "section"),
                    "people_involved": metadata.get("people_involved", ""),
                }
            )
        return inputs

    async def get_sections_with_cache(self, user_id: str, video_id: str) -> list[dict[str, Any]]:
        if self.redis_service is not None:
            cached = await self.redis_service.get_sections(user_id=user_id, video_id=video_id)
            if cached is not None:
                return cached

        if self.supabase_service is None:
            return []

        rows = self.supabase_service.get_sections(user_id=user_id, video_id=video_id)
        sections = self._rows_to_cached_sections(rows)
        if sections and self.redis_service is not None:
            await self.redis_service.warmup_sections(user_id=user_id, video_id=video_id, sections=sections)
        return sections

    async def ensure_docstore_cache(self, user_id: str, video_id: str, sections: list[dict[str, Any]] | None = None) -> None:
        prepared_sections = sections if sections is not None else await self.get_sections_with_cache(user_id=user_id, video_id=video_id)
        if not prepared_sections:
            return

        from app.services.section_multivector_retriever import warm_docstore_cache

        warm_docstore_cache(
            section_documents=self._to_retriever_inputs(prepared_sections),
            user_id=user_id,
            video_id=video_id,
        )

    def configure_runtime(self, provider: str, model: str, provider_api_key: str) -> None:
        normalized_provider = normalize_provider(provider)
        from app.services.section_multivector_retriever import set_runtime_config

        set_runtime_config(normalized_provider, provider_api_key, model)

    async def build_sections(self, youtube_url: str, provider: str, model: str, provider_api_key: str) -> dict[str, Any]:
        normalized_provider = normalize_provider(provider)
        from app.services.section_multivector_retriever import pop_runtime_config, push_runtime_config

        runtime_tokens = push_runtime_config(normalized_provider, provider_api_key, model)
        try:
            from app.services.transcript import get_transcript
            from app.services.RagPreprocessing import process_transcript_batches_parallel

            docs = get_transcript(youtube_url, 25)
            if not docs:
                raise ValueError("No transcript found for this video URL.")

            processed = process_transcript_batches_parallel(docs=docs, batch_size=15, provider=normalized_provider)
            processed_sections = processed.get("sections", []) if isinstance(processed, dict) else processed
            video_overview = processed.get("video_overview") if isinstance(processed, dict) else None

            if not processed_sections:
                raise RuntimeError("Section generation did not produce any output.")
            rows: list[dict[str, Any]] = []

            for section in processed_sections:
                start_time = str(section.get("start_time", "00:00"))
                end_time = str(section.get("end_time", "00:00"))
                rows.append(
                    {
                        "title": str(section.get("title", "Untitled")),
                        "summary": str(section.get("summary", "")).strip(),
                        "start_seconds": mmss_to_seconds(start_time),
                        "end_seconds": mmss_to_seconds(end_time),
                        "start_time": start_time,
                        "end_time": end_time,
                        "metadata": {
                            "topics": str(section.get("topics", "")).strip(),
                            "raw_transcript": str(section.get("raw_transcript", "")).strip(),
                            "provider": normalized_provider,
                            "model": model,
                        },
                    }
                )
            return {
                "sections": rows,
                "video_overview": video_overview,
            }
        finally:
            pop_runtime_config(runtime_tokens)

    def warmup_retriever(
        self,
        user_id: str,
        video_id: str,
        sections: list[dict[str, Any]],
        video_overview: dict[str, Any] | None,
        provider: str,
        model: str,
        provider_api_key: str,
        *,
        force_reindex: bool = False,
    ) -> dict[str, Any]:
        from app.services.section_multivector_retriever import pop_runtime_config, push_runtime_config

        runtime_tokens = None
        try:
            normalized_provider = normalize_provider(provider)
            runtime_tokens = push_runtime_config(normalized_provider, provider_api_key, model)

            from app.services.section_multivector_retriever import generate_embeddings

            inputs = self._to_retriever_inputs(sections)

            if video_overview and str(video_overview.get("summary", "")).strip():
                inputs.append(
                    {
                        "transcript_uuid": str((video_overview.get("transcript_uuid") or "")).strip(),
                        "start_time": "00:00",
                        "end_time": "00:00",
                        "title": str(video_overview.get("title", "Overall Video Overview")),
                        "summary": str(video_overview.get("summary", "")).strip(),
                        "topics": str(video_overview.get("topics", "")).strip(),
                        "raw_transcript": str(video_overview.get("summary", "")).strip(),
                        "entry_type": "video_overview",
                        "people_involved": str(video_overview.get("people_involved", "")).strip(),
                    }
                )

            generate_embeddings(
                section_documents=inputs,
                user_id=user_id,
                video_id=video_id,
                force_reindex=force_reindex,
            )
            return {"enabled": True, "status": "ready"}
        except Exception as error:
            return {"enabled": False, "status": "failed", "reason": str(error)}
        finally:
            pop_runtime_config(runtime_tokens)

    def query_retriever(self, user_id: str, video_id: str, question: str) -> list[dict[str, Any]]:
        try:
            from app.services.section_multivector_retriever import query

            docs = query(question=question, user_id=user_id, video_id=video_id, k=3)
            results: list[dict[str, Any]] = []
            for doc in docs:
                meta = doc.metadata or {}
                results.append(
                    {
                        "title": meta.get("title", "Untitled"),
                        "start_time": meta.get("start_time", "00:00"),
                        "end_time": meta.get("end_time", "00:00"),
                        "summary": meta.get("summary", ""),
                    }
                )
            return results
        except Exception:
            return []

    def delete_video_vectors(self, user_id: str, video_id: str) -> None:
        try:
            from app.services.section_multivector_retriever import delete_video_vectors

            delete_video_vectors(user_id=user_id, video_id=video_id)
        except Exception:
            return


class ChatAnsweringService:
    def __init__(self, rag_adapter: RagPreprocessingAdapter) -> None:
        self.rag_adapter = rag_adapter

    async def answer(self, query: str, sections: list[dict[str, Any]], user_id: str, video_id: str) -> dict[str, Any]:
        rag_hits = self.rag_adapter.query_retriever(user_id=user_id, video_id=video_id, question=query)
        if rag_hits:
            selected = rag_hits[:2]
            combined = " ".join(item["summary"] for item in selected if item.get("summary"))
            answer = f"Retrieved from your video knowledge base: {combined}" if combined else "Retrieved relevant sections from the video knowledge base."
            sources = [f"{item['start_time']} - {item['title']}" for item in selected]
            return {"answer": answer, "sources": sources}

        lowered = query.lower()
        matched = [
            section
            for section in sections
            if lowered in section["title"].lower() or lowered in section["summary"].lower()
        ]
        selected = matched[:2] if matched else sections[:2]
        combined = " ".join(item["summary"] for item in selected)
        answer = f"Based on the processed chapters: {combined}"
        sources = [f"{item['start_time']} - {item['title']}" for item in selected]
        return {"answer": answer, "sources": sources}
