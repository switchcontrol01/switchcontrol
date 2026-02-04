interface DiskInfo {
  mount: string;
  name: string;
  usedGB: number;
  totalGB: number;
  usedPercent: number;
}

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
  disks?: DiskInfo[];
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
  interface TelemetryData {
    cpuLoadPercent: number;
    cpuTempC: number | null;
    gpuTempC: number | null;
    gpuLoadPercent: number | null;
    moboTempC: number | null;
    ramUsedGb: number;
    ramTotalGb: number;
  }
  
  interface EnhancedTelemetryData {
    enhancedAvailable: boolean;
    error?: string;
    cpuTemp?: number | null;
    gpuTemp?: number | null;
    motherboardTemp?: number | null;
    disks?: Array<{ name: string; temp: number | null }>;
    isAdmin?: boolean;
  }
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
      getEnhanced: () => Promise<EnhancedTelemetryData>;
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
      getAllDisks: () => Promise<DiskInfo[]>;
    };
  }
}

export {};
