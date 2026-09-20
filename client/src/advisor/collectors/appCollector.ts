import type { SignalValue } from "../types";


export function collectAppSignals(storeState: {
  tweaks: Record<string, boolean>;
  account: { stats: { tweaksApplied: number; lastScan: string | null } };
  isPremium: boolean;
  userId: string;
}): Record<string, SignalValue> {
  const signals: Record<string, SignalValue> = {};

  try {
    const api = (window as any).electronAPI;
    if (api?.getAppVersion) {
      signals.appVersion = { value: "pending", source: "electron" };
      api.getAppVersion().then((v: string) => {
        signals.appVersion = { value: v || "1.3.3", source: "electron" };
      }).catch(() => {
        signals.appVersion = { value: "1.3.3", source: "static" };
      });
    } else {
      signals.appVersion = { value: "1.3.3", source: "static" };
    }
  } catch {
    signals.appVersion = { value: "1.3.3", source: "static", error: "Could not detect version" };
  }

  try {
    const api = (window as any).electronAPI;
    if (api?.getDeviceId) {
      // Real 16-char hardware-anchored device ID from hardware-fingerprint.js via IPC.
      // Fail-closed: if IPC fails or returns null/empty, leave as null — never fake it.
      signals.deviceIdShort = { value: null, source: "electron" };
      api.getDeviceId().then((id: string | null) => {
        signals.deviceIdShort = { value: id && id.length > 0 ? id : null, source: "electron" };
      }).catch(() => {
        signals.deviceIdShort = { value: null, source: "electron", error: "IPC call failed" };
      });
    } else {
      // Web / non-Electron: no hardware fingerprint available.
      signals.deviceIdShort = { value: null, source: "browser" };
    }
  } catch {
    signals.deviceIdShort = { value: null, source: "browser", error: "Failed to read device ID" };
  }

  try {
    const enabledCount = Object.values(storeState.tweaks).filter(Boolean).length;
    signals.tweaksApplied = { value: enabledCount, source: "store" };
  } catch {
    signals.tweaksApplied = { value: null, source: "store", error: "Failed to count tweaks" };
  }

  try {
    signals.lastTweakApplyAt = {
      value: storeState.account.stats.lastScan || null,
      source: "store"
    };
  } catch {
    signals.lastTweakApplyAt = { value: null, source: "store", error: "Failed to read last tweak time" };
  }

  try {
    signals.isPremium = { value: storeState.isPremium, source: "store" };
  } catch {
    signals.isPremium = { value: false, source: "store", error: "Failed to read premium status" };
  }

  return signals;
}
