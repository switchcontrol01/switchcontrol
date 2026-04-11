import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";

export type PressureLevel = "low" | "moderate" | "elevated" | "high";

export interface SystemSignal {
  id: string;
  label: string;
  level: PressureLevel;
  value: string;
  detail: string;
  subsystem: "cpu" | "memory" | "process" | "network" | "trend";
}

export interface TweakRanking {
  tweakId: string;
  score: number;
  relevance: "high" | "medium" | "low" | "none";
  reason: string;
  dominantSignal: string;
  alreadyApplied: boolean;
}

export interface PostureDimension {
  id: string;
  label: string;
  score: number;
  applied: number;
  total: number;
  color: string;
}

export interface TweakIntelligenceState {
  signals: SystemSignal[];
  rankings: TweakRanking[];
  posture: PostureDimension[];
  overallCoverage: number;
  cpuLoad: number;
  memPct: number;
  processCount: number;
  networkKbs: number;
  loadTrend: "rising" | "falling" | "stable";
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const DEFAULT_STATE: TweakIntelligenceState = {
  signals: [],
  rankings: [],
  posture: [],
  overallCoverage: 0,
  cpuLoad: 0,
  memPct: 0,
  processCount: 0,
  networkKbs: 0,
  loadTrend: "stable",
  loading: true,
  error: null,
  lastUpdated: null,
};

export function useTweakIntelligence(pollIntervalMs = 10_000) {
  const { tweaks } = useStore();
  const [state, setState] = useState<TweakIntelligenceState>(DEFAULT_STATE);
  const abortRef     = useRef<AbortController | null>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef   = useRef(true);

  const appliedIds = Object.keys(tweaks).filter((id) => tweaks[id]);
  const appliedParam = appliedIds.join(",");

  const fetchAll = useCallback(async (param: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const [stateRes, rankRes, postureRes] = await Promise.all([
        fetch("/api/tweak-intelligence/system-state", { signal: ac.signal }),
        fetch(`/api/tweak-intelligence/rankings?applied=${encodeURIComponent(param)}`, { signal: ac.signal }),
        fetch(`/api/tweak-intelligence/posture?applied=${encodeURIComponent(param)}`, { signal: ac.signal }),
      ]);

      if (!stateRes.ok || !rankRes.ok || !postureRes.ok) {
        throw new Error("Non-OK response from intelligence API");
      }

      const [systemState, rankData, postureData] = await Promise.all([
        stateRes.json(),
        rankRes.json(),
        postureRes.json(),
      ]);

      if (!mountedRef.current) return;

      setState({
        signals:        systemState.signals ?? [],
        rankings:       rankData.rankings   ?? [],
        posture:        postureData.dimensions ?? [],
        overallCoverage: postureData.overallCoverage ?? 0,
        cpuLoad:        systemState.cpuLoad        ?? 0,
        memPct:         systemState.memPct         ?? 0,
        processCount:   systemState.processCount   ?? 0,
        networkKbs:     systemState.networkKbs     ?? 0,
        loadTrend:      systemState.loadTrend      ?? "stable",
        loading:        false,
        error:          null,
        lastUpdated:    Date.now(),
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: "Could not load system intelligence." }));
    }
  }, []);

  // Poll on mount and whenever applied IDs change
  useEffect(() => {
    mountedRef.current = true;
    fetchAll(appliedParam);

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        fetchAll(appliedParam);
        schedule();
      }, pollIntervalMs);
    };
    schedule();

    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedParam, pollIntervalMs]);

  return state;
}
