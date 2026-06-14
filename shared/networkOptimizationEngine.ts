/**
 * networkOptimizationEngine.ts — Separate, dedicated engine for network optimization.
 *
 * Completely distinct from the main optimization engine:
 * - Uses network-specific signals (wired detection, traffic load, WiFi presence)
 * - Different safety rules (never recommend WiFi disable unless confirmed wired)
 * - Scores ONLY network-relevant tweaks
 * - Returns the same OptimizationPlan shape so the UI is reused unchanged
 *
 * Only runs when the user explicitly enters the "Network Responsiveness" intent.
 */

import type { OptimizationPlan, PlanEntry, AvoidedEntry, EngineInputTweak } from "./optimizationEngine";
import { windowsBuildFactor as buildFactor } from "./networkEngineBuildUtil";

// ── Network-specific input signals ───────────────────────────────────────────

export interface NetworkSignals {
  isWired: boolean | null;         // confirmed Ethernet connection
  hasWifiAdapter: boolean | null;  // a WiFi adapter is present
  rxKBps: number | null;           // live RX traffic (kB/s) — high = busy uplink
  txKBps: number | null;           // live TX traffic (kB/s)
  windowsBuild: number | null;
  appliedTweakIds: string[];
}

// ── Per-tweak network scoring rules ──────────────────────────────────────────

interface NetworkTweakRule {
  baseScore: number;
  reason: string;
  safetyLevel: "safe" | "moderate" | "risky";
  reversibility: "instant" | "reboot" | "partial";
  conditionalAvoid?: (signals: NetworkSignals) => string | null; // return avoid reason or null
}

const NETWORK_TWEAK_RULES: Record<string, NetworkTweakRule> = {
  "net-throttle-index": {
    baseScore: 92,
    reason: "Removes the Windows network throttle (10 Gbps cap on non-multimedia flows). The most impactful single network tweak — directly lowers game packet latency.",
    safetyLevel: "safe",
    reversibility: "instant",
  },
  "disable-delivery-opt": {
    baseScore: 85,
    reason: "Stops Windows Update from using your connection for peer-to-peer update distribution. Eliminates unexpected bandwidth spikes during gaming sessions.",
    safetyLevel: "safe",
    reversibility: "instant",
  },
  "sys-responsiveness": {
    baseScore: 74,
    reason: "Configures MMCSS responsiveness, which controls how CPU time is allocated to multimedia (including network game threads). Reduces jitter on congested connections.",
    safetyLevel: "safe",
    reversibility: "instant",
  },
  "win32-priority-sep": {
    baseScore: 62,
    reason: "Increases the CPU quantum for foreground processes. Game network sockets receive longer CPU slices, reducing round-trip time variability.",
    safetyLevel: "safe",
    reversibility: "instant",
  },
  "bluetooth": {
    baseScore: 68,
    reason: "Disables the Bluetooth service, which shares RF spectrum with 2.4 GHz WiFi. Most impactful if you are on 2.4 GHz WiFi — less relevant on 5 GHz or wired.",
    safetyLevel: "moderate",
    reversibility: "instant",
    conditionalAvoid: (s) => {
      if (s.isWired === false || s.isWired === null) {
        return "Cannot safely recommend Bluetooth disable — wired connection not confirmed. Disabling Bluetooth while on WiFi may affect Bluetooth peripherals. Apply manually if you have no Bluetooth devices.";
      }
      return null;
    },
  },
  "wifi": {
    baseScore: 55,
    reason: "Disables the WiFi adapter. Only useful if you have switched to a wired Ethernet connection — eliminates RF interference and wireless overhead entirely.",
    safetyLevel: "risky",
    reversibility: "instant",
    conditionalAvoid: (s) => {
      if (s.isWired !== true) {
        return "Cannot recommend disabling WiFi — you do not appear to have a confirmed wired connection. Applying this on a wireless-only system would disconnect you from the network.";
      }
      return null;
    },
  },
  "irq-priority": {
    baseScore: 58,
    reason: "Raises the IRQ priority for network interface controllers. Reduces interrupt handling latency for network packets under CPU load.",
    safetyLevel: "moderate",
    reversibility: "instant",
  },
  "disable-wer": {
    baseScore: 45,
    reason: "Stops Windows Error Reporting from sending data over the network during a session, reducing occasional background bandwidth spikes.",
    safetyLevel: "safe",
    reversibility: "instant",
  },
};

// Tweaks to never include in network flow — they have no meaningful network impact
const NETWORK_EXCLUDED_TWEAKS = new Set([
  "gaming-mode", "disable-mpo", "preemption", "disable-pointer-precision",
  "mouse-queue-size", "kbd-queue-size", "low-level-hooks-timeout",
  "disable-transparency", "disable-animations", "menu-show-delay",
  "hung-app-timeout", "compact-explorer", "recent-files", "wait-to-kill-app",
  "show-file-extensions", "explorer-separate-process", "desktop-comp",
  "fast-startup", "core-isolation", "vbs", "hyper-v", "p-states", "disable-dcom",
  "hdcp", "page-combining", "large-system-cache", "storage-sense",
  "copilot", "cortana", "search-highlights", "disable-activity-history",
  "fax-printer", "disable-lock-screen", "disable-wallpaper-compression",
  "xbox-bar", "xbox-services", "disable-fso", "usb-selective-suspend",
]);

// ── Network signal summary (shown in hardwareSummary field) ───────────────────

function buildNetworkSignalSummary(signals: NetworkSignals): string {
  const parts: string[] = [];
  if (signals.isWired === true) parts.push("Wired (Ethernet)");
  else if (signals.isWired === false) parts.push("Wireless (WiFi)");
  else parts.push("Connection type: unknown");
  if (signals.rxKBps != null && signals.rxKBps > 500) parts.push(`High RX load: ${Math.round(signals.rxKBps)} kB/s`);
  const build = signals.windowsBuild;
  if (build) parts.push(`Win Build ${build}`);
  return parts.join(" · ");
}

// ── Main network engine function ──────────────────────────────────────────────

export function runNetworkOptimizationEngine(
  signals: NetworkSignals,
  allTweaks: EngineInputTweak[],
): OptimizationPlan {
  const recommended: PlanEntry[] = [];
  const avoided: AvoidedEntry[] = [];

  // Build a quick lookup of current tweak applied state
  const appliedSet = new Set(signals.appliedTweakIds);

  for (const tweak of allTweaks) {
    if (NETWORK_EXCLUDED_TWEAKS.has(tweak.id)) continue;
    const rule = NETWORK_TWEAK_RULES[tweak.id];
    if (!rule) continue; // not a network-relevant tweak

    if (appliedSet.has(tweak.id)) continue; // already applied — skip silently

    // Check conditional avoid (wired/bluetooth safety rules)
    const avoidReason = rule.conditionalAvoid?.(signals);
    if (avoidReason) {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: "hardware-incompatible",
        reason: avoidReason,
      });
      continue;
    }

    // Apply Windows build decay from the central utility
    const decayedScore = Math.round(rule.baseScore * buildFactor(tweak.id, signals.windowsBuild));

    if (decayedScore < 45) {
      avoided.push({
        tweakId: tweak.id,
        tweakTitle: tweak.title,
        avoidType: "low-confidence",
        reason: `Below confidence threshold on your Windows build (score: ${decayedScore}).`,
      });
      continue;
    }

    recommended.push({
      tweakId: tweak.id,
      tweakTitle: tweak.title,
      score: decayedScore,
      confidence: decayedScore,
      expectedImpact: decayedScore >= 80 ? "high" : decayedScore >= 65 ? "medium" : "low",
      reason: rule.reason,
      safetyLevel: rule.safetyLevel,
      reversibility: rule.reversibility,
      alreadyApplied: false,
      requiresReboot: tweak.requiresReboot ?? false,
    });
  }

  recommended.sort((a, b) => b.score - a.score);

  // Deterministic session ID from signal fingerprint + recommended tweak IDs
  const sigFingerprint = `net|${signals.isWired}|${signals.hasWifiAdapter}|${signals.windowsBuild ?? "?"}`;
  const tweakSig = recommended.map(e => e.tweakId).sort().join(",");
  let h = 5381;
  for (const ch of (sigFingerprint + "|" + tweakSig)) {
    h = Math.imul(h << 5 + h, 1) ^ ch.charCodeAt(0);
  }
  const sessionId = `net_${Math.abs(h).toString(36)}`;
  return {
    sessionId,
    intent: "network-responsiveness",
    recommended,
    avoided,
    generatedAt: Date.now(),
    hardwareSummary: buildNetworkSignalSummary(signals),
  };
}
