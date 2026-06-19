import type { SignalValue } from "../types";

function generateDeviceHash(userId: string): string {
  const raw = `${userId}-${navigator.userAgent}-${screen.width}x${screen.height}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8).toUpperCase();
}

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
        signals.appVersion = { value: v || "1.1.4", source: "electron" };
      }).catch(() => {
        signals.appVersion = { value: "1.1.4", source: "static" };
      });
    } else {
      signals.appVersion = { value: "1.1.4", source: "static" };
    }
  } catch {
    signals.appVersion = { value: "1.1.4", source: "static", error: "Could not detect version" };
  }

  try {
    const api = (window as any).electronAPI;
    if (api?.getDeviceId) {
      signals.deviceIdShort = { value: "pending", source: "electron" };
      api.getDeviceId().then((id: string) => {
        signals.deviceIdShort = { value: id || generateDeviceHash(storeState.userId), source: "electron" };
      }).catch(() => {
        signals.deviceIdShort = { value: generateDeviceHash(storeState.userId), source: "browser" };
      });
    } else {
      signals.deviceIdShort = { value: generateDeviceHash(storeState.userId), source: "browser" };
    }
  } catch {
    signals.deviceIdShort = { value: null, source: "browser", error: "Failed to generate device ID" };
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
