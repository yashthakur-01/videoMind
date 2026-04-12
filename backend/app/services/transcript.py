from urllib.parse import parse_qs, urlparse

from langchain_core.documents import Document
from typing import List
import os
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi, FetchedTranscript

path = "./.env"
load_dotenv(path,override=True)


def extract_video_id(video_url: str) -> str:
    parsed = urlparse(video_url)
    if parsed.netloc in {"youtu.be", "www.youtu.be"}:
        return parsed.path.strip("/")

    if parsed.path == "/watch":
        return parse_qs(parsed.query).get("v", [""])[0]

    if parsed.path.startswith("/shorts/"):
        return parsed.path.split("/shorts/")[-1].split("/")[0]

    return ""

def get_transcript(video_url: str,numDocs: int=20) -> List[Document]: 
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
