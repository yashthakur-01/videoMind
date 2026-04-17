import { useState } from "react";
import { motion } from "framer-motion";
import { SendHorizonal, LoaderCircle, RotateCcw } from "lucide-react";
import { DashboardSidebarLayout } from "./DashboardSidebarLayout";

function formatTimestamp(seconds) {
  const hh = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Dashboard({
  onAsk,
  currentVideo,
  sections,
  chatLoading,
  chatMessages,
  videos,
  historyLoading,
  historyItemLoadingId,
  onRegenerateSections,
  regeneratingSections,
}) {
  const [question, setQuestion] = useState("");

  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    await onAsk(question.trim());
    setQuestion("");
  };

  return (
    <DashboardSidebarLayout
      pageTitle="Video Session"
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={historyItemLoadingId}
    >
      <div className="grid grid-cols-1 gap-4 xl:h-[calc(100vh-140px)] xl:grid-cols-5 xl:overflow-hidden">
        <div className="space-y-4 xl:col-span-3 xl:overflow-y-auto xl:pr-1">
          <section className="rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            {currentVideo ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">{currentVideo.video_title || "Selected video"}</h2>
                    <p className="text-sm text-zinc-400">
                      {currentVideo.channel_name || "Unknown channel"}
                      {currentVideo.duration_label ? ` • ${currentVideo.duration_label}` : ""}
                    </p>
                  </div>
                </div>
                {currentVideo.embed_url ? (
                  <div className="mx-auto w-full overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950">
                    <iframe
                      src={currentVideo.embed_url}
                      title={currentVideo.video_title || "YouTube video"}
                      className="aspect-video w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Embed unavailable for this video.</p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
                Select a video from history, or start a new one from the New Video page.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-100">Generated Sections</h2>
              {currentVideo && sections.length === 0 ? (
                <button
                  type="button"
                  onClick={onRegenerateSections}
                  disabled={regeneratingSections}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
                >
                  {regeneratingSections ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  {regeneratingSections ? "Regenerating..." : "Regenerate Sections"}
                </button>
              ) : null}
            </div>
            <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
              {sections.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  No generated sections yet.
                  {currentVideo ? " You can use Regenerate Sections to retry." : ""}
                </p>
              ) : null}
              {sections.map((section) => {
                const startTime = section.start_time ?? formatTimestamp(section.start_seconds);
                const endTime = section.end_time ?? formatTimestamp(section.end_seconds);
                return (
                  <article key={section.id} className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                    <p className="text-sm font-medium text-zinc-100">[{startTime} - {endTime}] {section.title}</p>
                    <p className="mt-2 text-sm text-zinc-400">{section.summary}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <section className="flex min-h-[520px] flex-col rounded-2xl border border-zinc-700/60 bg-zinc-900/70 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.25)] xl:col-span-2 xl:sticky xl:top-24 xl:h-[calc(100vh-170px)]">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Interactive Chat</h2>
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {chatMessages.map((message, index) => (
              <motion.div key={`${message.role}-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-3 text-sm ${message.role === "user" ? "border border-zinc-600 bg-zinc-800 text-zinc-100" : "bg-zinc-950 text-zinc-300"}`}>
                <p>
                  {message.content}
                  {message.streaming ? <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-zinc-300 align-middle" /> : null}
                </p>
                {message.sources?.length ? (
                  <div className="mt-2 text-xs text-zinc-400">Sources: {message.sources.join(", ")}</div>
                ) : null}
              </motion.div>
            ))}
          </div>
          <form onSubmit={submitQuestion} className="mt-3 flex gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this video"
              className="flex-1 rounded-xl border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
            />
            <button disabled={chatLoading} className="rounded-xl bg-zinc-100 px-3 text-zinc-950 hover:bg-white disabled:opacity-70">
              {chatLoading ? <LoaderCircle className="animate-spin" size={16} /> : <SendHorizonal size={16} />}
            </button>
          </form>
        </section>
      </div>
    </DashboardSidebarLayout>
  );
}
