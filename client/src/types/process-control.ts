// ── Process Control Types ───────────────────────────────────────────────────
// Single source of truth for all Process Control data shapes.

export type ProcessCategory =
  | 'System Core'
  | 'Gaming / Launchers'
  | 'Audio / Voice'
  | 'Network / VPN'
  | 'Startup Weight'
  | 'Background Apps'
  | 'Browser / Electron'
  | 'Vendor Utilities'
  | 'Windows Optional'
  | 'Unknown / Review';

export type ProcessSafety = 'safe' | 'moderate' | 'risky' | 'protected' | 'unknown';

export type RecommendedAction =
  | 'none'
  | 'lower_priority'
  | 'stop_process'
  | 'suspend_temporarily'
  | 'review_only';

export type ProcessRisk = 'safe' | 'moderate' | 'risky' | 'protected' | 'unknown';

export type ProcessControlProfile = 'safe' | 'competitive' | 'extreme';

export type ProcessControlStatus =
  | 'idle'
  | 'scanning'
  | 'planning'
  | 'applying'
  | 'verifying'
  | 'verified'
  | 'error';

export interface ProcessEntry {
  pid: number;
  name: string;
  displayName: string;
  path: string | null;
  publisher: string | null;
  cpuTimeCumulative: number; // honest: cumulative CPU time from Get-Process, NOT live %
  memoryMb: number;
  category: ProcessCategory;
  safety: ProcessSafety;
  reason: string;
  recommendedAction: RecommendedAction;
  canStop: boolean;
  canLowerPriority: boolean;
  isProtected: boolean;
  risk: ProcessRisk;
  impactScore: number; // 0-100
}

export interface ScanResult {
  timestamp: number;
  totalProcesses: number;
  backgroundProcesses: number;
  protectedCount: number;
  backgroundLoadScore: number; // honest: weighted by cpuTimeCumulative, not fake %
  startupWeightScore: number;
  estimatedReductionPotential: number;
  processes: ProcessEntry[];
  scanDurationMs: number;
}

export interface ActionPlan {
  toStop: ProcessEntry[];
  toLowerPriority: ProcessEntry[];
  protected: ProcessEntry[];
  profile: ProcessControlProfile;
  estimatedRamFreedMb: number;
  estimatedCpuReduction: number;
}

export interface BeforeAfterResult {
  processCountBefore: number;
  processCountAfter: number;
  backgroundLoadBefore: number;
  backgroundLoadAfter: number;
  startupWeightBefore: number;
  startupWeightAfter: number;
  ramFreedMb: number;
  cpuReductionCumulative: number; // honest: delta in cumulative CPU time, not fake %
  actionsApplied: number;
  restorable: boolean;
}

export interface RestoreRecord {
  appliedAt: string;
  profile: string;
  actionsApplied: {
    stopped: string[];
    priorityLowered: string[];
  };
  restorable: boolean;
}

export interface ProcessTrendPoint {
  ts: number;
  pressure: number;
  processCount: number;
}
