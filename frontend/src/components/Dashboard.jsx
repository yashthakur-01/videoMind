import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SendHorizonal, LoaderCircle, LogOut, KeyRound, Link as LinkIcon } from "lucide-react";
import { ShimmerBlock } from "./ShimmerBlock";
import { useSession } from "../lib/session-context";

const providers = {
  OpenAI: ["gpt-4o", "gpt-4.1-mini"],
  Gemini: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
};

const steps = ["Fetching Transcript", "Analyzing Eras", "Generating Chapters"];

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
  onProcess,
  onAsk,
  providerSettings,
  onProviderSettingsChange,
  onSaveProviderSettings,
  settingsLoading,
  sections,
  processing,
  chatLoading,
  chatMessages,
  videos,
  historyLoading,
  onResume,
}) {
  const { user, signOut } = useSession();
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const availableModels = useMemo(
    () => providers[providerSettings.activeProvider] ?? providers.OpenAI,
    [providerSettings.activeProvider]
  );
  const hasSavedKeyForActiveProvider = providerSettings.savedKeys?.[providerSettings.activeProvider] ?? false;

  const handleProviderChange = (value) => {
    onProviderSettingsChange((current) => ({
      ...current,
      activeProvider: value,
      activeModel: providers[value][0],
      apiKeyInput: "",
    }));
  };

  const submitProcess = async (event) => {
    event.preventDefault();
    await onProcess({ url });
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    await onAsk(question.trim());
    setQuestion("");
  };

  const submitProviderSettings = async (event) => {
    event.preventDefault();
    setSettingsError("");
    try {
      await onSaveProviderSettings({
        provider: providerSettings.activeProvider,
        model: providerSettings.activeModel,
        apiKey: providerSettings.apiKeyInput.trim(),
      });
    } catch (error) {
      setSettingsError(error.message);
    }
  };

  const resumeVideo = async (id) => {
    setHistoryError("");
    try {
      await onResume(id);
    } catch (error) {
      setHistoryError(error.message);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
        <div>
          <p className="text-sm text-slate-300">Signed in as {user?.email}</p>
          <h1 className="text-2xl font-semibold text-white">VideoMind Workspace</h1>
        </div>
        <button onClick={signOut} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-cyan-400">
          <LogOut size={16} /> Sign out
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitProviderSettings} className="glass grid gap-4 rounded-2xl p-4 md:grid-cols-4">
          <div className="col-span-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Model Settings</h2>
              <p className="text-sm text-slate-300">Save your provider, model, and API key once for future requests.</p>
            </div>
            {settingsLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
          </div>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Provider</span>
            <select
              value={providerSettings.activeProvider}
              onChange={(event) => handleProviderChange(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm"
            >
              {Object.keys(providers).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Model</span>
            <select
              value={providerSettings.activeModel}
              onChange={(event) =>
                onProviderSettingsChange((current) => ({ ...current, activeModel: event.target.value }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm"
            >
              {availableModels.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-2 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2"><KeyRound size={14} /> API Key</span>
            <input
              type="password"
              value={providerSettings.apiKeyInput}
              onChange={(event) =>
                onProviderSettingsChange((current) => ({ ...current, apiKeyInput: event.target.value }))
              }
              placeholder={hasSavedKeyForActiveProvider ? "Saved key exists. Enter a new one to replace it." : "sk-..."}
              autoComplete="off"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm tracking-wide focus:border-cyan-400 focus:outline-none"
            />
            <p className="text-xs text-slate-400">
              {hasSavedKeyForActiveProvider
                ? "A key is already saved for this provider. Leaving this blank keeps the existing key."
                : "No key saved yet for this provider."}
            </p>
          </label>
          {settingsError ? <p className="col-span-4 text-sm text-rose-300">{settingsError}</p> : null}
          <button
            disabled={settingsLoading}
            type="submit"
            className="col-span-4 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-70"
          >
            Save Settings
          </button>
        </form>

        <form onSubmit={submitProcess} className="glass grid gap-4 rounded-2xl p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Process Video</h2>
            <p className="text-sm text-slate-300">
              New videos will use your saved {providerSettings.activeProvider} / {providerSettings.activeModel} settings.
            </p>
          </div>
          <label className="space-y-2 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2"><LinkIcon size={14} /> YouTube URL</span>
            <input
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </label>
          <button
            disabled={processing}
            type="submit"
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-70"
          >
            {processing ? "Processing..." : "Generate"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass rounded-2xl p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Video History</h2>
          {historyLoading ? <p className="text-sm text-slate-300">Loading history...</p> : null}
          {!historyLoading && videos.length === 0 ? <p className="text-sm text-slate-300">No past videos yet.</p> : null}
          {historyError ? <p className="mb-2 text-sm text-rose-300">{historyError}</p> : null}
          <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
            {videos.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => resumeVideo(video.id)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/50 p-3 text-left hover:border-cyan-400"
              >
                <p className="text-sm font-medium text-cyan-200">{video.youtube_url}</p>
                <p className="mt-1 text-xs text-slate-300">{video.provider} / {video.model}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(video.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Progress</h2>
          <ol className="space-y-2">
            {steps.map((step, index) => {
              const active = processing && index <= 2;
              return (
                <li key={step} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-cyan-300" : "bg-slate-600"}`} />
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
          {processing ? (
            <div className="mt-4 space-y-2">
              <ShimmerBlock className="h-4 w-full" />
              <ShimmerBlock className="h-4 w-4/5" />
              <ShimmerBlock className="h-4 w-2/3" />
            </div>
          ) : null}
        </section>

        <section className="glass flex h-[520px] flex-col rounded-2xl p-4 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-white">Interactive Chat</h2>
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {chatMessages.map((message, index) => (
              <motion.div key={`${message.role}-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl p-3 text-sm ${message.role === "user" ? "bg-cyan-400/15 text-cyan-100" : "bg-slate-900/70 text-slate-200"}`}>
                <p>
                  {message.content}
                  {message.streaming ? <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-cyan-300 align-middle" /> : null}
                </p>
                {message.sources?.length ? (
                  <div className="mt-2 text-xs text-cyan-200">Sources: {message.sources.join(", ")}</div>
                ) : null}
              </motion.div>
            ))}
          </div>
          <form onSubmit={submitQuestion} className="mt-3 flex gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this video"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
            <button disabled={chatLoading} className="rounded-xl bg-cyan-400 px-3 text-slate-900 hover:bg-cyan-300 disabled:opacity-70">
              {chatLoading ? <LoaderCircle className="animate-spin" size={16} /> : <SendHorizonal size={16} />}
            </button>
          </form>
        </section>
      </div>

      <section className="glass rounded-2xl p-4">
        <h2 className="mb-4 text-lg font-semibold text-white">Generated Chapters JSON</h2>
        <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
          {sections.length === 0 ? <p className="text-sm text-slate-300">No generated chapters yet.</p> : null}
          {sections.map((section) => {
            const startTime = section.start_time ?? formatTimestamp(section.start_seconds);
            const endTime = section.end_time ?? formatTimestamp(section.end_seconds);
            return (
              <article key={section.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <button className="w-full text-left">
                  <p className="text-sm font-medium text-cyan-200">[{startTime} - {endTime}] {section.title}</p>
                  <p className="mt-2 text-sm text-slate-300">{section.summary}</p>
                </button>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950/70 p-2 text-xs text-slate-200">{JSON.stringify(section, null, 2)}</pre>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
