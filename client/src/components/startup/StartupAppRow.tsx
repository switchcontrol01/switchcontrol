import { useState } from "react";
import { motion } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { BootApp } from "./startupUtils";
import { Cpu, HardDrive, Gauge, AlertTriangle } from "lucide-react";

// ── App favicon resolver ────────────────────────────────────────────────────
// Maps well-known app names to their primary domain so we can pull a real icon.
const KNOWN_DOMAINS: Record<string, string> = {
  steam: "store.steampowered.com",
  epicgames: "epicgames.com",
  "epic games": "epicgames.com",
  discord: "discord.com",
  spotify: "spotify.com",
  chrome: "google.com",
  firefox: "firefox.com",
  opera: "opera.com",
  brave: "brave.com",
  edge: "microsoft.com",
  teams: "microsoft.com",
  "com.squirrel.teams": "microsoft.com",
  slack: "slack.com",
  zoom: "zoom.us",
  skype: "skype.com",
  telegram: "telegram.org",
  whatsapp: "whatsapp.com",
  signal: "signal.org",
  roblox: "roblox.com",
  robloxplayer: "roblox.com",
  minecraft: "minecraft.net",
  battlenet: "battle.net",
  "battle.net": "battle.net",
  blizzard: "blizzard.com",
  gog: "gog.com",
  uplay: "ubisoft.com",
  ubisoft: "ubisoft.com",
  origin: "ea.com",
  "ea desktop": "ea.com",
  rockstar: "rockstargames.com",
  bethesda: "bethesda.net",
  playnite: "playnite.link",
  notion: "notion.so",
  obsidian: "obsidian.md",
  vlc: "videolan.org",
  itunes: "apple.com",
  acrobat: "adobe.com",
  photoshop: "adobe.com",
  illustrator: "adobe.com",
  premiere: "adobe.com",
  lightroom: "adobe.com",
  gimp: "gimp.org",
  inkscape: "inkscape.org",
  blender: "blender.org",
  vscode: "code.visualstudio.com",
  "visual studio code": "code.visualstudio.com",
  sublime: "sublimetext.com",
  postman: "postman.com",
  figma: "figma.com",
  dropbox: "dropbox.com",
  onedrive: "microsoft.com",
  googledrive: "drive.google.com",
  realtek: "realtek.com",
  nvidia: "nvidia.com",
  geforce: "nvidia.com",
  amd: "amd.com",
  radeon: "amd.com",
  corsair: "corsair.com",
  icue: "corsair.com",
  logitech: "logitech.com",
  ghub: "logitech.com",
  razer: "razer.com",
  synapse: "razer.com",
  steelseries: "steelseries.com",
  hyperx: "hyperx.com",
  asus: "asus.com",
  msi: "msi.com",
  docker: "docker.com",
  virtualbox: "virtualbox.org",
  vmware: "vmware.com",
  parsec: "parsec.app",
  twitch: "twitch.tv",
  obs: "obsproject.com",
  "obs studio": "obsproject.com",
  streamlabs: "streamlabs.com",
  elgato: "elgato.com",
  xbox: "xbox.com",
  googleupdate: "google.com",
  google: "google.com",
  "nvidia geforce": "nvidia.com",
  "amd noise": "amd.com",
  rtk: "realtek.com",
  rtkaud: "realtek.com",
  equalizer: "equalizer-apo.de",
  "force timer": "bitsum.com",
  aimemory: "microsoft.com",
  fifine: "fifine-mic.com",
};

function resolveDomain(app: BootApp): string | null {
  const name = app.entry.name.toLowerCase().replace(/[._-]/g, " ").trim();
  // Direct match
  for (const [key, domain] of Object.entries(KNOWN_DOMAINS)) {
    if (name.includes(key)) return domain;
  }
  // Try extracting from executable path (e.g. C:\Program Files\Steam\steam.exe → steam)
  if (app.entry.executablePath) {
    const parts = app.entry.executablePath.split(/[\\/]/);
    for (let i = parts.length - 2; i >= 0; i--) {
      const seg = parts[i].toLowerCase();
      for (const [key, domain] of Object.entries(KNOWN_DOMAINS)) {
        if (seg.includes(key)) return domain;
      }
    }
  }
  return null;
}

/** Single letter avatar with a deterministic color from the app name */
function LetterAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const colors = [
    "#6366f1", "#8b5cf6", "#a78bfa", "#60a5fa",
    "#34d399", "#fbbf24", "#fb923c", "#f472b6",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0 text-white font-bold select-none"
      style={{ width: size, height: size, background: `${color}22`, border: `1px solid ${color}40`, fontSize: size * 0.42, color }}
    >
      {letter}
    </div>
  );
}

/** Favicon fetched from Google's favicon CDN, fallback to letter avatar */
function AppIcon({ app, size = 28 }: { app: BootApp; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = resolveDomain(app);

  if (!domain || failed) {
    return <LetterAvatar name={app.entry.name} size={size} />;
  }

  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0 bg-[#1E242C] border border-white/[0.06]"
      style={{ width: size, height: size }}
    >
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        width={16}
        height={16}
        style={{ imageRendering: "auto" }}
        onError={() => setFailed(true)}
        draggable={false}
      />
    </div>
  );
}

// ── Risk badge — only shown for broken/critical entries ────────────────────
// Safe and moderate items don't get a scary label; the category tag (MS, Driver)
// already gives enough context without making every row look like a threat.
const RISK_META = {
  safe:     { label: null,       color: "",              bg: "",                  border: "" },
  moderate: { label: null,       color: "",              bg: "",                  border: "" },
  critical: { label: "Broken",   color: "text-red-400",  bg: "bg-red-500/10",     border: "border-red-500/20" },
};

interface Props {
  app: BootApp;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}

export function StartupAppRow({ app, onToggle, loading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = RISK_META[app.risk] ?? RISK_META.safe;
  const isEnabled = app.entry.enabled;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        isEnabled
          ? "bg-[#1A1F26] border-[#2A313A]"
          : "bg-[#1A1F26] border-white/[0.03] opacity-60"
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-[#1E242C] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* App icon — real favicon or letter avatar */}
        <AppIcon app={app} size={28} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-[#E6EAF0] truncate">{app.entry.name}</span>

            {/* Contextual tags — informational, not alarming */}
            {app.isMicrosoft && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                Microsoft
              </span>
            )}
            {app.isDriver && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                Driver
              </span>
            )}
            {app.entry.source === "task-scheduler" && !app.isDriver && !app.isMicrosoft && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2A313A] border border-[#3A414A] text-[#6B7380]">
                Scheduled
              </span>
            )}

            {/* Only show a badge for genuinely broken entries */}
            {meta.label && (
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5", meta.bg, meta.border, meta.color)}>
                <AlertTriangle className="size-2.5" />
                {meta.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground/50">{app.entry.source.replace(/-/g, " ")}</span>
            {app.entry.publisher && app.entry.publisher !== "unknown publisher" && (
              <span className="text-[10px] text-muted-foreground/30 truncate max-w-[120px]">{app.entry.publisher}</span>
            )}
          </div>
        </div>

        {/* Impact pills */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <Cpu className="size-2.5" />{app.cpuImpact}%
          </span>
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <HardDrive className="size-2.5" />{app.diskImpact}%
          </span>
          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
            <Gauge className="size-2.5" />{Math.round(app.delayMs)}ms
          </span>
        </div>

        {/* Toggle */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          {loading ? (
            <span className="size-4 border-2 border-[#2A313A] border-t-white/60 rounded-full animate-spin inline-block" />
          ) : (
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-emerald-500"
            />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="px-3.5 py-2.5 space-y-1.5 border-t border-[#2A313A]"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DetailPill label="Est. Delay" value={`${Math.round(app.delayMs)}ms`} />
            <DetailPill label="Est. CPU" value={`${app.cpuImpact}%`} />
            <DetailPill label="Est. Disk" value={`${app.diskImpact}%`} />
            <DetailPill label="Est. RAM" value={`${app.ramMb} MB`} />
          </div>
          {app.entry.executablePath && (
            <p className="text-[10px] text-muted-foreground/30 font-mono truncate">
              {app.entry.executablePath}
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#1A1F26] border border-[#2A313A] px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground/40">{label}</p>
      <p className="text-[11px] text-[#E6EAF0] font-medium tabular-nums">{value}</p>
    </div>
  );
}
