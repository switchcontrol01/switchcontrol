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

// ── Competitive + expanded action builders ────────────────────────────────────

function buildWin32PriorityPs(mode: "apply" | "revert" | "check"): string {
  const key = `HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl`;
  if (mode === "apply")
    return `New-Item -Path "${key}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${key}" -Name "Win32PrioritySeparation" -Value 38 -Type DWord -Force; Write-Output "ok"`;
  if (mode === "revert")
    return `Set-ItemProperty -Path "${key}" -Name "Win32PrioritySeparation" -Value 2 -Type DWord -Force -EA SilentlyContinue; Write-Output "ok"`;
  return `(Get-ItemProperty -Path "${key}" -Name "Win32PrioritySeparation" -EA SilentlyContinue).Win32PrioritySeparation -eq 38`;
}

function buildTimerResolutionPs(mode: "apply" | "revert" | "check"): string {
  if (mode === "apply")
    return `bcdedit /set useplatformtick yes; Write-Output "ok"`;
  if (mode === "revert")
    return `bcdedit /deletevalue useplatformtick; Write-Output "ok"`;
  // Check: look for useplatformtick in bcdedit output
  return `(bcdedit /enum '{current}') -match 'useplatformtick'`;
}

function buildHpetDisablePs(mode: "apply" | "revert" | "check"): string {
  if (mode === "apply")
    return `bcdedit /deletevalue useplatformclock; Write-Output "ok"`;
  if (mode === "revert")
    return `bcdedit /set useplatformclock true; Write-Output "ok"`;
  // Check: HPET is disabled when useplatformclock is absent from bcdedit output
  return `!((bcdedit /enum '{current}') -match 'useplatformclock')`;
}

function buildNvidiaMaxPerfPs(mode: "apply" | "revert" | "check"): string {
  const adapterClass = `{4d36e968-e325-11ce-bfc1-08002be10318}`;
  const enumPath = `HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\${adapterClass}`;
  if (mode === "apply")
    return `$keys = Get-ChildItem "${enumPath}" -EA SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ProviderName -like '*NVIDIA*' }; if ($keys) { $keys | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "PreferedOpenGLImageUnits" -Value 0 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "PerfLevelSrc" -Value 0x2222 -Type DWord -Force -EA SilentlyContinue } }; Write-Output "ok"`;
  if (mode === "revert")
    return `$keys = Get-ChildItem "${enumPath}" -EA SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ProviderName -like '*NVIDIA*' }; if ($keys) { $keys | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "PreferedOpenGLImageUnits" -Force -EA SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "PerfLevelSrc" -Force -EA SilentlyContinue } }; Write-Output "ok"`;
  return `$k = Get-ChildItem "${enumPath}" -EA SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ProviderName -like '*NVIDIA*' } | Select-Object -First 1; if ($k) { (Get-ItemProperty $k.PSPath -EA SilentlyContinue).PerfLevelSrc -eq 0x2222 } else { $false }`;
}

function buildECoreAffinityPs(exe: string, mode: "apply" | "revert" | "check"): string {
  const ifeoKey = `HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions`;
  if (mode === "apply")
    return `$p = Get-WmiObject Win32_Processor -EA SilentlyContinue | Select-Object -First 1; $lp = $p.NumberOfLogicalProcessors; $c = $p.NumberOfCores; $isHybrid = ($p.Description -like '*Intel*') -and ($p.Name -match '1[234]th Gen') -and ($lp -gt $c * 2); if (-not $isHybrid) { Write-Output 'no-op: not a hybrid Intel CPU'; exit 0 }; $mask = [uint32]((1 -shl $c) - 1); New-Item -Path "${ifeoKey}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${ifeoKey}" -Name "CpuAffinityMask" -Value $mask -Type DWord -Force; Write-Output "ok"`;
  if (mode === "revert")
    return `Remove-ItemProperty -Path "${ifeoKey}" -Name "CpuAffinityMask" -Force -EA SilentlyContinue; Write-Output "ok"`;
  return `(Get-ItemProperty -Path "${ifeoKey}" -Name "CpuAffinityMask" -EA SilentlyContinue).CpuAffinityMask -ne $null`;
}

function buildNagleOffPs(mode: "apply" | "revert" | "check"): string {
  const ifaces = `HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces`;
  if (mode === "apply")
    return `Get-ChildItem "${ifaces}" | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).IPAddress -or (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DhcpIPAddress } | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -Type DWord -Force -EA SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -Type DWord -Force -EA SilentlyContinue }; Write-Output "ok"`;
  if (mode === "revert")
    return `Get-ChildItem "${ifaces}" | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Force -EA SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Force -EA SilentlyContinue }; Write-Output "ok"`;
  return `$i = Get-ChildItem "${ifaces}" | Where-Object { (Get-ItemProperty $_.PSPath -EA SilentlyContinue).TCPNoDelay -eq 1 } | Select-Object -First 1; $i -ne $null`;
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

// ── Base action set (all profiles) ───────────────────────────────────────────

function buildBaseActions(game: GameMeta, exePath: string): ProfileAction[] {
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

// ── Competitive extras (Fortnite, Valorant, CS2, Warzone, etc.) ───────────────

function buildCompetitiveExtras(game: GameMeta): ProfileAction[] {
  return [
    {
      id: "win32-priority",
      label: "Scheduler Foreground Boost",
      category: "cpu",
      description:
        "Sets Win32PrioritySeparation to 38 (0x26) — gives foreground threads a stronger quantum boost for lower input latency.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildWin32PriorityPs("apply"),
      revertPs: buildWin32PriorityPs("revert"),
      checkPs: buildWin32PriorityPs("check"),
    },
    {
      id: "timer-resolution",
      label: "0.5ms Timer Resolution",
      category: "cpu",
      description:
        "Forces Windows to use the platform tick source (useplatformtick), enabling sub-millisecond timer resolution for tighter frame pacing.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: true,
      applyPs: buildTimerResolutionPs("apply"),
      revertPs: buildTimerResolutionPs("revert"),
      checkPs: buildTimerResolutionPs("check"),
    },
    {
      id: "hpet-disable",
      label: "Disable HPET",
      category: "cpu",
      description:
        "Removes the useplatformclock BCD setting, disabling HPET and forcing the TSC as the primary clock source. Reduces timer interrupt overhead.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: true,
      applyPs: buildHpetDisablePs("apply"),
      revertPs: buildHpetDisablePs("revert"),
      checkPs: buildHpetDisablePs("check"),
    },
    {
      id: "nvidia-max-perf",
      label: "NVIDIA Max Performance",
      category: "gpu",
      description:
        "Sets NVIDIA driver registry keys to maximum performance mode. No-op on non-NVIDIA systems.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildNvidiaMaxPerfPs("apply"),
      revertPs: buildNvidiaMaxPerfPs("revert"),
      checkPs: buildNvidiaMaxPerfPs("check"),
    },
    {
      id: "ecore-affinity",
      label: "E-Core Affinity Exclusion",
      category: "cpu",
      description:
        "Pins this game to P-cores only on Intel 12th–14th gen hybrid CPUs, preventing E-core scheduling jitter. No-op on non-hybrid systems.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildECoreAffinityPs(game.executable, "apply"),
      revertPs: buildECoreAffinityPs(game.executable, "revert"),
      checkPs: buildECoreAffinityPs(game.executable, "check"),
    },
    {
      id: "nagle-off",
      label: "Disable Nagle (Per-Interface)",
      category: "network",
      description:
        "Sets TcpAckFrequency=1 and TCPNoDelay=1 on all non-loopback adapters for immediate TCP ACK transmission.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildNagleOffPs("apply"),
      revertPs: buildNagleOffPs("revert"),
      checkPs: buildNagleOffPs("check"),
    },
  ];
}

// ── Simulation/open-world extras (lighter set) ────────────────────────────────

function buildSimulationExtras(): ProfileAction[] {
  return [
    {
      id: "nvidia-max-perf",
      label: "NVIDIA Max Performance",
      category: "gpu",
      description:
        "Sets NVIDIA driver registry keys to maximum performance mode. No-op on non-NVIDIA systems.",
      impact: "high",
      requiresAdmin: true,
      persistent: true,
      activeOnly: false,
      reversible: true,
      requiresRestart: false,
      applyPs: buildNvidiaMaxPerfPs("apply"),
      revertPs: buildNvidiaMaxPerfPs("revert"),
      checkPs: buildNvidiaMaxPerfPs("check"),
    },
  ];
}

export function buildActionsForGame(
  game: GameMeta,
  installPath: string | null,
  profileIdOverride?: string
): ProfileAction[] {
  const exePath = installPath ? `${installPath}\\${game.executable}` : game.executable;
  const base = buildBaseActions(game, exePath);
  const effectiveProfileId = profileIdOverride ?? game.profileId;

  if (effectiveProfileId === "competitive-high") {
    return [...base, ...buildCompetitiveExtras(game)];
  }
  if (effectiveProfileId === "simulation-ultra" || effectiveProfileId === "open-world-performance") {
    return [...base, ...buildSimulationExtras()];
  }
  // single-player-quality and any unknown profiles get base set only
  return base;
}

export function getGameBySlug(slug: string): GameMeta | undefined {
  return SUPPORTED_GAMES.find((g) => g.slug === slug);
}
