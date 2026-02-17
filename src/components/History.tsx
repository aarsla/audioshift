import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Search, Copy, Trash2, Check, X, FileText, FolderOpen, TriangleAlert, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
  app_name: string | null;
  window_title: string | null;
  char_count: number;
  dir_path: string | null;
  duration_ms: number;
  processing_time_ms: number;
  model_id: string;
  language: string | null;
  translate: boolean;
  app_version: string;
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getTitle(entry: HistoryEntry): string {
  const text = entry.text.trim();
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 60) return firstSentence;
  return firstSentence.slice(0, 57) + "...";
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i);
  const pages: (number | "ellipsis")[] = [0];
  if (current > 2) pages.push("ellipsis");
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 3) pages.push("ellipsis");
  pages.push(total - 1);
  return pages;
}

export default function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday">(() => {
    const stored = localStorage.getItem("historyDateFilter");
    return stored === "today" || stored === "yesterday" ? stored : "all";
  });
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem("historySidebarOpen") !== "false";
  });
  const PAGE_SIZE = 15;

  const loadEntries = async () => {
    try {
      const data = await invoke<HistoryEntry[]>("get_history");
      setEntries(data);
      setError(null);
    } catch (e) {
      setEntries([]);
      setError(String(e));
    }
  };

  useEffect(() => {
    loadEntries();
    const unlisten = listen("history-updated", () => {
      loadEntries();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Recheck on window focus (e.g. after granting Documents access)
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) loadEntries();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const filtered = useMemo(() => {
    let result = entries;

    if (dateFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);
      if (dateFilter === "today") {
        result = result.filter((e) => e.timestamp >= today.getTime());
      } else {
        result = result.filter((e) => e.timestamp >= yesterday.getTime() && e.timestamp < today.getTime());
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.text.toLowerCase().includes(q) ||
          (e.app_name && e.app_name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, search, dateFilter]);

  useEffect(() => { setPage(0); }, [search, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    let currentLabel = "";
    for (const entry of paged) {
      const label = getDateGroup(entry.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [entry] });
      } else {
        groups[groups.length - 1].entries.push(entry);
      }
    }
    return groups;
  }, [paged]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_history_entry", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  };

  const handleClearAll = async () => {
    try {
      await invoke("clear_history");
      setEntries([]);
      setSelectedId(null);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={(open) => {
        setSidebarOpen(open);
        localStorage.setItem("historySidebarOpen", String(open));
      }}
      className="h-full !min-h-0"
    >
      <Sidebar variant="floating" collapsible="offcanvas" className="border-r-0">
        <SidebarHeader className="gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search transcriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
            {([["today", "Today"], ["yesterday", "Yesterday"], ["all", "All"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setDateFilter(id); localStorage.setItem("historyDateFilter", id); }}
                className={`flex-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                  dateFilter === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {error && (
            <div className="mx-3 mb-1 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-2">
                <TriangleAlert size={14} className="text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-destructive">Documents access required</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    AudioShift needs access to your Documents folder to save and view transcription history.
                  </p>
                  <button
                    onClick={() => invoke("open_privacy_settings", { pane: "files-and-folders" })}
                    className="text-[11px] font-medium text-destructive hover:underline"
                  >
                    Grant Access
                  </button>
                </div>
              </div>
            </div>
          )}

          {filtered.length === 0 && !error ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {entries.length === 0
                  ? "No transcriptions yet"
                  : "No results found"}
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <SidebarGroup key={group.label} className="py-0">
                <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {group.entries.map((entry) => (
                    <SidebarMenuItem key={entry.id}>
                      <SidebarMenuButton
                        isActive={selectedId === entry.id}
                        onClick={() => setSelectedId(entry.id)}
                        className="h-auto py-1.5 items-start"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium truncate">
                              {getTitle(entry)}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatTime(entry.timestamp)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {entry.app_name && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {entry.app_name}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/50">
                              {entry.char_count} chars
                            </span>
                          </div>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))
          )}
        </SidebarContent>

        <SidebarFooter>
          <Pagination className="mx-0 w-auto">
            <PaginationContent className="gap-0.5">
              <PaginationItem>
                <PaginationPrevious
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(0, p - 1)); }}
                  className={`h-7 w-7 p-0 [&>span]:hidden [&>svg]:size-3.5 ${page === 0 ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                  size="icon"
                />
              </PaginationItem>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <PaginationItem key={`e${i}`}>
                    <PaginationEllipsis className="h-7 w-7 [&>svg]:size-3.5" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={(e) => { e.preventDefault(); setPage(p); }}
                      className="h-7 w-7 text-xs cursor-pointer"
                      size="icon"
                    >
                      {p + 1}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}
              <PaginationItem>
                <PaginationNext
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages - 1, p + 1)); }}
                  className={`h-7 w-7 p-0 [&>span]:hidden [&>svg]:size-3.5 ${page >= totalPages - 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                  size="icon"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
            {entries.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    Clear All
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {entries.length} {entries.length === 1 ? "transcription" : "transcriptions"} and their audio recordings. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearAll}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4" data-tauri-drag-region>
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Clock size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">History</span>
        </header>

        <div className="flex-1 min-h-0">
          {selected ? (
            <ScrollArea className="h-full">
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium text-foreground">
                      {formatFullDate(selected.timestamp)}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selected.app_name || "Unknown App"}
                      {selected.window_title && ` — ${selected.window_title}`}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md
                                   border border-destructive/30 text-destructive
                                   hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete transcription?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this transcription and its audio recording. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(selected.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <Separator />

                {/* Text */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Transcribed Text
                    </h3>
                    <button
                      onClick={() => handleCopy(selected.text)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md
                                 bg-secondary border border-border hover:bg-accent
                                 text-muted-foreground transition-colors"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {selected.text}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Details
                  </h3>
                  <div className="bg-card border border-border rounded-lg divide-y divide-border">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Application</span>
                      <span className="text-xs text-foreground">{selected.app_name || "Unknown"}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Window</span>
                      <span className="text-xs text-foreground truncate ml-4 max-w-[200px]">
                        {selected.window_title || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Characters</span>
                      <span className="text-xs text-foreground">{selected.char_count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Duration</span>
                      <span className="text-xs text-foreground">
                        {selected.duration_ms >= 1000
                          ? `${(selected.duration_ms / 1000).toFixed(1)}s`
                          : `${selected.duration_ms}ms`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Processing Time</span>
                      <span className="text-xs text-foreground">
                        {selected.processing_time_ms >= 1000
                          ? `${(selected.processing_time_ms / 1000).toFixed(1)}s`
                          : `${selected.processing_time_ms}ms`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Model</span>
                      <span className="text-xs text-foreground">{selected.model_id}</span>
                    </div>
                    {selected.language && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">Language</span>
                        <span className="text-xs text-foreground">
                          {selected.language}{selected.translate ? " → English" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Files */}
                {selected.dir_path && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Files
                    </h3>
                    <div className="bg-card border border-border rounded-lg divide-y divide-border">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">Audio Recording</span>
                        <button
                          onClick={() => revealItemInDir(selected.dir_path + "/output.wav")}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md
                                     bg-secondary border border-border hover:bg-accent
                                     text-muted-foreground transition-colors"
                        >
                          <FolderOpen size={12} />
                          {navigator.userAgent.includes("Mac") ? "Show in Finder" : "Show in Explorer"}
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">Transcript</span>
                        <button
                          onClick={() => revealItemInDir(selected.dir_path + "/meta.json")}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md
                                     bg-secondary border border-border hover:bg-accent
                                     text-muted-foreground transition-colors"
                        >
                          <FolderOpen size={12} />
                          {navigator.userAgent.includes("Mac") ? "Show in Finder" : "Show in Explorer"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </ScrollArea>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {error ? (
                  <TriangleAlert size={20} className="text-destructive" />
                ) : (
                  <FileText size={20} className="text-muted-foreground" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {error
                    ? "Cannot access history"
                    : entries.length === 0
                      ? "No transcriptions yet"
                      : "No transcription selected"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {error
                    ? "Grant Documents access to view transcription history"
                    : entries.length === 0
                      ? "Transcriptions will appear here"
                      : "Select a transcription to view details"}
                </p>
                {error && (
                  <button
                    onClick={() => invoke("open_privacy_settings", { pane: "files-and-folders" })}
                    className="mt-2 px-3 py-1.5 text-xs rounded-md bg-secondary border border-border
                               hover:bg-accent text-foreground transition-colors"
                  >
                    Open System Settings
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
