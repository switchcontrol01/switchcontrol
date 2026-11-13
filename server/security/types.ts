export interface SecurityCapabilities {
  defenderStatusAvailable: boolean;
  firewallStatusAvailable: boolean;
  startupAnalysisAvailable: boolean;
  processAnalysisAvailable: boolean;
  aiRecommendationsAvailable: boolean;
  imageAnalysisAvailable: boolean;
  historyAvailable: boolean;
}

export interface SecurityStatus {
  realtimeProtection: boolean | null;
  tamperProtection: boolean | null;
  firewallEnabled: boolean | null;
  defenderAvailable: boolean | null;
  antispywareEnabled: boolean | null;
  engineVersion: string | null;
  signatureVersion: string | null;
  lastQuickScan: string | null;
  lastFullScan: string | null;
  firewallProfiles?: Array<{ Name?: string; Enabled?: boolean | number | string }>;
  activeFirewallCategories?: string[];
  source: "electron" | "partial" | "unavailable";
}

export interface StartupItem {
  name: string;
  command: string;
  location: string;
  publisher: string | null;
  category: "launcher" | "overlay" | "updater" | "security" | "system" | "utility" | "browser" | "unknown";
  impact: "low" | "medium" | "high";
  recommendation: "keep" | "review" | "disable";
}

export interface ProcessItem {
  name: string;
  pid: number;
  cpuSec: number | null;
  memMb: number | null;
  category: "launcher" | "overlay" | "updater" | "security" | "system" | "browser" | "gaming" | "unknown";
  impact: "low" | "medium" | "high";
}

export interface SecurityRecommendation {
  id: string;
  title: string;
  summary: string;
  severity: "info" | "low" | "medium" | "high";
  category: "protection" | "startup" | "performance" | "configuration";
  performanceImpact: "none" | "low" | "medium" | "high";
  securityImpact: "none" | "low" | "medium" | "high";
  actionLabel: string | null;
  actionType: "info" | "review" | "disable" | "external";
}

export type { IntegritySummary as ScanSummary } from "../../shared/securityScore";
import type { IntegritySummary as ScanSummary, ScanCoverage } from "../../shared/securityScore";

export interface SystemAnalysisRequest {
  status: SecurityStatus | null;
  startupItems: StartupItem[];
  topProcesses: ProcessItem[];
  scanCoverage?: ScanCoverage;
  systemInfo?: {
    cpu?: string;
    ram?: string;
    gpu?: string;
  };
}

export interface SystemAnalysisResult {
  recommendations: SecurityRecommendation[];
  summary: ScanSummary;
}

export interface SecurityImageFinding {
  title: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}

export interface ImageAnalysisResult {
  analysisType: string;
  findings: SecurityImageFinding[];
  recommendations: string[];
  rawAnalysis: string;
}
