import json
import os
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from pydantic import SecretStr
from langchain_classic.retrievers.multi_vector import MultiVectorRetriever
from langchain_classic.storage import create_kv_docstore
from langchain_community.storage import RedisStore
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec


load_dotenv("./.env", override=False)

SECTION_QA_PROMPT = """
You create retrieval question-answer pairs from a transcript section summary.
Return strict JSON with this schema:
{{
  "qa_pairs": [
    {{"question": "...", "answer": "..."}}
  ]
}}

Rules:
- Generate only high-value questions that improve retrieval for this section.
- Hard limit: at most 5 QA pairs.
- Prefer 4 or 5 pairs when the summary has enough concrete teaching content.
- Do not add unnecessary, generic, or repetitive questions.
- Questions and answers must be faithful to the summary.
- Output ONLY valid JSON.

Section title: {title}
Section topics: {topics}
Section summary:
{summary}
""".strip()


def require_env(var_name: str) -> str:
    value = os.getenv(var_name)
    if not value:
        raise EnvironmentError(
            f"Missing required environment variable: {var_name}. "
            "Set it in your shell or add it to .env in the project root."
        )
    return value


def get_llm_instance(provider: str) -> BaseChatModel:
    temperature = float(os.getenv("YT_LLM_TEMPERATURE", "0.1"))

    if provider == "gemini":
        gemini_key = require_env("GEMINI_KEY")
        # Keep GOOGLE_API_KEY aligned so downstream Google clients do not fall back to ADC.
        os.environ.setdefault("GOOGLE_API_KEY", gemini_key)
        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash-lite"),
            temperature=temperature,
            api_key=SecretStr(gemini_key),
        )

    if provider == "openai":
        openai_key = require_env("OPENAI_KEY")
        return ChatOpenAI(
            model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
            temperature=temperature,
            api_key=SecretStr(openai_key),
        )

    raise ValueError("Unsupported YT_LLM_PROVIDER. Use 'gemini' or 'openai'.")


def invoke_llm_chat(system_prompt: str, user_prompt: str) -> str:
    provider = os.getenv("YT_LLM_PROVIDER", "gemini").strip().lower()
    llm = get_llm_instance(provider)
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    response = llm.invoke(messages)
    content = response.content
    return _normalize_llm_content(content)


async def stream_llm_chat(system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
    """Yield LLM output chunks so the API layer can stream them to the frontend."""
    provider = os.getenv("YT_LLM_PROVIDER", "gemini").strip().lower()
    llm = get_llm_instance(provider)
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    async for chunk in llm.astream(messages):
        text = _normalize_llm_content(getattr(chunk, "content", ""))
        if text:
            yield text


def _normalize_llm_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(part) for part in content)
    return str(content)


def get_hf_embeddings() -> Embeddings:
    hf_token = require_env("HUGGINGFACEHUB_API_TOKEN")
    model = os.getenv("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    return HuggingFaceEndpointEmbeddings(
        model=model,
        huggingfacehub_api_token=hf_token,
    )


def _get_embedding_dimension(embeddings: Embeddings) -> int:
    probe_vector = embeddings.embed_query("embedding dimension probe")
    return len(probe_vector)


def get_embeddings_with_fallback() -> Embeddings:
    errors: list[str] = []
    provider = os.getenv("YT_LLM_PROVIDER", "gemini").strip().lower()

    provider_embedding: tuple[str, Embeddings] | None = None
    if provider == "gemini":
        gemini_key = os.getenv("GEMINI_KEY")
        if gemini_key:
            os.environ.setdefault("GOOGLE_API_KEY", gemini_key)
            provider_embedding = (
                "gemini-embeddings",
                GoogleGenerativeAIEmbeddings(
                    model=os.getenv("GEMINI_EMBED_MODEL", "models/text-embedding-004"),
                    api_key=SecretStr(gemini_key),
                ),
            )
        else:
            errors.append("gemini-embeddings: missing GEMINI_KEY")
    elif provider == "openai":
        openai_key = os.getenv("OPENAI_KEY")
        if openai_key:
            provider_embedding = (
                "openai-embeddings",
                OpenAIEmbeddings(
                    model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
                    api_key=SecretStr(openai_key),
                ),
            )
        else:
            errors.append("openai-embeddings: missing OPENAI_KEY")
    else:
        errors.append(f"{provider}-embeddings: no native embedding provider configured")

    if provider_embedding is not None:
        name, embedding_model = provider_embedding
        try:
            embedding_model.embed_query("healthcheck")
            return embedding_model
        except Exception as exc:
            errors.append(f"{name}: {exc}")

    try:
        hf_embeddings = get_hf_embeddings()
        hf_embeddings.embed_query("healthcheck")
        return hf_embeddings
    except Exception as exc:
        errors.append(f"hf-embeddings: {exc}")

    raise RuntimeError(
        "Embedding initialization failed for provider "
        f"'{provider}' and Hugging Face fallback. "
        + " | ".join(errors)
    )


def get_pinecone_vector_store(embeddings: Embeddings, namespace: str) -> PineconeVectorStore:
    api_key = require_env("PINECONE_API_KEY")
    index_name = os.getenv("YT_PINECONE_INDEX", os.getenv("PINECONE_INDEX", "yt-rag-index"))
    cloud = os.getenv("PINECONE_CLOUD", "aws")
    region = os.getenv("PINECONE_REGION", "us-east-1")
    dimension = _get_embedding_dimension(embeddings)

    pc = Pinecone(api_key=api_key)
    existing_indexes = {item["name"] for item in pc.list_indexes()}

    if index_name not in existing_indexes:
        pc.create_index(
            name=index_name,
            dimension=dimension,
            metric="cosine",
            spec=ServerlessSpec(cloud=cloud, region=region),
        )
    else:
        described = pc.describe_index(index_name)
        existing_dim = getattr(described, "dimension", None)
        if existing_dim is None and isinstance(described, dict):
            existing_dim = described.get("dimension")
        if existing_dim and int(existing_dim) != dimension:
            raise ValueError(
                f"Pinecone index '{index_name}' dimension ({existing_dim}) does not match "
                f"selected embedding dimension ({dimension})."
            )

    index = pc.Index(index_name)
    return PineconeVectorStore(index=index, embedding=embeddings, namespace=namespace)


def get_redis_docstore():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis_namespace = os.getenv("YT_REDIS_NAMESPACE", "yt-parent-docs")
    byte_store = RedisStore(redis_url=redis_url, namespace=redis_namespace)
    return create_kv_docstore(byte_store)


def parse_qa_json(raw_text: str) -> list[dict[str, str]]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    data = json.loads(cleaned)
    qa_pairs = data.get("qa_pairs", [])

    safe_pairs: list[dict[str, str]] = []
    for item in qa_pairs[:5]:
        question = str(item.get("question", "")).strip()
        answer = str(item.get("answer", "")).strip()
        if question and answer:
            safe_pairs.append({"question": question, "answer": answer})

    return safe_pairs


def generate_qa_pairs_from_summary(section: dict[str, Any]) -> list[dict[str, str]]:
    summary = str(section.get("summary", "")).strip()
    if not summary:
        return []

    prompt = SECTION_QA_PROMPT.format(
        title=str(section.get("title", "")).strip() or "Untitled",
        topics=str(section.get("topics", "")).strip() or "",
        summary=summary,
    )

    response_text = invoke_llm_chat(
        "Return strict JSON only.",
        prompt,
    )
    return parse_qa_json(response_text)


def _build_base_metadata(
    section: dict[str, Any],
    transcript_uuid: str,
    id_key: str,
    user_id: str,
    video_id: str,
) -> dict[str, Any]:
    return {
        id_key: transcript_uuid,
        "user_id": user_id,
        "video_id": video_id,
        "title": str(section.get("title", "")).strip(),
        "start_time": str(section.get("start_time", "")).strip(),
        "end_time": str(section.get("end_time", "")).strip(),
        "topics": str(section.get("topics", "")).strip(),
    }


def _build_child_docs_for_section(
    section: dict[str, Any],
    transcript_uuid: str,
    id_key: str,
    user_id: str,
    video_id: str,
) -> list[Document]:
    child_docs: list[Document] = []

    summary = str(section.get("summary", "")).strip()
    raw_transcript = str(section.get("raw_transcript", "")).strip()
    title = str(section.get("title", "")).strip()
    topics = str(section.get("topics", "")).strip()
    base_metadata = _build_base_metadata(section, transcript_uuid, id_key, user_id, video_id)

    if summary:
        child_docs.append(
            Document(
                page_content=summary,
                metadata={
                    **base_metadata,
                    "chunk_type": "summary",
                },
            )
        )

    if raw_transcript:
        child_docs.append(
            Document(
                page_content=raw_transcript,
                metadata={
                    **base_metadata,
                    "chunk_type": "transcript",
                },
            )
        )

    qa_pairs = generate_qa_pairs_from_summary(section)
    for i, qa in enumerate(qa_pairs, start=1):
        child_docs.append(
            Document(
                page_content=f"Q: {qa['question']}\nA: {qa['answer']}",
                metadata={
                    **base_metadata,
                    "chunk_type": "qa",
                    "qa_index": i,
                    "question": qa["question"],
                },
            )
        )

    if not child_docs:
        child_docs.append(
            Document(
                page_content=title or "Section",
                metadata={
                    **base_metadata,
                    "chunk_type": "fallback",
                },
            )
        )

    return child_docs


def generate_embeddings_and_retriever(
    section_documents: list[dict[str, Any]],
    user_id: str,
    video_id: str,
    force_reindex: bool = False,
) -> MultiVectorRetriever:
    """
    Build and index a MultiVectorRetriever from RagPreprocessing section outputs.

    Expected section shape:
    {
      "start_time": "MM:SS",
      "end_time": "MM:SS",
      "title": "...",
      "summary": "...",
      "topics": "...",
      "raw_transcript": "..."
    }
    """
    if not section_documents:
        raise ValueError("section_documents is empty.")

    embeddings = get_embeddings_with_fallback()
    vector_store = get_pinecone_vector_store(embeddings, namespace=user_id)
    docstore = get_redis_docstore()

    id_key = "transcript_uuid"
    retriever = MultiVectorRetriever(
        vectorstore=vector_store,
        docstore=docstore,
        id_key=id_key,
        search_kwargs={"k": int(os.getenv("YT_DENSE_K", "6"))},
    )

    if force_reindex:
        try:
            vector_store.delete(filter={"video_id": video_id})
        except Exception:
            pass

    all_child_docs: list[Document] = []
    parent_pairs: list[tuple[str, Document]] = []

    for section in section_documents:
        transcript_uuid = str(uuid4())
        base_metadata = _build_base_metadata(section, transcript_uuid, id_key, user_id, video_id)

        parent_doc = Document(
            page_content=str(section.get("raw_transcript", "")).strip(),
            metadata={
                **base_metadata,
                "summary": str(section.get("summary", "")).strip(),
            },
        )

        child_docs = _build_child_docs_for_section(
            section=section,
            transcript_uuid=transcript_uuid,
            id_key=id_key,
            user_id=user_id,
            video_id=video_id,
        )
        all_child_docs.extend(child_docs)
        parent_pairs.append((transcript_uuid, parent_doc))

    vector_store.add_documents(all_child_docs)
    retriever.docstore.mset(parent_pairs)
    return retriever


def generate_embeddings(
    section_documents: list[dict[str, Any]],
    user_id: str,
    video_id: str,
    force_reindex: bool = False,
) -> MultiVectorRetriever:
    """
    Explicit embedding/indexing entrypoint.
    """
    return generate_embeddings_and_retriever(
        section_documents=section_documents,
        user_id=user_id,
        video_id=video_id,
        force_reindex=force_reindex,
    )


def query_multivector_retriever(
    question: str,
    user_id: str,
    video_id: str,
    k: int | None = None,
) -> list[Document]:
    """
    Query indexed section data and return matched parent transcript documents.
    """
    if not question.strip():
        return []

    embeddings = get_embeddings_with_fallback()
    vector_store = get_pinecone_vector_store(embeddings, namespace=user_id)
    docstore = get_redis_docstore()
    search_k = k if k is not None else int(os.getenv("YT_DENSE_K", "6"))
    retriever = MultiVectorRetriever(
        vectorstore=vector_store,
        docstore=docstore,
        id_key="transcript_uuid",
        search_kwargs={
            "k": search_k,
            "filter": {"video_id": video_id},
        },
    )

    return retriever.invoke(question)


def query(
    question: str,
    user_id: str,
    video_id: str,
    k: int | None = None,
) -> list[Document]:
    """
    Explicit query entrypoint.
    """
    return query_multivector_retriever(question=question, user_id=user_id, video_id=video_id, k=k)


def load_sections_json(file_path: str) -> list[dict[str, Any]]:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Expected list of section dictionaries in JSON file.")
    return data


def main() -> None:
    sections_path = input("Path to video sections JSON [video_sections.json]: ").strip() or "video_sections.json"
    force_reindex = input("Force reindex? (y/N): ").strip().lower() == "y"

    sections = load_sections_json(sections_path)
    user_id = input("User namespace: ").strip() or "demo-user"
    video_id = input("Video id: ").strip() or "demo-video"
    retriever = generate_embeddings(sections, user_id=user_id, video_id=video_id, force_reindex=force_reindex)

    user_query = input("Ask a question: ").strip()
    results = query(user_query, user_id=user_id, video_id=video_id)

    print(f"\nRetrieved {len(results)} section(s):\n")
    for i, doc in enumerate(results, start=1):
        meta = doc.metadata
        print(f"[{i}] {meta.get('start_time', '')}-{meta.get('end_time', '')} | {meta.get('title', 'Untitled')}")
        print(f"UUID: {meta.get('transcript_uuid', '')}")
        print((doc.page_content or "")[:300])
        print()


if __name__ == "__main__":
    main()
