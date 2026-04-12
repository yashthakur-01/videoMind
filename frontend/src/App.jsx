import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LandingPage } from "./components/LandingPage";
import { Dashboard } from "./components/Dashboard";
import { AuthModal } from "./components/AuthModal";
import { useSession } from "./lib/session-context";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function createAssistantPlaceholder() {
  return {
    role: "assistant",
    content: "",
    sources: [],
    streaming: true,
  };
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

function HomeRoute() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [authOpen, setAuthOpen] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <LandingPage
        onTryNow={() => {
          setAuthOpen(true);
        }}
      />
      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          if (user) navigate("/dashboard");
        }}
      />
    </>
  );
}

function DashboardRoute() {
  const { session } = useSession();
  const [sections, setSections] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
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

  const authHeader = useMemo(() => {
    if (!session?.access_token) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session]);

  const loadVideoHistory = async () => {
    if (!authHeader) {
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
      const activeProvider = payload.active_provider === "openai"
        ? "OpenAI"
        : "Gemini";
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
      const payload = await response.json();
      throw new Error(payload.detail ?? "Failed to save provider settings");
    }

    const payload = await response.json();
    const activeProvider = payload.active_provider === "openai"
      ? "OpenAI"
      : "Gemini";
    setProviderSettings({
      activeProvider,
      activeModel: payload.active_model,
      apiKeyInput: "",
      savedKeys: {
        OpenAI: payload.has_openai_key,
        Gemini: payload.has_gemini_key,
      },
    });
  };

  const onProcess = async ({ url }) => {
    if (!authHeader) {
      throw new Error("Missing auth session");
    }

    setProcessing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ youtube_url: url }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail ?? "Processing failed");
      }

      const payload = await response.json();
      setSections(payload.sections);
      setVideoId(payload.video_id);
      setChatMessages([
        {
          role: "assistant",
          content: "Processing complete. Ask me anything about this video.",
          sources: payload.sections.slice(0, 2).map((item) => item.start_time),
        },
      ]);
      await loadVideoHistory();
    } finally {
      setProcessing(false);
    }
  };

  const onAsk = async (question) => {
    if (!videoId || !authHeader) {
      return;
    }

    setChatMessages((current) => [...current, { role: "user", content: question }, createAssistantPlaceholder()]);
    setChatLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ query: question, video_id: videoId }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail ?? "Chat failed");
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
          throw new Error(payload.message ?? "Chat failed");
        },
      });
    } catch (error) {
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
        return [...current, { role: "assistant", content: error.message, sources: [], streaming: false }];
      });
    } finally {
      setChatLoading(false);
    }
  };

  const onResume = async (selectedVideoId) => {
    if (!authHeader) {
      return;
    }

    const response = await fetch(`${apiBaseUrl}/videos/${selectedVideoId}`, {
      headers: {
        ...authHeader,
      },
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.detail ?? "Failed to load video history");
    }

    const payload = await response.json();
    setVideoId(payload.video.id);
    setSections(payload.sections);
    setChatMessages(
      payload.chat_messages.map((message) => ({
        role: message.role,
        content: message.content,
        sources: message.sources ?? [],
        streaming: false,
      }))
    );
  };

  return (
    <Dashboard
      onProcess={onProcess}
      onAsk={onAsk}
      providerSettings={providerSettings}
      onProviderSettingsChange={setProviderSettings}
      onSaveProviderSettings={saveProviderSettings}
      settingsLoading={settingsLoading}
      sections={sections}
      processing={processing}
      chatLoading={chatLoading}
      chatMessages={chatMessages}
      videos={videos}
      historyLoading={historyLoading}
      onResume={onResume}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
