from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI,GoogleGenerativeAIEmbeddings
import os
import json
from dotenv import load_dotenv
from pydantic import SecretStr, BaseModel, Field
from typing import List, Dict, Literal, Any
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document
from app.services.transcript import get_transcript

load_dotenv("./.env",override=True)

from langchain_core.language_models.chat_models import BaseChatModel

def get_llm(provider: Literal['openai', 'gemini'], temperature: float = 0.7) -> BaseChatModel:
    """
    Factory function to initialize and return the specified LLM.
    """

    max_retries = int(os.getenv('YT_LLM_MAX_RETRIES', '1'))

    if provider == 'openai':
        api_key = os.getenv('OPENAI_KEY')
        if not api_key:
            raise ValueError("OPENAI_KEY is not provided.")
        return ChatOpenAI(
            model='gpt-4o', 
            temperature=temperature, 
            api_key=SecretStr(api_key),
            max_retries=max_retries,
        )

    elif provider == 'gemini':
        api_key = os.getenv('GEMINI_KEY')
        if not api_key:
            raise ValueError("GEMINI_KEY is not provided.")
        return ChatGoogleGenerativeAI(
            model='gemini-2.5-flash-lite', 
            temperature=temperature, 
            api_key=SecretStr(api_key),
            max_retries=max_retries,
        )

    else:
        raise ValueError(f"Unsupported provider: '{provider}'. Choose 'openai' or 'gemini'.")


def time_to_seconds(time_str: str) -> float:
    parts = time_str.split(":")
    if len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    return 0.0

class SectionMetadata(BaseModel):
    start_time: str = Field(description="Exact starting timestamp in MM:SS format, matching a tag in the text.")
    end_time: str = Field(description="Exact ending timestamp in MM:SS format, matching a tag in the text.")
    title: str = Field(description="A clear title for this section.")
    summary: str = Field(description="Detailed summary of this section.")
    topics: str = Field(
        default="",
        description=(
            "Comma-separated taught topics for this section, with 0 to 5 items. "
            "Return empty string if no specific topic is taught."
        ),
    )

class VideoSections(BaseModel):
    sections: List[SectionMetadata] = Field(description="List of topic sections")


class VideoOverview(BaseModel):
    summary: str = Field(description="Overall video-level summary covering the full video.")
    topics: str = Field(
        default="",
        description="Comma-separated high-level video topics, max 8 items; empty string if unavailable.",
    )
    people_involved: str = Field(
        default="",
        description="Comma-separated people/entities involved in the video, if known.",
    )
    
def format_time(seconds: float) -> str:
    """Converts raw seconds into MM:SS format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}" 


def _tail_after_sentence_boundary(text: str) -> str:
    """Return text after the last sentence boundary ('.' or '।')."""
    last_idx = max(text.rfind("."), text.rfind("।"))
    return text[last_idx + 1 :] if last_idx != -1 else text


def _head_until_sentence_boundary(text: str) -> str:
    """Return text up to and including the first sentence boundary ('.' or '।')."""
    dot_idx = text.find(".")
    danda_idx = text.find("।")
    candidates = [idx for idx in (dot_idx, danda_idx) if idx != -1]
    if not candidates:
        return text
    first_idx = min(candidates)
    return text[: first_idx + 1]


def process_transcript_batches_parallel(docs: List[Document], batch_size: int = 13,provider: Literal['openai', 'gemini']= 'gemini') -> Dict[str, Any]:
    llm = get_llm(provider=provider, temperature=0.2)
    model_for_chain = llm.with_structured_output(VideoSections)

    prompt = PromptTemplate.from_template("""
You are an expert content architect. Convert the transcript into high-level thematic chapters. You can understand multiple languages, but output in English.

Objective:
- Group content into broad macro-chapters; each chapter must represent a sustained thematic phase.

Required chapter budget:
- Produce strictly MAX 3 sections for this transcript batch.
- Never output more than 3 sections.
- If many subtopics appear, merge them under broader umbrella chapters.

Guardrails (prevent over-segmentation):
1. Thematic aggregation: do not split supporting examples/anecdotes/sub-points into separate sections when they support one thesis.
2. Significance threshold: start a new section only for a fundamental subject shift; absorb minor pivots/tangents.
3. Quality over quantity: prefer fewer, deeper, information-dense sections over fragmented shallow ones.
4. No lazy summaries: extract concrete "what" and "how" insights, not vague commentary.

Beginning-of-video guidance:
- The opening may include short preview snippets. If that opening is not a complete topic, do not treat it as its own section.
- If the opening is a real intro, title it "Introduction" (or another relevant intro title) and summarize accordingly.

Output requirements:
- Use only provided [MM:SS] tags for timestamps.
- Keep start/end timestamps continuous for each section.
- Include topics for each section:
    - Include topics only when a specific concept/technique/entity is explicitly taught.
    - If none are taught, return "".
    - Do not hallucinate.
    - Max 5 topics per section.
    - Format as comma-separated short topic names.
- Return only valid JSON with this schema:

{{
    "sections": [
        {{
            "start_time": "MM:SS",
            "end_time": "MM:SS",
            "title": "A High-Level Thematic Title",
            "summary": "An analytical summary of core concepts, methods, or frameworks discussed.",
            "topics": "Topic1, Topic2"
        }}
    ]
}}

Transcript:
{chunk}
""")

    overview_model = llm.with_structured_output(VideoOverview)
    overview_prompt = PromptTemplate.from_template("""
You are creating a single video-level overview from already-generated section summaries.

Goal:
- Explain what the full video is about at a generic, whole-video level.
- Include details users commonly ask at video level: main topic/theme, what is covered overall, who is involved (host/guest/organization/entity if present), and overall intent/outcome.
- Focus on entire-video context, not per-section details.

Output rules:
- Be concise but complete.
- Do not hallucinate names or facts; if unknown, omit.
- Return strict JSON only:
{{
    "summary": "...",
    "topics": "Topic1, Topic2",
    "people_involved": "Person A, Person B"
}}

Section summaries:
{section_summaries}
""")
   
    chain = prompt | model_for_chain
    
    # 1. Prepare all inputs upfront
    all_batches = []
    llm_inputs = []
    
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        all_batches.append(batch)
        
        batch_text = ""
        for doc in batch:
            time_str = format_time(doc.metadata.get("start_time", 0))
            batch_text += f"START:[{time_str}]\n{doc.page_content}\n"
            
        llm_inputs.append({"chunk": batch_text})
        
    print(f"Prepared {len(llm_inputs)} batches. Sending to LLM in parallel...")
    
    # 2. Execute Parallel LLM Calls
    # max_concurrency: limits how many simultaneous calls are made to avoid rate limits
    # return_exceptions: ensures if one batch fails, the others still complete!
    try:
        llm_results = chain.batch(
        llm_inputs, 
        config={"max_concurrency": 3}, 
        return_exceptions=True
    )
    except Exception as e:
        print(f"Error during batch processing: {e}")
        return []

    # 3. Process results and extract raw text
    final_sections = []
    batch_errors: List[str] = []
    
    for batch_index, llm_result in enumerate(llm_results):
        # Skip this batch if the API threw an error for this specific chunk
        if isinstance(llm_result, Exception):
            print(f"Batch {batch_index + 1} failed with error: {llm_result}")
            batch_errors.append(str(llm_result))
            continue

        if not llm_result:
            continue

        if isinstance(llm_result, dict):
            sections_data: Any = llm_result.get("sections", [])
        else:
            sections_data = getattr(llm_result, "sections", [])
            
        if not sections_data:
            continue
            
        original_batch = all_batches[batch_index]
        
        for section in sections_data:
            if isinstance(section, dict):
                section = SectionMetadata.model_validate(section)
            section_start = section.start_time
            section_end = section.end_time
            section_title = section.title
            section_summary = section.summary
            section_topics = section.topics

            sec_start_sec = time_to_seconds(section_start)
            sec_end_sec = time_to_seconds(section_end)
            
            raw_text_parts = []
            final = -1
            first = False
            for ind,doc in enumerate(original_batch):
                doc_time = doc.metadata.get("start_time", 0)
                if doc_time >= sec_start_sec and doc_time < sec_end_sec:
                    if not first and doc.page_content and not doc.page_content[0].isupper():
                        if ind > 0:
                            prev_tail = _tail_after_sentence_boundary(original_batch[ind - 1].page_content)
                            raw_text_parts.append(prev_tail)
                            raw_text_parts[-1] = raw_text_parts[-1] + doc.page_content
                        first = True
                    else :
                        raw_text_parts.append(doc.page_content)
                        final = ind
            if raw_text_parts and raw_text_parts[-1]:
                if raw_text_parts[-1][-1] not in (".", "।"):
                    if final!=-1 and final+1 < len(original_batch):
                        next_head = _head_until_sentence_boundary(original_batch[final + 1].page_content)
                        raw_text_parts.append(next_head)
                        
            if not raw_text_parts and original_batch:
                raw_text_parts.append(original_batch[-1].page_content)
                
            final_sections.append({
                "start_time": section_start,
                "end_time": section_end,
                "title": section_title,
                "summary": section_summary,
                "topics": section_topics,
                "raw_transcript": " ".join(raw_text_parts)
            })

    if batch_errors:
        first_error = batch_errors[0]
        raise RuntimeError(f"Section generation failed for one or more batches. First error: {first_error}")

    if not final_sections:
        raise RuntimeError("Section generation completed but produced no sections.")
            
    section_summaries_text = "\n\n".join(
        [
            (
                f"Title: {item.get('title', 'Untitled')}\n"
                f"Range: {item.get('start_time', '00:00')} - {item.get('end_time', '00:00')}\n"
                f"Summary: {item.get('summary', '').strip()}"
            )
            for item in final_sections
        ]
    )

    overview_result = overview_model.invoke(
        overview_prompt.format(section_summaries=section_summaries_text)
    )

    if isinstance(overview_result, dict):
        overview_data = VideoOverview.model_validate(overview_result)
    else:
        overview_data = overview_result

    video_overview = {
        "title": "Overall Video Overview",
        "summary": str(overview_data.summary).strip(),
        "topics": str(overview_data.topics).strip(),
        "people_involved": str(overview_data.people_involved).strip(),
    }

    return {
        "sections": final_sections,
        "video_overview": video_overview,
    }


def main() -> None:
    video_url = input("Enter YouTube video URL: ").strip()
    if not video_url:
        print("Video URL is required.")
        return
    docs_in_segment = int(input("Enter number of transcript lines per segment [25]: ").strip())
    provider_input = input("Enter provider (openai/gemini) [gemini]: ").strip().lower()
    provider: Literal["openai", "gemini"]
    if provider_input == "openai":
        provider = "openai"
    else:
        provider = "gemini"

    batch_size_input = input("Enter batch size [13]: ").strip()
    batch_size = 13
    if batch_size_input:
        try:
            batch_size = max(1, int(batch_size_input))
        except ValueError:
            print("Invalid batch size. Using default 13.")

    output_path = input("Enter output JSON file path [video_sections.json]: ").strip() or "video_sections.json"

    docs = get_transcript(video_url,docs_in_segment)
    if not docs:
        print("No transcript chunks found. JSON file was not created.")
        return
    print(f"Fetched {len(docs)} transcript chunks. Processing with {provider} LLM...")
    sections = process_transcript_batches_parallel(docs=docs, batch_size=batch_size, provider=provider)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sections, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(sections)} section(s) to {output_path}")


if __name__ == "__main__":
    main()


