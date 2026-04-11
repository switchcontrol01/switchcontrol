import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstabilityData {
  score: number;
  state: "stable" | "minor_pressure" | "unstable" | "severe";
  stateLabel: string;
  source: string;
  sourceDetail: string;
  metrics: {
    cpuLoad: number;
    ramPct: number;
    processCount: number;
    loadTrend: string;
    networkKbs: number;
  };
  ts: number;
}

export interface CauseFinding {
  id: string;
  label: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  subsystem: string;
  score: number;
  suggestion: string;
  destination: string;
}

export interface CausationData {
  primaryCause: CauseFinding;
  allCauses: CauseFinding[];
  noIssue: boolean;
  cpuLoad: number;
  ramPct: number;
  ts: number;
}

export interface DNADimension {
  id: string;
  label: string;
  score: number;
  color: string;
  higherIsBad: boolean;
}

export interface SystemDNAData {
  dimensions: DNADimension[];
  profile: string;
  profileNote: string;
  ts: number;
}

export interface ActiveProblem {
  id: string;
  severity: "high" | "warning" | "info";
  title: string;
  message: string;
  metric: string;
  suggestion: string;
  destination: string;
}

export interface ActiveProblemsData {
  problems: ActiveProblem[];
  allClear: boolean;
  problemCount: number;
  ts: number;
}

export interface LatencyBreakdown {
  label: string;
  ms: number;
  note: string;
}

export interface LatencyData {
  estimatedMs: number;
  quality: "Excellent" | "Good" | "Fair" | "Poor";
  confidence: "high" | "medium";
  trend: "rising" | "falling" | "stable";
  breakdown: LatencyBreakdown[];
  ts: number;
}

export interface RAMAnalysisData {
  usedGB: number;
  totalGB: number;
  freeGB: number;
  usedPct: number;
  reclaimableGB: number;
  reclaimableEstimated: true;
  newUsedPct: number;
  pressure: "critical" | "high" | "moderate" | "low";
  pressureLabel: string;
  risk: "low" | "medium";
  riskLabel: string;
  impactLabel: string;
  ts: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface DashboardIntelligenceState {
  instability: InstabilityData | null;
  dna: SystemDNAData | null;
  problems: ActiveProblemsData | null;
  latency: LatencyData | null;
  ram: RAMAnalysisData | null;
  loading: boolean;
  causation: CausationData | null;
  causeLoading: boolean;
  analyzeCause: () => Promise<void>;
  refresh: () => void;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export function useDashboardIntelligence(): DashboardIntelligenceState {
  const [instability, setInstability]   = useState<InstabilityData | null>(null);
  const [dna, setDna]                   = useState<SystemDNAData | null>(null);
  const [problems, setProblems]         = useState<ActiveProblemsData | null>(null);
  const [latency, setLatency]           = useState<LatencyData | null>(null);
  const [ram, setRam]                   = useState<RAMAnalysisData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [causation, setCausation]       = useState<CausationData | null>(null);
  const [causeLoading, setCauseLoading] = useState(false);
  const initRef = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const [inst, d, probs, lat, r] = await Promise.allSettled([
        fetchJSON<InstabilityData>("/api/dashboard-intelligence/instability"),
        fetchJSON<SystemDNAData>("/api/dashboard-intelligence/system-dna"),
        fetchJSON<ActiveProblemsData>("/api/dashboard-intelligence/active-problems"),
        fetchJSON<LatencyData>("/api/dashboard-intelligence/latency-estimate"),
        fetchJSON<RAMAnalysisData>("/api/dashboard-intelligence/ram-analysis"),
      ]);
      if (inst.status === "fulfilled")  setInstability(inst.value);
      if (d.status === "fulfilled")     setDna(d.value);
      if (probs.status === "fulfilled") setProblems(probs.value);
      if (lat.status === "fulfilled")   setLatency(lat.value);
      if (r.status === "fulfilled")     setRam(r.value);
    } catch (_) {}
    setLoading(false);
  }, []);

  const analyzeCause = useCallback(async () => {
    setCauseLoading(true);
    try {
      const data = await fetchJSON<CausationData>("/api/dashboard-intelligence/what-caused-that");
      setCausation(data);
    } catch (_) {}
    setCauseLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    fetchAll();

    // Staggered polling intervals for each endpoint
    const intervals = [
      setInterval(() => fetchJSON<InstabilityData>("/api/dashboard-intelligence/instability").then(setInstability).catch(() => {}),  5_000),
      setInterval(() => fetchJSON<SystemDNAData>("/api/dashboard-intelligence/system-dna").then(setDna).catch(() => {}),            12_000),
      setInterval(() => fetchJSON<ActiveProblemsData>("/api/dashboard-intelligence/active-problems").then(setProblems).catch(() => {}), 8_000),
      setInterval(() => fetchJSON<LatencyData>("/api/dashboard-intelligence/latency-estimate").then(setLatency).catch(() => {}),    6_000),
      setInterval(() => fetchJSON<RAMAnalysisData>("/api/dashboard-intelligence/ram-analysis").then(setRam).catch(() => {}),         9_000),
    ];
    return () => intervals.forEach(clearInterval);
  }, [fetchAll]);

  return { instability, dna, problems, latency, ram, loading, causation, causeLoading, analyzeCause, refresh };
}
