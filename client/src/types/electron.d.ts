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
  username: string | null;
  avatarUrl: string | null;
  plan: string;
  isPremium: boolean;
}

declare global {
  interface Window {
    electron?: {
      openExternal: (url: string) => Promise<boolean>;
    };
    
    auth?: {
      onCallback: (callback: (url: string) => void) => void;
      removeCallbackListener: () => void;
    };
    
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
  }
}

export {};
