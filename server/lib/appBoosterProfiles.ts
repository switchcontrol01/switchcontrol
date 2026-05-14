import { CATALOG } from "./gameDetection/catalog";

// ── Re-export types for backward compat ──────────────────────────────────────

export interface GameMeta {
  slug: string;
  name: string;
  publisher: string;
  executable: string;
  knownPaths: string[];
  genre: string;
  profileId: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
}

export interface ProfileAction {
  id: string;
  label: string;
  category: "cpu" | "gpu" | "system" | "network";
  description: string;
  impact: "high" | "medium" | "low";
  requiresAdmin: boolean;
  persistent: boolean;
  activeOnly: boolean;
  reversible: boolean;
  requiresRestart: boolean;
  applyPs?: string;
  revertPs?: string;
  checkPs?: string;
  reusesTweakId?: string;
}

export interface GameProfile {
  id: string;
  name: string;
  description: string;
  actions: ProfileAction[];
}

// ── Game list derived from the enriched catalog ───────────────────────────────

export const SUPPORTED_GAMES: GameMeta[] = CATALOG.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  publisher: entry.publisher,
  executable: entry.executable,
  knownPaths: entry.knownPaths,
  genre: entry.genre,
  profileId: entry.profileId,
  logoUrl: entry.logoUrl ?? null,
  coverUrl: entry.coverUrl ?? null,
}));

// ── Profile registry ──────────────────────────────────────────────────────────

export const PROFILES: Record<string, Omit<GameProfile, "actions">> = {
  "competitive-high": {
    id: "competitive-high",
    name: "Competitive",
    description:
      "Maximum responsiveness for competitive play. Prioritizes CPU/GPU allocation and removes background overhead.",
  },
  "simulation-ultra": {
    id: "simulation-ultra",
    name: "Simulation Ultra",
    description:
      "High-fidelity profile for simulation titles. Maximizes GPU and CPU headroom, disables background recorders.",
  },
  "open-world-performance": {
    id: "open-world-performance",
    name: "Performance",
    description:
      "Balanced performance for open-world and RPG titles. Reduces input lag and ensures stable frame pacing.",
  },
  "single-player-quality": {
    id: "single-player-quality",
    name: "Quality",
    description:
      "Balanced settings for single-player and open-world games. Maximizes GPU utilization and stability.",
  },
};

// ── PowerShell action builders (unchanged) ────────────────────────────────────

function buildCpuPriorityPs(exe: string, mode: "apply" | "revert" | "check"): string {
  const key = `HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions`;
  if (mode === "apply")
    return `New-Item -Path "${key}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${key}" -Name "CpuPriorityClass" -Value 6 -Type DWord -Force`;
  if (mode === "revert")
    return `Remove-Item -Path "${key}" -Recurse -Force -EA SilentlyContinue`;
  return `(Get-ItemProperty -Path "${key}" -Name "CpuPriorityClass" -EA SilentlyContinue).CpuPriorityClass -eq 6`;
}

function buildFsoPs(exePath: string, mode: "apply" | "revert" | "check"): string {
  const regKey = `HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers`;
  const value = `~ DISABLEDXMAXIMIZEDWINDOWEDMODE`;
  if (mode === "apply")
    return `New-Item -Path "${regKey}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${regKey}" -Name "${exePath}" -Value "${value}" -Type String -Force`;
  if (mode === "revert")
    return `Remove-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue`;
  return `(Get-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue)."${exePath}" -eq "${value}"`;
}

function buildGpuPrefPs(exePath: string, mode: "apply" | "revert" | "check"): string {
  const regKey = `HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences`;
  if (mode === "apply")
    return `New-Item -Path "${regKey}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${regKey}" -Name "${exePath}" -Value "GpuPreference=2;" -Type String -Force`;
  if (mode === "revert")
    return `Remove-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue`;
  return `(Get-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue)."${exePath}" -like "*GpuPreference=2*"`;
}

// ── PowerShell string escaping ───────────────────────────────────────────────

/** Escape a value for safe inclusion inside a double-quoted PowerShell string. */
function psEscape(val: string): string {
  return val.replace(/[`$"]/g, "`$&");
}

/** Validate that a path looks like a real Windows file path (not injection). */
function isSafeWindowsPath(p: string): boolean {
  // Reject any path containing PowerShell metacharacters that could break out of quoting
  if (/[;&|<>(){}\[\]$\n\r]/.test(p)) return false;
  // Require .exe extension for game executables
  if (!/\.exe$/i.test(p)) return false;
  // Max reasonable path length
  if (p.length > 260) return false;
  return true;
}

function buildNetworkQosPs(
  gameName: string,
  exePath: string,
  mode: "apply" | "revert" | "check"
): string {
  const policyName = `${gameName} SC-Boost`;
  if (!isSafeWindowsPath(exePath)) {
    // Return a no-op that safely fails instead of injecting untrusted input
    return `Write-Error 'Invalid exePath — blocked by path validation'; exit 1`;
  }
  const safeExe = psEscape(exePath);
  const safePolicy = psEscape(policyName);
  if (mode === "apply")
    return `if (!(Get-NetQosPolicy -Name "${safePolicy}" -EA SilentlyContinue)) { New-NetQosPolicy -Name "${safePolicy}" -AppPathNameMatchCondition "${safeExe}" -IPProtocolMatchCondition Both -DSCPAction 46 -NetworkProfile All -Confirm:$false -EA SilentlyContinue }`;
  if (mode === "revert")
    return `Remove-NetQosPolicy -Name "${safePolicy}" -Confirm:$false -EA SilentlyContinue`;
  return `(Get-NetQosPolicy -Name "${safePolicy}" -EA SilentlyContinue) -ne $null`;
}

export function buildActionsForGame(game: GameMeta, installPath: string | null): ProfileAction[] {
  const exePath = installPath ? `${installPath}\\${game.executable}` : game.executable;

  return [
    {
      id: "cpu-priority",
      label: "CPU Launch Priority",
      category: "cpu",
      description:
        "Sets game process to AboveNormal priority at launch via Windows IFEO. Persists across reboots.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildCpuPriorityPs(game.executable, "apply"),
      revertPs: buildCpuPriorityPs(game.executable, "revert"),
      checkPs: buildCpuPriorityPs(game.executable, "check"),
    },
    {
      id: "fso-disable",
      label: "Disable Fullscreen Optimizations",
      category: "gpu",
      description:
        "Disables Windows Fullscreen Optimizations for this executable. Reduces latency in many games.",
      impact: "medium",
      requiresAdmin: false,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: true,
      applyPs: buildFsoPs(exePath, "apply"),
      revertPs: buildFsoPs(exePath, "revert"),
      checkPs: buildFsoPs(exePath, "check"),
    },
    {
      id: "gpu-preference",
      label: "GPU High Performance Mode",
      category: "gpu",
      description:
        "Forces Windows to use the high-performance GPU for this game. Prevents integrated GPU usage.",
      impact: "high",
      requiresAdmin: false,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: true,
      applyPs: buildGpuPrefPs(exePath, "apply"),
      revertPs: buildGpuPrefPs(exePath, "revert"),
      checkPs: buildGpuPrefPs(exePath, "check"),
    },
    {
      id: "game-mode",
      label: "Windows Game Mode",
      category: "system",
      description:
        "Enables Windows Game Mode. Tells the OS to prioritize game resources globally.",
      impact: "medium",
      requiresAdmin: false,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      reusesTweakId: "gaming-mode",
    },
    {
      id: "xbox-dvr-off",
      label: "Disable Xbox Game DVR",
      category: "system",
      description:
        "Disables Xbox Game Bar DVR background recording. Frees CPU and memory during gameplay.",
      impact: "medium",
      requiresAdmin: false,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      reusesTweakId: "xbox-bar",
    },
    {
      id: "network-qos",
      label: "Network QoS Priority",
      category: "network",
      description:
        "Creates a QoS policy to prioritize game network packets with DSCP EF (46) tagging.",
      impact: "medium",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildNetworkQosPs(game.name, exePath, "apply"),
      revertPs: buildNetworkQosPs(game.name, exePath, "revert"),
      checkPs: buildNetworkQosPs(game.name, exePath, "check"),
    },
  ];
}

export function getGameBySlug(slug: string): GameMeta | undefined {
  return SUPPORTED_GAMES.find((g) => g.slug === slug);
}
