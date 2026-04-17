import { Link, useLocation, useNavigate } from "react-router-dom";
import { Film, Home, KeyRound, LoaderCircle, LogOut, PlusSquare } from "lucide-react";
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
import { useSession } from "@/lib/session-context";

export function DashboardSidebarLayout({
  pageTitle,
  videos,
  historyLoading,
  historyItemLoadingId,
  children,
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useSession();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-zinc-800 bg-zinc-950 text-zinc-100">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950">
                    <Film className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">VideoMind</span>
                    <span className="truncate text-xs text-zinc-400">AI Video Workspace</span>
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
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard/session"} tooltip="Session">
                    <Link to="/dashboard/session">
                      <Home />
                      <span>Session</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard/settings"} tooltip="API Settings">
                    <Link to="/dashboard/settings">
                      <KeyRound />
                      <span>API Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/dashboard" || pathname === "/dashboard/new"} tooltip="New Video">
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
              {historyLoading ? <p className="px-2 text-xs text-zinc-500">Loading history...</p> : null}
              {!historyLoading && videos.length === 0 ? (
                <p className="px-2 text-xs text-zinc-500">No videos yet.</p>
              ) : null}
              <SidebarMenu className="rounded-md border border-zinc-800 bg-zinc-900/70">
                {videos.slice(0, 10).map((video, index) => (
                  <SidebarMenuItem key={video.id} className={index > 0 ? "border-t border-zinc-800" : ""}>
                    <SidebarMenuButton
                      tooltip={video.video_title || video.youtube_url}
                      onClick={() =>
                        navigate("/dashboard/session", {
                          state: { resumeVideoId: video.id, resumeNonce: Date.now() },
                        })
                      }
                      className="h-auto min-h-11 rounded-none px-2 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {historyItemLoadingId === video.id ? <LoaderCircle className="size-3 animate-spin" /> : null}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-zinc-100">{video.video_title || "Untitled video"}</p>
                          <p className="truncate text-[10px] text-zinc-500">{video.channel_name || video.youtube_url}</p>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <img
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=80&q=80"
                alt="Profile"
                className="h-9 w-9 rounded-full object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.user_metadata?.username ?? "VideoMind User"}</p>
                <p className="truncate text-xs text-zinc-500">{user?.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 hover:bg-zinc-900"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:px-6">
          <SidebarTrigger className="border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800" />
          <div>
            <p className="text-sm font-semibold tracking-wide text-zinc-400">VideoMind</p>
            <h1 className="text-base font-medium text-zinc-100 md:text-lg">{pageTitle}</h1>
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
