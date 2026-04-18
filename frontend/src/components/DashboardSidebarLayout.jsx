import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  KeyRound,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  PlusSquare,
  Trash2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session-context";
import appLogo from "../../resource/logo.png";

export function DashboardSidebarLayout({
  pageTitle,
  videos,
  historyLoading,
  historyItemLoadingId,
  historyDeleteLoadingId,
  onDeleteVideo,
  children,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useSession();
  const rawName =
    user?.user_metadata?.username ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email ??
    "VideoMind User";
  const displayName = String(rawName).trim() || "VideoMind User";
  const avatarUrl =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "VM";

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="border-r border-zinc-800 bg-zinc-950 text-zinc-100"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <img
                    src={appLogo}
                    alt="VideoMind logo"
                    className="h-28 w-28 object-contain group-data-[collapsible=icon]:hidden"
                  />
                  <div className="hidden h-24 w-24 items-center justify-center rounded-md border border-white/30 bg-white/10 text-2xl font-semibold text-zinc-100 group-data-[collapsible=icon]:flex">
                    VM
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/dashboard/settings"}
                    tooltip="API Settings"
                  >
                    <Link to="/dashboard/settings">
                      <KeyRound />
                      <span>API Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === "/dashboard" || pathname === "/dashboard/new"
                    }
                    tooltip="New Video"
                  >
                    <Link to="/dashboard">
                      <PlusSquare />
                      <span>New Video</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Video History</SidebarGroupLabel>
            <SidebarGroupContent>
              {historyLoading ? (
                <p className="px-2 text-xs text-zinc-500">Loading history...</p>
              ) : null}
              {!historyLoading && videos.length === 0 ? (
                <p className="px-2 text-xs text-zinc-500">No videos yet.</p>
              ) : null}
              <SidebarMenu className="rounded-xl border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-lg">
                {videos.slice(0, 10).map((video, index) => (
                  <SidebarMenuItem
                    key={video.id}
                    className={index > 0 ? "mt-1" : ""}
                  >
                    <div className="group/history relative">
                      <SidebarMenuButton
                        tooltip={video.video_title || video.youtube_url}
                        onClick={() =>
                          navigate("/dashboard/session", {
                            state: {
                              resumeVideoId: video.id,
                              resumeNonce: Date.now(),
                            },
                          })
                        }
                        disabled={historyDeleteLoadingId === video.id}
                        className="h-auto min-h-11 w-full rounded-lg border border-transparent px-2 py-2 pr-10 hover:border-white/30 hover:bg-white/10"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {historyItemLoadingId === video.id ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-100">
                              {video.video_title || "Untitled video"}
                            </p>
                            <p className="truncate text-[10px] text-zinc-500">
                              {video.channel_name || video.youtube_url}
                            </p>
                          </div>
                        </div>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="absolute right-1 top-1/2 z-30 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-white/20 bg-white/10 text-zinc-200 opacity-0 transition-opacity hover:bg-white/15 group-hover/history:opacity-100 focus:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
                            title="Open history item actions"
                            aria-label={`Actions for ${video.video_title || "video"}`}
                            disabled={historyDeleteLoadingId === video.id}
                          >
                            {historyDeleteLoadingId === video.id ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-3.5" />
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-white/20 bg-zinc-950/95 text-zinc-100"
                        >
                          <DropdownMenuItem
                            disabled={
                              !onDeleteVideo ||
                              historyDeleteLoadingId === video.id
                            }
                            onSelect={() => onDeleteVideo?.(video.id)}
                            className="text-rose-300 focus:bg-rose-500/20 focus:text-rose-200"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="rounded-xl border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-lg group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-9 w-9 rounded-full border border-white/35 object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/10 text-xs font-semibold text-zinc-100"
                  aria-label="Profile placeholder"
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-zinc-500">{user?.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-2 py-1.5 text-xs text-zinc-100 hover:bg-white/15"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-zinc-950 text-zinc-100 font-sans">
        <header className="sticky top-0 z-10 mx-2 mt-2 flex items-center gap-3 rounded-xl border border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05))] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl md:mx-3 md:px-6">
          <SidebarTrigger className="border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide text-zinc-400">
              VideoMind
            </p>
            <h1 className="max-w-[70vw] truncate text-base font-medium text-zinc-100 md:text-lg">
              {pageTitle}
            </h1>
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
