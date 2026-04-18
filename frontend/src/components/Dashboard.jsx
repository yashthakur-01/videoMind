import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ChevronDown,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
} from "lucide-react";
import { Carousel } from "@ark-ui/react/carousel";
import { DashboardSidebarLayout } from "./DashboardSidebarLayout";
import { AIPrompt } from "@/components/ui/animated-ai-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShiningText } from "@/components/ui/shining-text";
import { cn } from "@/lib/utils";

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

function parseSectionStart(section) {
  if (typeof section?.start_seconds === "number") {
    return section.start_seconds;
  }
  const value = String(section?.start_time ?? "").trim();
  if (!value) {
    return 0;
  }
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((item) => Number.isNaN(item))) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

function buildEmbedUrlWithStart(embedUrl, startSeconds) {
  if (!embedUrl) {
    return "";
  }
  try {
    const parsed = new URL(embedUrl);
    parsed.searchParams.set(
      "start",
      String(Math.max(0, Math.floor(startSeconds))),
    );
    return parsed.toString();
  } catch {
    const separator = embedUrl.includes("?") ? "&" : "?";
    return `${embedUrl}${separator}start=${Math.max(0, Math.floor(startSeconds))}`;
  }
}

export function Dashboard({
  onAsk,
  onDeleteVideo,
  selectedSectionForChat,
  onSelectSectionForChat,
  onAskFromSection,
  currentVideo,
  sections,
  chatLoading,
  chatMessages,
  videos,
  historyLoading,
  historyItemLoadingId,
  historyDeleteLoadingId,
  onRegenerateSections,
  regeneratingSections,
  chatCollapsed,
  onToggleChatCollapsed,
}) {
  const chatScrollContainerRef = useRef(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [seekStartSeconds, setSeekStartSeconds] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  useEffect(() => {
    setSelectedSectionId(null);
    setSeekStartSeconds(0);
  }, [currentVideo?.id]);

  const iframeSrc = useMemo(() => {
    const base = currentVideo?.embed_url;
    if (!base) {
      return "";
    }
    return buildEmbedUrlWithStart(base, seekStartSeconds);
  }, [currentVideo?.embed_url, seekStartSeconds]);

  const selectedSectionTitleForChat = useMemo(() => {
    if (!selectedSectionForChat) {
      return "No section selected";
    }
    return (
      sections.find((section) => section.id === selectedSectionForChat)
        ?.title ?? "No section selected"
    );
  }, [sections, selectedSectionForChat]);

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    });
    setShowScrollToBottom(false);
  }, [chatMessages]);

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (!container) {
      return;
    }

    const updateScrollState = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 24);
    };

    updateScrollState();
    container.addEventListener("scroll", updateScrollState, { passive: true });

    return () => {
      container.removeEventListener("scroll", updateScrollState);
    };
  }, []);

  return (
    <DashboardSidebarLayout
      pageTitle={currentVideo?.video_title || "Video Session"}
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={historyItemLoadingId}
      historyDeleteLoadingId={historyDeleteLoadingId}
      onDeleteVideo={onDeleteVideo}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onToggleChatCollapsed}
          className="absolute right-3 top-3 z-30 inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/90 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800"
        >
          {chatCollapsed ? (
            <PanelRightOpen size={14} />
          ) : (
            <PanelRightClose size={14} />
          )}
          {chatCollapsed ? "Open Chat" : "Collapse Chat"}
        </button>

        <div
          className={cn(
            "grid grid-cols-1 gap-4 xl:h-[calc(100vh-140px)] xl:items-stretch xl:overflow-hidden",
            chatCollapsed ? "xl:grid-cols-1" : "xl:grid-cols-5",
          )}
        >
          <div
            className={cn(
              chatCollapsed
                ? "grid grid-cols-1 gap-4 xl:grid-cols-5 xl:h-full xl:items-stretch xl:pr-1"
                : "space-y-4 xl:col-span-3 xl:overflow-y-auto xl:pr-1",
            )}
          >
            <section
              className={cn(
                "rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))] p-4 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl",
                chatCollapsed &&
                  "xl:col-span-3 xl:flex xl:h-full xl:flex-col xl:justify-center",
              )}
            >
              {currentVideo ? (
                <>
                  {currentVideo.embed_url ? (
                    <div className="mx-auto w-full overflow-hidden rounded-xl border border-white/25 bg-zinc-950/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                      <iframe
                        key={`${currentVideo.id}-${seekStartSeconds}`}
                        src={iframeSrc}
                        title={currentVideo.video_title || "YouTube video"}
                        className="aspect-video w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Embed unavailable for this video.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
                  Select a video from history, or start a new one from the New
                  Video page.
                </div>
              )}
            </section>

            <section
              className={cn(
                "rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))] p-4 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl",
                chatCollapsed && "xl:col-span-2 xl:flex xl:h-full xl:flex-col",
              )}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-100">
                  Generated Sections
                </h2>
                {currentVideo && sections.length === 0 ? (
                  <button
                    type="button"
                    onClick={onRegenerateSections}
                    disabled={regeneratingSections}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
                  >
                    {regeneratingSections ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    {regeneratingSections
                      ? "Regenerating..."
                      : "Regenerate Sections"}
                  </button>
                ) : null}
              </div>
              <div
                className={cn(
                  "overflow-hidden",
                  chatCollapsed
                    ? "flex flex-1 flex-col justify-center overflow-hidden"
                    : "",
                )}
              >
                {sections.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    No generated sections yet.
                    {currentVideo
                      ? " You can use Regenerate Sections to retry."
                      : ""}
                  </p>
                ) : null}
                {sections.length > 0 ? (
                  <Carousel.Root
                    defaultPage={0}
                    slideCount={sections.length}
                    orientation="horizontal"
                    className={cn(
                      "w-full",
                      chatCollapsed ? "max-h-[520px]" : "",
                    )}
                  >
                    <Carousel.Control className="mb-3 flex items-center justify-between">
                      <Carousel.PrevTrigger className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800">
                        Previous
                      </Carousel.PrevTrigger>
                      <Carousel.NextTrigger className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800">
                        Next
                      </Carousel.NextTrigger>
                    </Carousel.Control>

                    <Carousel.ItemGroup
                      className={cn(
                        "overflow-hidden",
                        chatCollapsed ? "min-h-[220px]" : "min-h-[220px]",
                      )}
                    >
                      {sections.map((section, index) => {
                        const startTime =
                          section.start_time ??
                          formatTimestamp(section.start_seconds);
                        const endTime =
                          section.end_time ??
                          formatTimestamp(section.end_seconds);
                        const active = selectedSectionId === section.id;
                        return (
                          <Carousel.Item
                            key={section.id}
                            index={index}
                            className="p-1"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSectionId(section.id);
                                setSeekStartSeconds(parseSectionStart(section));
                              }}
                              className={cn(
                                "group relative h-full w-full overflow-hidden rounded-2xl border p-4 text-left backdrop-blur-xl transition duration-300",
                                "bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                                "hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_14px_36px_rgba(34,211,238,0.22)]",
                                active
                                  ? "border-cyan-300/80 ring-1 ring-cyan-300/50 shadow-[0_16px_42px_rgba(34,211,238,0.28)]"
                                  : "border-white/25",
                              )}
                            >
                              <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-300/20 blur-2xl" />
                              <span className="pointer-events-none absolute -left-10 bottom-0 h-20 w-20 rounded-full bg-indigo-400/20 blur-2xl" />
                              <div className="relative z-10 mb-2 flex items-center justify-between gap-2">
                                <span className="rounded-full border border-white/35 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-200">
                                  {startTime} - {endTime}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide text-cyan-200/90 opacity-0 transition-opacity group-hover:opacity-100">
                                  Jump to section
                                </span>
                              </div>
                              <p className="relative z-10 text-sm font-semibold leading-snug text-zinc-50">
                                {section.title}
                              </p>
                              <p
                                className={cn(
                                  "mt-2 text-sm text-zinc-300",
                                  chatCollapsed
                                    ? "line-clamp-none"
                                    : "line-clamp-5",
                                )}
                              >
                                {section.summary}
                              </p>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedSectionId(section.id);
                                  setSeekStartSeconds(
                                    parseSectionStart(section),
                                  );
                                  onAskFromSection(section.id);
                                }}
                                className="relative z-10 mt-3 inline-flex items-center rounded-md border border-white/35 bg-white/10 px-2 py-1 text-xs text-zinc-100 hover:bg-white/15"
                              >
                                Ask question
                              </button>
                            </button>
                          </Carousel.Item>
                        );
                      })}
                    </Carousel.ItemGroup>

                    <Carousel.IndicatorGroup className="mt-3 flex items-center justify-center gap-2">
                      {sections.map((section, index) => (
                        <Carousel.Indicator
                          key={section.id}
                          index={index}
                          className="h-2 w-2 cursor-pointer rounded-full bg-zinc-600 transition-colors data-[current]:bg-cyan-300"
                        />
                      ))}
                    </Carousel.IndicatorGroup>
                  </Carousel.Root>
                ) : null}
              </div>
            </section>
          </div>

          <section
            className={cn(
              "relative flex min-h-[520px] flex-col rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))] p-4 shadow-[0_10px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:col-span-2 xl:h-full",
              chatCollapsed && "hidden",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-100">
                Interactive Chat
              </h2>
            </div>
            <div
              ref={chatScrollContainerRef}
              className="flex-1 space-y-3 overflow-y-auto pr-1"
            >
              {chatMessages.map((message, index) => (
                <motion.div
                  key={`${message.role}-${index}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-3 text-sm ${message.role === "user" ? "border border-zinc-600 bg-zinc-800 text-zinc-100" : "bg-zinc-950 text-zinc-300"}`}
                >
                  <p>
                    {message.content}
                    {message.streaming ? (
                      <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-zinc-300 align-middle" />
                    ) : null}
                  </p>
                  {message.sources?.length ? (
                    <div className="mt-2 text-xs text-zinc-400">
                      Sources: {message.sources.join(", ")}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </div>
            <div className="relative mt-3 space-y-2">
              {showScrollToBottom ? (
                <button
                  type="button"
                  onClick={() => {
                    const container = chatScrollContainerRef.current;
                    if (!container) {
                      return;
                    }
                    container.scrollTo({
                      top: container.scrollHeight,
                      behavior: "smooth",
                    });
                    setShowScrollToBottom(false);
                  }}
                  className="absolute -top-12 right-0 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-zinc-900/85 text-zinc-100 shadow-[0_10px_24px_rgba(0,0,0,0.35)] hover:bg-zinc-800"
                  aria-label="Scroll chat to bottom"
                  title="Jump to latest message"
                >
                  <ArrowDown size={16} />
                </button>
              ) : null}
              {chatLoading ? <ShiningText text="Thinking..." /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between border-white/25 bg-white/10 text-zinc-100 hover:bg-white/15"
                  >
                    {selectedSectionTitleForChat}
                    <ChevronDown className="opacity-70" size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-[--radix-dropdown-menu-trigger-width] border-white/20 bg-zinc-950/95 text-zinc-100"
                >
                  <DropdownMenuItem
                    onSelect={() => onSelectSectionForChat(null)}
                  >
                    No section selected
                  </DropdownMenuItem>
                  {sections.map((section) => (
                    <DropdownMenuItem
                      key={section.id}
                      onSelect={() => onSelectSectionForChat(section.id)}
                    >
                      {section.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <AIPrompt
                disabled={chatLoading}
                onSubmit={(message) => onAsk(message, selectedSectionForChat)}
                placeholder="Ask about this video"
              />
            </div>
          </section>
        </div>
      </div>
    </DashboardSidebarLayout>
  );
}
