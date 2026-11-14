export type SecurityEvidenceState = "confirmed" | "review" | "unknown" | "not-checked";

export const smartScanPreview = {
  kind: "Smart Scan",
  healthScore: 87,
  state: "Needs attention",
  coveragePercent: 100,
  scores: { protection: 85, startup: 88, processes: 91 },
  issueCounts: { protection: 1, startup: 2, processes: 1 },
  explanation: "One protection control is off in this illustrative sample. This score is a scan heuristic, not a malware verdict.",
} as const;

export const quickScanPreview = {
  kind: "Quick Scan",
  healthScore: 85,
  state: "Needs attention",
  coveragePercent: 50,
  scores: { protection: 85, startup: null, processes: null },
  issueCounts: { protection: 1, startup: null, processes: null },
  explanation: "Protection only. Startup and process evidence was not collected and remains unknown.",
} as const;

export const protectionPreview = [
  { label: "Real-time protection", state: "confirmed", value: "On", note: "Illustrative sample" },
  { label: "Firewall", state: "confirmed", value: "On", note: "Illustrative sample" },
  { label: "Tamper protection", state: "review", value: "Off", note: "Illustrative sample · review in Windows Security" },
  { label: "Anti-spyware", state: "confirmed", value: "On", note: "Illustrative sample" },
  { label: "Cloud protection", state: "unknown", value: "Unknown", note: "Not collected in this preview" },
  { label: "Controlled folder access", state: "unknown", value: "Unknown", note: "Not collected in this preview" },
] satisfies ReadonlyArray<{ label: string; state: SecurityEvidenceState; value: string; note: string }>;

export const startupPreviewItems = [
  {
    name: "Steam Client",
    command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent',
    location: "Current user · Run",
    publisher: "Valve",
    recommendation: "Review",
    impact: "Medium",
  },
  {
    name: "Discord",
    command: '"C:\\Users\\User\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe',
    location: "Current user · Run",
    publisher: "Discord Inc.",
    recommendation: "Review",
    impact: "Medium",
  },
  {
    name: "OneDrive",
    command: '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background',
    location: "Current user · Run",
    publisher: "Microsoft",
    recommendation: "Keep",
    impact: "Low",
  },
] as const;

export const processPreviewItems = [
  {
    name: "OverlayHost.exe",
    publisher: "Publisher not verified in sample",
    path: "%LOCALAPPDATA%\\GameTools\\Overlay\\OverlayHost.exe",
    memory: "1.48 GB",
    trust: "Review",
    impact: "High memory use",
    note: "A review label is not a malware finding; verify the file locally.",
  },
  {
    name: "steam.exe",
    publisher: "Valve",
    path: "C:\\Program Files (x86)\\Steam\\steam.exe",
    memory: "410 MB",
    trust: "Trusted",
    impact: "Typical",
    note: "Illustrative sample only.",
  },
  {
    name: "dwm.exe",
    publisher: "Microsoft Windows",
    path: "C:\\Windows\\System32\\dwm.exe",
    memory: "176 MB",
    trust: "Trusted",
    impact: "Typical",
    note: "Illustrative sample only.",
  },
] as const;

export const auditPreviewItems = [
  { category: "Platform & firmware", label: "Secure Boot", state: "confirmed", value: "Enabled", note: "Illustrative sample" },
  { category: "Platform & firmware", label: "TPM 2.0", state: "confirmed", value: "Ready", note: "Illustrative sample" },
  { category: "Credential protection", label: "Credential Guard", state: "unknown", value: "Unknown", note: "Not collected" },
  { category: "Storage protection", label: "BitLocker status", state: "unknown", value: "Unknown", note: "Permission-limited in this sample" },
  { category: "Network exposure", label: "Listening port audit", state: "not-checked", value: "Not checked", note: "Full Audit was not run" },
  { category: "Persistence", label: "Scheduled task review", state: "unknown", value: "Unknown", note: "Requires the Windows desktop audit" },
] satisfies ReadonlyArray<{ category: string; label: string; state: SecurityEvidenceState; value: string; note: string }>;

export const securityHistoryPreview = [
  { label: "Earlier", score: 92, coverage: 100 },
  { label: "Earlier", score: 90, coverage: 100 },
  { label: "Earlier", score: 89, coverage: 100 },
  { label: "Earlier", score: 88, coverage: 100 },
  { label: "Current sample", score: 87, coverage: 100 },
] as const;

export const securityPreviewDisclosure =
  "Illustrative preview data only. No Windows scan or security action was run from this design.";
