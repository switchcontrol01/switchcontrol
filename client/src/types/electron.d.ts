interface DiskInfo {
  mount: string;
  name: string;
  usedGB: number;
  totalGB: number;
  usePercent: number;
  usedPercent: number; // Alias for compatibility
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
    isNvidia: boolean;
  };
  system: {
    os: string;
    osVersion: string;
    arch: string;
    hasLibreHardwareMonitor: boolean;
    hostname: string;
  };
  disk: {
    name: string;
    usedGB: number;
    totalGB: number;
    usePercent?: number;
  };
  disks?: DiskInfo[];
}

interface RamUsage {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usagePercent: number;
  ramTotalGb?: number;
  ramUsedGb?: number;
}

interface LiveTelemetry {
  cpuUsage: number;
  ramUsage: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
  gpuLoad: number | null;
  moboTemp: number | null;
  cpuDisplay: number;
  cpuLabel: string;
  gpuDisplay: number | null;
  gpuLabel: string | null;
  showGpu: boolean;
  showMobo: boolean;
  timestamp: number;
}

interface EnhancedTelemetry {
  cpuUsage: number;
  cpuCores: number[];
  ramUsage: number;
  cpuTemp: number | null;
  gpuTemp: number | null;
  timestamp: number;
}

interface HardwareTelemetryData {
  cpuBoostClock: number | null;
  cpuBaseClock: number | null;
  packagePower: number | null;
  ppt: number | null;
  tdc: number | null;
  edc: number | null;
  memoryFrequency: number | null;
  memoryTimings: string | null;
  physicalCores: number | null;
  logicalCores: number | null;
  cStateResidency: number | null;
  cpuModel: string;
  gpuModel: string;
  ramTotalGB: number;
  rebarSupported: boolean | null;
  vcoreVoltage: number | null;
  cpuTemp: number | null;
  thermalThrottling: boolean | null;
  gpuPower: number | null;
}

interface TweakResult {
  success: boolean;
  requiresReboot: boolean;
  requiresAdmin: boolean;
  message: string | null;
  error: string | null;
}

interface TweakStatus {
  tweakId: string;
  applied: boolean;
  error: string | null;
}

interface LocalTweakState {
  appliedTweaks: Record<string, boolean>;
  lastSync: string | null;
  windowsBuild?: string;
}

interface TweakInfo {
  id: string;
  name: string;
  tier: string;
  requiresAdmin: boolean;
  requiresReboot: boolean;
}

declare global {
  interface TelemetryData {
    cpuLoadPercent: number;
    cpuTempC: number | null;
    gpuTempC: number | null;
    gpuLoadPercent: number | null;
    ramUsedGb: number;
    ramTotalGb: number;
  }
  
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      isPackaged: () => Promise<boolean>;
      openExternal: (url: string) => Promise<void>;
      
      auth: {
        onCallback: (callback: (url: string) => void) => void;
        removeCallbackListener: () => void;
      };
      
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
      };
      
      system: {
        getInfo: () => Promise<{
          platform: string;
          arch: string;
          hostname: string;
          cpus: number;
          totalMemory: number;
          freeMemory: number;
        }>;
        getSpecs: () => Promise<SystemSpecs>;
        getRamUsage: () => Promise<RamUsage>;
        getAllDisks: () => Promise<DiskInfo[]>;
      };
      
      telemetry: {
        getLive: () => Promise<LiveTelemetry>;
        getEnhanced: () => Promise<EnhancedTelemetry>;
        getHardwareTelemetry: () => Promise<HardwareTelemetryData>;
      };
      
      tweaks: {
        execute: (tweakId: string, action: 'apply' | 'revert') => Promise<TweakResult>;
        checkStatus: (tweakId: string) => Promise<TweakStatus>;
        syncAll: () => Promise<Record<string, TweakStatus>>;
        getLocalState: () => Promise<LocalTweakState>;
        getInfo: () => Promise<TweakInfo[]>;
      };
    };
  }
}

export {};
