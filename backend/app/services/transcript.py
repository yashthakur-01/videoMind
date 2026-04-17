from urllib.parse import parse_qs, urlparse

import httpx
import re
from langchain_core.documents import Document
from typing import List
from youtube_transcript_api import YouTubeTranscriptApi
from app.config import settings

YOUTUBE_V3_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def extract_video_id(video_url: str) -> str:
    parsed = urlparse(video_url)
    if parsed.netloc in {"youtu.be", "www.youtu.be"}:
        return parsed.path.strip("/")

    if parsed.path == "/watch":
        return parse_qs(parsed.query).get("v", [""])[0]

    if parsed.path.startswith("/shorts/"):
        return parsed.path.split("/shorts/")[-1].split("/")[0]

    return ""


def format_duration_hhmmss(total_seconds: int | None) -> str | None:
    if total_seconds is None:
        return None
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def parse_iso8601_duration_to_seconds(value: str | None) -> int | None:
    if not value:
        return None

    # Example values: PT4M13S, PT1H02M03S, PT59S
    pattern = r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$"
    match = re.match(pattern, value)
    if not match:
        return None

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def get_video_metadata(video_url: str) -> dict:
    youtube_video_id = extract_video_id(video_url)
    embed_url = f"https://www.youtube.com/embed/{youtube_video_id}" if youtube_video_id else None

    payload = {
        "youtube_video_id": youtube_video_id or None,
        "video_title": None,
        "channel_name": None,
        "duration_seconds": None,
        "duration_label": None,
        "thumbnail_url": None,
        "embed_url": embed_url,
        "source_url": video_url,
    }

    api_key = settings.youtube_data_api_key
    if not api_key or not youtube_video_id:
        return payload

    try:
        response = httpx.get(
            YOUTUBE_V3_VIDEOS_URL,
            params={
                "part": "snippet,contentDetails",
                "id": youtube_video_id,
                "key": api_key,
            },
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

        items = data.get("items") or []
        if items:
            item = items[0]
            snippet = item.get("snippet") or {}
            content_details = item.get("contentDetails") or {}
            thumbnails = snippet.get("thumbnails") or {}

            best_thumbnail = (
                thumbnails.get("maxres")
                or thumbnails.get("standard")
                or thumbnails.get("high")
                or thumbnails.get("medium")
                or thumbnails.get("default")
                or {}
            )

            duration_seconds = parse_iso8601_duration_to_seconds(content_details.get("duration"))

            payload.update(
                {
                    "youtube_video_id": item.get("id") or payload["youtube_video_id"],
                    "video_title": snippet.get("title"),
                    "channel_name": snippet.get("channelTitle"),
                    "duration_seconds": duration_seconds,
                    "duration_label": format_duration_hhmmss(duration_seconds),
                    "thumbnail_url": best_thumbnail.get("url"),
                    "embed_url": (
                        f"https://www.youtube.com/embed/{item.get('id')}"
                        if item.get("id")
                        else payload["embed_url"]
                    ),
                }
            )
    except Exception:
        # Metadata should not block transcript processing.
        pass

    return payload

def get_transcript(video_url: str,numDocs: int=25) -> List[Document]: 
    script = []        
    video_id = extract_video_id(video_url)
    if not video_id:
        print("Could not extract a video ID from the provided URL.")
        return script

    try:
            transList = YouTubeTranscriptApi().list(video_id=video_id)

            raw_segments = None
            try: 
                raw_segments = transList.find_manually_created_transcript(["en", "hi"]).fetch()
            
            except Exception as e:
                print("Manually created transcript not found. Trying generated transcript")    
                
                try:     
                    raw_segments = transList.find_generated_transcript(["en", "hi"]).fetch()
                except Exception as gen_e:
                    print("Generated transcript not found.")
            
            if not raw_segments:
                print("No transcripts available for this video.")
                return script
            
            
            segments = list(raw_segments)
            text_parts = []
            for i in range(0,len(segments),numDocs):
                batch = segments[i:i+numDocs]
                
                batch_text = []
                for seg in batch:
                    if isinstance(seg,dict):
                        batch_text.append(seg.get("text",""))                
                    else:
                        batch_text.append(getattr(seg,'text',''))
                        
                first_seg = batch[0]
                last_seg = batch[-1]
                if isinstance(first_seg, dict):
                    start_time = first_seg.get("start", 0.0)
                    end_time = last_seg.get("start", 0.0) + last_seg.get("duration", 0.0)
                else:
                    start_time = getattr(first_seg, 'start', 0.0)
                    end_time = getattr(last_seg, 'start', 0.0) + getattr(last_seg, 'duration', 0.0)

                # Append the clean variables
                text_parts.append((" ".join(batch_text), start_time, end_time))
            for text,start,end in text_parts:
                doc = Document(
                        page_content=text,
                        metadata={"source": video_url, "video_id": video_id, "start_time": start, "end_time": end},
                )
                script.append(doc)
    except Exception as fallback_error:
            print(f"Fallback transcript fetch failed: {fallback_error}")
    
    return script


def main():
    video_url = input("Enter the youtube video url: ")
    transcript = get_transcript(video_url)
    
    if(transcript):
        print(f"Transcript for {video_url}:")
        for doc in transcript:
            print(doc.page_content)
        print(len(transcript))
    else:
        print("No transcript found for the provided video URL.")

if __name__ == "__main__":
    main()    
