import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { LandingPage } from "./components/LandingPage";
import { Dashboard } from "./components/Dashboard";
import { DashboardSettingsPage } from "./components/DashboardSettingsPage";
import { DashboardNewVideoPage } from "./components/DashboardNewVideoPage";
import { DashboardSidebarLayout } from "./components/DashboardSidebarLayout";
import { AuthPage } from "./components/AuthPage";
import { ToastHost, useAppToast } from "./components/ui/toast-1";
import { Component as AILoader } from "./components/ui/ai-loader";
import { useSession } from "./lib/session-context";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
let videosCache = [];
let hasVideosCache = false;

function createAssistantPlaceholder() {
  return {
    role: "assistant",
    content: "",
    sources: [],
    streaming: true,
  };
}

function createApiError(message, extras = {}) {
  const error = new Error(message);
  if (extras.code) {
    error.code = extras.code;
  }
  if (extras.status) {
    error.status = extras.status;
  }
  if (extras.details) {
    error.details = extras.details;
  }
  return error;
}

async function toApiError(response, fallbackMessage) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const rootError = payload?.error;
  if (rootError && typeof rootError === "object") {
    return createApiError(rootError.message ?? fallbackMessage, {
      code: rootError.code,
      status: rootError.status ?? response.status,
      details: rootError.details,
    });
  }

  const detail = payload?.detail;
  if (detail && typeof detail === "object") {
    return createApiError(detail.message ?? fallbackMessage, {
      code: detail.code,
      status: response.status,
      details: detail.details,
    });
  }

  if (typeof detail === "string" && detail.trim()) {
    return createApiError(detail, { status: response.status });
  }

  return createApiError(fallbackMessage, { status: response.status });
}

async function readSseStream(response, handlers) {
  if (!response.body) {
    throw new Error("Streaming is not available in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      let eventName = "message";
      const dataLines = [];

      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) {
        continue;
      }

      const payload = JSON.parse(dataLines.join("\n"));
      const handler = handlers[eventName];
      if (handler) {
        handler(payload);
      }
    }
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useSession();
  if (loading) {
    return <div className="p-8 text-slate-200">Loading session...</div>;
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function HomeRoute() {
  const navigate = useNavigate();
  const { user } = useSession();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <LandingPage
      onTryNow={() => {
        navigate("/auth");
      }}
    />
  );
}

function DashboardRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useSession();
  const showToast = useAppToast();
  const [sections, setSections] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [videos, setVideos] = useState(videosCache);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItemLoadingId, setHistoryItemLoadingId] = useState(null);
  const [historyDeleteLoadingId, setHistoryDeleteLoadingId] = useState(null);
  const [regeneratingSections, setRegeneratingSections] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [selectedSectionForChat, setSelectedSectionForChat] = useState(null);

  const authHeader = useMemo(() => {
    if (!session?.access_token) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  const loadVideoHistory = async (force = false) => {
    if (!authHeader) {
      return;
    }

    if (hasVideosCache && !force) {
      setVideos(videosCache);
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/videos`, {
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setVideos(payload);
      videosCache = payload;
      hasVideosCache = true;
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadVideoHistory();
  }, [authHeader]);

  const onAsk = async (question, sectionId = null) => {
    if (!videoId || !authHeader) {
      return;
    }

    setChatMessages((current) => [
      ...current,
      { role: "user", content: question },
      createAssistantPlaceholder(),
    ]);
    setChatLoading(true);
    let streamFinished = false;

    try {
      const response = await fetch(`${apiBaseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          query: question,
          video_id: videoId,
          section_id: sectionId || null,
        }),
      });

      if (!response.ok) {
        throw await toApiError(response, "Chat failed");
      }

      await readSseStream(response, {
        meta: (payload) => {
          setChatMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                ...next[lastIndex],
                sources: payload.sources ?? [],
              };
            }
            return next;
          });
        },
        token: (payload) => {
          setChatMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                ...next[lastIndex],
                content: `${next[lastIndex].content}${payload.text ?? ""}`,
              };
            }
            return next;
          });
        },
        done: (payload) => {
          streamFinished = true;
          setChatMessages((current) => {
            const next = [...current];
            const lastIndex = next.length - 1;
            if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
              next[lastIndex] = {
                ...next[lastIndex],
                content: payload.answer ?? next[lastIndex].content,
                sources: payload.sources ?? next[lastIndex].sources ?? [],
                streaming: false,
              };
            }
            return next;
          });
        },
        error: (payload) => {
          throw createApiError(payload.message ?? "Chat failed", {
            code: payload.code,
            details: payload.details,
          });
        },
      });

      if (!streamFinished) {
        setChatMessages((current) => {
          const next = [...current];
          const lastIndex = next.length - 1;
          if (
            lastIndex >= 0 &&
            next[lastIndex].role === "assistant" &&
            next[lastIndex].streaming
          ) {
            next[lastIndex] = {
              ...next[lastIndex],
              content:
                next[lastIndex].content ||
                "Chat ended unexpectedly. Please try again.",
              streaming: false,
            };
          }
          return next;
        });
      }
    } catch (error) {
      showToast(
        "Chat error",
        error.message ?? "Something went wrong while answering your question.",
      );
      setChatMessages((current) => {
        const next = [...current];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
          next[lastIndex] = {
            ...next[lastIndex],
            content: error.message,
            sources: [],
            streaming: false,
          };
          return next;
        }
        return [
          ...current,
          {
            role: "assistant",
            content: error.message,
            sources: [],
            streaming: false,
          },
        ];
      });
    } finally {
      setChatLoading(false);
    }
  };

  const onResume = async (selectedVideoId) => {
    if (!authHeader) {
      return;
    }

    setHistoryItemLoadingId(selectedVideoId);
    try {
      const response = await fetch(`${apiBaseUrl}/videos/${selectedVideoId}`, {
        headers: {
          ...authHeader,
        },
      });

      if (!response.ok) {
        throw await toApiError(response, "Failed to load video history");
      }

      const payload = await response.json();
      setVideoId(payload.video.id);
      setCurrentVideo(payload.video);
      setSections(payload.sections);
      setSelectedSectionForChat(null);
      setChatMessages(
        payload.chat_messages.map((message) => ({
          role: message.role,
          content: message.content,
          sources: message.sources ?? [],
          streaming: false,
        })),
      );
    } finally {
      setHistoryItemLoadingId(null);
    }
  };

  const onRegenerateSections = async () => {
    if (!authHeader || !videoId) {
      return;
    }

    setRegeneratingSections(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/videos/${videoId}/regenerate-sections`,
        {
          method: "POST",
          headers: {
            ...authHeader,
          },
        },
      );

      if (!response.ok) {
        throw await toApiError(response, "Failed to regenerate sections");
      }

      const payload = await response.json();
      setCurrentVideo(payload.video);
      setSections(payload.sections ?? []);
      setSelectedSectionForChat(null);
      setChatMessages(
        payload.chat_messages.map((message) => ({
          role: message.role,
          content: message.content,
          sources: message.sources ?? [],
          streaming: false,
        })),
      );
      showToast("Sections regenerated", "Sections were rebuilt successfully.");
      await loadVideoHistory(true);
    } catch (error) {
      if (error?.code === "API_LIMIT_REACHED") {
        showToast(
          "API limit reached",
          error.message ?? "Provider quota is exhausted. Try again later.",
        );
      } else if (error?.code === "TRANSCRIPT_UNAVAILABLE") {
        showToast(
          "Transcript unavailable",
          error.message ?? "Unable to fetch transcript for this video.",
        );
      } else {
        showToast(
          "Regeneration failed",
          error?.message ?? "Could not regenerate sections.",
        );
      }
    } finally {
      setRegeneratingSections(false);
    }
  };

  const onDeleteVideo = async (selectedVideoId) => {
    if (!authHeader || !selectedVideoId) {
      return;
    }

    setHistoryDeleteLoadingId(selectedVideoId);
    try {
      const response = await fetch(`${apiBaseUrl}/videos/${selectedVideoId}`, {
        method: "DELETE",
        headers: {
          ...authHeader,
        },
      });

      if (!response.ok) {
        throw await toApiError(response, "Failed to delete video");
      }

      await loadVideoHistory(true);

      const isCurrentVideo = videoId === selectedVideoId;
      if (isCurrentVideo) {
        setVideoId(null);
        setCurrentVideo(null);
        setSections([]);
        setChatMessages([]);
        setSelectedSectionForChat(null);
        navigate("/dashboard", {
          replace: true,
        });
      }

      showToast("Video deleted", "Video history item removed successfully.");
    } catch (error) {
      showToast("Delete failed", error?.message ?? "Unable to delete video.");
    } finally {
      setHistoryDeleteLoadingId(null);
    }
  };

  useEffect(() => {
    const nextState = location.state ?? {};

    if (Array.isArray(nextState.updatedVideos)) {
      setVideos(nextState.updatedVideos);
      videosCache = nextState.updatedVideos;
      hasVideosCache = true;
    }

    if (nextState.processedPayload) {
      const payload = nextState.processedPayload;
      setSections(payload.sections ?? []);
      setVideoId(payload.video_id ?? null);
      setCurrentVideo(payload.video ?? null);
      setSelectedSectionForChat(null);
      setChatMessages([
        {
          role: "assistant",
          content: "Processing complete. Ask me anything about this video.",
          sources: (payload.sections ?? [])
            .slice(0, 2)
            .map((item) => item.start_time),
        },
      ]);
      return;
    }

    if (nextState.resumeVideoId) {
      onResume(nextState.resumeVideoId).catch((error) => {
        showToast(
          "History load failed",
          error.message ?? "Unable to load that video session.",
        );
        setChatMessages([
          {
            role: "assistant",
            content: error.message ?? "Failed to load selected history item.",
            sources: [],
            streaming: false,
          },
        ]);
      });
    }
  }, [
    location.state?.resumeNonce,
    location.state?.processedPayload,
    location.state?.updatedVideosNonce,
  ]);

  return (
    <Dashboard
      onAsk={onAsk}
      onDeleteVideo={onDeleteVideo}
      selectedSectionForChat={selectedSectionForChat}
      onSelectSectionForChat={setSelectedSectionForChat}
      onAskFromSection={(sectionId) => {
        setSelectedSectionForChat(sectionId);
        if (chatCollapsed) {
          setChatCollapsed(false);
        }
      }}
      currentVideo={currentVideo}
      sections={sections}
      chatLoading={chatLoading}
      chatMessages={chatMessages}
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={historyItemLoadingId}
      historyDeleteLoadingId={historyDeleteLoadingId}
      onRegenerateSections={onRegenerateSections}
      regeneratingSections={regeneratingSections}
      chatCollapsed={chatCollapsed}
      onToggleChatCollapsed={() => setChatCollapsed((current) => !current)}
    />
  );
}

function DashboardSettingsRoute() {
  const { session } = useSession();
  const showToast = useAppToast();
  const [videos, setVideos] = useState(videosCache);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeleteLoadingId, setHistoryDeleteLoadingId] = useState(null);
  const [providerSettings, setProviderSettings] = useState({
    activeProvider: "OpenAI",
    activeModel: "gpt-4o",
    apiKeyInput: "",
    savedKeys: {
      OpenAI: false,
      Gemini: false,
    },
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDeleting, setSettingsDeleting] = useState(false);

  const authHeader = useMemo(() => {
    if (!session?.access_token) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  const loadVideoHistory = async (force = false) => {
    if (!authHeader) {
      return;
    }

    if (hasVideosCache && !force) {
      setVideos(videosCache);
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/videos`, {
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setVideos(payload);
      videosCache = payload;
      hasVideosCache = true;
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadVideoHistory();
  }, [authHeader]);

  const loadProviderSettings = async () => {
    if (!authHeader) {
      return;
    }

    setSettingsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/settings/provider`, {
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const activeProvider =
        payload.active_provider === "openai" ? "OpenAI" : "Gemini";
      setProviderSettings({
        activeProvider,
        activeModel: payload.active_model,
        apiKeyInput: "",
        savedKeys: {
          OpenAI: payload.has_openai_key,
          Gemini: payload.has_gemini_key,
        },
      });
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    loadProviderSettings();
  }, [authHeader]);

  const saveProviderSettings = async ({ provider, model, apiKey }) => {
    if (!authHeader) {
      throw new Error("Missing auth session");
    }
    setSettingsSaving(true);
    try {
      const normalizedProvider = provider.toLowerCase();
      const response = await fetch(`${apiBaseUrl}/settings/provider`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({
          active_provider: normalizedProvider,
          active_model: model,
          api_key: apiKey || null,
        }),
      });

      if (!response.ok) {
        throw await toApiError(response, "Failed to save provider settings");
      }

      const payload = await response.json();
      const activeProvider =
        payload.active_provider === "openai" ? "OpenAI" : "Gemini";
      setProviderSettings({
        activeProvider,
        activeModel: payload.active_model,
        apiKeyInput: "",
        savedKeys: {
          OpenAI: payload.has_openai_key,
          Gemini: payload.has_gemini_key,
        },
      });
      showToast("Settings saved", "Provider settings updated successfully.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const deleteProviderSettings = async () => {
    if (!authHeader) {
      throw new Error("Missing auth session");
    }

    setSettingsDeleting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/settings/provider`, {
        method: "DELETE",
        headers: {
          ...authHeader,
        },
      });

      if (!response.ok) {
        throw await toApiError(response, "Failed to delete API key settings");
      }

      const payload = await response.json();
      const activeProvider =
        payload.active_provider === "openai" ? "OpenAI" : "Gemini";
      setProviderSettings({
        activeProvider,
        activeModel: payload.active_model,
        apiKeyInput: "",
        savedKeys: {
          OpenAI: payload.has_openai_key,
          Gemini: payload.has_gemini_key,
        },
      });

      showToast(
        "API key settings deleted",
        "Provider settings were removed for this user.",
      );
    } finally {
      setSettingsDeleting(false);
    }
  };

  const onDeleteVideo = async (selectedVideoId) => {
    if (!authHeader || !selectedVideoId) {
      return;
    }

    setHistoryDeleteLoadingId(selectedVideoId);
    try {
      const response = await fetch(`${apiBaseUrl}/videos/${selectedVideoId}`, {
        method: "DELETE",
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        throw await toApiError(response, "Failed to delete video");
      }

      await loadVideoHistory(true);
      showToast("Video deleted", "Video history item removed successfully.");
    } catch (error) {
      showToast("Delete failed", error?.message ?? "Unable to delete video.");
    } finally {
      setHistoryDeleteLoadingId(null);
    }
  };

  return (
    <DashboardSettingsPage
      providerSettings={providerSettings}
      onProviderSettingsChange={setProviderSettings}
      onSaveProviderSettings={saveProviderSettings}
      onDeleteProviderSettings={deleteProviderSettings}
      settingsLoading={settingsLoading}
      settingsSaving={settingsSaving}
      settingsDeleting={settingsDeleting}
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={null}
      historyDeleteLoadingId={historyDeleteLoadingId}
      onDeleteVideo={onDeleteVideo}
    />
  );
}

function DashboardNewVideoRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useSession();
  const showToast = useAppToast();
  const [videos, setVideos] = useState(videosCache);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeleteLoadingId, setHistoryDeleteLoadingId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const authHeader = useMemo(() => {
    if (!session?.access_token) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  const loadVideoHistory = async (force = false) => {
    if (!authHeader) {
      return;
    }

    if (hasVideosCache && !force) {
      setVideos(videosCache);
      return;
    }

    setHistoryLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/videos`, {
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setVideos(payload);
      videosCache = payload;
      hasVideosCache = true;
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadVideoHistory();
  }, [authHeader]);

  useEffect(() => {
    const processError = location.state?.processError;
    if (!processError) {
      return;
    }
    showToast(
      processError.title ?? "Processing failed",
      processError.message ?? "Failed to process video.",
    );
  }, [location.state?.processErrorNonce]);

  const submitNewVideo = async (url) => {
    if (!authHeader) {
      throw createApiError("Missing auth session", {
        code: "UNAUTHORIZED",
        status: 401,
      });
    }

    if (!url?.trim()) {
      throw createApiError("Please paste a YouTube URL first.", {
        code: "MISSING_URL",
        status: 400,
      });
    }

    setProcessing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/process-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ youtube_url: url.trim() }),
      });

      if (!response.ok) {
        throw await toApiError(response, "Failed to start video generation");
      }

      const job = await response.json();
      if (!job?.id) {
        throw createApiError("Failed to start video generation", {
          code: "JOB_CREATION_FAILED",
          status: 500,
        });
      }

      navigate("/dashboard/processing", {
        state: {
          jobId: job.id,
        },
      });
    } finally {
      setProcessing(false);
    }
  };

  const onDeleteVideo = async (selectedVideoId) => {
    if (!authHeader || !selectedVideoId) {
      return;
    }

    setHistoryDeleteLoadingId(selectedVideoId);
    try {
      const response = await fetch(`${apiBaseUrl}/videos/${selectedVideoId}`, {
        method: "DELETE",
        headers: {
          ...authHeader,
        },
      });
      if (!response.ok) {
        throw await toApiError(response, "Failed to delete video");
      }

      await loadVideoHistory(true);
      showToast("Video deleted", "Video history item removed successfully.");
    } catch (error) {
      showToast("Delete failed", error?.message ?? "Unable to delete video.");
    } finally {
      setHistoryDeleteLoadingId(null);
    }
  };

  return (
    <DashboardNewVideoPage
      onSubmit={submitNewVideo}
      processing={processing}
      initialUrl={location.state?.failedUrl ?? ""}
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={null}
      historyDeleteLoadingId={historyDeleteLoadingId}
      onDeleteVideo={onDeleteVideo}
    />
  );
}

function DashboardProcessingRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useSession();
  const initialJobId = (location.state?.jobId ?? "").trim();

  const authHeader = useMemo(() => {
    if (!session?.access_token) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  useEffect(() => {
    if (!authHeader) {
      navigate("/auth", { replace: true });
      return;
    }

    let active = true;
    let pollTimerId;

    const pollJobUntilDone = async (jobId) => {
      try {
        const response = await fetch(`${apiBaseUrl}/process-jobs/${jobId}`, {
          headers: {
            ...authHeader,
          },
        });

        if (!response.ok) {
          throw await toApiError(response, "Failed to check generation status");
        }

        const job = await response.json();
        if (!active) {
          return;
        }

        if (job.status === "completed" && job.video_id) {
          let updatedVideos = null;
          try {
            const historyResponse = await fetch(`${apiBaseUrl}/videos`, {
              headers: {
                ...authHeader,
              },
            });
            if (historyResponse.ok) {
              updatedVideos = await historyResponse.json();
              videosCache = updatedVideos;
              hasVideosCache = true;
            }
          } catch {
            // Best effort: session navigation should still succeed even if history refresh fails.
          }

          navigate("/dashboard/session", {
            replace: true,
            state: {
              resumeVideoId: job.video_id,
              resumeNonce: Date.now(),
              updatedVideos,
              updatedVideosNonce: Date.now(),
            },
          });
          return;
        }

        if (job.status === "failed") {
          let title = "Processing failed";
          const message = job.error_message ?? "Failed to process video.";
          if (
            message.toLowerCase().includes("quota") ||
            message.toLowerCase().includes("rate limit")
          ) {
            title = "API limit reached";
          } else if (message.toLowerCase().includes("transcript")) {
            title = "Transcript unavailable";
          }

          navigate("/dashboard", {
            replace: true,
            state: {
              failedUrl: job.youtube_url ?? "",
              processError: {
                title,
                message,
              },
              processErrorNonce: Date.now(),
            },
          });
          return;
        }

        pollTimerId = window.setTimeout(() => {
          void pollJobUntilDone(jobId);
        }, 2000);
      } catch (error) {
        if (!active) {
          return;
        }

        navigate("/dashboard", {
          replace: true,
          state: {
            processError: {
              title: "Processing status failed",
              message: error?.message ?? "Unable to check generation status.",
            },
            processErrorNonce: Date.now(),
          },
        });
      }
    };

    const resolveActiveJobAndPoll = async () => {
      if (initialJobId) {
        await pollJobUntilDone(initialJobId);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/process-jobs/active`, {
          headers: {
            ...authHeader,
          },
        });

        if (!response.ok) {
          throw await toApiError(
            response,
            "Failed to load active generation job",
          );
        }

        const activeJob = await response.json();
        if (activeJob?.id) {
          await pollJobUntilDone(activeJob.id);
          return;
        }

        navigate("/dashboard", { replace: true });
      } catch (error) {
        if (!active) {
          return;
        }

        navigate("/dashboard", {
          replace: true,
          state: {
            processError: {
              title: "Processing status failed",
              message: error?.message ?? "Unable to check generation status.",
            },
            processErrorNonce: Date.now(),
          },
        });
      }
    };

    void resolveActiveJobAndPoll();

    return () => {
      active = false;
      if (pollTimerId) {
        window.clearTimeout(pollTimerId);
      }
    };
  }, [authHeader, initialJobId, navigate]);

  return (
    <DashboardSidebarLayout
      pageTitle="Processing Video"
      videos={videosCache}
      historyLoading={false}
      historyItemLoadingId={null}
    >
      <AILoader text="Generating" />
    </DashboardSidebarLayout>
  );
}
export default function App() {
  return (
    <ToastHost>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardNewVideoRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/session"
          element={
            <ProtectedRoute>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute>
              <DashboardSettingsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/new"
          element={
            <ProtectedRoute>
              <DashboardNewVideoRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/processing"
          element={
            <ProtectedRoute>
              <DashboardProcessingRoute />
            </ProtectedRoute>
          }
        />
      </Routes>
    </ToastHost>
  );
}
