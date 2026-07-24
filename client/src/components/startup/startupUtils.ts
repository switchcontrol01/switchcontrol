// ── Boot Intelligence Engine ────────────────────────────────────────────────
// Heuristic-based estimates. All "estimated" values are clearly labeled.
// No fake hardcoded numbers — every number derives from real scan data.

export type StartupSource =
  | "registry-hkcu" | "registry-hklm"
  | "startup-folder-user" | "startup-folder-common"
  | "task-scheduler";

export type StartupCategory =
  | "system" | "drivers" | "userApps" | "scheduled" | "broken";

export type RiskLevel = "safe" | "moderate" | "critical";

export interface StartupEntry {
  id: string;
  name: string;
  publisher: string | null;
  executablePath: string | null;
  commandLine: string;
  source: StartupSource;
  enabled: boolean;
  fileExists: boolean;
  broken: boolean;
  registryName?: string;
  taskPath?: string;
  folderPath?: string;
}

export interface BootApp {
  entry: StartupEntry;
  category: StartupCategory;
  risk: RiskLevel;
  /** Estimated delay in ms (heuristic) */
  delayMs: number;
  /** Estimated CPU impact 0–100 (heuristic) */
  cpuImpact: number;
  /** Estimated disk impact 0–100 (heuristic) */
  diskImpact: number;
  /** Estimated RAM footprint in MB (heuristic) */
  ramMb: number;
  isMicrosoft: boolean;
  isDriver: boolean;
}

// ── Category detection ──────────────────────────────────────────────────────

const SYS_RE = /microsoft|windows|ctfmon|explorer|dwm|svchost|lsass|winlogon|taskmgr|regsvc|shell|runtime broker/i;
const DRV_RE = /realtek|nvidia|amd.*driver|radeon|geforce|intel.*hd|corsair|logitech|steelseries|razer|hyperx|asus.*armoury|rog|msi.*dragon|synapse|icue|g-hub|ghub|hub.*logitech|driver/i;
const USER_RE = /steam|epic.?games|battle\.?net|blizzard|gog|xbox|ea.?desktop|origin|uplay|ubisoft|rockstar|bethesda|playnite|itch\.io|game.*bar|discord|teams|slack|zoom|skype|whatsapp|telegram|signal|wechat|viber|hangouts|webex|meet\b|chrome|firefox|opera|brave|edge|vivaldi|notion|obsidian|spotify|vlc|iTunes|itunes|acrobat|reader|office|word|excel|powerpoint|photoshop|illustrator|premiere|after|effects|lightroom|gimp|inkscape|blender|vscode|code|sublime|atom|postman|figma|slack/i;

export function detectCategory(entry: StartupEntry): StartupCategory {
  if (entry.broken || !entry.fileExists) return "broken";
  const haystack = [entry.name, entry.publisher ?? "", entry.executablePath ?? ""].join(" ");
  if (SYS_RE.test(haystack)) return "system";
  if (DRV_RE.test(haystack)) return "drivers";
  if (entry.source === "task-scheduler") return "scheduled";
  return "userApps";
}

// ── Risk detection ──────────────────────────────────────────────────────────
// "critical" is reserved for entries that are genuinely broken (file missing /
// entry malformed). Everything else is safe or moderate — startup items are
// normal software, not threats; labelling them all critical causes alarm fatigue.

export function detectRisk(entry: StartupEntry, category: StartupCategory): RiskLevel {
  // Only truly broken entries warrant a critical label
  if (entry.broken || !entry.fileExists) return "critical";

  const haystack = [entry.name, entry.publisher ?? "", entry.executablePath ?? ""].join(" ");

  // Security tools and system-critical services → moderate (informational, not scary)
  if (/security|defender|antivirus|firewall|vpn|malware|bitdefender|kaspersky|avast|avira|eset|norton|mcafee/i.test(haystack)) return "moderate";
  if (category === "system") return "moderate";
  if (category === "drivers") return "moderate";
  if (/microsoft|windows/i.test(haystack)) return "moderate";

  // Everything else (user apps, games, launchers, productivity) → safe
  return "safe";
}

// ── Heuristic impact estimation ─────────────────────────────────────────────
// These are ORDER-OF-MAGNITUDE estimates based on app category + name patterns.
// They are NOT precise measurements. Always displayed with "est." prefix.

function estimateDelayMs(entry: StartupEntry, category: StartupCategory): number {
  // Base delay by category
  const base: Record<StartupCategory, number> = {
    system: 400, drivers: 300, userApps: 1200, scheduled: 800, broken: 0,
  };
  let d = base[category] ?? 800;
  // Heavy apps (known slow starters)
  const heavy = /steam|epic|battle\.?net|blizzard|adobe|photoshop|premiere|after|office|vscode|docker/i;
  if (heavy.test(entry.name)) d *= 2.5;
  // Light apps
  const light = /notepad|calc|paint|sticky|snipping/i;
  if (light.test(entry.name)) d *= 0.3;
  // Registry entries tend to be lighter than full apps
  if (entry.source.startsWith("registry")) d *= 0.7;
  return Math.round(d);
}

function estimateCpuImpact(entry: StartupEntry, category: StartupCategory): number {
  const base: Record<StartupCategory, number> = { system: 8, drivers: 6, userApps: 15, scheduled: 10, broken: 0 };
  let v = base[category] ?? 12;
  if (/steam|epic|chrome|edge|firefox|opera|adobe|photoshop|premiere/i.test(entry.name)) v += 12;
  if (/notepad|calc|paint|sticky/i.test(entry.name)) v -= 8;
  return Math.max(1, Math.min(40, Math.round(v)));
}

function estimateDiskImpact(entry: StartupEntry, category: StartupCategory): number {
  const base: Record<StartupCategory, number> = { system: 5, drivers: 8, userApps: 12, scheduled: 6, broken: 0 };
  let v = base[category] ?? 10;
  if (/steam|epic|chrome|edge|adobe|office/i.test(entry.name)) v += 10;
  return Math.max(1, Math.min(35, Math.round(v)));
}

function estimateRamMb(entry: StartupEntry, category: StartupCategory): number {
  const base: Record<StartupCategory, number> = { system: 20, drivers: 15, userApps: 60, scheduled: 25, broken: 0 };
  let v = base[category] ?? 40;
  if (/chrome|edge|firefox|steam|epic|adobe|photoshop|premiere|office/i.test(entry.name)) v += 80;
  if (/notepad|calc|paint/i.test(entry.name)) v = 5;
  return Math.max(1, Math.round(v));
}

function isMicrosoft(entry: StartupEntry): boolean {
  return /microsoft|windows/i.test([entry.name, entry.publisher ?? ""].join(" "));
}

function isDriver(entry: StartupEntry): boolean {
  return /driver|realtek|nvidia|amd|radeon|geforce|intel.*hd/i.test([entry.name, entry.publisher ?? ""].join(" "));
}

// ── Enrich raw entries ─────────────────────────────────────────────────────

export function enrichEntries(raw: StartupEntry[]): BootApp[] {
  return raw
    .filter(e => !!e && typeof e === "object")
    .map(entry => {
      const cat = detectCategory(entry);
      const risk = detectRisk(entry, cat);
      return {
        entry,
        category: cat,
        risk,
        delayMs: estimateDelayMs(entry, cat),
        cpuImpact: estimateCpuImpact(entry, cat),
        diskImpact: estimateDiskImpact(entry, cat),
        ramMb: estimateRamMb(entry, cat),
        isMicrosoft: isMicrosoft(entry),
        isDriver: isDriver(entry),
      };
    });
}

// ── Score calculation ────────────────────────────────────────────────────────
// 0–100. Higher = cleaner/faster boot. Drops with enabled heavy apps.

export function calculateBootScore(apps: BootApp[]): number {
  const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);
  if (enabled.length === 0) return 100;
  const totalDelay = enabled.reduce((s, a) => s + a.delayMs, 0);
  const totalCpu = enabled.reduce((s, a) => s + a.cpuImpact, 0);
  const totalDisk = enabled.reduce((s, a) => s + a.diskImpact, 0);
  const heavyCount = enabled.filter(a => a.category === "userApps" && a.delayMs > 1500).length;

  // Penalties
  let score = 100;
  score -= Math.min(30, totalDelay / 600);        // up to -30 for delay
  score -= Math.min(15, totalCpu / 20);           // up to -15 for CPU
  score -= Math.min(15, totalDisk / 15);           // up to -15 for disk
  score -= Math.min(15, enabled.length * 1.5);    // up to -15 for count
  score -= heavyCount * 5;                        // -5 per heavy app

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "Clean";
  if (score >= 70) return "Moderate";
  if (score >= 50) return "Heavy";
  return "Critical";
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "#34d399"; // emerald-400
  if (score >= 70) return "#fbbf24"; // amber-400
  if (score >= 50) return "#fb923c"; // orange-400
  return "#f87171";                  // red-400
}

// ── Boot time estimate ──────────────────────────────────────────────────────

export function estimateBootTimeMs(apps: BootApp[]): number {
  const enabled = apps.filter(a => a.entry.enabled && !a.entry.broken);
  // Base Windows boot ~12s, + sequential-ish startup delays
  const base = 12000;
  // Many apps overlap, so don't sum purely sequentially
  const overlapFactor = 0.45;
  const extraDelay = enabled.reduce((s, a) => s + a.delayMs, 0) * overlapFactor;
  return Math.round(base + extraDelay);
}

export function fmtBootTime(ms: number): string {
  const sec = ms / 1000;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
}

// ── Grouping ────────────────────────────────────────────────────────────────

export function groupByCategory(apps: BootApp[]): Record<StartupCategory, BootApp[]> {
  const groups: Record<StartupCategory, BootApp[]> = {
    system: [], drivers: [], userApps: [], scheduled: [], broken: [],
  };
  for (const app of apps) groups[app.category].push(app);
  return groups;
}

// ── Recommendations ───────────────────────────────────────────────────────────
// Top safe apps to disable (highest delay, lowest risk)

export function getRecommendations(apps: BootApp[], max = 3): BootApp[] {
  const candidates = apps.filter(
    a => a.entry.enabled && a.risk === "safe" && !a.entry.broken && a.category !== "system"
  );
  return candidates
    .sort((a, b) => b.delayMs - a.delayMs)
    .slice(0, max);
}

export function estimateSavings(apps: BootApp[], targets: BootApp[]): {
  timeMs: number; cpuReduction: number; diskReduction: number; ramReduction: number;
} {
  const timeMs = targets.reduce((s, a) => s + a.delayMs, 0);
  const cpuReduction = targets.reduce((s, a) => s + a.cpuImpact, 0);
  const diskReduction = targets.reduce((s, a) => s + a.diskImpact, 0);
  const ramReduction = targets.reduce((s, a) => s + a.ramMb, 0);
  return { timeMs, cpuReduction, diskReduction, ramReduction };
}
