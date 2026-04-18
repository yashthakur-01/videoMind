from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal, TypedDict

from app.services.rag_pipeline import RagPreprocessingAdapter
from app.services.redis_service import RedisService
from app.services.section_multivector_retriever import invoke_llm_chat, stream_llm_chat
from app.services.supabase_service import SupabaseService

try:
    from langgraph.graph import END, START, StateGraph
except ModuleNotFoundError:
    END = "__end__"
    START = "__start__"
    StateGraph = None


ROUTER_PROMPT = """
Classify the user message for a video-chat assistant.
Return strict JSON only:
{
  "route": "generic" | "video",
  "reason": "short explanation"
}

Use "generic" only for conversational chat that does not need video retrieval:
- greetings
- thanks
- identity/basic assistant questions
- short pleasantries

Use "video" for anything that depends on the uploaded/processed video, transcript, prior discussion about the video, or asks for explanation grounded in video context.
""".strip()


class ChatbotState(TypedDict, total=False):
    query: str
    user_id: str
    video_id: str
    section_id: str | None
    sections: list[dict[str, Any]]
    route: Literal["generic", "video"]
    route_reason: str
    cache_hit: bool
    cache_match_score: float
    retrieved_context: list[dict[str, Any]]
    conversation_history: list[dict[str, Any]]
    system_prompt: str
    user_prompt: str
    answer: str
    sources: list[str]


class PreparedChatTurn(TypedDict, total=False):
    mode: Literal["cache", "generic", "video"]
    answer: str
    sources: list[str]
    retrieved_context: list[dict[str, Any]]
    conversation_history: list[dict[str, Any]]
    system_prompt: str
    user_prompt: str
    cache_hit: bool
    route_reason: str
    cache_match_score: float
    selected_section_id: str | None


class LangGraphChatbotService:
    def __init__(
        self,
        rag_adapter: RagPreprocessingAdapter,
        redis_service: RedisService,
        supabase_service: SupabaseService,
    ) -> None:
        self.rag_adapter = rag_adapter
        self.redis_service = redis_service
        self.supabase_service = supabase_service
        self.graph = self._build_graph() if StateGraph is not None else None

    def _build_graph(self):
        graph = StateGraph(ChatbotState)

        # The graph only prepares the turn. The route performs streaming and persistence
        # so we can save the final assistant message only after the full output is ready.
        graph.add_node("navigator", self._navigator_node)
        graph.add_node("load_history", self._load_history_node)
        graph.add_node("build_generic_prompt", self._build_generic_prompt_node)
        graph.add_node("cache_lookup", self._cache_lookup_node)
        graph.add_node("retrieve_context", self._retrieve_context_node)
        graph.add_node("build_video_prompt", self._build_video_prompt_node)

        graph.add_edge(START, "load_history")
        graph.add_edge("load_history", "navigator")
        graph.add_conditional_edges(
            "navigator",
            self._route_after_history,
            {
                "generic": "build_generic_prompt",
                "video": "cache_lookup",
            },
        )
        graph.add_conditional_edges(
            "cache_lookup",
            self._route_after_cache_lookup,
            {
                "hit": END,
                "miss": "retrieve_context",
            },
        )
        graph.add_edge("retrieve_context", "build_video_prompt")
        graph.add_edge("build_generic_prompt", END)
        graph.add_edge("build_video_prompt", END)
        return graph.compile()

    async def prepare_turn(
        self,
        query: str,
        sections: list[dict[str, Any]],
        user_id: str,
        video_id: str,
        section_id: str | None = None,
    ) -> PreparedChatTurn:
        state: ChatbotState = {
            "query": query,
            "sections": sections,
            "user_id": user_id,
            "video_id": video_id,
            "section_id": section_id,
        }
        if self.graph is not None:
            result = await self.graph.ainvoke(state)
        else:
            result = await self._run_without_langgraph(state)

        if result.get("cache_hit"):
            return {
                "mode": "cache",
                "answer": result.get("answer", ""),
                "sources": result.get("sources", []),
                "retrieved_context": result.get("retrieved_context", []),
                "conversation_history": result.get("conversation_history", []),
                "cache_hit": True,
                "route_reason": result.get("route_reason", ""),
                "cache_match_score": result.get("cache_match_score", 0.0),
                "selected_section_id": result.get("section_id"),
            }

        route = result.get("route", "video")
        return {
            "mode": route,
            "sources": result.get("sources", []),
            "retrieved_context": result.get("retrieved_context", []),
            "conversation_history": result.get("conversation_history", []),
            "system_prompt": result.get("system_prompt", ""),
            "user_prompt": result.get("user_prompt", ""),
            "cache_hit": False,
            "route_reason": result.get("route_reason", ""),
            "selected_section_id": result.get("section_id"),
        }

    async def stream_prepared_turn(self, prepared_turn: PreparedChatTurn) -> AsyncIterator[str]:
        system_prompt = prepared_turn.get("system_prompt", "")
        user_prompt = prepared_turn.get("user_prompt", "")
        async for chunk in stream_llm_chat(system_prompt=system_prompt, user_prompt=user_prompt):
            yield chunk

    async def _run_without_langgraph(self, state: ChatbotState) -> ChatbotState:
        state.update(self._load_history_node(state))
        state.update(self._navigator_node(state))
        if self._route_after_history(state) == "generic":
            state.update(self._build_generic_prompt_node(state))
            return state

        state.update(await self._cache_lookup_node(state))
        if self._route_after_cache_lookup(state) == "hit":
            return state

        state.update(self._retrieve_context_node(state))
        state.update(self._build_video_prompt_node(state))
        return state

    def _navigator_node(self, state: ChatbotState) -> ChatbotState:
        navigator_history = self._format_navigator_history(
            history=state.get("conversation_history", []),
            query=state["query"],
            max_messages=3,
        )
        prompt = (
            f"Conversation context hint: this chat belongs to video_id={state['video_id']}.\n"
            f"Recent conversation (at most 3 prior messages):\n{navigator_history}\n\n"
            f"User message:\n{state['query']}"
        )
        response_text = invoke_llm_chat(ROUTER_PROMPT, prompt)
        parsed = self._parse_json_response(response_text)
        route = parsed.get("route", "video")
        if route not in {"generic", "video"}:
            route = "video"
        return {
            "route": route,
            "route_reason": str(parsed.get("reason", "")).strip(),
        }

    def _load_history_node(self, state: ChatbotState) -> ChatbotState:
        # We always fetch the latest history so both generic and video answers
        # can stay grounded in the ongoing conversation.
        history = self.supabase_service.get_recent_conversation_history(
            user_id=state["user_id"],
            video_id=state["video_id"],
            limit=7,
        )
        return {"conversation_history": history}

    @staticmethod
    def _route_after_history(state: ChatbotState) -> str:
        return state.get("route", "video")

    async def _cache_lookup_node(self, state: ChatbotState) -> ChatbotState:
        match = await self.redis_service.get_cached_query_match(
            user_id=state["user_id"],
            video_id=state["video_id"],
            query=state["query"],
            threshold=0.9,
        )
        if match is None:
            return {"cache_hit": False}

        return {
            "cache_hit": True,
            "cache_match_score": float(match.get("score", 0.0)),
            "answer": str(match.get("answer", "")),
            "sources": list(match.get("sources", [])),
            "retrieved_context": list(match.get("retrieved_context", [])),
        }

    @staticmethod
    def _route_after_cache_lookup(state: ChatbotState) -> str:
        return "hit" if state.get("cache_hit") else "miss"

    def _retrieve_context_node(self, state: ChatbotState) -> ChatbotState:
        selected_section_id = str(state.get("section_id") or "").strip()
        if selected_section_id:
            row = self.supabase_service.get_section_by_id(
                user_id=state["user_id"],
                video_id=state["video_id"],
                section_id=selected_section_id,
            )
            if row is not None:
                metadata = row.get("metadata") or {}
                section_context = [
                    {
                        "id": row.get("id"),
                        "title": row.get("title", "Untitled"),
                        "start_time": row.get("start_time", "00:00"),
                        "end_time": row.get("end_time", "00:00"),
                        "summary": row.get("summary", ""),
                        "raw_transcript": metadata.get("raw_transcript", ""),
                        "topics": metadata.get("topics", ""),
                        "people_involved": metadata.get("people_involved", ""),
                    }
                ]
                return {
                    "retrieved_context": section_context,
                    "sources": [
                        f"{row.get('start_time', '00:00')} - {row.get('title', 'Untitled')}"
                    ],
                    "cache_hit": False,
                    "section_id": selected_section_id,
                }

        retrieved_context = self.rag_adapter.query_retriever(
            user_id=state["user_id"],
            video_id=state["video_id"],
            question=state["query"],
        )
        sources = [
            f"{item.get('start_time', '00:00')} - {item.get('title', 'Untitled')}"
            for item in retrieved_context[:3]
        ]
        return {
            "retrieved_context": retrieved_context,
            "sources": sources,
            "cache_hit": False,
            "section_id": None,
        }

    def _build_generic_prompt_node(self, state: ChatbotState) -> ChatbotState:
        # Generic messages are answered directly by the LLM without retrieval.
        history_block = self._format_conversation_history(state.get("conversation_history", []))
        return {
            "system_prompt": (
                "You are a helpful assistant inside a video-chat app. "
                "The user asked a generic message that does not require document retrieval. "
                "Answer naturally and briefly while keeping continuity with the conversation. "
                "Default to concise, to-the-point answers. Only provide a detailed, step-by-step explanation "
                "if the user explicitly asks for details, full explanation, or all steps."
            ),
            "user_prompt": (
                f"Recent conversation:\n{history_block}\n\n"
                f"Current user message:\n{state['query']}"
            ),
            "sources": [],
            "retrieved_context": [],
        }

    def _build_video_prompt_node(self, state: ChatbotState) -> ChatbotState:
        history_block = self._format_conversation_history(state.get("conversation_history", []))
        context_block = self._format_retrieved_context(state.get("retrieved_context", []))
        selected_section_id = str(state.get("section_id") or "").strip()
        section_instruction = (
            "The user selected a specific section. Answer using that section context first and avoid unrelated sections unless asked."
            if selected_section_id
            else ""
        )
        return {
            "system_prompt": (
                "You are a helpful video assistant. "
                "Use the retrieved video context as the primary grounding source, and use recent conversation "
                "history only to maintain continuity. If the retrieved context is insufficient, say that clearly. "
                "Default to concise, to-the-point answers. Only provide a detailed, step-by-step explanation "
                "if the user explicitly asks for details, full explanation, or all steps. "
                f"{section_instruction}"
            ),
            "user_prompt": (
                f"Recent conversation:\n{history_block}\n\n"
                f"Retrieved video context:\n{context_block}\n\n"
                f"Current user question:\n{state['query']}"
            ),
            "section_id": selected_section_id or None,
        }

    @staticmethod
    def _format_conversation_history(history: list[dict[str, Any]]) -> str:
        if not history:
            return "No prior messages."
        lines: list[str] = []
        for item in history[-7:]:
            role = str(item.get("role", "user")).strip()
            content = str(item.get("content", "")).strip()
            if content:
                lines.append(f"{role}: {content}")
        return "\n".join(lines) if lines else "No prior messages."

    @staticmethod
    def _format_navigator_history(history: list[dict[str, Any]], query: str, max_messages: int = 3) -> str:
        if not history:
            return "No prior messages."

        # The current user query is included separately in the navigator prompt.
        trimmed_history = list(history)
        last_item = trimmed_history[-1]
        last_role = str(last_item.get("role", "")).strip().lower()
        last_content = str(last_item.get("content", "")).strip()
        if last_role == "user" and last_content == query.strip():
            trimmed_history = trimmed_history[:-1]

        lines: list[str] = []
        for item in trimmed_history[-max_messages:]:
            role = str(item.get("role", "user")).strip()
            content = str(item.get("content", "")).strip()
            if content:
                lines.append(f"{role}: {content}")
        return "\n".join(lines) if lines else "No prior messages."

    @staticmethod
    def _format_retrieved_context(retrieved_context: list[dict[str, Any]]) -> str:
        if not retrieved_context:
            return "No retrieved context was found for this question."
        blocks: list[str] = []
        for item in retrieved_context[:3]:
            raw_transcript = str(item.get("raw_transcript", "")).strip()
            topics = str(item.get("topics", "")).strip()
            people_involved = str(item.get("people_involved", "")).strip()
            lines = [
                f"Title: {item.get('title', 'Untitled')}",
                f"Time: {item.get('start_time', '00:00')} - {item.get('end_time', '00:00')}",
                f"Summary: {str(item.get('summary', '')).strip()}",
            ]
            if topics:
                lines.append(f"Topics: {topics}")
            if people_involved:
                lines.append(f"People involved: {people_involved}")
            if raw_transcript:
                lines.append(f"Transcript excerpt: {raw_transcript}")
            blocks.append(
                "\n".join(lines)
            )
        return "\n\n".join(blocks)

    @staticmethod
    def _parse_json_response(raw_text: str) -> dict[str, Any]:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}
