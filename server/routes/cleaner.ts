import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, isNoDbMode } from "../db";
import { storage } from "../storage";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export type CleanMode = "safe" | "advanced";
export type CleanCategory = "storage" | "privacy" | "latency" | "performance" | "gaming" | "apps" | "browsers" | "windows_system" | "storage_cleanup";
export type CleanItemRisk = "safe" | "moderate" | "advanced";
export type CleanStatus = "cleaned" | "partial" | "nothing" | "failed" | "verification-failed" | "unsupported";

export interface CleanItemDef {
  id: string;
  name: string;
  description: string;
  category: CleanCategory;
  risk: CleanItemRisk;
  impactRam: number;
  impactBootSec: number;
  requiresAdmin: boolean;
  requiresRestart: boolean;
  estimateBasis: string;
  diskBased: boolean;
  warning?: string;
}

// ── Canonical item registry ───────────────────────────────────────────────────

const ITEM_REGISTRY: CleanItemDef[] = [
  {
    id: "windows_temp",
    name: "Windows Temp Files",
    description: "System (%WINDIR%\\Temp) and user (%TEMP%) temporary files. Safe to delete — Windows recreates them as needed.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from system and user temp directories.",
    diskBased: true,
  },
  {
    id: "update_downloads",
    name: "Windows Update Download Cache",
    description: "Downloaded update packages in SoftwareDistribution\\Download. Safe after updates complete — Windows re-downloads if needed.",
    category: "storage",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from SoftwareDistribution\\Download.",
    diskBased: true,
  },
  {
    id: "crash_dumps",
    name: "Crash Dumps",
    description: "Memory minidumps and kernel crash artifacts from previous crashes. No value after investigation.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Minidump and LiveKernelReports folders.",
    diskBased: true,
  },
  {
    id: "wer_reports",
    name: "Windows Error Reports",
    description: "Archived error and crash reports stored by Windows Error Reporting. Not needed after submission.",
    category: "storage",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from WER report archive folders.",
    diskBased: true,
  },
  {
    id: "thumbcache",
    name: "Thumbnail Cache",
    description: "Explorer thumbnail database files. Windows rebuilds on demand. Clears stale previews.",
    category: "privacy",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes of thumbcache_*.db files.",
    diskBased: true,
  },
  {
    id: "recent_files",
    name: "Recent Files List",
    description: "Shell shortcut (.lnk) files in the Recent folder. Clears the quick-access recent list.",
    category: "privacy",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file count of .lnk files in Recent folder.",
    diskBased: false,
  },
  {
    id: "discord_cache",
    name: "Discord Cache",
    description: "Discord web cache, code cache, and GPU cache. Discord rebuilds automatically — safe to wipe.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Discord cache directories.",
    diskBased: true,
  },
  {
    id: "inet_cache",
    name: "Windows Internet Cache",
    description: "Windows INetCache files only. Kept separate from Steam so each location is counted once.",
    category: "latency", risk: "safe",
    impactRam: 0, impactBootSec: 0, requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from user and local Windows INetCache folders.", diskBased: true,
  },
  {
    id: "steam_htmlcache",
    name: "Browser & Web Caches",
    description: "Steam web-helper cache from discovered Steam installations and libraries. Rebuilt on next use.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from discovered Steam installations and libraries.",
    diskBased: true,
  },
  {
    id: "shader_cache",
    name: "GPU Shader Caches",
    description: "NVIDIA DXCache, GLCache, AMD DxCache, and D3D shader caches. Recompiled on next game launch. Moderate risk — may cause stutters on first run after cleaning.",
    category: "latency",
    risk: "moderate",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from GPU shader cache directories.",
    diskBased: true,
  },
  {
    id: "anticheat_temp",
    name: "Anti-Cheat Temp Files",
    description: "EasyAntiCheat, Vanguard, and BattlEye temp directories. Re-created on game launch.",
    category: "latency",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from known anti-cheat temp folders.",
    diskBased: true,
  },
  {
    id: "dns_cache",
    name: "DNS Cache",
    description: "DNS resolver cache (in-memory). Flushed via ipconfig /flushdns. May briefly slow name resolution on first requests after cleaning.",
    category: "latency",
    risk: "safe",
    impactRam: 4,
    impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Count of cached DNS entries. RAM estimate is conservative (4MB max).",
    diskBased: false,
  },
  {
    id: "dead_startup_entries",
    name: "Dead Startup Entries",
    description: "Registry startup entries pointing to executables that no longer exist. Each entry adds a small boot-time lookup cost.",
    category: "performance",
    risk: "safe",
    impactRam: 0, impactBootSec: 0.3,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Per-entry boot overhead: ~0.3s conservative estimate per dead entry.",
    diskBased: false,
  },
  {
    id: "event_logs_old",
    name: "Non-Critical Event Log Archives",
    description: "Archived Windows event log files (excluding System, Application, Security, Setup). Safe on most systems.",
    category: "performance",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from non-critical .evtx log files.",
    diskBased: false,
  },

  // ── Gaming ─────────────────────────────────────────────────────────────────
  {
    id: "steam_download_cache",
    name: "Steam Download Cache",
    description: "Incomplete or paused Steam download chunks and temp files. Safe to delete — Steam re-downloads if needed.",
    category: "gaming",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Steam steamapps/downloading and steamapps/temp.",
    diskBased: true,
  },
  {
    id: "steam_shader_cache",
    name: "Steam Shader Cache",
    description: "Pre-compiled shader cache for Steam games. Recompiled on next launch — may cause brief stutters after cleaning.",
    category: "gaming",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Steam steamapps/shadercache.",
    diskBased: true,
  },
  {
    id: "epic_games_cache",
    name: "Epic Games Cache",
    description: "Epic Games Launcher web cache and log files. Rebuilt automatically on next launch.",
    category: "gaming",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from EpicGamesLauncher Saved/webcache and Saved/Logs.",
    diskBased: true,
  },
  {
    id: "ea_app_cache", name: "EA App Cache",
    description: "EA App cache and logs only. Game installs and settings are not touched.",
    category: "gaming", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Known EA App cache and log directories.", diskBased: true,
  },
  {
    id: "battle_net_cache", name: "Battle.net Cache",
    description: "Battle.net cache and logs. Rebuilt on next launch; game installations are untouched.",
    category: "gaming", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Known Battle.net cache and log directories.", diskBased: true,
  },
  {
    id: "ubisoft_cache", name: "Ubisoft Connect Cache",
    description: "Ubisoft Connect cache and logs only.",
    category: "gaming", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Known Ubisoft Connect cache and log directories.", diskBased: true,
  },
  {
    id: "riot_client_cache", name: "Riot Client Cache",
    description: "Riot Client cache and logs only. Game data is not touched.",
    category: "gaming", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Known Riot Client cache and log directories.", diskBased: true,
  },

  // ── Apps ──────────────────────────────────────────────────────────────────
  {
    id: "spotify_cache",
    name: "Spotify Cache",
    description: "Spotify local song and artwork cache. Rebuilt from the cloud on demand — no music is lost.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Spotify Data folder in LocalAppData and AppData.",
    diskBased: true,
  },
  {
    id: "vscode_cache",
    name: "VS Code Cache",
    description: "VS Code file cache, cached extension data, and log files. Rebuilt automatically.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Code/Cache, Code/CachedData, and Code/logs.",
    diskBased: true,
  },
  {
    id: "teams_cache",
    name: "Microsoft Teams Cache",
    description: "Teams local cache, blob storage, GPU cache, and temp data. Teams rebuilds on next sign-in.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Teams cache sub-folders in AppData/Roaming.",
    diskBased: true,
  },
  {
    id: "zoom_cache",
    name: "Zoom Cache",
    description: "Zoom local data and cache files. Rebuilt on next Zoom session.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Zoom/data in AppData/Roaming and LocalAppData.",
    diskBased: true,
  },
  {
    id: "obs_cache",
    name: "OBS Cache",
    description: "OBS Studio log files and crash reports. No recordings or settings are affected.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from obs-studio/logs and obs-studio/crashes.",
    diskBased: true,
  },
  {
    id: "voicemeeter_logs",
    name: "Voicemeeter Logs",
    description: "Voicemeeter Banana log files accumulated over time. Settings and routing are not affected.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes of *.log files in the VoicemeeterBanana folder.",
    diskBased: true,
  },
  {
    id: "discord_variants_cache", name: "Discord Canary & PTB Cache",
    description: "Cache files for Discord Canary, PTB, and alternate installs. Messages and account data are not touched.",
    category: "apps", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Known cache directories for Discord release channels.", diskBased: true,
  },
  {
    id: "office_temp", name: "Office & Outlook Temporary Files",
    description: "Temporary Office and Outlook cache files. Mail, documents, and profiles are not deleted.",
    category: "apps", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Scoped OfficeFileCache, Outlook RoamCache, and *.tmp files.", diskBased: true,
  },
  {
    id: "adobe_cache",
    name: "Adobe Cache",
    description: "Adobe Premiere Pro, After Effects disk cache, and Media Cache Files. Rebuilt when you next open a project.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Adobe Common/Media Cache Files, Premiere Pro cache, and After Effects disk cache.",
    diskBased: true,
  },
  {
    id: "onedrive_cache",
    name: "OneDrive Cache",
    description: "OneDrive diagnostic logs and temp files. Your synced files are unaffected.",
    category: "apps",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from OneDrive logs and temp folders in LocalAppData.",
    diskBased: true,
  },

  // ── Browsers ──────────────────────────────────────────────────────────────
  {
    id: "edge_cache",
    name: "Microsoft Edge Cache",
    description: "Edge browser cache and code cache. Pages may load slightly slower on first visit after cleaning.",
    category: "browsers",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Edge User Data/Default/Cache and Code Cache.",
    diskBased: true,
  },
  {
    id: "chrome_cache",
    name: "Chrome Cache",
    description: "Chrome browser cache and code cache. Pages may load slightly slower on first visit after cleaning.",
    category: "browsers",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Chrome User Data/Default/Cache and Code Cache.",
    diskBased: true,
  },
  {
    id: "firefox_cache",
    name: "Firefox Cache",
    description: "Firefox browser cache and startup cache across all default-release profiles.",
    category: "browsers",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from Firefox Profiles/*.default-release/cache2 and startupCache.",
    diskBased: true,
  },
  {
    id: "browser_crash_logs", name: "Browser Crash Reports",
    description: "Crash reports and temporary browser diagnostics across all discovered Chrome, Edge, and Firefox profiles.",
    category: "browsers", risk: "safe", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Scoped crash-report directories across discovered profiles.", diskBased: true,
  },
  {
    id: "windows_setup_logs", name: "Windows Setup Logs",
    description: "Old Windows setup and upgrade log files. Useful for troubleshooting only; no system files are removed.",
    category: "windows_system", risk: "advanced", impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false, estimateBasis: "Scoped *.log files in Windows setup log directories.", diskBased: true,
  },
  {
    id: "visual_studio_cache", name: "Visual Studio Logs",
    description: "Visual Studio diagnostic logs only. Projects, solutions, extensions, and source files are not touched.",
    category: "apps", risk: "advanced", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Scoped Visual Studio and VSCommon *.log files.", diskBased: true,
  },
  {
    id: "jetbrains_logs", name: "JetBrains Logs",
    description: "JetBrains IDE log files only. Projects and IDE settings remain untouched.",
    category: "apps", risk: "advanced", impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false, estimateBasis: "Scoped JetBrains *.log files.", diskBased: true,
  },

  // ── Windows System ─────────────────────────────────────────────────────────
  {
    id: "windows_prefetch",
    name: "Windows Prefetch Files",
    description: "Prefetch data (.pf) used to speed up app cold launches. Windows rebuilds on next run. May slow first cold launch after cleaning.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of *.pf files in Windows/Prefetch.",
    diskBased: true,
  },
  {
    id: "windows_font_cache",
    name: "Windows Font Cache",
    description: "Font cache .dat files used by the font service. Rebuilt on next boot. Clearing can briefly affect text rendering.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of *.dat files in LocalService FontCache folder.",
    diskBased: false,
  },
  {
    id: "windows_icon_cache",
    name: "Windows Icon Cache",
    description: "Explorer icon cache files. Cleared icons rebuild automatically. May cause brief Explorer refresh.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes of IconCache.db and iconcache*.db files.",
    diskBased: false,
  },
  {
    id: "windows_installer_leftovers",
    name: "Windows Installer Leftovers",
    description: "Cached patch files in the Windows Installer $PatchCache$ folder. Removing these prevents rollback of older MSI packages.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from Windows/Installer/$PatchCache$.",
    diskBased: false,
  },
  {
    id: "windows_memory_dump",
    name: "Windows Memory Dump Files",
    description: "Full and mini memory dumps from previous crashes. No value after investigation. Safe to remove.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of MEMORY.DMP and Minidump/*.dmp files.",
    diskBased: true,
  },
  {
    id: "windows_cbs_logs",
    name: "Windows CBS Logs",
    description: "Component-Based Servicing logs generated by Windows Update and system maintenance.",
    category: "windows_system",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of *.log files in Windows/Logs/CBS.",
    diskBased: true,
  },
  {
    id: "windows_dism_logs",
    name: "Windows DISM Logs",
    description: "Deployment Image Servicing and Management tool logs. Safe to remove after system servicing.",
    category: "windows_system",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of *.log files in Windows/Logs/DISM.",
    diskBased: true,
  },
  {
    id: "windows_defender_history",
    name: "Windows Defender Scan History",
    description: "Historical scan records retained by Windows Defender. Manual deletion is disabled to avoid interfering with protection diagnostics.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from Windows Defender Scans/History/Service folder.",
    diskBased: false,
  },
  {
    id: "windows_delivery_optimization",
    name: "Windows Delivery Optimization Cache",
    description: "Files cached by Delivery Optimization for peer-to-peer Windows Update distribution. Safe to remove.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from SoftwareDistribution/DeliveryOptimization.",
    diskBased: false,
  },
  {
    id: "wer_queue",
    name: "WER Queue (Windows Error Reporting)",
    description: "System-wide Windows Error Reporting queued and archived reports in ProgramData. Safe to remove.",
    category: "windows_system",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from ProgramData/Microsoft/Windows/WER/ReportQueue and ReportArchive.",
    diskBased: true,
  },
  {
    id: "print_spooler",
    name: "Print Spooler Queue",
    description: "Pending print jobs in the spooler queue. Clearing stops any active print jobs — use with caution.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from Windows/System32/spool/PRINTERS.",
    diskBased: true,
  },
  {
    id: "iis_logs",
    name: "IIS Logs",
    description: "Internet Information Services web server access logs. Only present on systems with IIS installed.",
    category: "windows_system",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from C:/inetpub/logs/LogFiles (only if IIS is installed).",
    diskBased: true,
  },
  {
    id: "bluetooth_pairing_logs",
    name: "Bluetooth Pairing Logs",
    description: "Windows event log files for Bluetooth events. Clearing does not affect paired devices or connectivity.",
    category: "windows_system",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes of Microsoft-Windows-Bluetooth*.evtx log files.",
    diskBased: true,
  },

  // ── Storage Cleanup ────────────────────────────────────────────────────────
  {
    id: "recycle_bin",
    name: "Recycle Bin",
    description: "Files currently sitting in the Recycle Bin across all drives. Permanently deletes them.",
    category: "storage_cleanup",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from $Recycle.Bin on all filesystem drives.",
    diskBased: true,
  },
  {
    id: "old_windows_update",
    name: "Old Windows Update Leftovers",
    description: "Windows.old and $WinREAgent folders left after a Windows upgrade. Removes the ability to roll back Windows.",
    category: "storage_cleanup",
    risk: "advanced",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: true, requiresRestart: false,
    estimateBasis: "Real file sizes from C:/Windows.old and C:/$WinREAgent if they exist.",
    diskBased: false,
  },
  {
    id: "nvidia_driver_cache",
    name: "NVIDIA Driver Install Cache",
    description: "NVIDIA driver installer leftovers in C:\\NVIDIA and Temp. Safe to remove after drivers are installed.",
    category: "storage_cleanup",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from C:/NVIDIA and Temp/NVIDIA Corporation.",
    diskBased: true,
  },
  {
    id: "amd_driver_cache",
    name: "AMD Driver Install Cache",
    description: "AMD driver installer leftovers in C:\\AMD and Temp. Safe to remove after drivers are installed.",
    category: "storage_cleanup",
    risk: "safe",
    impactRam: 0, impactBootSec: 0,
    requiresAdmin: false, requiresRestart: false,
    estimateBasis: "Real file sizes from C:/AMD and Temp/AMD.",
    diskBased: true,
  },
];

// ── Mode filtering ────────────────────────────────────────────────────────────

function getItemsForMode(mode: CleanMode): CleanItemDef[] {
  if (mode === "advanced") return ITEM_REGISTRY;
  return ITEM_REGISTRY.filter(i => i.risk === "safe");
}

// ── DB init ───────────────────────────────────────────────────────────────────

async function initTable() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cleaner_history (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL DEFAULT '__legacy__',
      scan_mode     TEXT NOT NULL DEFAULT 'safe',
      item_ids      JSONB NOT NULL DEFAULT '[]',
      bytes_removed BIGINT NOT NULL DEFAULT 0,
      files_removed INT NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'cleaned',
      scan_results  JSONB,
      clean_results JSONB,
      errors        INT NOT NULL DEFAULT 0,
      ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add user_id to any pre-existing table
  await db.execute(sql`ALTER TABLE cleaner_history ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cleaner_scan_history (
      id              SERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL DEFAULT '__legacy__',
      scan_mode       TEXT NOT NULL DEFAULT 'safe',
      total_bytes     BIGINT NOT NULL DEFAULT 0,
      total_files     INT NOT NULL DEFAULT 0,
      found_count     INT NOT NULL DEFAULT 0,
      category_totals JSONB,
      ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE cleaner_scan_history ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '__legacy__'`);
}

initTable().catch(e => console.error("[Cleaner] table init failed:", e.message));

async function initStorageTable() {
  if (isNoDbMode || !db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drive_optimization_history (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL DEFAULT '__legacy__',
      drive_letter  TEXT NOT NULL,
      drive_model   TEXT NOT NULL DEFAULT '',
      media_type    TEXT NOT NULL DEFAULT 'Unknown',
      optimize_type TEXT NOT NULL DEFAULT 'trim',
      duration_ms   INT NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'success',
      ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
initStorageTable().catch(e => console.error("[Storage] table init failed:", e.message));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/cleaner/categories?mode=safe|advanced
router.get("/categories", (req, res) => {
  const mode = (req.query.mode as CleanMode) ?? "safe";
  const items = getItemsForMode(mode);
  const categories: Record<CleanCategory, any[]> = {
    storage: [], privacy: [], latency: [], performance: [],
    gaming: [], apps: [], browsers: [], windows_system: [], storage_cleanup: [],
  };
  for (const item of items) {
    const { id, name, description, category, risk, impactRam, impactBootSec,
      requiresAdmin, requiresRestart, estimateBasis, diskBased } = item;
    categories[category].push({
      id, name, description, category, risk, impactRam, impactBootSec,
      requiresAdmin, requiresRestart, estimateBasis, diskBased,
      defaultSelected: risk === "safe",
    });
  }
  res.json({ ok: true, mode, categories });
});

// POST /api/cleaner/scan
// Body: { mode, electronResults }
router.post("/scan", async (req: any, res) => {
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  const { mode = "safe", electronResults = {} } = req.body as {
    mode?: CleanMode;
    electronResults?: Record<string, { sizeBytes?: number; fileCount?: number; found?: boolean; error?: string }>;
  };

  if (mode !== "safe" && mode !== "advanced") {
    return res.status(400).json({ ok: false, error: "mode must be safe or advanced" });
  }
  if (!electronResults || typeof electronResults !== "object" || Array.isArray(electronResults)) {
    return res.status(400).json({ ok: false, error: "electronResults must be an object" });
  }
  const items = getItemsForMode(mode);
  const findings: Record<string, any> = {};

  let totalBytes = 0;
  let totalFiles = 0;

  for (const item of items) {
    const er = electronResults[item.id];
    if (!er) {
      findings[item.id] = {
        id: item.id, sizeBytes: 0, fileCount: 0, found: false,
        scanStatus: "pending", impactBootSec: 0, impactRamMb: 0,
      };
      continue;
    }
    if (typeof er !== "object" || Array.isArray(er)) {
      return res.status(400).json({ ok: false, error: `Invalid scan result for ${item.id}` });
    }

    const sizeBytes = er.sizeBytes ?? 0;
    const fileCount = er.fileCount ?? 0;
    if ((typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) ||
        (typeof fileCount !== "number" || !Number.isFinite(fileCount) || fileCount < 0 || !Number.isInteger(fileCount)) ||
        (er.found !== undefined && typeof er.found !== "boolean")) {
      return res.status(400).json({ ok: false, error: `Invalid numeric scan result for ${item.id}` });
    }
    const found     = er.found ?? (fileCount > 0 || sizeBytes > 0);
    const hasError  = !!er.error;

    let impactBootSec = 0, impactRamMb = 0;
    if (item.id === "dead_startup_entries" && found) impactBootSec = +(fileCount * item.impactBootSec).toFixed(1);
    if (item.id === "dns_cache" && found) impactRamMb = Math.min(item.impactRam, fileCount > 0 ? 4 : 0);
    if (item.diskBased) { totalBytes += sizeBytes; totalFiles += fileCount; }

    findings[item.id] = {
      id: item.id, sizeBytes, fileCount, found,
      scanStatus: hasError ? "error" : "scanned",
      error: er.error, impactBootSec, impactRamMb,
    };
  }

  const categoryTotals: Record<string, { sizeBytes: number; fileCount: number; itemCount: number }> = {
    storage: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    privacy: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    latency: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    performance: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    gaming: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    apps: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    browsers: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    windows_system: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
    storage_cleanup: { sizeBytes: 0, fileCount: 0, itemCount: 0 },
  };
  for (const item of items) {
    const f = findings[item.id];
    if (f?.found) {
      categoryTotals[item.category].sizeBytes += f.sizeBytes ?? 0;
      categoryTotals[item.category].fileCount += f.fileCount ?? 0;
      categoryTotals[item.category].itemCount += 1;
    }
  }

  const totalBootSec = Object.values(findings).reduce((a: number, f: any) => a + (f.impactBootSec ?? 0), 0);
  const totalRamMb   = Object.values(findings).reduce((a: number, f: any) => a + (f.impactRamMb ?? 0), 0);
  const foundCount   = Object.values(findings).filter((f: any) => f.found).length;

  // Persist scan summary to scan history
  if (!isNoDbMode && db) {
    db.execute(sql`
      INSERT INTO cleaner_scan_history
        (user_id, scan_mode, total_bytes, total_files, found_count, category_totals)
      VALUES
        (${userId}, ${mode}, ${totalBytes}, ${totalFiles}, ${foundCount}, ${JSON.stringify(categoryTotals)})
    `).catch(e => console.warn("[Cleaner] scan history insert failed:", e.message));
  }

  res.json({
    ok: true, mode, findings, categoryTotals,
    summary: {
      totalBytes, totalFiles,
      totalBootSec: +totalBootSec.toFixed(1),
      totalRamMb, foundCount,
    },
  });
});

// POST /api/cleaner/clean
router.post("/clean", async (req: any, res) => {
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  const { mode = "safe", itemIds = [], electronResults = {} } = req.body as {
    mode?: CleanMode;
    itemIds?: string[];
    electronResults?: Record<string, { bytesRemoved?: number; filesRemoved?: number; failed?: number; error?: string }>;
  };

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ ok: false, error: "No items specified" });
  }
  if ((mode !== "safe" && mode !== "advanced") ||
      itemIds.some((id: unknown) => typeof id !== "string" || !id.trim()) ||
      new Set(itemIds).size !== itemIds.length) {
    return res.status(400).json({ ok: false, error: "mode, itemIds and their values are invalid" });
  }
  if (!electronResults || typeof electronResults !== "object" || Array.isArray(electronResults)) {
    return res.status(400).json({ ok: false, error: "electronResults must be an object" });
  }

  const results: Record<string, {
    id: string; status: CleanStatus;
    bytesRemoved: number; filesRemoved: number; error?: string;
  }> = {};

  let totalBytesRemoved = 0, totalFilesRemoved = 0, errors = 0;

  for (const itemId of itemIds) {
    const def = ITEM_REGISTRY.find(i => i.id === itemId);
    if (!def) {
      results[itemId] = { id: itemId, status: "unsupported", bytesRemoved: 0, filesRemoved: 0 };
      continue;
    }

    const er = electronResults[itemId];

    // No electron data = not actually cleaned (browser mode or IPC failure)
    if (!er) {
      results[itemId] = {
        id: itemId,
        status: "unsupported",
        bytesRemoved: 0,
        filesRemoved: 0,
      };
      continue;
    }
    if (!def.diskBased && (er.error === "unsupported-item" || er.error === "unknown-item")) {
      results[itemId] = {
        id: itemId, status: "unsupported", bytesRemoved: 0, filesRemoved: 0,
        error: "This cleanup requires a supported Windows maintenance flow.",
      };
      continue;
    }

    let status: CleanStatus = "cleaned";
    let bytesRemoved = 0, filesRemoved = 0;
    let error: string | undefined;

    if (er) {
      bytesRemoved = er.bytesRemoved ?? 0;
      filesRemoved = er.filesRemoved ?? 0;
      const failed = er.failed ?? 0;
      error        = er.error;
      if (![bytesRemoved, filesRemoved, failed].every(v =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v))) {
        return res.status(400).json({ ok: false, error: `Invalid numeric clean result for ${itemId}` });
      }
      if (error !== undefined && typeof error !== "string") {
        return res.status(400).json({ ok: false, error: `Invalid error value for ${itemId}` });
      }

      if (error || (failed > 0 && filesRemoved === 0)) { status = "failed"; errors++; }
      else if (filesRemoved === 0 && bytesRemoved === 0) status = "nothing";
      else if (failed > 0) status = "partial";
      else status = "cleaned";
    }

    totalBytesRemoved += bytesRemoved;
    totalFilesRemoved += filesRemoved;
    results[itemId] = { id: itemId, status, bytesRemoved, filesRemoved, error };
  }

  if (!isNoDbMode && db) {
    await db.execute(sql`
      INSERT INTO cleaner_history
        (user_id, scan_mode, item_ids, bytes_removed, files_removed, status, clean_results, errors)
      VALUES
        (${userId}, ${mode}, ${JSON.stringify(itemIds)}, ${totalBytesRemoved}, ${totalFilesRemoved},
         ${errors > 0 ? "partial" : "cleaned"}, ${JSON.stringify(results)}, ${errors})
    `).catch(e => console.error("[Cleaner] history insert failed:", e.message));
  }

  const successCount = Object.values(results).filter(r => r.status === "cleaned" || r.status === "partial").length;
  const nothingCount = Object.values(results).filter(r => r.status === "nothing").length;

  storage.getOrCreateSettings(userId).then(s => storage.addHistory({
    settingsId: s.id,
    action: `Cleaner: ${successCount} item${successCount !== 1 ? "s" : ""} cleaned`,
    page: "Cleaner",
    result: errors > 0 ? "Partial" : successCount > 0 ? "Cleaned" : "Nothing Found",
    notes: `${totalFilesRemoved} file${totalFilesRemoved !== 1 ? "s" : ""} removed, ${(totalBytesRemoved / 1024 / 1024).toFixed(1)} MB freed`,
  })).catch(() => {});

  res.json({
    ok: true, results,
    summary: { totalBytesRemoved, totalFilesRemoved, successCount, nothingCount, errors },
  });
});

// POST /api/cleaner/verify
router.post("/verify", (req, res) => {
  const { electronResults = {} } = req.body as {
    electronResults?: Record<string, { sizeBytes?: number; fileCount?: number; found?: boolean }>;
  };

  const verifications: Record<string, { id: string; verified: boolean; remainingBytes: number }> = {};
  for (const [id, er] of Object.entries(electronResults)) {
    const stillPresent = (er.sizeBytes ?? 0) > 0 || (er.fileCount ?? 0) > 0;
    verifications[id] = { id, verified: !stillPresent, remainingBytes: er.sizeBytes ?? 0 };
  }
  res.json({ ok: true, verifications });
});

// GET /api/cleaner/history
router.get("/history", async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const rows = await db.execute<{
      id: number; scan_mode: string; item_ids: any; bytes_removed: number;
      files_removed: number; status: string; errors: number; ran_at: string; clean_results: any;
    }>(sql`SELECT id, scan_mode, item_ids, bytes_removed, files_removed, status, errors, ran_at, clean_results
           FROM cleaner_history WHERE user_id = ${userId} ORDER BY ran_at DESC LIMIT 50`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/cleaner/storage-optimize  — log a drive optimization event
router.post("/storage-optimize", async (req: any, res) => {
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  const { driveLetter = '', driveModel = '', mediaType = 'Unknown', optimizeType = 'trim', durationMs = 0, status = 'success' } = req.body ?? {};

  if (!isNoDbMode && db) {
    await db.execute(sql`
      INSERT INTO drive_optimization_history
        (user_id, drive_letter, drive_model, media_type, optimize_type, duration_ms, status)
      VALUES
        (${userId}, ${String(driveLetter).substring(0,2)}, ${String(driveModel).substring(0,128)},
         ${String(mediaType).substring(0,32)}, ${String(optimizeType).substring(0,16)},
         ${parseInt(String(durationMs), 10) || 0}, ${String(status).substring(0,16)})
    `).catch(e => console.warn("[Storage] history insert failed:", e.message));
  }

  storage.getOrCreateSettings(userId).then(s => storage.addHistory({
    settingsId: s.id,
    action: `Drive ${driveLetter}: ${optimizeType === 'trim' ? 'TRIM' : 'Defrag'} optimization`,
    page: "Cleaner",
    result: status === 'success' ? "Optimized" : "Failed",
    notes: `${driveModel || driveLetter + ':'} · ${durationMs > 60000 ? Math.round(durationMs / 60000) + ' min' : Math.round(durationMs / 1000) + 's'}`,
  })).catch(() => {});

  res.json({ ok: true });
});

// GET /api/cleaner/storage-history  — last 25 drive optimization events
router.get("/storage-history", async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const rows = await db.execute<{
      id: number; drive_letter: string; drive_model: string; media_type: string;
      optimize_type: string; duration_ms: number; status: string; ran_at: string;
    }>(sql`SELECT id, drive_letter, drive_model, media_type, optimize_type, duration_ms, status, ran_at
           FROM drive_optimization_history WHERE user_id = ${userId} ORDER BY ran_at DESC LIMIT 25`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/cleaner/scan-history
router.get("/scan-history", async (req: any, res) => {
  if (isNoDbMode || !db) return res.json({ ok: true, history: [] });
  const userId: string = req.cloudUser?.id ?? '__legacy__';
  try {
    const rows = await db.execute<{
      id: number; scan_mode: string; total_bytes: number; total_files: number;
      found_count: number; category_totals: any; ran_at: string;
    }>(sql`SELECT id, scan_mode, total_bytes, total_files, found_count, category_totals, ran_at
           FROM cleaner_scan_history WHERE user_id = ${userId} ORDER BY ran_at ASC LIMIT 30`);
    res.json({ ok: true, history: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
