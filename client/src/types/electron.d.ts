interface SystemSpecs {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    speed: string;
  };
  ram: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
  };
  gpu: {
    model: string;
    vendor: string;
    vramGB: number;
  };
  system: {
    os: string;
    osVersion: string;
    arch: string;
    hostname: string;
  };
  disk: {
    name: string;
    usedGB: number;
    totalGB: number;
  };
}

interface TelemetryData {
  cpuLoadPercent: number;
  cpuTempC: number | null;
  gpuTempC: number | null;
  gpuLoadPercent: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
}

interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  isPremium: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      isPackaged: () => Promise<boolean>;
      system?: {
        getInfo: () => Promise<{
          platform: string;
          arch: string;
          hostname: string;
          cpus: number;
          totalMemory: number;
          freeMemory: number;
          uptime: number;
        }>;
        openExternal: (url: string) => Promise<boolean>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      auth?: {
        onCallback: (callback: (data: { token: string; user: AuthUser }) => void) => void;
        removeCallbackListener: () => void;
      };
    };
    
    telemetry?: {
      getLive: () => Promise<TelemetryData>;
    };
    
    sc?: {
      getSystemInfo: () => Promise<{
        platform: string;
        arch: string;
        hostname: string;
        cpus: number;
        totalMemory: number;
        freeMemory: number;
        uptime: number;
      }>;
      getSystemSpecs: () => Promise<SystemSpecs>;
      getRamUsage: () => Promise<{ ramTotalGb: number; ramUsedGb: number }>;
    };
    
    switchControl?: {
      ready: boolean;
      version: string;
      tweaks: {
        apply: (tweakId: string) => Promise<{ success: boolean; message: string }>;
        revert: (tweakId: string) => Promise<{ success: boolean; message: string }>;
        getStatus: (tweakId: string) => Promise<{ applied: boolean; available: boolean }>;
      };
      startup: {
        getApps: () => Promise<any[]>;
        toggleApp: (appId: string, enabled: boolean) => Promise<{ success: boolean }>;
      };
      system: {
        getInfo: () => Promise<any>;
        clearRam: () => Promise<{ success: boolean; freedMB: number }>;
      };
      network: {
        getSettings: () => Promise<any>;
        applyTweak: (tweakId: string) => Promise<{ success: boolean }>;
      };
    };
  }
}

export {};
