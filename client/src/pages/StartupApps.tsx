import { useState, useCallback, useEffect } from "react";
import { usePageTiming } from "@/lib/page-timing";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence, Reveal } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import {
  List, RefreshCw, AlertTriangle, History, ChevronDown, ChevronUp,
  Shield, MonitorSpeaker, Gamepad2, MessageSquare, Cloud, RefreshCcw,
  HelpCircle, Power, PowerOff, ChevronRight, Laptop2, Database, LayoutGrid,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StartupSource =
  | "registry-hkcu"
  | "registry-hklm"
  | "startup-folder-user"
  | "startup-folder-common"
  | "task-scheduler";

type StartupCategory =
  | "security"
  | "drivers"
  | "gaming"
  | "communication"
  | "cloud"
  | "updaters"
  | "system"
  | "unknown";

interface StartupEntry {
  id: string;
  name: string;
  publisher: string | null;
  executablePath: string | null;
  commandLine: string;
  source: StartupSource;
  enabled: boolean;
  fileExists: boolean;
  broken: boolean;
  category: StartupCategory;
  registryName?: string;
  taskPath?: string;
  folderPath?: string;
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CAT_META: Record<
  StartupCategory,
  { label: string; color: string; dot: string; icon: typeof Shield }
> = {
  security:      { label: "Security",      color: "bg-red-500/15 text-red-400 border-red-500/20",       dot: "bg-red-400",    icon: Shield },
  drivers:       { label: "Drivers",       color: "bg-blue-500/15 text-blue-400 border-blue-500/20",    dot: "bg-blue-400",   icon: MonitorSpeaker },
  gaming:        { label: "Gaming",        color: "bg-violet-500/15 text-violet-400 border-violet-500/20", dot: "bg-violet-400", icon: Gamepad2 },
  communication: { label: "Communication", color: "bg-green-500/15 text-green-400 border-green-500/20", dot: "bg-green-400",  icon: MessageSquare },
  cloud:         { label: "Cloud & Sync",  color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",    dot: "bg-cyan-400",   icon: Cloud },
  updaters:      { label: "Updaters",      color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400", icon: RefreshCcw },
  system:        { label: "System",        color: "bg-orange-500/15 text-orange-400 border-orange-500/20", dot: "bg-orange-400", icon: Laptop2 },
  unknown:       { label: "Unknown",       color: "bg-gray-500/15 text-gray-400 border-gray-500/20",    dot: "bg-gray-400",   icon: HelpCircle },
};

const SOURCE_LABELS: Record<StartupSource, string> = {
  "registry-hkcu":       "Registry (User)",
  "registry-hklm":       "Registry (System)",
  "startup-folder-user": "Startup Folder",
  "startup-folder-common": "Startup Folder (All)",
  "task-scheduler":      "Task Scheduler",
};

// ── Category auto-detection ───────────────────────────────────────────────────

const CATEGORY_RULES: Array<{ re: RegExp; cat: StartupCategory }> = [
  { re: /security|defender|antivirus|kaspersky|mcafee|norton|avast|avg|bitdefender|malwarebytes|eset|sophos|webroot|trend|cylance/i, cat: "security" },
  { re: /realtek|nvidia|amd.*driver|radeon|geforce|intel.*hd|corsair|logitech|steelseries|razer|hyperx|asus.*armoury|rog|msi.*dragon|synapse|icue|razure|g-hub|ghub|hub.*logitech/i, cat: "drivers" },
  { re: /steam|epic.?games|battle\.?net|blizzard|gog|xbox|ea.?desktop|origin|uplay|ubisoft|rockstar|bethesda|playnite|itch\.io|game.*bar/i, cat: "gaming" },
  { re: /discord|teams|slack|zoom|skype|whatsapp|telegram|signal|wechat|viber|hangouts|webex|meet\b/i, cat: "communication" },
  { re: /onedrive|dropbox|google.?drive|icloud|box\.?net|mega\.?sync|nextcloud|sugarsync|spideroak/i, cat: "cloud" },
  { re: /update|updater|update.*service|autoupdate|google.?update|java.?update|adobe.*update|scheduled.?update/i, cat: "updaters" },
  { re: /microsoft|windows|ctfmon|explorer|dwm|svchost|lsass|winlogon|taskmgr|regsvc/i, cat: "system" },
];

function detectCategory(entry: Pick<StartupEntry, "name" | "publisher" | "executablePath">): StartupCategory {
  const haystack = [entry.name, entry.publisher ?? "", entry.executablePath ?? ""].join(" ");
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(haystack)) return rule.cat;
  }
  return "unknown";
}

function enrichEntries(raw: Omit<StartupEntry, "category">[]): StartupEntry[] {
  return raw.map((e) => ({
    ...e,
    category: detectCategory(e),
  }));
}

// ── Electron helper ───────────────────────────────────────────────────────────

function eAPI() {
  return (window as any).electronAPI ?? null;
}

// ── Toggle button ─────────────────────────────────────────────────────────────

function ToggleButton({
  entry,
  onToggle,
  loading,
}: {
  entry: StartupEntry;
  onToggle: (enabled: boolean) => void;
  loading: boolean;
}) {
  if (entry.broken) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-red-400/70">
        <AlertTriangle className="size-3" />
        <span>Broken entry</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {loading && <RefreshCw className="size-3 text-muted-foreground/50 animate-spin" />}
      <button
        onClick={() => !loading && onToggle(!entry.enabled)}
        disabled={loading}
        data-testid={`toggle-${entry.id}`}
        className={cn(
          "relative w-9 h-5 rounded-full transition-all duration-200 focus:outline-none",
          entry.enabled
            ? "bg-green-500/80 hover:bg-green-500"
            : "bg-white/10 hover:bg-white/15",
          loading && "opacity-50 cursor-not-allowed"
        )}
        title={entry.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-all duration-200",
            entry.enabled
              ? "translate-x-[18px] bg-white"
              : "translate-x-0.5 bg-white/50"
          )}
        />
      </button>
      <span
        className={cn(
          "text-[10px] font-medium w-12",
          entry.enabled ? "text-green-400" : "text-white/30"
        )}
      >
        {entry.enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onToggle,
  loadingId,
}: {
  entry: StartupEntry;
  onToggle: (id: string, enabled: boolean) => void;
  loadingId: string | null;
}) {
  const cat = CAT_META[entry.category];
  const isLoading = loadingId === entry.id;
  const exeName = entry.executablePath
    ? entry.executablePath.split(/[/\\]/).pop()
    : null;

  return (
    <motion.div
      layout
      className={cn(
        "flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors",
        entry.broken
          ? "bg-red-500/4 border-red-500/15"
          : entry.enabled
            ? "bg-white/4 border-white/10 hover:bg-white/6"
            : "bg-white/2 border-white/6"
      )}
      data-testid={`entry-card-${entry.id}`}
    >
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-1.5 h-8 rounded-full flex-shrink-0",
            cat.dot,
            (!entry.enabled || entry.broken) && "opacity-20"
          )}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "font-medium text-sm",
                entry.enabled && !entry.broken ? "text-white" : "text-white/35"
              )}
            >
              {entry.name}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[9px] px-1.5 py-0 border", cat.color)}
            >
              {cat.label}
            </Badge>
            {entry.broken && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/20"
              >
                <AlertTriangle className="size-2.5 mr-1" />
                Missing file
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {entry.publisher && (
              <span className="text-[10px] text-muted-foreground/60 truncate max-w-[160px]">
                {entry.publisher}
              </span>
            )}
            {entry.publisher && exeName && (
              <span className="text-[9px] text-muted-foreground/25">·</span>
            )}
            {exeName && (
              <span className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-[200px]">
                {exeName}
              </span>
            )}
          </div>
          <div className="mt-1">
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full border",
                "bg-white/4 border-white/8 text-muted-foreground/40"
              )}
            >
              {SOURCE_LABELS[entry.source]}
            </span>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex-shrink-0">
        <ToggleButton
          entry={entry}
          onToggle={(enabled) => onToggle(entry.id, enabled)}
          loading={isLoading}
        />
      </div>
    </motion.div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  entries,
  onToggle,
  loadingId,
}: {
  category: StartupCategory;
  entries: StartupEntry[];
  onToggle: (id: string, enabled: boolean) => void;
  loadingId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const cat = CAT_META[category];
  const CatIcon = cat.icon;
  const enabledCount = entries.filter((e) => e.enabled && !e.broken).length;
  const brokenCount = entries.filter((e) => e.broken).length;

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors"
        onClick={() => setOpen((p) => !p)}
        data-testid={`category-section-${category}`}
      >
        <div className="flex items-center gap-3">
          <CatIcon className={cn("size-3.5", cat.color.split(" ")[1])} />
          <span className={cn("text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border", cat.color)}>
            {cat.label}
          </span>
          <span className="text-xs text-muted-foreground/60">
            {enabledCount}/{entries.length} active
          </span>
          {brokenCount > 0 && (
            <span className="text-[10px] text-red-400/60">
              {brokenCount} broken
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1">
            {entries.slice(0, 8).map((e) => (
              <div
                key={e.id}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  e.broken
                    ? "bg-red-400/50"
                    : e.enabled
                      ? cat.dot
                      : "bg-white/12"
                )}
                title={`${e.name}: ${e.enabled ? "enabled" : "disabled"}${e.broken ? " (broken)" : ""}`}
              />
            ))}
            {entries.length > 8 && (
              <span className="text-[9px] text-muted-foreground/30">+{entries.length - 8}</span>
            )}
          </div>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground/40" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 space-y-2 border-t border-white/6">
              {entries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onToggle={onToggle}
                  loadingId={loadingId}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Requires Electron banner ──────────────────────────────────────────────────

function RequiresElectronBanner() {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-white/6 border border-white/10 flex items-center justify-center">
          <Laptop2 className="size-5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-white/70">Desktop app required</p>
          <p className="text-xs text-muted-foreground/50 mt-1 max-w-xs mx-auto">
            Startup scanning reads directly from your Windows registry and file system.
            Open SwitchControl on your Windows PC to manage startup apps.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-white/6 border border-white/10 flex items-center justify-center">
          <LayoutGrid className="size-5 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-white/70">No startup apps detected</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            No entries were found in your startup registry, startup folders, or Task Scheduler.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          data-testid="button-refresh-empty"
        >
          <RefreshCw className="size-3.5 mr-1.5" />
          Scan again
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: StartupCategory[] = [
  "security", "system", "drivers", "gaming", "communication", "cloud", "updaters", "unknown",
];

export default function StartupApps() {
  const { mark: timingMark } = usePageTiming("StartupApps");
  const { toast } = useToast();

  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [requiresElectron, setRequiresElectron] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Scan ──────────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    const api = eAPI();
    if (!api?.startup?.scan) {
      setRequiresElectron(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setScanError(null);
    timingMark("startup-scan");

    try {
      const result = await api.startup.scan();
      timingMark("startup-scan-done");

      if (!result.ok) {
        setScanError(result.error ?? "Scan failed");
        setEntries([]);
        return;
      }

      const rawEntries: Omit<StartupEntry, "category">[] = result.entries ?? [];
      setEntries(enrichEntries(rawEntries));
    } catch (e: any) {
      setScanError(e.message ?? "Unexpected error");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/startup/history");
      const data = await res.json();
      if (data.ok) setHistory(data.history ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  // ── Toggle entry ──────────────────────────────────────────────────────────
  const toggleEntry = useCallback(
    async (id: string, enabled: boolean) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;

      // Optimistic update
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, enabled } : e))
      );
      setLoadingId(id);

      try {
        const api = eAPI();
        if (api?.startup?.setEnabled) {
          const result = await api.startup.setEnabled({
            source: entry.source,
            registryName: entry.registryName,
            taskPath: entry.taskPath,
            folderPath: entry.folderPath,
            enabled,
          });
          if (!result?.ok) throw new Error(result?.error ?? "Toggle failed");
        }

        // Log to server for history
        await fetch(`/api/startup/apps/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: entry.name, source: entry.source, enabled }),
        }).catch(() => {});

        toast({
          title: `${entry.name} ${enabled ? "enabled" : "disabled"}`,
          description: enabled
            ? "Will run at next boot."
            : "Will not run at next boot.",
        });
      } catch (e: any) {
        // Revert
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, enabled: !enabled } : e))
        );
        toast({
          title: "Action failed",
          description: e.message,
          variant: "destructive",
        });
      } finally {
        setLoadingId(null);
      }
    },
    [entries, toast]
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    entries: entries.filter((e) => e.category === cat),
  })).filter((g) => g.entries.length > 0);

  const totalCount = entries.length;
  const enabledCount = entries.filter((e) => e.enabled && !e.broken).length;
  const disabledCount = entries.filter((e) => !e.enabled).length;
  const brokenCount = entries.filter((e) => e.broken).length;

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          icon={List}
          title="Startup Manager"
          subtitle="Shows only apps actually configured to run on your Windows PC at startup — scanned live from your registry, startup folders, and Task Scheduler."
          actions={
            <div className="flex gap-2">
              {!requiresElectron && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowHistory((p) => !p);
                      if (!showHistory) fetchHistory();
                    }}
                    data-testid="button-history"
                  >
                    <History className="size-3.5 mr-1.5" />
                    History
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={scan}
                    disabled={loading}
                    data-testid="button-refresh"
                  >
                    <RefreshCw className={cn("size-3.5 mr-1.5", loading && "animate-spin")} />
                    Refresh
                  </Button>
                </>
              )}
            </div>
          }
        />

        {/* ── Requires Electron ──────────────────────────────────────────── */}
        {requiresElectron && <RequiresElectronBanner />}

        {/* ── Scan error ─────────────────────────────────────────────────── */}
        {scanError && !requiresElectron && (
          <Card className="bg-red-500/5 border-red-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="size-4 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm text-red-400 font-medium">Scan failed</p>
                <p className="text-xs text-red-400/60 mt-0.5">{scanError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={scan}
                className="ml-auto border-red-500/30 text-red-400 hover:bg-red-500/10"
                data-testid="button-retry-scan"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Metrics ────────────────────────────────────────────────────── */}
        {!requiresElectron && !loading && entries.length > 0 && (
          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {[
              {
                icon: Database,
                color: "text-white/60",
                value: totalCount,
                label: "Total entries",
                sub: "from Windows sources",
              },
              {
                icon: Power,
                color: "text-green-400",
                value: enabledCount,
                label: "Enabled",
                sub: "will run at boot",
              },
              {
                icon: PowerOff,
                color: "text-white/30",
                value: disabledCount,
                label: "Disabled",
                sub: "won't run at boot",
              },
              {
                icon: AlertTriangle,
                color: brokenCount > 0 ? "text-red-400" : "text-white/20",
                value: brokenCount,
                label: "Broken",
                sub: "missing executable",
              },
            ].map(({ icon: Icon, color, value, label, sub }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <Card className="bg-card/40 border-border/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className={cn("size-5 flex-shrink-0", color)} />
                    <div>
                      <p className="text-xl font-bold text-white tabular-nums">{value}</p>
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <p className="text-[9px] text-muted-foreground/40">{sub}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ── Entries ────────────────────────────────────────────────────── */}
        {!requiresElectron && (
          <Reveal delay={0.08}>
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[72px] rounded-xl border border-white/8 bg-card/30 animate-pulse"
                  />
                ))
              ) : entries.length === 0 && !scanError ? (
                <EmptyState onRefresh={scan} />
              ) : (
                grouped.map(({ category, entries: catEntries }) => (
                  <CategorySection
                    key={category}
                    category={category}
                    entries={catEntries}
                    onToggle={toggleEntry}
                    loadingId={loadingId}
                  />
                ))
              )}
            </div>
          </Reveal>
        )}

        {/* ── History ────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28 }}
            >
              <Reveal delay={0.1}>
                <Card className="bg-card/40 border-border/50">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-white/80 flex items-center gap-2">
                      <History className="size-4 text-muted-foreground" />
                      Change History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {history.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">
                        No changes recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {history.map((h, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-xs py-1.5 border-b border-white/5 last:border-0"
                            data-testid={`history-row-${i}`}
                          >
                            <span className="text-muted-foreground/40 font-mono text-[10px] w-20 flex-shrink-0">
                              {new Date(h.changed_at).toLocaleTimeString()}
                            </span>
                            <span className="text-white/70 font-medium min-w-0 truncate">
                              {h.entry_name}
                            </span>
                            <ChevronRight className="size-3 text-muted-foreground/25 flex-shrink-0" />
                            <span
                              className={cn(
                                "font-semibold flex-shrink-0 text-[11px]",
                                h.enabled ? "text-green-400" : "text-white/30"
                              )}
                            >
                              {h.enabled ? "Enabled" : "Disabled"}
                            </span>
                            <span className="text-[9px] text-muted-foreground/30 flex-shrink-0 ml-auto">
                              {SOURCE_LABELS[h.source as StartupSource] ?? h.source}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Reveal>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
