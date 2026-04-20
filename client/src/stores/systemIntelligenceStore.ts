/**
 * System Intelligence Store — single shared source of hardware truth.
 *
 * Fetches the profile once, caches it for CACHE_TTL_MS, and exposes
 * reactive access to all components. Any page can call useSystemIntelligence()
 * without triggering duplicate network requests.
 */

import { create } from "zustand";

// ── Re-export types so consumers only need one import ──────────────────────────

export interface SipController {
  name: string | null;
  vendor: string | null;
  subVendor: string | null;
  vendorId: string | null;
  deviceId: string | null;
  vramMb: number | null;
  vramDynamic: boolean | null;
  bus: string | null;
  external: boolean | null;
}

export interface SipDisplay {
  model: string | null;
  main: boolean | null;
  connection: string | null;
  resolutionX: number | null;
  resolutionY: number | null;
  refreshRate: number | null;
}

export interface SipMemStick {
  bank: string | null;
  slot: string | null;
  sizeMb: number | null;
  clockMhz: number | null;
  configuredClockMhz: number | null;
  manufacturer: string | null;
  partNum: string | null;
  type: string | null;
}

export interface SipStorageDevice {
  name: string | null;
  type: string | null;
  interfaceType: string | null;
  sizeGb: number | null;
  serial: string | null;
}

export interface SipFilesystem {
  fs: string | null;
  mount: string | null;
  type: string | null;
  sizeGb: number | null;
  usedGb: number | null;
  usePct: number | null;
}

export interface SipNetworkInterface {
  name: string | null;
  type: string | null;
  operstate: string | null;
  internal: boolean | null;
  speedMbps: number | null;
  dhcp: boolean | null;
  ip4: string | null;
  mac: string | null;
  wifi: boolean;
}

export interface SipProcess {
  name: string;
  pid: number;
  cpu: number | null;
  memoryMb: number | null;
}

export interface SipInference {
  state: "confirmed" | "likely" | "unknown";
  reason: string;
}

export interface SystemIntelligenceProfile {
  baseboard: {
    manufacturer: string | null;
    model: string | null;
    version: string | null;
  };
  bios: {
    vendor: string | null;
    version: string | null;
    releaseDate: string | null;
  };
  cpu: {
    manufacturer: string | null;
    brand: string | null;
    physicalCores: number | null;
    logicalCores: number | null;
    socket: string | null;
    speedGHz: number | null;
  };
  gpu: {
    controllers: SipController[];
    displays: SipDisplay[];
  };
  memory: {
    totalMb: number | null;
    sticks: SipMemStick[];
    inferredDualChannel: boolean | null;
  };
  storage: {
    layout: SipStorageDevice[];
    filesystems: SipFilesystem[];
  };
  network: {
    defaultInterface: string | null;
    defaultGateway: string | null;
    interfaces: SipNetworkInterface[];
    activeConnections: any[];
  };
  processes: {
    topCpu: SipProcess[];
    topMemory: SipProcess[];
  };
  platform: {
    os: string | null;
    build: string | null;
    hostname: string | null;
    uptimeSec: number | null;
    secureBootEnabled: boolean | null;
    tpmPresent: boolean | null;
    virtualizationEnabled: boolean | null;
    hypervisorPresent: boolean | null;
    memoryIntegrityEnabled: boolean | null;
    vbsEnabled: boolean | null;
    resizeBarEnabled: boolean | null;
    uefiBoot: boolean | null;
  };
  device: {
    batteryPresent: boolean | null;
    batteryPercent: number | null;
    chassisType: string | null;
  };
  users: {
    currentUser: string | null;
    sessions: any[];
  };
  containers: {
    dockerDetected: boolean | null;
    containers: any[];
  };
  inference: {
    expoOrXmp: SipInference;
    biosFreshness: SipInference;
  };
  collectedAt: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000;

interface SystemIntelligenceState {
  profile: SystemIntelligenceProfile | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number;

  fetch: (forceRefresh?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useSystemIntelligenceStore = create<SystemIntelligenceState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  fetchedAt: 0,

  fetch: async (forceRefresh = false) => {
    const { loading, fetchedAt } = get();
    const stale = Date.now() - fetchedAt > CACHE_TTL_MS;

    if (!forceRefresh && !stale && get().profile) return;
    if (loading) return;

    set({ loading: true, error: null });
    try {
      const url = forceRefresh
        ? "/api/system-intelligence/profile"
        : "/api/system-intelligence/profile";

      const method = forceRefresh ? "POST" : "GET";
      const endpoint = forceRefresh
        ? "/api/system-intelligence/refresh"
        : "/api/system-intelligence/profile";

      const res = await fetch(forceRefresh ? endpoint : url, {
        method: forceRefresh ? "POST" : "GET",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SystemIntelligenceProfile;
      set({ profile: data, loading: false, fetchedAt: Date.now() });
      console.log(`[SysIntelligence] Profile loaded | MB=${data.baseboard.model} | BIOS=${data.bios.version} | CPU=${data.cpu.brand}`);
    } catch (err: any) {
      console.warn("[SysIntelligence] fetch failed:", err?.message);
      set({ loading: false, error: err?.message ?? "Failed to load system profile" });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/system-intelligence/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SystemIntelligenceProfile;
      set({ profile: data, loading: false, fetchedAt: Date.now() });
      console.log("[SysIntelligence] Profile refreshed");
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? "Refresh failed" });
    }
  },
}));

// ── Convenience selectors ─────────────────────────────────────────────────────

/** Formatted string for AI/BIOS context: "Gigabyte X870E AORUS PRO" */
export function formatMotherboard(p: SystemIntelligenceProfile | null): string {
  if (!p) return "Unknown";
  const parts = [p.baseboard.manufacturer, p.baseboard.model].filter(Boolean);
  return parts.join(" ") || "Unknown";
}

export function formatBios(p: SystemIntelligenceProfile | null): string {
  if (!p) return "Unknown";
  const parts = [p.bios.vendor, p.bios.version, p.bios.releaseDate].filter(Boolean);
  return parts.join(", ") || "Unknown";
}

export function formatCpu(p: SystemIntelligenceProfile | null): string {
  if (!p?.cpu.brand) return "Unknown";
  return p.cpu.brand;
}

const _DISCRETE_SIG = ["nvidia", "amd", "radeon", "geforce", "rx ", "rtx ", "gtx "];

/** Returns the name of the active GPU using the same discrete-preference
 *  priority as GpuModal: NVIDIA/AMD → highest VRAM → first controller. */
export function formatGpu(p: SystemIntelligenceProfile | null): string {
  if (!p?.gpu.controllers.length) return "Unknown";
  const ctrls = p.gpu.controllers;
  if (ctrls.length === 1) return ctrls[0].name ?? "Unknown";

  const discrete = ctrls.find(c => {
    const sig = `${c.vendor ?? ""} ${c.name ?? ""}`.toLowerCase();
    return _DISCRETE_SIG.some(d => sig.includes(d));
  });
  if (discrete) return discrete.name ?? "Unknown";

  const byVram = [...ctrls].sort((a, b) => (b.vramMb ?? 0) - (a.vramMb ?? 0));
  return byVram[0].name ?? "Unknown";
}

export function formatRam(p: SystemIntelligenceProfile | null): string {
  if (!p) return "Unknown";
  if (p.memory.sticks.length > 0) {
    const totalGb = p.memory.totalMb ? Math.round(p.memory.totalMb / 1024) : null;
    const stick = p.memory.sticks[0];
    const speed = stick.configuredClockMhz ?? stick.clockMhz;
    const type = stick.type ?? "DDR";
    const count = p.memory.sticks.length;
    const sizeEach = stick.sizeMb ? Math.round(stick.sizeMb / 1024) : null;
    if (count > 1 && sizeEach && speed) {
      return `${count} x ${sizeEach}GB ${type} @ ${speed} MHz`;
    }
    if (totalGb && speed) return `${totalGb}GB ${type} @ ${speed} MHz`;
    if (totalGb) return `${totalGb}GB ${type}`;
  }
  if (p.memory.totalMb) return `${Math.round(p.memory.totalMb / 1024)}GB`;
  return "Unknown";
}

export function formatStorage(p: SystemIntelligenceProfile | null): string {
  if (!p?.storage.layout.length) return "Unknown";
  const d = p.storage.layout[0];
  const parts: string[] = [];
  if (d.name) parts.push(d.name);
  if (d.sizeGb) parts.push(`${d.sizeGb}GB`);
  if (d.type) parts.push(d.type);
  return parts.join(" ") || "Unknown";
}

export function formatNetwork(p: SystemIntelligenceProfile | null): string {
  if (!p?.network.interfaces.length) return "Unknown";
  const active = p.network.interfaces.find(n => n.operstate === "up" && !n.internal);
  if (!active) return "Unknown";
  const type = active.wifi ? "Wi-Fi" : "Ethernet";
  const speed = active.speedMbps ? ` ${active.speedMbps} Mbps` : "";
  const name = active.name ? ` (${active.name})` : "";
  return `${type}${speed}${name}`;
}
