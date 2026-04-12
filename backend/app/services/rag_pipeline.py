from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Literal


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
    def __init__(self) -> None:
        pass

    @staticmethod
    def _apply_provider_env(provider: str, model: str, provider_api_key: str) -> None:
        # We clear other provider credentials first so one user's request never
        # accidentally reuses another provider key left in process env.
        for env_key in (
            "OPENAI_KEY",
            "OPENAI_CHAT_MODEL",
            "GEMINI_KEY",
            "GOOGLE_API_KEY",
            "GEMINI_CHAT_MODEL",
            "GEMINI_EMBED_MODEL",
        ):
            os.environ.pop(env_key, None)

        os.environ["YT_LLM_PROVIDER"] = provider
        if provider == "openai":
            os.environ["OPENAI_KEY"] = provider_api_key
            os.environ["OPENAI_CHAT_MODEL"] = model
        elif provider == "gemini":
            os.environ["GEMINI_KEY"] = provider_api_key
            os.environ["GOOGLE_API_KEY"] = provider_api_key
            os.environ["GEMINI_CHAT_MODEL"] = model
            os.environ["GEMINI_EMBED_MODEL"] = "models/text-embedding-004"

    def configure_runtime(self, provider: str, model: str, provider_api_key: str) -> None:
        normalized_provider = normalize_provider(provider)
        self._apply_provider_env(normalized_provider, model, provider_api_key)

    async def build_sections(self, youtube_url: str, provider: str, model: str, provider_api_key: str) -> list[dict[str, Any]]:
        normalized_provider = normalize_provider(provider)
        self._apply_provider_env(normalized_provider, model, provider_api_key)

        from app.services.transcript import get_transcript
        from app.services.RagPreprocessing import process_transcript_batches_parallel

        docs = get_transcript(youtube_url, 20)
        if not docs:
            raise ValueError("No transcript found for this video URL.")

        processed_sections = process_transcript_batches_parallel(docs=docs, batch_size=15, provider=normalized_provider)
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
        return rows

    def warmup_retriever(
        self,
        user_id: str,
        video_id: str,
        sections: list[dict[str, Any]],
        provider: str,
        model: str,
        provider_api_key: str,
    ) -> dict[str, Any]:
        try:
            normalized_provider = normalize_provider(provider)
            self._apply_provider_env(normalized_provider, model, provider_api_key)

            from app.services.section_multivector_retriever import generate_embeddings

            inputs: list[dict[str, Any]] = []
            for section in sections:
                metadata = section.get("metadata") or {}
                inputs.append(
                    {
                        "start_time": section.get("start_time", "00:00"),
                        "end_time": section.get("end_time", "00:00"),
                        "title": section.get("title", "Untitled"),
                        "summary": section.get("summary", ""),
                        "topics": metadata.get("topics", ""),
                        "raw_transcript": metadata.get("raw_transcript", ""),
                    }
                )

            generate_embeddings(
                section_documents=inputs,
                user_id=user_id,
                video_id=video_id,
                force_reindex=False,
            )
            return {"enabled": True, "status": "ready"}
        except Exception as error:
            return {"enabled": False, "status": "failed", "reason": str(error)}

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
