import type { CatalogEntry } from "./types";

// ── Enriched game catalog ─────────────────────────────────────────────────────
//
// PRIMARY detection: launcher-specific identifiers (steamAppId, epicAppName, etc.)
// SECONDARY detection: knownPaths filesystem scan (last resort only)
// BRANDING: logo/cover URLs using Steam CDN (free, no auth) or curated stable URLs

const STEAM = (appId: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

export const CATALOG: CatalogEntry[] = [
  // ── Battle Royale ─────────────────────────────────────────────────────────

  {
    slug: "fortnite",
    name: "Fortnite",
    publisher: "Epic Games",
    genre: "battle-royale",
    profileId: "competitive-high",
    executable: "FortniteClient-Win64-Shipping.exe",
    epicAppName: "Fortnite",
    knownPaths: [
      "C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "C:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "D:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "D:\\Games\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
      "E:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64",
    ],
    logoUrl: STEAM(2280890),
    coverUrl: STEAM(2280890),
    aliases: ["fortnite battle royale", "fn"],
  },

  {
    slug: "apex-legends",
    name: "Apex Legends",
    publisher: "EA / Respawn",
    genre: "battle-royale",
    profileId: "competitive-high",
    executable: "r5apex.exe",
    steamAppId: 1172470,
    eaDesktopId: "apex_legends",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends",
      "C:\\Program Files\\EA Games\\Apex Legends",
      "D:\\Steam\\steamapps\\common\\Apex Legends",
      "D:\\SteamLibrary\\steamapps\\common\\Apex Legends",
      "D:\\EA Games\\Apex Legends",
      "E:\\Steam\\steamapps\\common\\Apex Legends",
    ],
    logoUrl: STEAM(1172470),
    coverUrl: STEAM(1172470),
    aliases: ["apex", "apex legends"],
  },

  {
    slug: "warzone",
    name: "Call of Duty: Warzone",
    publisher: "Activision",
    genre: "battle-royale",
    profileId: "competitive-high",
    executable: "cod.exe",
    battlenetUid: "FORE",
    knownPaths: [
      "C:\\Program Files (x86)\\Call of Duty",
      "C:\\Program Files\\Battle.net\\Call of Duty",
      "D:\\Call of Duty",
      "D:\\Games\\Call of Duty",
      "E:\\Call of Duty",
    ],
    logoUrl: STEAM(2619640),
    coverUrl: STEAM(2619640),
    aliases: ["warzone", "cod warzone", "call of duty warzone", "call of duty: warzone"],
  },

  // ── Competitive FPS ───────────────────────────────────────────────────────

  {
    slug: "valorant",
    name: "Valorant",
    publisher: "Riot Games",
    genre: "competitive",
    profileId: "competitive-high",
    executable: "VALORANT-Win64-Shipping.exe",
    riotClientId: "valorant",
    knownPaths: [
      "C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "C:\\Program Files\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "D:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
      "D:\\Games\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64",
    ],
    logoUrl: STEAM(2694490),
    coverUrl: STEAM(2694490),
    aliases: ["valorant", "valo"],
  },

  {
    slug: "cs2",
    name: "Counter-Strike 2",
    publisher: "Valve",
    genre: "competitive",
    profileId: "competitive-high",
    executable: "cs2.exe",
    steamAppId: 730,
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "E:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
      "E:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64",
    ],
    logoUrl: STEAM(730),
    coverUrl: STEAM(730),
    aliases: ["cs2", "counter-strike 2", "csgo", "cs:go", "counter strike 2", "counter-strike global offensive"],
  },

  {
    slug: "overwatch2",
    name: "Overwatch 2",
    publisher: "Blizzard",
    genre: "competitive",
    profileId: "competitive-high",
    executable: "Overwatch.exe",
    battlenetUid: "Pro",
    steamAppId: 2357570,
    knownPaths: [
      "C:\\Program Files (x86)\\Overwatch",
      "C:\\Program Files\\Overwatch",
      "D:\\Overwatch",
      "D:\\Games\\Overwatch",
    ],
    logoUrl: STEAM(2357570),
    coverUrl: STEAM(2357570),
    aliases: ["overwatch 2", "ow2", "overwatch"],
  },

  {
    slug: "rainbow-six-siege",
    name: "Rainbow Six Siege",
    publisher: "Ubisoft",
    genre: "competitive",
    profileId: "competitive-high",
    executable: "RainbowSix.exe",
    steamAppId: 359550,
    ubisoftGameId: "Rainbow Six Siege",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Tom Clancy's Rainbow Six Siege",
      "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Tom Clancy's Rainbow Six Siege",
      "D:\\Steam\\steamapps\\common\\Tom Clancy's Rainbow Six Siege",
      "D:\\Ubisoft\\Tom Clancy's Rainbow Six Siege",
    ],
    logoUrl: STEAM(359550),
    coverUrl: STEAM(359550),
    aliases: ["rainbow six siege", "r6s", "r6 siege", "siege"],
  },

  // ── Simulation ────────────────────────────────────────────────────────────

  {
    slug: "msfs-2024",
    name: "Microsoft Flight Simulator 2024",
    publisher: "Microsoft / Asobo",
    genre: "simulation",
    profileId: "simulation-ultra",
    executable: "FlightSimulator.exe",
    steamAppId: 2537590,
    xboxPackageName: "Microsoft.FlightSimulator2024",
    epicAppName: "Microsoft Flight Simulator 2024",
    knownPaths: [
      "C:\\Program Files\\WindowsApps\\Microsoft.FlightSimulator2024_8wekyb3d8bbwe",
      "D:\\Xbox Games\\Microsoft Flight Simulator 2024",
      "C:\\XboxGames\\Microsoft Flight Simulator 2024",
      "D:\\Microsoft Flight Simulator 2024",
    ],
    logoUrl: STEAM(2537590),
    coverUrl: STEAM(2537590),
    aliases: [
      "microsoft flight simulator 2024",
      "msfs 2024",
      "msfs2024",
      "flight simulator 2024",
      "Microsoft.FlightSimulator2024_8wekyb3d8bbwe",
    ],
  },

  {
    slug: "msfs-2020",
    name: "Microsoft Flight Simulator 2020",
    publisher: "Microsoft / Asobo",
    genre: "simulation",
    profileId: "simulation-ultra",
    executable: "FlightSimulator.exe",
    steamAppId: 1250410,
    xboxPackageName: "Microsoft.FlightSimulator",
    knownPaths: [
      "C:\\Program Files\\WindowsApps\\Microsoft.FlightSimulator_8wekyb3d8bbwe",
      "D:\\Xbox Games\\Microsoft Flight Simulator",
      "C:\\XboxGames\\Microsoft Flight Simulator",
    ],
    logoUrl: STEAM(1250410),
    coverUrl: STEAM(1250410),
    aliases: ["microsoft flight simulator", "msfs", "msfs 2020", "flight simulator 2020"],
  },

  // ── Open-world / RPG ──────────────────────────────────────────────────────

  {
    slug: "gta5",
    name: "Grand Theft Auto V",
    publisher: "Rockstar Games",
    genre: "open-world",
    profileId: "open-world-performance",
    executable: "GTA5.exe",
    steamAppId: 271590,
    epicAppName: "GrandTheftAutoV",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V",
      "C:\\Program Files\\Rockstar Games\\Grand Theft Auto V",
      "D:\\Steam\\steamapps\\common\\Grand Theft Auto V",
      "D:\\Rockstar Games\\Grand Theft Auto V",
      "E:\\Games\\Grand Theft Auto V",
    ],
    logoUrl: STEAM(271590),
    coverUrl: STEAM(271590),
    aliases: ["gta 5", "gta5", "grand theft auto v", "gta v"],
  },

  {
    slug: "cyberpunk",
    name: "Cyberpunk 2077",
    publisher: "CD Projekt Red",
    genre: "rpg",
    profileId: "open-world-performance",
    executable: "Cyberpunk2077.exe",
    steamAppId: 1091500,
    epicAppName: "CyberpunkGame",
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077",
      "C:\\Program Files\\Epic Games\\Cyberpunk 2077",
      "D:\\Steam\\steamapps\\common\\Cyberpunk 2077",
      "D:\\GOG Games\\Cyberpunk 2077",
    ],
    logoUrl: STEAM(1091500),
    coverUrl: STEAM(1091500),
    aliases: ["cyberpunk 2077", "cyberpunk2077", "cp2077", "cyberpunk"],
  },

  {
    slug: "elden-ring",
    name: "Elden Ring",
    publisher: "Bandai Namco / FromSoftware",
    genre: "rpg",
    profileId: "open-world-performance",
    executable: "eldenring.exe",
    steamAppId: 1245620,
    knownPaths: [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\ELDEN RING\\Game",
      "D:\\Steam\\steamapps\\common\\ELDEN RING\\Game",
      "D:\\SteamLibrary\\steamapps\\common\\ELDEN RING\\Game",
    ],
    logoUrl: STEAM(1245620),
    coverUrl: STEAM(1245620),
    aliases: ["elden ring", "eldenring"],
  },

  // ── MMO ───────────────────────────────────────────────────────────────────

  {
    slug: "league-of-legends",
    name: "League of Legends",
    publisher: "Riot Games",
    genre: "mmo",
    profileId: "competitive-high",
    executable: "LeagueClient.exe",
    riotClientId: "lol",
    knownPaths: [
      "C:\\Riot Games\\League of Legends",
      "C:\\Program Files\\Riot Games\\League of Legends",
      "D:\\Riot Games\\League of Legends",
      "D:\\Games\\Riot Games\\League of Legends",
    ],
    logoUrl: STEAM(2154380),
    coverUrl: STEAM(2154380),
    aliases: ["lol", "league", "league of legends"],
  },

  {
    slug: "world-of-warcraft",
    name: "World of Warcraft",
    publisher: "Blizzard",
    genre: "mmo",
    profileId: "open-world-performance",
    executable: "Wow.exe",
    battlenetUid: "WoW",
    knownPaths: [
      "C:\\Program Files (x86)\\World of Warcraft",
      "C:\\Program Files\\World of Warcraft",
      "D:\\World of Warcraft",
      "D:\\Games\\World of Warcraft",
    ],
    logoUrl: STEAM(2835570),
    coverUrl: STEAM(2835570),
    aliases: ["world of warcraft", "wow"],
  },

  // ── Racing / Sports ───────────────────────────────────────────────────────

  {
    slug: "rocket-league",
    name: "Rocket League",
    publisher: "Psyonix / Epic",
    genre: "racing",
    profileId: "competitive-high",
    executable: "RocketLeague.exe",
    epicAppName: "Sugar",
    steamAppId: 252950,
    knownPaths: [
      "C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64",
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\rocketleague\\Binaries\\Win64",
      "D:\\Epic Games\\rocketleague\\Binaries\\Win64",
      "D:\\Steam\\steamapps\\common\\rocketleague\\Binaries\\Win64",
    ],
    logoUrl: STEAM(252950),
    coverUrl: STEAM(252950),
    aliases: ["rocket league", "rl"],
  },

  // ── Sandbox / Survival ───────────────────────────────────────────────────

  {
    slug: "minecraft",
    name: "Minecraft",
    publisher: "Mojang / Microsoft",
    genre: "open-world",
    profileId: "open-world-performance",
    executable: "Minecraft.Windows.exe",
    xboxPackageName: "Microsoft.MinecraftUWP",
    knownPaths: [
      "C:\\Program Files\\WindowsApps\\Microsoft.MinecraftUWP_8wekyb3d8bbwe",
      "C:\\Program Files (x86)\\Minecraft Launcher",
      "C:\\Program Files\\Minecraft Launcher",
      "%LOCALAPPDATA%\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe\\LocalState\\games\\com.mojang",
      "C:\\Users\\%USERNAME%\\AppData\\Roaming\\.minecraft",
      "D:\\Minecraft",
    ],
    logoUrl: STEAM(2328520),
    coverUrl: STEAM(2328520),
    aliases: ["minecraft", "mc", "minecraft java", "minecraft bedrock", "minecraft windows 10"],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export function getCatalogBySlug(slug: string): CatalogEntry | undefined {
  return CATALOG.find((g) => g.slug === slug);
}

export function getCatalogBySteamId(appId: number): CatalogEntry | undefined {
  return CATALOG.find((g) => g.steamAppId === appId);
}

export function getCatalogByEpicName(appName: string): CatalogEntry | undefined {
  const lc = appName.toLowerCase();
  return CATALOG.find(
    (g) =>
      g.epicAppName?.toLowerCase() === lc ||
      g.aliases.some((a) => a.toLowerCase() === lc)
  );
}

export function getCatalogByXboxPackage(pkgName: string): CatalogEntry | undefined {
  const lc = pkgName.toLowerCase();
  return CATALOG.find(
    (g) =>
      g.xboxPackageName?.toLowerCase().includes(lc) ||
      lc.includes((g.xboxPackageName ?? "").toLowerCase()) ||
      g.aliases.some((a) => a.toLowerCase() === lc)
  );
}

export function matchByNormalizedName(name: string): CatalogEntry | undefined {
  const norm = normalizeName(name);
  return CATALOG.find(
    (g) =>
      normalizeName(g.name) === norm ||
      g.aliases.some((a) => normalizeName(a) === norm)
  );
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(edition|deluxe|ultimate|gold|complete|goty|remastered|enhanced|definitive)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
