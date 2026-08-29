import type {
  SipController,
  SipDisplay,
  SipMemStick,
  SipStorageDevice,
  SystemIntelligenceProfile,
} from "@/stores/systemIntelligenceStore";

export interface AiHardwareDetails {
  platform: {
    tpmPresent: boolean | null;
    tpmVersion: string | null;
    uefiBoot: boolean | null;
    virtualizationEnabled: boolean | null;
    hypervisorPresent: boolean | null;
  };
  cpu: {
    physicalCores: number | null;
    logicalCores: number | null;
  };
  memory: {
    totalMb: number | null;
    inferredDualChannel: boolean | null;
    sticks: Array<{
      slot: string | null;
      bank: string | null;
      sizeMb: number | null;
      type: string | null;
      clockMhz: number | null;
      configuredClockMhz: number | null;
      manufacturer: string | null;
      partNum: string | null;
    }>;
  };
  gpus: Array<{
    name: string | null;
    vendor: string | null;
    subVendor: string | null;
    vramMb: number | null;
    vramDynamic: boolean | null;
    bus: string | null;
    external: boolean | null;
  }>;
  storage: Array<{
    name: string | null;
    type: string | null;
    interfaceType: string | null;
    sizeGb: number | null;
  }>;
  displays: Array<{
    model: string | null;
    main: boolean | null;
    connection: string | null;
    resolutionX: number | null;
    resolutionY: number | null;
    refreshRate: number | null;
  }>;
  deviceCounts: {
    gpuControllers: number;
    displays: number;
    storageDevices: number;
    networkInterfaces: number;
    audioDevices: number;
  };
}

function mapMemoryStick(stick: SipMemStick): AiHardwareDetails["memory"]["sticks"][number] {
  return {
    slot: stick.slot,
    bank: stick.bank,
    sizeMb: stick.sizeMb,
    type: stick.type,
    clockMhz: stick.clockMhz,
    configuredClockMhz: stick.configuredClockMhz,
    manufacturer: stick.manufacturer,
    partNum: stick.partNum,
  };
}

function mapGpu(controller: SipController): AiHardwareDetails["gpus"][number] {
  return {
    name: controller.name,
    vendor: controller.vendor,
    subVendor: controller.subVendor,
    vramMb: controller.vramMb,
    vramDynamic: controller.vramDynamic,
    bus: controller.bus,
    external: controller.external,
  };
}

function mapDisplay(display: SipDisplay): AiHardwareDetails["displays"][number] {
  return {
    model: display.model,
    main: display.main,
    connection: display.connection,
    resolutionX: display.resolutionX,
    resolutionY: display.resolutionY,
    refreshRate: display.refreshRate,
  };
}

function mapStorage(device: SipStorageDevice): AiHardwareDetails["storage"][number] {
  return {
    name: device.name,
    type: device.type,
    interfaceType: device.interfaceType,
    sizeGb: device.sizeGb,
  };
}

/**
 * Normalizes the complete, relevant hardware inventory for AI requests.
 * Deliberately omits serial numbers, MAC addresses, hostnames, user names,
 * filesystem mounts, and process data because they do not improve hardware advice.
 */
export function buildAiHardwareDetails(profile: SystemIntelligenceProfile): AiHardwareDetails {
  return {
    platform: {
      tpmPresent: profile.platform.tpmPresent,
      tpmVersion: profile.platform.tpmVersion,
      uefiBoot: profile.platform.uefiBoot,
      virtualizationEnabled: profile.platform.virtualizationEnabled,
      hypervisorPresent: profile.platform.hypervisorPresent,
    },
    cpu: {
      physicalCores: profile.cpu.physicalCores,
      logicalCores: profile.cpu.logicalCores,
    },
    memory: {
      totalMb: profile.memory.totalMb,
      inferredDualChannel: profile.memory.inferredDualChannel,
      sticks: profile.memory.sticks.map(mapMemoryStick),
    },
    gpus: profile.gpu.controllers.map(mapGpu),
    storage: profile.storage.layout.map(mapStorage),
    displays: profile.gpu.displays.map(mapDisplay),
    deviceCounts: {
      gpuControllers: profile.gpu.controllers.length,
      displays: profile.gpu.displays.length,
      storageDevices: profile.storage.layout.length,
      networkInterfaces: profile.network.interfaces.length,
      audioDevices: profile.audio.devices.length,
    },
  };
}