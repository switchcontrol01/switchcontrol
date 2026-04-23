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
import { getCachedSystemIntelligence } from "../lib/systemIntelligence";
import { getCachedDisplaySignal } from "./dashboardIntelligence";
import { db, isNoDbMode } from "../db";
import { sql } from "drizzle-orm";

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

  const display = displayResult.status === "fulfilled" ? displayResult.value : unavailableDisplay();
  const networkTweaks = networkResult.status === "fulfilled" ? networkResult.value : unavailableNetworkTweaks();
  const telemetry = telemetryResult.status === "fulfilled" ? telemetryResult.value : unavailableTelemetry();
  const systemIntel = sysIntelResult.status === "fulfilled" ? sysIntelResult.value : unavailableSysIntel();

  if (displayResult.status === "rejected") console.error("[AdvisorCtx] display failed:", displayResult.reason?.message);
  if (networkResult.status === "rejected") console.error("[AdvisorCtx] network-tweaks failed:", networkResult.reason?.message);
  if (sysIntelResult.status === "rejected") console.error("[AdvisorCtx] sys-intel failed:", sysIntelResult.reason?.message);

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
  const cached = getCachedDisplaySignal();
  if (!cached) {
    return {
      status: "unavailable",
      primaryMonitor: null, resolution: null, refreshHz: null,
      connectionType: null, qualityScore: null, qualityReason: null,
      qualityActions: [], hdrEnabled: null, vrrEnabled: null, displayCount: 0,
    };
  }

  const displays: any[] = cached.displays ?? [];
  const primary = displays.find((d: any) => d.main) ?? displays[0] ?? null;

  return {
    status: primary ? "available" : "partial",
    primaryMonitor: primary?.monitorName ?? null,
    resolution: primary?.resolution ?? null,
    refreshHz: primary?.refreshHz ?? null,
    connectionType: primary?.connectionType ?? null,
    qualityScore: primary?.qualityScore ?? cached.qualityScore ?? null,
    qualityReason: primary?.qualityReason ?? cached.qualityReason ?? null,
    qualityActions: primary?.qualityActions ?? cached.qualityActions ?? [],
    hdrEnabled: primary?.hdrEnabled ?? null,
    vrrEnabled: primary?.vrrEnabled ?? null,
    displayCount: cached.displayCount ?? displays.length,
  };
}

async function resolveNetworkTweaks(): Promise<AdvisorNetworkTweaks> {
  if (isNoDbMode || !db) {
    return { status: "unavailable", applied: [], failed: [], total: 0 };
  }
  try {
    const result = await db.execute(sql`
      SELECT tweak_id, status FROM network_tweak_state ORDER BY tweak_id
    `);
    const applied: string[] = [];
    const failed: string[] = [];
    for (const row of result.rows) {
      const s = row.status as string;
      if (s === "enabled" || s === "enabled_unverified") applied.push(row.tweak_id as string);
      else if (s === "failed") failed.push(row.tweak_id as string);
    }
    const total = result.rows.length;
    return {
      status: total > 0 ? "available" : "partial",
      applied,
      failed,
      total,
    };
  } catch {
    return { status: "unavailable", applied: [], failed: [], total: 0 };
  }
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
  const intel = getCachedSystemIntelligence();
  if (!intel) return unavailableSysIntel();
  try {
    const mb = [intel.baseboard.manufacturer, intel.baseboard.model].filter(Boolean).join(" ");
    return {
      status: "available",
      cpuBrand: intel.cpu.brand ?? null,
      gpuNames: intel.gpu.controllers.map((g: any) => g.name).filter(Boolean),
      ramTotalMb: intel.memory.totalMb ?? null,
      ramStickCount: intel.memory.sticks.length,
      ramType: intel.memory.sticks[0]?.type ?? null,
      ramSpeedMhz: intel.memory.sticks[0]?.configuredClockMhz ?? intel.memory.sticks[0]?.clockMhz ?? null,
      motherboard: mb || null,
      biosVersion: intel.bios.version ?? null,
      os: intel.platform.os ?? null,
      vbsEnabled: intel.platform.vbsEnabled ?? null,
      hypervisorPresent: intel.platform.hypervisorPresent ?? null,
      resizeBarEnabled: intel.platform.resizeBarEnabled ?? null,
      xmpInference: intel.inference?.expoOrXmp?.reason ?? null,
      networkAdapters: (intel.network.interfaces ?? [])
        .filter((n: any) => n.operstate === "up" && !n.internal)
        .map((n: any) => [n.wifi ? "Wi-Fi" : "Ethernet", n.speedMbps ? `${n.speedMbps}Mbps` : null, n.name ? `(${n.name})` : null].filter(Boolean).join(" "))
        .slice(0, 3),
    };
  } catch {
    return unavailableSysIntel();
  }
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
