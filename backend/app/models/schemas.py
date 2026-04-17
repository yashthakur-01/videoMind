from __future__ import annotations

from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    youtube_url: str = Field(min_length=8)
    provider: str | None = Field(default=None, min_length=2)
    model: str | None = Field(default=None, min_length=2)


class Section(BaseModel):
    id: str
    title: str
    summary: str
    start_seconds: int
    end_seconds: int
    start_time: str
    end_time: str
    metadata: dict


class ProcessResponse(BaseModel):
    video_id: str
    video: "VideoHistoryItem"
    sections: list[Section]
    rag_status: dict


class ChatRequest(BaseModel):
    query: str = Field(min_length=2)
    video_id: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


class ChatMessage(BaseModel):
    id: str | None = None
    role: str
    content: str
    sources: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    created_at: str | None = None


class VideoHistoryItem(BaseModel):
    id: str
    youtube_url: str
    youtube_video_id: str | None = None
    video_title: str | None = None
    channel_name: str | None = None
    duration_seconds: int | None = None
    duration_label: str | None = None
    thumbnail_url: str | None = None
    embed_url: str | None = None
    provider: str
    model: str
    metadata: dict = Field(default_factory=dict)
    created_at: str


class VideoDetailResponse(BaseModel):
    video: VideoHistoryItem
    sections: list[Section]
    chat_messages: list[ChatMessage]


class ProviderSettingsResponse(BaseModel):
    active_provider: str
    active_model: str
    has_openai_key: bool = False
    has_gemini_key: bool = False


class ProviderSettingsUpdateRequest(BaseModel):
    active_provider: str = Field(min_length=2)
    active_model: str = Field(min_length=2)
    api_key: str | None = None
