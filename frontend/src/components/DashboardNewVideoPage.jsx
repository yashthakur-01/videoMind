import { useEffect, useState } from "react";
import { LinkIcon } from "lucide-react";
import { DashboardSidebarLayout } from "./DashboardSidebarLayout";
import { useAppToast } from "./ui/toast-1";

export function DashboardNewVideoPage({
  onSubmit,
  processing,
  initialUrl,
  videos,
  historyLoading,
  historyItemLoadingId,
}) {
  const [url, setUrl] = useState("");
  const showToast = useAppToast();

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      showToast("Missing URL", "Paste a YouTube link before clicking process.");
      return;
    }

    try {
      await onSubmit(trimmedUrl);
      setUrl("");
    } catch (nextError) {
      if (nextError?.code === "API_LIMIT_REACHED") {
        showToast("API limit reached", nextError.message ?? "Provider quota is exhausted. Try again later.");
        return;
      }
      if (nextError?.code === "TRANSCRIPT_UNAVAILABLE") {
        showToast("Transcript unavailable", nextError.message ?? "Unable to fetch transcript for this video.");
        return;
      }
      showToast("Processing failed", nextError?.message ?? "Failed to process video.");
    }
  };

  return (
    <DashboardSidebarLayout
      pageTitle="New Video"
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={historyItemLoadingId}
    >
      <div className="mx-auto max-w-3xl">
        <form onSubmit={submit} className="glass grid gap-4 rounded-2xl border border-white/15 bg-black/65 p-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Paste a Fresh Video Link</h2>
            <p className="text-sm text-zinc-300">Enter a YouTube URL to process a new video and open it in the dashboard.</p>
          </div>
          <label className="space-y-2 text-sm text-zinc-200">
            <span className="inline-flex items-center gap-2"><LinkIcon size={14} /> YouTube URL</span>
            <input
              disabled={processing}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-white/20 bg-black/70 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/60 focus:outline-none"
            />
          </label>
          <button
            disabled={processing}
            type="submit"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-70"
          >
            {processing ? "Processing..." : "Process and Open"}
          </button>
        </form>
      </div>
    </DashboardSidebarLayout>
  );
}
