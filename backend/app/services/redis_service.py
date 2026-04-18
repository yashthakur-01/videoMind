from __future__ import annotations

from array import array
import json
import math
from typing import Any

from redis.asyncio import Redis
from redis.commands.search.field import TagField, TextField, VectorField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query
from redis.exceptions import RedisError, ResponseError

from app.config import settings


class RedisService:
    def __init__(self) -> None:
        self.client = Redis.from_url(settings.redis_url, decode_responses=True)
        self.binary_client = Redis.from_url(settings.redis_url, decode_responses=False)
        self.sections_cache_ttl_seconds = 60 * 60 * 5
        self.query_cache_index_name = "videomind:query-cache:index"
        self.query_cache_prefix = "videomind:query-cache:entry:"
        self.query_cache_ttl_seconds = 60 * 60 * 24
        self.query_cache_threshold = 0.9
        self.query_cache_k = 1

    @staticmethod
    def key(user_id: str, video_id: str) -> str:
        return f"videomind:{user_id}:{video_id}:sections"

    @staticmethod
    def query_cache_key(user_id: str, video_id: str) -> str:
        return f"videomind:{user_id}:{video_id}:query-cache"

    async def warmup_sections(self, user_id: str, video_id: str, sections: list[dict[str, Any]]) -> None:
        key = self.key(user_id, video_id)
        try:
            await self.client.set(key, json.dumps(sections), ex=self.sections_cache_ttl_seconds)
        except Exception:
            return

    async def clear_video_cache(self, user_id: str, video_id: str) -> None:
        keys_to_delete = [
            self.key(user_id, video_id),
            self.query_cache_key(user_id, video_id),
        ]
        pattern = f"{self.query_cache_prefix}{user_id}:{video_id}:*"

        try:
            async for cache_key in self.binary_client.scan_iter(match=pattern, count=200):
                keys_to_delete.append(self._decode_redis_value(cache_key))
        except Exception:
            pass

        unique_keys = [key for key in dict.fromkeys(keys_to_delete) if key]
        if not unique_keys:
            return

        try:
            await self.client.delete(*unique_keys)
        except Exception:
            return

    async def get_sections(self, user_id: str, video_id: str) -> list[dict[str, Any]] | None:
        key = self.key(user_id, video_id)
        try:
            payload = await self.client.get(key)
        except Exception:
            return None
        if payload is None:
            return None
        try:
            decoded = json.loads(payload)
        except json.JSONDecodeError:
            return None
        if not isinstance(decoded, list):
            return None
        return decoded

    async def get_cached_query_match(
        self,
        user_id: str,
        video_id: str,
        query: str,
        threshold: float = 0.9,
    ) -> dict[str, Any] | None:
        try:
            await self._ensure_query_cache_index()
            query_embedding = self._embed_text(query)
            if not query_embedding:
                return None

            redis_query = (
                Query(
                    f"(@user_id:{{{self._escape_tag_value(user_id)}}} "
                    f"@video_id:{{{self._escape_tag_value(video_id)}}})"
                    f"=>[KNN {self.query_cache_k} @embedding $vector AS vector_distance]"
                )
                .return_fields("query", "answer", "sources", "retrieved_context", "vector_distance")
                .sort_by("vector_distance", asc=True)
                .paging(0, self.query_cache_k)
                .dialect(2)
            )
            result = await self.binary_client.ft(self.query_cache_index_name).search(
                redis_query,
                {"vector": self._embedding_to_bytes(query_embedding)},
            )
        except Exception:
            return await self._get_cached_query_match_fallback(
                user_id=user_id,
                video_id=video_id,
                query=query,
                threshold=threshold,
            )

        if not getattr(result, "docs", None):
            return None

        doc = result.docs[0]
        distance = self._safe_float(self._decode_redis_value(getattr(doc, "vector_distance", None)))
        similarity = 1.0 - distance
        if similarity < threshold:
            return None

        return {
            "score": similarity,
            "query": self._decode_redis_value(getattr(doc, "query", "")),
            "answer": self._decode_redis_value(getattr(doc, "answer", "")),
            "sources": self._load_json_field(getattr(doc, "sources", b"[]")),
            "retrieved_context": self._load_json_field(getattr(doc, "retrieved_context", b"[]")),
        }

    async def cache_query_result(
        self,
        user_id: str,
        video_id: str,
        query: str,
        answer: str,
        sources: list[str],
        retrieved_context: list[dict[str, Any]],
    ) -> None:
        try:
            await self._ensure_query_cache_index()
            embedding = self._embed_text(query)
            if not embedding:
                return

            cache_key = self._query_cache_entry_key(user_id, video_id, query)
            await self.binary_client.hset(
                cache_key,
                mapping={
                    "user_id": user_id,
                    "video_id": video_id,
                    "query": query,
                    "answer": answer,
                    "sources": json.dumps(sources),
                    "retrieved_context": json.dumps(retrieved_context),
                    "embedding": self._embedding_to_bytes(embedding),
                },
            )
            await self.binary_client.expire(cache_key, self.query_cache_ttl_seconds)
        except Exception:
            await self._cache_query_result_fallback(
                user_id=user_id,
                video_id=video_id,
                query=query,
                answer=answer,
                sources=sources,
                retrieved_context=retrieved_context,
            )
            return

    @staticmethod
    def _embed_text(text: str) -> list[float]:
        from app.services.section_multivector_retriever import get_embeddings_with_fallback

        embeddings = get_embeddings_with_fallback()
        return embeddings.embed_query(text)

    async def _get_cached_query_match_fallback(
        self,
        user_id: str,
        video_id: str,
        query: str,
        threshold: float,
    ) -> dict[str, Any] | None:
        cache_key = self.query_cache_key(user_id, video_id)
        try:
            payload = await self.client.get(cache_key)
        except Exception:
            return None
        if payload is None:
            return None

        try:
            entries = json.loads(payload)
        except json.JSONDecodeError:
            return None
        if not isinstance(entries, list) or not entries:
            return None

        query_embedding = self._embed_text(query)
        if not query_embedding:
            return None

        best_match: dict[str, Any] | None = None
        best_score = -1.0
        for entry in entries:
            embedding = entry.get("embedding")
            if not isinstance(embedding, list):
                continue
            score = self._cosine_similarity(query_embedding, embedding)
            if score > best_score:
                best_score = score
                best_match = entry

        if best_match is None or best_score < threshold:
            return None

        return {
            "score": best_score,
            "query": best_match.get("query", ""),
            "answer": best_match.get("answer", ""),
            "sources": best_match.get("sources", []),
            "retrieved_context": best_match.get("retrieved_context", []),
        }

    async def _cache_query_result_fallback(
        self,
        user_id: str,
        video_id: str,
        query: str,
        answer: str,
        sources: list[str],
        retrieved_context: list[dict[str, Any]],
    ) -> None:
        cache_key = self.query_cache_key(user_id, video_id)
        try:
            payload = await self.client.get(cache_key)
        except Exception:
            return

        entries: list[dict[str, Any]] = []
        if payload:
            try:
                decoded = json.loads(payload)
                if isinstance(decoded, list):
                    entries = decoded
            except json.JSONDecodeError:
                entries = []

        embedding = self._embed_text(query)
        if not embedding:
            return

        entries.append(
            {
                "query": query,
                "embedding": embedding,
                "answer": answer,
                "sources": sources,
                "retrieved_context": retrieved_context,
            }
        )
        try:
            await self.client.set(cache_key, json.dumps(entries[-50:]), ex=self.query_cache_ttl_seconds)
        except Exception:
            return

    async def _ensure_query_cache_index(self) -> None:
        try:
            await self.binary_client.ft(self.query_cache_index_name).info()
            return
        except ResponseError as exc:
            if "unknown index name" not in str(exc).lower():
                raise

        dimension = len(self._embed_text("query cache dimension probe"))
        schema = (
            TagField("user_id"),
            TagField("video_id"),
            TextField("query"),
            TextField("answer"),
            TextField("sources"),
            TextField("retrieved_context"),
            VectorField(
                "embedding",
                "FLAT",
                {
                    "TYPE": "FLOAT32",
                    "DIM": dimension,
                    "DISTANCE_METRIC": "COSINE",
                },
            ),
        )
        definition = IndexDefinition(prefix=[self.query_cache_prefix], index_type=IndexType.HASH)
        try:
            await self.binary_client.ft(self.query_cache_index_name).create_index(schema, definition=definition)
        except ResponseError as exc:
            if "index already exists" not in str(exc).lower():
                raise

    def _query_cache_entry_key(self, user_id: str, video_id: str, query: str) -> str:
        fingerprint = abs(hash((user_id, video_id, query)))
        return f"{self.query_cache_prefix}{user_id}:{video_id}:{fingerprint}"

    @staticmethod
    def _embedding_to_bytes(embedding: list[float]) -> bytes:
        return array("f", embedding).tobytes()

    @staticmethod
    def _cosine_similarity(left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return -1.0
        dot = sum(a * b for a, b in zip(left, right))
        left_norm = math.sqrt(sum(a * a for a in left))
        right_norm = math.sqrt(sum(b * b for b in right))
        if left_norm == 0 or right_norm == 0:
            return -1.0
        return dot / (left_norm * right_norm)

    @staticmethod
    def _escape_tag_value(value: str) -> str:
        special_chars = {"-", "{", "}", "[", "]", "(", ")", "|", ":", "@", " ", ".", ","}
        return "".join(f"\\{char}" if char in special_chars else char for char in value)

    @staticmethod
    def _decode_redis_value(value: Any) -> str:
        if isinstance(value, bytes):
            return value.decode("utf-8")
        if value is None:
            return ""
        return str(value)

    @classmethod
    def _load_json_field(cls, value: Any) -> list[Any]:
        decoded = cls._decode_redis_value(value)
        try:
            data = json.loads(decoded)
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _safe_float(value: str) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 1.0
