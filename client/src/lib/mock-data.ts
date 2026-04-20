/**
 * mock-data.ts — backward-compatible re-export layer.
 *
 * All tweak definitions now live in tweak-registry.ts (the canonical source).
 * This file re-exports everything consumers expect so no import paths break.
 */

export type {
  RegistryTweak as Tweak,
  RiskLevel,
  ImpactLevel,
  TweakControlType,
  TweakExpected,
  SliderPreset,
  SliderConfig,
  TweakDetailsConfig,
  RegistryTweak,
} from "./tweak-registry";

export type { TweakLevel, TweakCategory } from "@shared/tweak-tiers";

export { TWEAKS_DATA, REGISTRY, getTweak } from "./tweak-registry";

// ── Non-tweak data (kept here as it has no home in the registry) ──────────────

export interface SystemStats {
  cpuName: string;
  cpuCores: number;
  cpuThreads: number;
  cpuSpeed: string;
  gpuName: string;
  gpuVendor: string;
  totalRamGb: number;
  usedRamGb: number;
  freeRamGb: number;
  diskName: string;
  diskUsedGb: number;
  diskTotalGb: number;
  vramGb: number;
  osName: string;
  osVersion: string;
  osArch: string;
  hostname: string;
}

export const MOCK_STATS: SystemStats = {
  cpuName: "Unavailable",
  cpuCores: 0,
  cpuThreads: 0,
  cpuSpeed: "Unavailable",
  gpuName: "Unavailable",
  gpuVendor: "Unavailable",
  totalRamGb: 0,
  usedRamGb: 0,
  freeRamGb: 0,
  diskName: "Unavailable",
  diskUsedGb: 0,
  diskTotalGb: 0,
  vramGb: 0,
  osName: "Unavailable",
  osVersion: "Unavailable",
  osArch: "Unavailable",
  hostname: "Unavailable",
};

export interface AIRecommendation {
  id: string;
  action: string;
  tag: "Safe" | "Advanced" | "Requires local agent";
}

export interface AIScanResult {
  timestamp: string;
  summary: string;
  recommendations: AIRecommendation[];
  optimized?: boolean;
}
