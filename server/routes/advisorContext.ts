/**
 * Advisor Context — unified server-side context aggregator for the AI Advisor.
 *
 * GET /api/ai-advisor/context  — returns all server-side knowledge for the
 *   coverage panel and the chat prompt enrichment.
 *
 * buildAdvisorServerContext() — exported function used by ai.ts to enrich
 *   every /api/ai/chat call with data the client cannot supply itself.
 *
 * Each source is fault-isolated: a failure in one does NOT crash the others.
 * Every source carries a status field: "available" | "partial" | "unavailable".
 */

import { Router } from "express";
import { getSnapshot } from "../lib/telemetry";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdvisorDisplaySignal {
  status: "available" | "partial" | "unavailable";
  primaryMonitor: string | null;
  resolution: string | null;
  refreshHz: number | null;
  connectionType: string | null;
  qualityScore: number | null;
  qualityReason: string | null;
  qualityActions: string[];
  hdrEnabled: boolean | null;
  vrrEnabled: boolean | null;
  displayCount: number;
}

export interface AdvisorNetworkTweaks {
  status: "available" | "partial" | "unavailable";
  applied: string[];
  failed: string[];
  total: number;
}

export interface AdvisorLiveTelemetry {
  status: "available" | "unavailable";
  cpuLoadPct: number | null;
  cpuTempC: number | null;
  gpuLoadPct: number | null;
  gpuTempC: number | null;
  ramUsedGB: number | null;
  ramTotalGB: number | null;
  ramUsedPct: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  vramPct: number | null;
  processCount: number | null;
  loadTrend: "rising" | "falling" | "stable" | null;
  networkRxKbps: number | null;
  networkTxKbps: number | null;
}

export interface AdvisorSystemIntel {
  status: "available" | "partial" | "unavailable";
  cpuBrand: string | null;
  gpuNames: string[];
  ramTotalMb: number | null;
  ramStickCount: number | null;
  ramType: string | null;
  ramSpeedMhz: number | null;
  motherboard: string | null;
  biosVersion: string | null;
  os: string | null;
  vbsEnabled: boolean | null;
  hypervisorPresent: boolean | null;
  resizeBarEnabled: boolean | null;
  xmpInference: string | null;
  networkAdapters: string[];
}

export interface AdvisorContextPayload {
  display: AdvisorDisplaySignal;
  networkTweaks: AdvisorNetworkTweaks;
  telemetry: AdvisorLiveTelemetry;
  systemIntel: AdvisorSystemIntel;
  coverage: {
    display: "available" | "partial" | "unavailable";
    networkTweaks: "available" | "partial" | "unavailable";
    telemetry: "available" | "unavailable";
    systemIntel: "available" | "partial" | "unavailable";
  };
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function buildAdvisorServerContext(): Promise<AdvisorContextPayload> {
  const [displayResult, networkResult, telemetryResult, sysIntelResult] =
    await Promise.allSettled([
      resolveDisplay(),
      resolveNetworkTweaks(),
      resolveTelemetry(),
      resolveSysIntel(),
    ]);

    // Note: resolveNetworkTweaks() returns unavailable until network_tweak_state
    // gains a user_id column. Previously it queried globally, which leaked every
    // user's tweak state into other users' AI context (information disclosure).

  const display      = displayResult.status      === "fulfilled" ? displayResult.value      : unavailableDisplay();
  const networkTweaks = networkResult.status     === "fulfilled" ? networkResult.value      : unavailableNetworkTweaks();
  const telemetry    = telemetryResult.status    === "fulfilled" ? telemetryResult.value    : unavailableTelemetry();
  const systemIntel  = sysIntelResult.status     === "fulfilled" ? sysIntelResult.value     : unavailableSysIntel();

  if (displayResult.status      === "rejected") console.error("[AdvisorCtx] display failed:",       displayResult.reason?.message);
  if (networkResult.status      === "rejected") console.error("[AdvisorCtx] network-tweaks failed:", networkResult.reason?.message);
  if (telemetryResult.status    === "rejected") console.error("[AdvisorCtx] telemetry failed:",      telemetryResult.reason?.message);
  if (sysIntelResult.status     === "rejected") console.error("[AdvisorCtx] sys-intel failed:",      sysIntelResult.reason?.message);

  return {
    display,
    networkTweaks,
    telemetry,
    systemIntel,
    coverage: {
      display: display.status,
      networkTweaks: networkTweaks.status,
      telemetry: telemetry.status,
      systemIntel: systemIntel.status,
    },
  };
}

// ── Source resolvers ──────────────────────────────────────────────────────────

async function resolveDisplay(): Promise<AdvisorDisplaySignal> {
  // getCachedDisplaySignal() reflects the cloud server's own display hardware
  // (a headless VM), not the user's monitor. Returning this data to the coverage
  // panel would show the server's display as if it were the user's hardware.
  // The ai.ts chat handler already ignores serverCtx.display in favour of
  // client-supplied display data, so "unavailable" here is both safe and honest.
  return unavailableDisplay();
}

async function resolveNetworkTweaks(): Promise<AdvisorNetworkTweaks> {
  // network_tweak_state has no user_id column, so any query here would return
  // every user's tweak state — an information disclosure in a multi-tenant
  // deployment. Return unavailable until the schema migration adds user_id and
  // this function can be properly scoped.
  return { status: "unavailable", applied: [], failed: [], total: 0 };
}

async function resolveTelemetry(): Promise<AdvisorLiveTelemetry> {
  try {
    const snap = await getSnapshot();
    if (!snap) return unavailableTelemetry();
    return {
      status: "available",
      cpuLoadPct: snap.cpu?.load ?? null,
      cpuTempC: snap.temps?.cpu ?? null,
      gpuLoadPct: snap.gpu?.load ?? null,
      gpuTempC: snap.temps?.gpu ?? snap.gpu?.tempC ?? null,
      ramUsedGB: snap.ram?.usedGB ?? null,
      ramTotalGB: snap.ram?.totalGB ?? null,
      ramUsedPct: snap.ram?.usedPercent ?? null,
      vramUsedMb: snap.gpu?.vramUsedMb ?? null,
      vramTotalMb: snap.gpu?.vramTotalMb ?? null,
      vramPct: snap.gpu?.vramPercent ?? null,
      processCount: snap.processes?.total ?? null,
      loadTrend: snap.load_trend ?? null,
      networkRxKbps: snap.network?.rx_sec != null ? snap.network.rx_sec / 1024 : null,
      networkTxKbps: snap.network?.tx_sec != null ? snap.network.tx_sec / 1024 : null,
    };
  } catch {
    return unavailableTelemetry();
  }
}

async function resolveSysIntel(): Promise<AdvisorSystemIntel> {
  // getCachedSystemIntelligence() reflects the cloud server's own hardware
  // (EPYC CPU, single RAM stick, ~4 GB) — not the user's PC. The ai.ts chat
  // handler already ignores serverCtx.systemIntel in favour of client-supplied
  // specs; the coverage panel must not show server hardware as user hardware.
  return unavailableSysIntel();
}

// ── Fallback stubs ────────────────────────────────────────────────────────────

function unavailableDisplay(): AdvisorDisplaySignal {
  return { status: "unavailable", primaryMonitor: null, resolution: null, refreshHz: null, connectionType: null, qualityScore: null, qualityReason: null, qualityActions: [], hdrEnabled: null, vrrEnabled: null, displayCount: 0 };
}
function unavailableNetworkTweaks(): AdvisorNetworkTweaks {
  return { status: "unavailable", applied: [], failed: [], total: 0 };
}
function unavailableTelemetry(): AdvisorLiveTelemetry {
  return { status: "unavailable", cpuLoadPct: null, cpuTempC: null, gpuLoadPct: null, gpuTempC: null, ramUsedGB: null, ramTotalGB: null, ramUsedPct: null, vramUsedMb: null, vramTotalMb: null, vramPct: null, processCount: null, loadTrend: null, networkRxKbps: null, networkTxKbps: null };
}
function unavailableSysIntel(): AdvisorSystemIntel {
  return { status: "unavailable", cpuBrand: null, gpuNames: [], ramTotalMb: null, ramStickCount: null, ramType: null, ramSpeedMhz: null, motherboard: null, biosVersion: null, os: null, vbsEnabled: null, hypervisorPresent: null, resizeBarEnabled: null, xmpInference: null, networkAdapters: [] };
}

// ── GET /api/ai-advisor/context ───────────────────────────────────────────────

router.get("/context", async (_req, res) => {
  try {
    const ctx = await buildAdvisorServerContext();
    res.json(ctx);
  } catch (err: any) {
    console.error("[AdvisorCtx] GET /context fatal:", err.message);
    res.status(500).json({ error: "Failed to build advisor context" });
  }
});

export default router;
