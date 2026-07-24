import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { logHistory } from "@/lib/logHistory";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  RefreshCw, Search, X, Package, Shield, ShieldOff, AlertTriangle,
  CheckCircle2, XCircle, Trash2, ChevronDown, ChevronUp, Monitor,
  ArrowUpDown, Lock, Zap, HardDrive, Info, Loader2,
  Gamepad2, Cpu, ShieldCheck, Music, Code2,
} from "lucide-react";

// Rows can expand to show detail, so height is measured dynamically.
const ESTIMATED_ROW_HEIGHT = 68;
// Below this count, render the plain animated list — virtualization overhead
// isn't worth it for short scans and this keeps existing enter/exit polish.
const VIRTUALIZE_THRESHOLD = 30;

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
  displayIcon:      string;
  iconDataUrl?:     string;
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
  icon:      (appId: string) => Promise<string | null>;
  uninstall: (app: InstalledApp) => Promise<UninstallResult>;
};
function getInstalledAppsAPI(): InstalledAppsAPI | undefined {
  return (window as any).electronAPI?.installedApps as InstalledAppsAPI | undefined;
}

// ── Category detection ────────────────────────────────────────────────────────
// Classifies apps by heuristic name/publisher matching for distinct fallback icons.
// This replaces the single cyan placeholder used for all unrecognized apps.

type AppCategory = "gaming" | "driver" | "security" | "media" | "dev" | "microsoft" | "generic";

function detectCategory(app: InstalledApp): AppCategory {
  if (app.trustLabel === "microsoft") return "microsoft";
  const combined = (app.name + " " + (app.publisher || "")).toLowerCase();

  if (
    /steam|epic games|gog\.com|origin|ubisoft|riot games|blizzard|bethesda|battle\.?net|electronic arts|valve corporation|activision/i.test(combined) ||
    /\bgame\b|gaming|esports|game launcher/i.test(app.name)
  ) return "gaming";

  if (
    /\bdriver\b|firmware|chipset/i.test(app.name) ||
    /nvidia|amd\b|advanced micro devices|realtek|qualcomm|marvell|broadcom|creative labs|corsair|logitech|steelseries|razer/i.test(combined)
  ) return "driver";

  if (
    /\bdefender\b|antivirus|anti-virus|internet security|kaspersky|norton|mcafee|bitdefender|avast|avg|webroot|eset|sophos|malwarebytes|symantec/i.test(combined)
  ) return "security";

  if (
    /vlc|spotify|media player|winamp|foobar|itunes|k-lite|codec|directshow|photoshop|lightroom|gimp|audacity|obs\b|streamlabs/i.test(combined)
  ) return "media";

  if (
    /visual studio|\.net\s|node\.js|python\s|jdk|jre|android studio|git\s|docker|sdk\b|runtime\b|redistributable|microsoft c\+\+/i.test(combined)
  ) return "dev";

  return "generic";
}

const CATEGORY_CONFIG: Record<AppCategory, { icon: React.FC<{ className?: string }>; cls: string }> = {
  gaming:    { icon: Gamepad2,    cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
  driver:    { icon: Cpu,         cls: "bg-sky-500/15 text-sky-400 border-sky-500/25" },
  security:  { icon: ShieldCheck, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  media:     { icon: Music,       cls: "bg-pink-500/15 text-pink-400 border-pink-500/25" },
  dev:       { icon: Code2,       cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  microsoft: { icon: Monitor,     cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  generic:   { icon: Package,     cls: "bg-zinc-500/15 text-zinc-500 border-zinc-700/50" },
};

// ── App icon with multi-layer web fallbacks ───────────────────────────────────
// Publisher name → canonical domain used to pull logos from icon services.
// Lower-cased, stripped of punctuation for matching.
const PUBLISHER_DOMAINS: Record<string, string> = {
  // Microsoft / Windows
  "microsoft": "microsoft.com", "microsoft corporation": "microsoft.com",

  // Processors & GPUs
  "nvidia": "nvidia.com", "nvidia corporation": "nvidia.com",
  "amd": "amd.com", "advanced micro devices": "amd.com", "advanced micro devices inc": "amd.com",
  "intel": "intel.com", "intel corporation": "intel.com",
  "qualcomm": "qualcomm.com", "qualcomm technologies": "qualcomm.com",

  // Motherboard / peripheral
  "asus": "asus.com", "asustek computer inc": "asus.com", "asustek": "asus.com",
  "gigabyte": "gigabyte.com", "gigabyte technology": "gigabyte.com",
  "msi": "msi.com", "micro-star international": "msi.com", "micro-star intl": "msi.com",
  "evga": "evga.com",
  "asrock": "asrock.com",

  // Peripherals & audio
  "corsair": "corsair.com", "corsair memory": "corsair.com", "corsair memory inc": "corsair.com",
  "logitech": "logitech.com", "logitech inc": "logitech.com",
  "razer": "razer.com", "razer inc": "razer.com",
  "steelseries": "steelseries.com",
  "hyperx": "hyperx.com",
  "roccat": "roccat.com",
  "elgato": "elgato.com", "elgato systems": "elgato.com",
  "creative technology": "creative.com",
  "creative labs": "creative.com",
  "focusrite": "focusrite.com",
  "fifine": "fifine-mic.com",
  "fiio": "fiio.com",
  "nzxt": "nzxt.com",
  "kingston": "kingston.com",
  "kingston technology": "kingston.com",
  "western digital": "westerndigital.com",
  "sandisk": "sandisk.com",
  "seagate": "seagate.com",
  "crucial": "crucial.com",

  // Cooling / case / PSU
  "thermaltake": "thermaltake.com",
  "cooler master": "coolermaster.com",
  "be quiet": "bequiet.com",
  "noctua": "noctua.at",
  "deepcool": "deepcool.com",
  "fractal design": "fractal-design.com",
  "arctic": "arctic.ac",

  // Storage
  "samsung": "samsung.com", "samsung electronics": "samsung.com",
  "seagate technology": "seagate.com",
  "qnap": "qnap.com",
  "synology": "synology.com",

  // Displays & accessories
  "lg": "lg.com", "lg electronics": "lg.com",
  "benq": "benq.com",
  "hp": "hp.com", "hewlett-packard": "hp.com",
  "dell": "dell.com", "dell inc": "dell.com",
  "alienware": "dell.com",
  "lenovo": "lenovo.com",
  "acer": "acer.com",
  "sony": "sony.com", "sony corporation": "sony.com",

  // Gaming platforms & launchers
  "valve": "steampowered.com", "valve corporation": "steampowered.com",
  "epic games": "epicgames.com", "epic games inc": "epicgames.com",
  "epic": "epicgames.com",
  "gog": "gog.com", "gog.com": "gog.com",
  "ea": "ea.com", "electronic arts": "ea.com",
  "origin": "ea.com",
  "riot games": "riotgames.com",
  "blizzard": "battle.net", "blizzard entertainment": "battle.net",
  "activision": "activision.com",
  "ubisoft": "ubisoft.com",
  "2k games": "2k.com",
  "rockstar": "rockstargames.com", "rockstar games": "rockstargames.com",
  "bethesda": "bethesda.net", "bethesda softworks": "bethesda.net",
  "cdprojekt": "cdprojektred.com", "cd projekt": "cdprojektred.com",
  "square enix": "square-enix.com",
  "bandai namco": "bandainamcoent.com",
  "sega": "sega.com",
  "505 games": "505games.com",
  "team17": "team17.com",
  "paradox interactive": "paradoxinteractive.com",

  // Streaming / recording
  "obs project": "obsproject.com", "obs studio": "obsproject.com",
  "streamlabs": "streamlabs.com",
  "xsplit": "xsplit.com",
  "twitch": "twitch.tv", "twitch interactive": "twitch.tv",
  "discord": "discord.com", "discord inc": "discord.com",
  "teamspeak": "teamspeak.com",

  // Cloud / productivity
  "google": "google.com", "google llc": "google.com",
  "amazon": "amazon.com", "amazon.com": "amazon.com",
  "apple": "apple.com", "apple inc": "apple.com",
  "dropbox": "dropbox.com",
  "slack": "slack.com", "slack technologies": "slack.com",
  "zoom": "zoom.us", "zoom video communications": "zoom.us",
  "notion": "notion.so",
  "figma": "figma.com",
  "atlassian": "atlassian.com",
  "spotify": "spotify.com", "spotify ab": "spotify.com",
  "telegram": "telegram.org",
  "signal": "signal.org",
  "whatsapp": "whatsapp.com",
  "1password": "1password.com", "agilebits": "1password.com",
  "lastpass": "lastpass.com",
  "bitwarden": "bitwarden.com",

  // VPN
  "nordvpn": "nordvpn.com", "nordvpn s.a.": "nordvpn.com",
  "expressvpn": "expressvpn.com",
  "surfshark": "surfshark.com",
  "protonvpn": "protonvpn.com", "proton": "proton.me",

  // Media
  "vlc": "videolan.org", "videolan": "videolan.org",
  "adobe": "adobe.com", "adobe inc": "adobe.com", "adobe systems": "adobe.com",
  "audacity": "audacityteam.org", "audacity team": "audacityteam.org",
  "blender": "blender.org", "blender foundation": "blender.org",
  "handbrake": "handbrake.fr",
  "voicemeeter": "vb-audio.com", "vb-audio": "vb-audio.com",

  // Security & AV
  "malwarebytes": "malwarebytes.com",
  "avast": "avast.com",
  "avg": "avg.com",
  "kaspersky": "kaspersky.com",
  "norton": "norton.com",
  "mcafee": "mcafee.com",
  "eset": "eset.com",
  "bitdefender": "bitdefender.com",
  "webroot": "webroot.com",
  "sophos": "sophos.com",

  // Dev tools & runtimes
  "jetbrains": "jetbrains.com",
  "oracle": "oracle.com", "oracle corporation": "oracle.com",
  "docker": "docker.com",
  "vmware": "vmware.com",
  "virtualbox": "virtualbox.org",

  // Utilities
  "7-zip": "7-zip.org", "igor pavlov": "7-zip.org",
  "winrar": "rarlab.com", "rarlab": "rarlab.com", "win.rar gmbh": "rarlab.com",
  "piriform": "piriform.com",
  "ccleaner": "ccleaner.com",
  "teamviewer": "teamviewer.com",
  "anydesk": "anydesk.com",
  "realtek": "realtek.com", "realtek semiconductor": "realtek.com",
  "hifi technologies": "hifisimulations.com",
  "parallels": "parallels.com",
  "cpu-z": "cpuid.com", "cpuid": "cpuid.com",
  "gpu-z": "techpowerup.com",
  "hwinfo": "hwinfo.com", "martin malik": "hwinfo.com",
  "crystaldiskinfo": "crystalmark.info", "crystalmark": "crystalmark.info",

  // Sim / flight
  "laminar research": "x-plane.com",
  "lockheed martin": "prepar3d.com",
};

/** Convert a publisher string to a domain best suited for icon lookups. */
function publisherToDomain(publisher: string, name: string): string | null {
  const raw = (publisher || "").toLowerCase()
    .replace(/[,.'"\u00ae\u2122]/g, "")   // strip punctuation, ®, ™
    .replace(/\s+/g, " ")
    .trim();

  // 1. Direct known-publisher lookup
  if (PUBLISHER_DOMAINS[raw]) return PUBLISHER_DOMAINS[raw];

  // 2. Try stripping common legal suffixes and re-matching
  const stripped = raw
    .replace(/\s+(inc|corp|llc|ltd|gmbh|co|bv|ag|sa|ab|plc|pty|srl|s\.a\.|s\.l\.)\.?\s*$/, "")
    .trim();
  if (stripped !== raw && PUBLISHER_DOMAINS[stripped]) return PUBLISHER_DOMAINS[stripped];

  // 3. Check app name itself for known brands
  const nameLow = (name || "").toLowerCase();
  for (const [key, domain] of Object.entries(PUBLISHER_DOMAINS)) {
    if (key.length > 3 && nameLow.startsWith(key)) return domain;
  }

  // 4. Heuristic: squash stripped publisher into a single word → <word>.com
  const heuristic = stripped.replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "");
  return heuristic.length >= 3 ? `${heuristic}.com` : null;
}

// Icon service URLs — tried in order when a domain is available
const iconSrcs = (domain: string) => [
  `https://logo.clearbit.com/${domain}`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  `https://api.faviconkit.com/${domain}/64`,
];

/**
 * AppIcon — renders the best available icon for an installed app.
 *
 * Cascade:
 *   1. Electron-extracted native icon (data URL from Windows Shell)
 *   2. Clearbit Logo API        (high-quality company logos)
 *   3. Google Favicons          (sz=64, very wide coverage)
 *   4. DuckDuckGo favicons      (additional fallback)
 *   5. FaviconKit               (last-resort favicon service)
 *   6. Category icon            (always works, final fallback)
 */
const AppIcon = memo(function AppIcon({
  app,
  isLoading,
}: {
  app: InstalledApp;
  isLoading: boolean;
}) {
  const catCfg = CATEGORY_CONFIG[detectCategory(app)];
  const CatIcon = catCfg.icon;

  // Compute the ordered list of image sources to try
  const sources = useMemo<string[]>(() => {
    const list: string[] = [];
    if (app.iconDataUrl) list.push(app.iconDataUrl);
    const domain = publisherToDomain(app.publisher, app.name);
    if (domain) list.push(...iconSrcs(domain));
    return list;
  }, [app.iconDataUrl, app.publisher, app.name]);

  const [idx, setIdx]       = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset when sources list changes (e.g. iconDataUrl arrives from Electron)
  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [sources]);

  // Shimmer while Electron is still extracting and we have no web fallback yet
  if (isLoading && !app.iconDataUrl) {
    return (
      <div className="size-9 rounded-xl shrink-0 bg-[#21262D] border border-[#2A313A] animate-pulse" />
    );
  }

  // Try sources in order via onError cascade
  if (sources.length > 0 && !failed) {
    return (
      <img
        key={sources[idx]}   // force re-mount on src change to clear browser error state
        src={sources[idx]}
        alt=""
        className="size-9 rounded-xl shrink-0 object-contain bg-[#1A1F26] border border-[#2A313A]"
        onError={() => {
          if (idx + 1 < sources.length) {
            setIdx(i => i + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    );
  }

  // Final fallback: category-colored lucide icon
  return (
    <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0 border", catCfg.cls)}>
      <CatIcon className="size-4" />
    </div>
  );
});

// ── Config ────────────────────────────────────────────────────────────────────

const TRUST_CONFIG = {
  microsoft:      { label: "Microsoft",      cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",       icon: Monitor },
  "user-installed":{ label: "User Installed", cls: "bg-[#00D4FF] text-[#00D4FF] border-[#00D4FF]", icon: Package },
  system:         { label: "System",         cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",     icon: Shield },
  protected:      { label: "Protected",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: Lock },
  unknown:        { label: "Unknown",        cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",        icon: AlertTriangle },
};

const METHOD_CONFIG = {
  msi:  { label: "MSI",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  exe:  { label: "EXE",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  appx: { label: "AppX", cls: "bg-[#00D4FF] text-[#00D4FF] border-[#00D4FF]" },
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

          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#21262D] border border-[#2A313A]">
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
  isIconLoading,
  onUninstall,
}: {
  app: InstalledApp;
  result?: AppResult;
  uninstallingId: string | null;
  isIconLoading: boolean;
  onUninstall: (app: InstalledApp) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tCfg        = TRUST_CONFIG[app.trustLabel] ?? TRUST_CONFIG.unknown;
  const mCfg        = METHOD_CONFIG[app.uninstallMethod] ?? METHOD_CONFIG.none;
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
      "rounded-xl border border-[#2A313A] overflow-hidden transition-all",
      app.isProtected && "opacity-70",
      result?.kind === "failed" && "border-red-500/20 bg-red-500/[0.03]",
    )} data-testid={`app-row-${app.id}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-3 sm:p-3.5 hover:bg-[#1A1F26] transition-colors">
        {/* Icon — cascades: Electron native → Clearbit → Google → DuckDuckGo → category */}
        <AppIcon app={app} isLoading={isIconLoading} />

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
            <div className=" px-3.5 sm:px-4 py-3 bg-white/[0.015] grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
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

// ── Virtualized row list (large scans only) ─────────────────────────────────

function VirtualizedAppList({
  apps,
  results,
  uninstallingId,
  iconLoadingIds,
  onUninstall,
}: {
  apps: InstalledApp[];
  results: Record<string, AppResult>;
  uninstallingId: string | null;
  iconLoadingIds: Set<string>;
  onUninstall: (app: InstalledApp) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: apps.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => apps[index].id,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto pr-1" data-testid="list-apps-virtualized">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const app = apps[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 8,
              }}
            >
              <AppRow
                app={app}
                result={results[app.id]}
                uninstallingId={uninstallingId}
                isIconLoading={iconLoadingIds.has(app.id)}
                onUninstall={onUninstall}
              />
            </div>
          );
        })}
      </div>
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
  // Tracks which app IDs are still waiting for their icon to resolve.
  // Used to show shimmer placeholders while icons load asynchronously.
  const [iconLoadingIds, setIconLoadingIds] = useState<Set<string>>(new Set());

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
        // Mark every app as icon-loading before firing requests
        if (api.icon && res.apps.length > 0) {
          setIconLoadingIds(new Set(res.apps.map((a: InstalledApp) => a.id)));
          for (const app of res.apps) {
            api.icon(app.id)
              .then((dataUrl: string | null) => {
                // Remove from loading set whether or not an icon was found
                setIconLoadingIds(prev => {
                  const next = new Set(prev);
                  next.delete(app.id);
                  return next;
                });
                if (dataUrl) {
                  setApps(prev => prev.map(a => a.id === app.id ? { ...a, iconDataUrl: dataUrl } : a));
                }
              })
              .catch(() => {
                setIconLoadingIds(prev => {
                  const next = new Set(prev);
                  next.delete(app.id);
                  return next;
                });
              });
          }
        }
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
        logHistory(
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
  }, []);

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
        <div className="size-12 rounded-full bg-[#21262D] border border-[#2A313A] flex items-center justify-center mx-auto">
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
              <Badge variant="outline" className="text-xs text-muted-foreground border-[#2A313A]">{stats.total}</Badge>
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
            { label: "Uninstallable", value: stats.uninstallable, color: "text-[#00D4FF]" },
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
      <div className="flex items-start gap-2 p-3 rounded-xl bg-[#1A1F26] border border-[#2A313A]">
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
              className="pl-9 bg-[#21262D] border-[#2A313A] h-9 text-sm"
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
          <div className="flex gap-0.5 bg-[#21262D] border border-[#2A313A] rounded-lg p-0.5 shrink-0">
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
                  : "border-[#2A313A] text-muted-foreground hover:text-foreground/80"
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
          ) : filtered.length > VIRTUALIZE_THRESHOLD ? (
            <div className="space-y-2">
              <VirtualizedAppList
                apps={filtered}
                results={results}
                uninstallingId={uninstallingId}
                iconLoadingIds={iconLoadingIds}
                onUninstall={(app) => {
                  // eslint-disable-next-line no-console
                  console.log(`[Debloat] uninstall confirm opened appName=${app.name} source=installed_apps_list`);
                  setConfirmApp(app);
                }}
              />

              <p className="text-center text-[11px] text-muted-foreground/40 pt-2">
                {filtered.length} app{filtered.length !== 1 ? "s" : ""} shown
                {stats.totalSizeMb > 0 && ` · ${stats.totalSizeMb > 1000 ? `${(stats.totalSizeMb / 1024).toFixed(1)} GB` : `${stats.totalSizeMb} MB`} total`}
              </p>
            </div>
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
                      isIconLoading={iconLoadingIds.has(app.id)}
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
