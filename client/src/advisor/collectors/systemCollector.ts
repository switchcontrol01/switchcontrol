import type { SignalValue } from "../types";

export async function collectSystemSignals(): Promise<Record<string, SignalValue>> {
  const signals: Record<string, SignalValue> = {};
  const api = (window as any).electronAPI;

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("game-mode");
      signals.gameMode = { value: status?.enabled ? "on" : "off", source: "electron" };
    } else {
      signals.gameMode = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.gameMode = { value: null, source: "electron", error: "Failed to read game mode" };
  }

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("power-plan");
      signals.powerPlanName = { value: status?.planName || null, source: "electron" };
    } else {
      signals.powerPlanName = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.powerPlanName = { value: null, source: "electron", error: "Failed to read power plan" };
  }

  try {
    if (api?.system?.getSpecs) {
      const specs = await api.system.getSpecs();
      signals.windowsBuild = { value: specs?.system?.osVersion || null, source: "electron" };
    } else {
      const ua = navigator.userAgent;
      const match = ua.match(/Windows NT (\d+\.\d+)/);
      signals.windowsBuild = { value: match ? match[1] : null, source: "browser" };
    }
  } catch {
    signals.windowsBuild = { value: null, source: "browser", error: "Failed to detect OS version" };
  }

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("memory-integrity");
      signals.memoryIntegrity = { value: status?.enabled ? "on" : "off", source: "electron" };
    } else {
      signals.memoryIntegrity = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.memoryIntegrity = { value: null, source: "electron", error: "Failed to read memory integrity" };
  }

  try {
    if (api?.tweaks?.checkStatus) {
      const status = await api.tweaks.checkStatus("hags");
      signals.hags = { value: status?.enabled ? "on" : "off", source: "electron" };
    } else {
      signals.hags = { value: null, source: "electron", error: "Electron API unavailable" };
    }
  } catch {
    signals.hags = { value: null, source: "electron", error: "Failed to read HAGS status" };
  }

  return signals;
}
