import type { SignalValue } from "../types";

export async function collectNetworkSignals(): Promise<Record<string, SignalValue>> {
  const signals: Record<string, SignalValue> = {};
  const api = (window as any).electronAPI;

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("network-adapter");
      signals.activeAdapterName = { value: status?.adapterName || null, source: "electron" };
    } else {
      signals.activeAdapterName = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.activeAdapterName = { value: null, source: "electron", error: "Failed to read adapter" };
  }

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("interrupt-moderation");
      signals.interruptModeration = { value: status?.enabled ? "on" : "off", source: "electron" };
    } else {
      signals.interruptModeration = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.interruptModeration = { value: null, source: "electron", error: "Failed to read interrupt moderation" };
  }

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("tcp-auto-tuning");
      signals.tcpAutoTuning = { value: status?.level || null, source: "electron" };
    } else {
      signals.tcpAutoTuning = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.tcpAutoTuning = { value: null, source: "electron", error: "Failed to read TCP auto-tuning" };
  }

  return signals;
}
