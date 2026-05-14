import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import {
  RefreshCw, Search, X, Package, Shield, ShieldOff, AlertTriangle,
  CheckCircle2, XCircle, Trash2, ChevronDown, ChevronUp, Monitor,
  ArrowUpDown, Lock, Zap, HardDrive, Info, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstalledApp {
  id:               string;
  name:             string;
  publisher:        string;
  version:          string;
  sizeMb:           number;
  installDate:      string;
  installLocation:  string;
  uninstallString:  string;
  quietUninstall:   string;
  windowsInstaller: boolean;
  registryKeyPath:  string;
  source:           string;
  isProtected:      boolean;
  canUninstall:     boolean;
  uninstallMethod:  "msi" | "exe" | "appx" | "none";
  trustLabel:       "microsoft" | "user-installed" | "system" | "protected" | "unknown";
}

type UninstallResult = {
  ok:              boolean;
  status:          string;
  methodUsed?:     string;
  executable?:     string;
  args?:           string;
  exitCode?:       number;
  requiresRestart?: boolean;
  verifiedRemoved?: boolean | null;
  errorDetail?:    string;
  error?:          string;
};

type AppResult = { kind: "removed" } | { kind: "restart-required" } | { kind: "failed"; detail: string } | { kind: "pending" };

type FilterType = "all" | "uninstallable" | "protected" | "microsoft" | "third-party" | "large";
type SortType   = "name" | "size-desc" | "publisher" | "uninstallable-first";

// ── Electron accessor helpers ─────────────────────────────────────────────────
type InstalledAppsAPI = {
  scan:      () => Promise<{ ok: boolean; apps: InstalledApp[]; scannedAt: string; error?: string }>;
  uninstall: (app: InstalledApp) => Promise<UninstallResult>;
};
function getInstalledAppsAPI(): InstalledAppsAPI | undefined {
  return (window as any).electronAPI?.installedApps as InstalledAppsAPI | undefined;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TRUST_CONFIG = {
  microsoft:      { label: "Microsoft",      cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",       icon: Monitor },
  "user-installed":{ label: "User Installed", cls: "bg-violet-500/15 text-violet-400 border-violet-500/25", icon: Package },
  system:         { label: "System",         cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",     icon: Shield },
  protected:      { label: "Protected",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: Lock },
  unknown:        { label: "Unknown",        cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",        icon: AlertTriangle },
};

const METHOD_CONFIG = {
  msi:  { label: "MSI",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  exe:  { label: "EXE",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  appx: { label: "AppX", cls: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
  none: { label: "None", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25" },
};

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all",            label: "All" },
  { id: "uninstallable",  label: "Uninstallable" },
  { id: "microsoft",      label: "Microsoft" },
  { id: "third-party",    label: "Third-party" },
  { id: "large",          label: "Large (>100MB)" },
  { id: "protected",      label: "Protected" },
];

const SORTS: { id: SortType; label: string }[] = [
  { id: "name",               label: "Name" },
  { id: "uninstallable-first",label: "Uninstallable first" },
  { id: "size-desc",          label: "Size (largest)" },
  { id: "publisher",          label: "Publisher" },
];

// ── Confirm dialog (ported to body so fixed positioning works inside any
//    transformed / scrolled ancestor) ──────────────────────────────────────────

function ConfirmDialog({
  app,
  onConfirm,
  onCancel,
}: {
  app: InstalledApp;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isUnknown = app.trustLabel === "unknown";
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Scroll lock + Escape close + focus confirm button on open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus confirm button after a short delay so screen readers catch the
    // newly-ported dialog
    const focusTimer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [onCancel]);

  const handleConfirm = () => {
    // eslint-disable-next-line no-console
    console.log(`[Debloat] uninstall confirmed appName=${app.name} method=${app.uninstallMethod}`);
    onConfirm();
  };

  return createPortal(
    <motion.div
      key={`confirm-${app.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#14181D] backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm"
      >
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 className="size-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Uninstall App</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{app.name}</p>
              {app.publisher && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{app.publisher}</p>}
            </div>
          </div>

          {isUnknown && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-400">
                Unknown publisher. Verify this app is safe to remove before continuing.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <Info className="size-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              This will run the app's uninstaller ({app.uninstallMethod?.toUpperCase()}).
              SwitchControl cannot undo this action.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9 text-sm"
              onClick={onCancel}
              data-testid="button-cancel-uninstall"
            >
              Cancel
            </Button>
            <Button
              ref={confirmBtnRef}
              variant="destructive"
              className="flex-1 h-9 text-sm gap-2"
              onClick={handleConfirm}
              data-testid="button-confirm-uninstall"
            >
              <Trash2 className="size-3.5" />Uninstall
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── App row ───────────────────────────────────────────────────────────────────

function AppRow({
  app,
  result,
  uninstallingId,
  onUninstall,
}: {
  app: InstalledApp;
  result?: AppResult;
  uninstallingId: string | null;
  onUninstall: (app: InstalledApp) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tCfg   = TRUST_CONFIG[app.trustLabel] ?? TRUST_CONFIG.unknown;
  const mCfg   = METHOD_CONFIG[app.uninstallMethod] ?? METHOD_CONFIG.none;
  const TrIcon = tCfg.icon;
  const isProcessing = uninstallingId === app.id;

  const installDateFormatted = useMemo(() => {
    if (!app.installDate || app.installDate.length < 8) return null;
    try {
      const y = app.installDate.slice(0, 4), m = app.installDate.slice(4, 6), d = app.installDate.slice(6, 8);
      return format(parseISO(`${y}-${m}-${d}`), "MMM d, yyyy");
    } catch { return app.installDate; }
  }, [app.installDate]);

  if (result?.kind === "removed") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] opacity-60">
        <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
        <span className="text-sm text-emerald-400">{app.name} — Uninstalled</span>
      </div>
    );
  }

  if (result?.kind === "restart-required") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] opacity-80">
        <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
        <span className="text-sm text-amber-400">{app.name} — Uninstalled (restart required)</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border border-white/[0.07] overflow-hidden transition-all",
      app.isProtected && "opacity-70",
      result?.kind === "failed" && "border-red-500/20 bg-red-500/[0.03]",
    )} data-testid={`app-row-${app.id}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-3 sm:p-3.5 hover:bg-white/[0.02] transition-colors">
        {/* Icon */}
        <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0 border", tCfg.cls)}>
          <TrIcon className="size-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate max-w-[200px] sm:max-w-xs">{app.name}</span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border shrink-0", tCfg.cls)}>
              {tCfg.label}
            </Badge>
            {app.uninstallMethod !== "none" && (
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border shrink-0", mCfg.cls)}>
                {mCfg.label}
              </Badge>
            )}
            {app.isProtected && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border border-emerald-500/25 text-emerald-400 bg-emerald-500/10 shrink-0 gap-1">
                <Lock className="size-2.5" />Protected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {app.publisher && <span className="text-[11px] text-muted-foreground">{app.publisher}</span>}
            {app.publisher && app.version && <span className="text-muted-foreground/40 text-[11px]">·</span>}
            {app.version && <span className="text-[11px] text-muted-foreground/60">{app.version}</span>}
            {app.sizeMb > 0 && (
              <>
                <span className="text-muted-foreground/40 text-[11px]">·</span>
                <span className="text-[11px] text-muted-foreground/60">{app.sizeMb} MB</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {result?.kind === "failed" && (
            <span
              className="text-[11px] text-red-400 flex items-center gap-1 max-w-[160px] truncate"
              title={result.detail || "Uninstall failed"}
            >
              <XCircle className="size-3 shrink-0" />
              {result.detail ? `Failed: ${result.detail}` : "Failed"}
            </span>
          )}
          {isProcessing ? (
            <Loader2 className="size-4 text-primary animate-spin" />
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={app.isProtected || !app.canUninstall}
              onClick={() => onUninstall(app)}
              className={cn(
                "h-7 text-xs gap-1.5",
                app.isProtected
                  ? "opacity-40 cursor-not-allowed"
                  : !app.canUninstall
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:text-destructive hover:border-destructive/30 hover:bg-destructive/8"
              )}
              title={app.isProtected ? "Protected — cannot uninstall" : !app.canUninstall ? "No uninstall path" : `Uninstall ${app.name}`}
              data-testid={`button-uninstall-${app.id}`}
            >
              {app.isProtected ? <Lock className="size-3" /> : <Trash2 className="size-3" />}
              <span className="hidden sm:inline">{app.isProtected ? "Protected" : !app.canUninstall ? "N/A" : "Uninstall"}</span>
            </Button>
          )}
          <button
            className="size-7 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-[#21262D] transition-colors"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-3.5 sm:px-4 py-3 bg-white/[0.015] grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
              {app.version && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Version</p>
                  <p className="text-xs font-mono">{app.version}</p>
                </div>
              )}
              {installDateFormatted && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Installed</p>
                  <p className="text-xs">{installDateFormatted}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Uninstall method</p>
                <p className="text-xs capitalize">{app.uninstallMethod === "none" ? "Not supported" : app.uninstallMethod.toUpperCase()}</p>
              </div>
              {app.sizeMb > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Estimated size</p>
                  <p className="text-xs">{app.sizeMb} MB</p>
                </div>
              )}
              {app.installLocation && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">Install location</p>
                  <p className="text-xs font-mono text-muted-foreground truncate">{app.installLocation}</p>
                </div>
              )}
              {app.isProtected && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                    <Lock className="size-3" />This app is protected and cannot be uninstalled from SwitchControl.
                  </p>
                </div>
              )}
              {!app.canUninstall && !app.isProtected && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    <Info className="size-3" />No supported uninstall path detected for this app.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Failure label helper ──────────────────────────────────────────────────────

function buildFailureLabel(res: UninstallResult): string {
  if (res.errorDetail) return res.errorDetail;
  if (res.error)       return res.error;
  if (res.exitCode !== undefined && res.exitCode !== null) {
    return `Exit code ${res.exitCode}`;
  }
  return res.status || "Uninstall failed";
}

// ── InstalledAppsPanel ────────────────────────────────────────────────────────

export function InstalledAppsPanel() {
  const applyAction = useStore(s => s.applyAction);

  const [apps,          setApps]          = useState<InstalledApp[]>([]);
  const [scanning,      setScanning]      = useState(false);
  const [scannedAt,     setScannedAt]     = useState<string | null>(null);
  const [scanError,     setScanError]     = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [filter,        setFilter]        = useState<FilterType>("all");
  const [sort,          setSort]          = useState<SortType>("name");
  const [confirmApp,    setConfirmApp]    = useState<InstalledApp | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);
  const [results,       setResults]       = useState<Record<string, AppResult>>({});

  const isElectronAvail = typeof window !== "undefined" && !!getInstalledAppsAPI();

  const runScan = useCallback(async () => {
    const api = getInstalledAppsAPI();
    if (!api) return;
    setScanning(true);
    setScanError(null);
    try {
      const res = await api.scan();
      if (res.ok) {
        setApps(res.apps);
        setScannedAt(res.scannedAt);
      } else {
        setScanError(res.error ?? "Scan failed");
      }
    } catch (e: any) {
      setScanError(e.message ?? "Unknown error");
    } finally {
      setScanning(false);
    }
  }, []);

  const doUninstall = useCallback(async (app: InstalledApp) => {
    const api = getInstalledAppsAPI();
    setConfirmApp(null);
    setUninstallingId(app.id);
    setResults(prev => ({ ...prev, [app.id]: { kind: "pending" } }));

    try {
      const res = await api!.uninstall(app);

      if (res.ok && res.requiresRestart) {
        setResults(prev => ({ ...prev, [app.id]: { kind: "restart-required" } }));
        // Keep in list — user should know a restart is needed
      } else if (res.ok) {
        setResults(prev => ({ ...prev, [app.id]: { kind: "removed" } }));
        setApps(prev => prev.filter(a => a.id !== app.id));
        applyAction(
          `Uninstalled ${app.name}`,
          "Debloat",
          "Removed from Installed Apps",
          app.publisher ? `Publisher: ${app.publisher}` : undefined
        );
        fetch("/api/debloat/apps/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appName: app.name, publisher: app.publisher,
            version: app.version, method: app.uninstallMethod,
            status: "removed", source: "InstalledApps",
          }),
        }).catch(() => {});
      } else {
        // Build a concise user-facing failure reason
        const detail = buildFailureLabel(res);
        setResults(prev => ({ ...prev, [app.id]: { kind: "failed", detail } }));
      }
    } catch (e: any) {
      setResults(prev => ({ ...prev, [app.id]: { kind: "failed", detail: e?.message ?? "Unexpected error" } }));
    } finally {
      setUninstallingId(null);
    }
  }, [applyAction]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = apps.filter(a => results[a.id]?.kind !== "removed");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.publisher.toLowerCase().includes(q) ||
        a.version.toLowerCase().includes(q)
      );
    }

    if (filter === "uninstallable") list = list.filter(a => a.canUninstall && !a.isProtected);
    if (filter === "protected")     list = list.filter(a => a.isProtected);
    if (filter === "microsoft")     list = list.filter(a => a.trustLabel === "microsoft");
    if (filter === "third-party")   list = list.filter(a => a.trustLabel === "user-installed" || a.trustLabel === "unknown");
    if (filter === "large")         list = list.filter(a => a.sizeMb >= 100);

    const sorted = [...list];
    if (sort === "name")                sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "size-desc")           sorted.sort((a, b) => b.sizeMb - a.sizeMb);
    if (sort === "publisher")           sorted.sort((a, b) => a.publisher.localeCompare(b.publisher));
    if (sort === "uninstallable-first") sorted.sort((a, b) => (b.canUninstall && !b.isProtected ? 1 : 0) - (a.canUninstall && !a.isProtected ? 1 : 0));

    return sorted;
  }, [apps, results, search, filter, sort]);

  const stats = useMemo(() => ({
    total:         apps.length,
    uninstallable: apps.filter(a => a.canUninstall && !a.isProtected).length,
    microsoft:     apps.filter(a => a.trustLabel === "microsoft").length,
    thirdParty:    apps.filter(a => a.trustLabel === "user-installed" || a.trustLabel === "unknown").length,
    totalSizeMb:   apps.reduce((s, a) => s + a.sizeMb, 0),
  }), [apps]);

  // ── Non-Electron placeholder ─────────────────────────────────────────────
  if (!isElectronAvail) {
    return (
      <GlassCard className="p-8 text-center space-y-3">
        <div className="size-12 rounded-full bg-[#21262D] border border-[#2A313A]0 flex items-center justify-center mx-auto">
          <Monitor className="size-5 text-muted-foreground/50" />
        </div>
        <p className="font-medium text-sm">Installed Apps Scan</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Run SwitchControl as the Windows desktop app to scan installed programs and manage them directly from here.
        </p>
      </GlassCard>
    );
  }

  // ── Unscan state ──────────────────────────────────────────────────────────
  if (!scannedAt && !scanning) {
    return (
      <GlassCard className="p-8 text-center space-y-4">
        <div className="size-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <Package className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-base">Scan Installed Apps</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
            Reads your Windows registry to list installed programs. Scan takes 5–15 seconds.
          </p>
        </div>
        {scanError && (
          <p className="text-sm text-red-400">{scanError}</p>
        )}
        <Button onClick={runScan} className="gap-2 mx-auto" data-testid="button-scan-apps">
          <Search className="size-4" />Scan Now
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Package className="size-4 text-primary" />
            Installed Apps
            {stats.total > 0 && (
              <Badge variant="outline" className="text-xs text-muted-foreground border-[#2A313A]0">{stats.total}</Badge>
            )}
          </h3>
          {scannedAt && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              Scanned {format(new Date(scannedAt), "MMM d, HH:mm")}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runScan}
          disabled={scanning}
          className="gap-2 h-8 text-xs"
          data-testid="button-rescan-apps"
        >
          <RefreshCw className={cn("size-3.5", scanning && "animate-spin")} />
          {scanning ? "Scanning…" : "Rescan"}
        </Button>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",         value: stats.total,         color: undefined },
            { label: "Uninstallable", value: stats.uninstallable, color: "text-violet-400" },
            { label: "Microsoft",     value: stats.microsoft,     color: "text-blue-400" },
            { label: "Third-party",   value: stats.thirdParty,    color: "text-amber-400" },
          ].map(s => (
            <GlassCard key={s.label} className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">{s.label}</p>
              <p className={cn("text-xl font-bold tabular-nums mt-0.5", s.color)}>{s.value}</p>
            </GlassCard>
          ))}
        </div>
      )}

      {/* ── Safety rail ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <ShieldOff className="size-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Protected system apps (Defender, Firewall, Windows Update) are locked and cannot be removed.
          SwitchControl uses the app's own uninstaller — always check you no longer need an app before removing it.
        </p>
      </div>

      {/* ── Search + filter + sort ────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, publisher, version…"
              className="pl-9 bg-white/[0.04] border-[#2A313A]0 h-9 text-sm"
              data-testid="input-search-apps"
            />
            {search && (
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                onClick={() => setSearch("")}>
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {/* Sort dropdown (simple buttons) */}
          <div className="flex gap-0.5 bg-white/[0.04] border border-[#2A313A]0 rounded-lg p-0.5 shrink-0">
            <ArrowUpDown className="size-3.5 text-muted-foreground/50 m-auto ml-2 mr-1" />
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortType)}
              className="bg-transparent text-[11px] text-muted-foreground pr-1 focus:outline-none cursor-pointer"
              data-testid="select-sort-apps"
            >
              {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                filter === f.id
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "border-white/[0.08] text-muted-foreground hover:text-foreground/80"
              )}
              data-testid={`filter-apps-${f.id}`}
            >
              {f.label}
            </button>
          ))}
          {filtered.length !== apps.length && (
            <span className="px-2.5 py-1 text-[11px] text-muted-foreground/50">
              {filtered.length} shown
            </span>
          )}
        </div>
      </div>

      {/* ── Scanning state ───────────────────────────────────────────────────── */}
      {scanning && (
        <GlassCard className="p-6 text-center">
          <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
          <p className="text-sm text-muted-foreground">Scanning installed apps…</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1">Reading Windows registry — this may take a few seconds</p>
        </GlassCard>
      )}

      {/* ── App list ─────────────────────────────────────────────────────────── */}
      {!scanning && (
        <>
          {filtered.length === 0 ? (
            <GlassCard className="p-8 text-center space-y-2">
              <Search className="size-7 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No apps match the current filters</p>
              <button onClick={() => { setSearch(""); setFilter("all"); }}
                className="text-xs text-primary hover:underline">Clear filters</button>
            </GlassCard>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map((app, i) => (
                  <motion.div
                    key={app.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.015, 0.3), ease: [0.22, 1, 0.36, 1] }}
                  >
                    <AppRow
                      app={app}
                      result={results[app.id]}
                      uninstallingId={uninstallingId}
                      onUninstall={(app) => {
                        // eslint-disable-next-line no-console
                        console.log(`[Debloat] uninstall confirm opened appName=${app.name} source=installed_apps_list`);
                        setConfirmApp(app);
                      }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              <p className="text-center text-[11px] text-muted-foreground/40 pt-2">
                {filtered.length} app{filtered.length !== 1 ? "s" : ""} shown
                {stats.totalSizeMb > 0 && ` · ${stats.totalSizeMb > 1000 ? `${(stats.totalSizeMb / 1024).toFixed(1)} GB` : `${stats.totalSizeMb} MB`} total`}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Confirm dialog ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmApp && (
          <ConfirmDialog
            app={confirmApp}
            onConfirm={() => doUninstall(confirmApp)}
            onCancel={() => {
              // eslint-disable-next-line no-console
              console.log("[Debloat] uninstall confirm closed");
              setConfirmApp(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
