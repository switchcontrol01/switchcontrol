export interface GameMeta {
  slug: string;
  name: string;
  publisher: string;
  executable: string;
  knownPaths: string[];
  genre: "competitive" | "open-world" | "simulation" | "mmo" | "battle-royale";
  profileId: string;
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

export const SUPPORTED_GAMES: GameMeta[] = [
  {
    slug: "fortnite",
    name: "Fortnite",
    publisher: "Epic Games",
    executable: "FortniteClient-Win64-Shipping.exe",
    knownPaths: [
      "C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "C:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "D:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "D:\\Games\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "E:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
    ],
    genre: "battle-royale",
    profileId: "competitive-high",
  },
  {
    slug: "valorant",
    name: "Valorant",
    publisher: "Riot Games",
    executable: "VALORANT-Win64-Shipping.exe",
    knownPaths: [
      "C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "C:\\Program Files\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "D:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "D:\\Games\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
    ],
    genre: "competitive",
    profileId: "competitive-high",
  },
  {
    slug: "cs2",
    name: "CS2",
    publisher: "Valve",
    executable: "cs2.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "E:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "E:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
    ],
    genre: "competitive",
    profileId: "competitive-high",
  },
  {
    slug: "apex-legends",
    name: "Apex Legends",
    publisher: "EA / Respawn",
    executable: "r5apex.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends",
      "C:\\Program Files\\EA Games\\Apex Legends",
      "D:\\Steam\\steamapps\\common\\Apex Legends",
      "D:\\SteamLibrary\\steamapps\\common\\Apex Legends",
      "D:\\EA Games\\Apex Legends",
      "E:\\Steam\\steamapps\\common\\Apex Legends",
    ],
    genre: "battle-royale",
    profileId: "competitive-high",
  },
  {
    slug: "warzone",
    name: "Call of Duty: Warzone",
    publisher: "Activision",
    executable: "cod.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Call of Duty",
      "C:\\Program Files\\Battle.net\\Call of Duty",
      "D:\\Call of Duty",
      "D:\\Games\\Call of Duty",
      "E:\\Call of Duty",
    ],
    genre: "battle-royale",
    profileId: "competitive-high",
  },
  {
    slug: "overwatch2",
    name: "Overwatch 2",
    publisher: "Blizzard",
    executable: "Overwatch.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Overwatch",
      "C:\\Program Files\\Overwatch",
      "D:\\Overwatch",
      "D:\\Games\\Overwatch",
    ],
    genre: "competitive",
    profileId: "competitive-high",
  },
  {
    slug: "cyberpunk2077",
    name: "Cyberpunk 2077",
    publisher: "CD Projekt RED",
    executable: "Cyberpunk2077.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64",
      "C:\\GOG Games\\Cyberpunk 2077\\bin\\x64",
      "D:\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64",
      "D:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077\\bin\\x64",
      "D:\\GOG Games\\Cyberpunk 2077\\bin\\x64",
      "E:\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64",
    ],
    genre: "open-world",
    profileId: "single-player-quality",
  },
  {
    slug: "elden-ring",
    name: "Elden Ring",
    publisher: "FromSoftware",
    executable: "eldenring.exe",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\ELDEN RING\\Game",
      "D:\\Steam\\steamapps\\common\\ELDEN RING\\Game",
      "D:\\SteamLibrary\\steamapps\\common\\ELDEN RING\\Game",
      "E:\\Steam\\steamapps\\common\\ELDEN RING\\Game",
      "E:\\SteamLibrary\\steamapps\\common\\ELDEN RING\\Game",
    ],
    genre: "open-world",
    profileId: "single-player-quality",
  },
  {
    slug: "msfs2024",
    name: "Microsoft Flight Simulator 2024",
    publisher: "Microsoft / Asobo",
    executable: "FlightSimulator2024.exe",
    knownPaths: [
      "C:\\XboxGames\\Microsoft Flight Simulator 2024\\Content",
      "D:\\XboxGames\\Microsoft Flight Simulator 2024\\Content",
      "E:\\XboxGames\\Microsoft Flight Simulator 2024\\Content",
      "C:\\Games\\Microsoft Flight Simulator 2024\\Content",
      "D:\\Games\\Microsoft Flight Simulator 2024\\Content",
      "C:\\Program Files\\WindowsApps\\Microsoft.Limitless_Content",
    ],
    genre: "simulation",
    profileId: "single-player-quality",
  },
];

function buildCpuPriorityPs(exe: string, mode: "apply" | "revert" | "check"): string {
  const key = `HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions`;
  if (mode === "apply") {
    return `New-Item -Path "${key}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${key}" -Name "CpuPriorityClass" -Value 6 -Type DWord -Force`;
  }
  if (mode === "revert") {
    return `Remove-Item -Path "${key}" -Recurse -Force -EA SilentlyContinue`;
  }
  return `(Get-ItemProperty -Path "${key}" -Name "CpuPriorityClass" -EA SilentlyContinue).CpuPriorityClass -eq 6`;
}

function buildFsoPs(exePath: string, mode: "apply" | "revert" | "check"): string {
  const regKey = `HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers`;
  const value = `~ DISABLEDXMAXIMIZEDWINDOWEDMODE`;
  if (mode === "apply") {
    return `New-Item -Path "${regKey}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${regKey}" -Name "${exePath}" -Value "${value}" -Type String -Force`;
  }
  if (mode === "revert") {
    return `Remove-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue`;
  }
  return `(Get-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue)."${exePath}" -eq "${value}"`;
}

function buildGpuPrefPs(exePath: string, mode: "apply" | "revert" | "check"): string {
  const regKey = `HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences`;
  if (mode === "apply") {
    return `New-Item -Path "${regKey}" -Force -EA SilentlyContinue | Out-Null; Set-ItemProperty -Path "${regKey}" -Name "${exePath}" -Value "GpuPreference=2;" -Type String -Force`;
  }
  if (mode === "revert") {
    return `Remove-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue`;
  }
  return `(Get-ItemProperty -Path "${regKey}" -Name "${exePath}" -EA SilentlyContinue)."${exePath}" -like "*GpuPreference=2*"`;
}

function buildNetworkQosPs(gameName: string, exePath: string, mode: "apply" | "revert" | "check"): string {
  const policyName = `${gameName} SC-Boost`;
  if (mode === "apply") {
    return `if (!(Get-NetQosPolicy -Name "${policyName}" -EA SilentlyContinue)) { New-NetQosPolicy -Name "${policyName}" -AppPathNameMatchCondition "${exePath}" -IPProtocolMatchCondition Both -DSCPAction 46 -NetworkProfile All -Confirm:$false -EA SilentlyContinue }`;
  }
  if (mode === "revert") {
    return `Remove-NetQosPolicy -Name "${policyName}" -Confirm:$false -EA SilentlyContinue`;
  }
  return `(Get-NetQosPolicy -Name "${policyName}" -EA SilentlyContinue) -ne $null`;
}

export function buildActionsForGame(game: GameMeta, installPath: string | null): ProfileAction[] {
  const exePath = installPath ? `${installPath}\\${game.executable}` : game.executable;

  const actions: ProfileAction[] = [
    {
      id: "cpu-priority",
      label: "CPU Launch Priority",
      category: "cpu",
      description: "Sets game process to AboveNormal priority at launch via Windows IFEO. Persists across reboots.",
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
      description: "Disables Windows Fullscreen Optimizations for this executable. Reduces latency in many games.",
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
      description: "Forces Windows to use the high-performance GPU for this game. Prevents integrated GPU usage.",
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
      description: "Enables Windows Game Mode. Tells the OS to prioritize game resources globally.",
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
      description: "Disables Xbox Game Bar DVR background recording. Frees CPU and memory during gameplay.",
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
      description: "Creates a QoS policy to prioritize game network packets with DSCP EF (46) tagging.",
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

  return actions;
}

export const PROFILES: Record<string, Omit<GameProfile, "actions">> = {
  "competitive-high": {
    id: "competitive-high",
    name: "Competitive",
    description: "Maximum responsiveness for competitive play. Prioritizes CPU/GPU allocation and removes background overhead.",
  },
  "single-player-quality": {
    id: "single-player-quality",
    name: "Quality",
    description: "Balanced settings for single-player and open-world games. Maximizes GPU utilization and stability.",
  },
};

export function getGameBySlug(slug: string): GameMeta | undefined {
  return SUPPORTED_GAMES.find((g) => g.slug === slug);
}
