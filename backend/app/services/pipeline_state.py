from __future__ import annotations

from app.services.langgraph_chatbot import LangGraphChatbotService
from app.services.rag_pipeline import RagPreprocessingAdapter
from app.services.redis_service import RedisService
from app.services.supabase_service import SupabaseService

redis_service = RedisService()
supabase_service = SupabaseService()
rag_adapter = RagPreprocessingAdapter(redis_service=redis_service, supabase_service=supabase_service)
chat_service = LangGraphChatbotService(rag_adapter, redis_service, supabase_service)
