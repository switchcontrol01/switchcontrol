/**
 * useDynamicRecommendations — hardware-aware "Recommended" overrides, layered:
 *
 *  1. Rule-based overrides (all users) — fetched from /api once per session.
 *     Instant, deterministic, works offline against the local Electron backend.
 *  2. AI overrides (premium only) — the client sends its REAL hardware specs to
 *     the cloud LLM endpoint. When the result arrives, AI picks replace the
 *     rule-based ones and badges upgrade to the premium "AI" treatment.
 *
 * If the AI call fails for any reason (offline, non-premium, LLM error), the
 * rule-based layer keeps working — AI is strictly additive.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "@/lib/store";
import { useSystemIntelligenceStore } from "@/stores/systemIntelligenceStore";
import { useAuth } from "@/hooks/use-auth";
import {
  buildAiSystemPayload,
  aiSystemSignature,
  fetchAiRecommendations,
  clearAiRecsStorage,
  type AiRecommendationsResult,
  type AiSystemPayload,
} from "@/lib/ai-recommendations";

export interface RecommendationOverride {
  /** Recommended registry value for slider tweaks. */
  recommendedValue?: number;
  /** Recommended option id for preset tweaks. */
  recommendedOptionId?: string;
  /** Human-readable reason shown as tooltip text. */
  reason: string;
  /** Where this recommendation came from. Absent = rule-based. */
  source?: "ai" | "rules";
}

export interface NetworkRecommendation {
  reason: string;
  source: "ai" | "rules";
}

// ── Module-level session cache (rule-based layer) ─────────────────────────────

interface FetchedData {
  overrides: Record<string, RecommendationOverride>;
  /** Network tweak recommendation reasons (by tweak id). */
  networkOverrides: Record<string, string>;
}

let _cachedData: FetchedData | null = null;
let _fetchPromise: Promise<FetchedData> | null = null;
let _cacheTs = 0;

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function _fetchOverrides(): Promise<FetchedData> {
  if (_cachedData && Date.now() - _cacheTs < CACHE_TTL_MS) {
    return _cachedData;
  }
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch("/api/tweak-intelligence/recommended-options", {
    signal: AbortSignal.timeout(8_000),
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{
        overrides: Record<string, RecommendationOverride>;
        networkOverrides?: Record<string, string>;
      }>;
    })
    .then(data => {
      _cachedData = {
        overrides: data.overrides ?? {},
        networkOverrides: data.networkOverrides ?? {},
      };
      _cacheTs = Date.now();
      _fetchPromise = null;
      return _cachedData;
    })
    .catch(err => {
      console.warn("[DynamicRecommendations] Fetch failed:", err.message ?? err);
      _fetchPromise = null;
      return { overrides: {}, networkOverrides: {} };
    });

  return _fetchPromise;
}

// ── Module-level session cache (AI layer) ─────────────────────────────────────

let _aiData: AiRecommendationsResult | null = null;
let _aiSig: string | null = null;
let _aiPromise: Promise<AiRecommendationsResult | null> | null = null;
const _aiFailedSigs = new Set<string>(); // don't hammer the LLM after a failure

async function _fetchAi(payload: AiSystemPayload, sig: string): Promise<AiRecommendationsResult | null> {
  if (_aiData && _aiSig === sig) return _aiData;
  if (_aiPromise) return _aiPromise;

  _aiPromise = fetchAiRecommendations(payload)
    .then(data => {
      _aiData = data;
      _aiSig = sig;
      _aiPromise = null;
      return data;
    })
    .catch(err => {
      // Expected for: 403 (not premium — race with entitlement refresh),
      // 503 (no OpenAI key on this host), offline. Rules remain active.
      console.warn("[AiRecs] Falling back to rule-based:", err?.message ?? err);
      _aiFailedSigs.add(sig);
      _aiPromise = null;
      return null;
    });

  return _aiPromise;
}

/** Force a fresh fetch on next call (e.g. after hardware re-scan). */
export function invalidateDynamicRecommendations(): void {
  _cachedData = null;
  _cacheTs = 0;
  _fetchPromise = null;
  _aiData = null;
  _aiSig = null;
  _aiPromise = null;
  _aiFailedSigs.clear();
  clearAiRecsStorage();
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergeLayers(rules: FetchedData | null, ai: AiRecommendationsResult | null): {
  overrides: Record<string, RecommendationOverride>;
  networkOverrides: Record<string, NetworkRecommendation>;
} {
  const overrides: Record<string, RecommendationOverride> = {};
  const networkOverrides: Record<string, NetworkRecommendation> = {};

  if (rules) {
    for (const [id, o] of Object.entries(rules.overrides)) {
      overrides[id] = { ...o, source: "rules" };
    }
    for (const [id, reason] of Object.entries(rules.networkOverrides)) {
      networkOverrides[id] = { reason, source: "rules" };
    }
  }
  if (ai) {
    for (const [id, o] of Object.entries(ai.overrides)) {
      overrides[id] = { ...o, source: "ai" };
    }
    for (const [id, reason] of Object.entries(ai.networkOverrides)) {
      networkOverrides[id] = { reason, source: "ai" };
    }
  }
  return { overrides, networkOverrides };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDynamicRecommendations(): {
  /** Per-tweak slider/preset recommendation overrides for the Tweaks page. */
  overrides: Record<string, RecommendationOverride> | null;
  /** Per-network-tweak hardware recommendations (presence = recommended). */
  networkOverrides: Record<string, NetworkRecommendation> | null;
  loading: boolean;
  /** True while the premium AI layer is being fetched. */
  aiLoading: boolean;
  /** True when AI recommendations are live (at least one AI override present). */
  aiActive: boolean;
} {
  // Start with cached data so there's no flicker on subsequent renders.
  const [data, setData] = useState<FetchedData | null>(_cachedData);
  const [loading, setLoading] = useState(_cachedData === null);
  const [ai, setAi] = useState<AiRecommendationsResult | null>(_aiData);
  const [aiLoading, setAiLoading] = useState(false);
  const mounted = useRef(true);

  // ── Layer 1: rule-based (all users) ─────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    if (_cachedData) {
      setData(_cachedData);
      setLoading(false);
    } else {
      setLoading(true);
      _fetchOverrides().then(result => {
        if (!mounted.current) return;
        setData(result);
        setLoading(false);
      });
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Layer 2: AI (premium) ────────────────────────────────────────────────
  const { isPremium } = useAuth();
  // Narrow store subscriptions — s.stats changes every telemetry tick.
  const cpuName = useStore(s => s.stats.cpuName);
  const gpuName = useStore(s => s.stats.gpuName);
  const totalRamGb = useStore(s => s.stats.totalRamGb);
  const siProfile = useSystemIntelligenceStore(s => s.profile);

  const sysPayload = useMemo(
    () => buildAiSystemPayload({ cpuName, gpuName, totalRamGb }, siProfile),
    [cpuName, gpuName, totalRamGb, siProfile],
  );
  const sysSig = sysPayload ? aiSystemSignature(sysPayload) : null;
  const payloadRef = useRef(sysPayload);
  payloadRef.current = sysPayload;

  useEffect(() => {
    if (!isPremium || !sysSig || !payloadRef.current) return;
    if (_aiData && _aiSig === sysSig) {
      setAi(_aiData);
      return;
    }
    if (_aiFailedSigs.has(sysSig)) return;

    let cancelled = false;
    setAiLoading(true);
    _fetchAi(payloadRef.current, sysSig)
      .then(result => {
        if (cancelled) return;
        if (result) setAi(result);
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPremium, sysSig]);

  // ── Merge ────────────────────────────────────────────────────────────────
  const merged = useMemo(() => mergeLayers(data, ai), [data, ai]);

  const aiActive = ai !== null && (
    Object.keys(ai.overrides).length > 0 || Object.keys(ai.networkOverrides).length > 0
  );

  return {
    overrides: data || ai ? merged.overrides : null,
    networkOverrides: data || ai ? merged.networkOverrides : null,
    loading,
    aiLoading,
    aiActive,
  };
}
