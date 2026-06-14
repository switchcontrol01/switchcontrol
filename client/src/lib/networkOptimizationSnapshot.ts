/**
 * networkOptimizationSnapshot.ts — Collects network-specific signals for the
 * dedicated network optimization engine.
 *
 * Distinct from the main hardware snapshot:
 * - Focuses on connection type, WiFi presence, live traffic load
 * - Tries Electron IPC for interface-level data (wired vs wireless detection)
 * - Falls back to live telemetry and store data
 * - No new polling — samples once and freezes
 */

import { useStore } from "@/lib/store";
import type { NetworkSignals } from "@shared/networkOptimizationEngine";

function parseBuildNumber(osVersion: string | null | undefined): number | null {
  if (!osVersion) return null;
  const parts = osVersion.split(".");
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  return Number.isFinite(n) && n > 1000 ? n : null;
}

/** Detect if the primary connection is wired Ethernet from Electron interface list. */
function detectWiredFromSpecs(specs: any): { isWired: boolean | null; hasWifiAdapter: boolean | null } {
  if (!Array.isArray(specs?.network)) return { isWired: null, hasWifiAdapter: null };
  const ifaces: any[] = specs.network;
  const hasWifi = ifaces.some(
    (i: any) => /wi.?fi|wireless|802\.11/i.test(i.type ?? "") || /wi.?fi|wireless/i.test(i.name ?? "")
  );
  const hasWired = ifaces.some(
    (i: any) => /ethernet|eth|lan/i.test(i.type ?? "") && i.operstate === "up" && i.internal === false
  );
  const hasWifiUp = ifaces.some(
    (i: any) => /wi.?fi|wireless/i.test(i.type ?? "") && i.operstate === "up" && i.internal === false
  );
  // Wired = at least one Ethernet up AND either no WiFi up, or explicitly Ethernet primary
  const isWired = hasWired ? (hasWifiUp ? null : true) : (hasWifiUp ? false : null);
  return { isWired, hasWifiAdapter: hasWifi };
}

/**
 * Collect network-specific signals for the network optimization engine.
 * Resolves in < 100ms on cache hit, < 1000ms on cold IPC.
 */
export async function collectNetworkOptimizationSnapshot(): Promise<NetworkSignals> {
  const storeState = useStore.getState();
  const tweaks = storeState.tweaks;
  const appliedTweakIds = Object.entries(tweaks).filter(([, v]) => v).map(([k]) => k);
  const windowsBuild = parseBuildNumber(storeState.stats?.osVersion);

  let isWired: boolean | null = null;
  let hasWifiAdapter: boolean | null = null;
  let rxKBps: number | null = null;
  let txKBps: number | null = null;

  const electronAPI = (window as any).electronAPI;

  // Try Electron IPC for interface-level data
  if (electronAPI?.system?.getSpecs) {
    try {
      const specs = await Promise.race([
        electronAPI.system.getSpecs(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1200)),
      ]) as any;
      const detected = detectWiredFromSpecs(specs);
      isWired = detected.isWired;
      hasWifiAdapter = detected.hasWifiAdapter;
    } catch { /* fall through */ }
  }

  // Pull live RX/TX from telemetry
  if (electronAPI?.telemetry?.getLive) {
    try {
      const live = await Promise.race([
        electronAPI.telemetry.getLive(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 700)),
      ]) as any;
      if (live?.network?.rxKBps != null) rxKBps = live.network.rxKBps;
      if (live?.network?.txKBps != null) txKBps = live.network.txKBps;
    } catch { /* fine */ }
  }

  return {
    isWired,
    hasWifiAdapter,
    rxKBps,
    txKBps,
    windowsBuild,
    appliedTweakIds,
  };
}
