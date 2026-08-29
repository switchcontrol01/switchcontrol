const test = require("node:test");
const assert = require("node:assert/strict");

function profileWith(overrides = {}) {
  return {
    baseboard: { manufacturer: "ASUS", model: "ROG STRIX X670E-E", version: "1.0" },
    bios: { vendor: "American Megatrends", version: "1807", releaseDate: "2025-01-01" },
    cpu: {
      manufacturer: "AMD",
      brand: "AMD Ryzen 7 7800X3D",
      physicalCores: 8,
      logicalCores: 16,
      socket: "AM5",
      speedGHz: 4.2,
    },
    gpu: {
      controllers: [
        {
          name: "NVIDIA GeForce RTX 4080",
          vendor: "NVIDIA",
          subVendor: "ASUS",
          vendorId: "10DE",
          deviceId: "2704",
          vramMb: 16384,
          vramDynamic: false,
          bus: "PCIe x16",
          external: false,
        },
        {
          name: "AMD Radeon Graphics",
          vendor: "AMD",
          subVendor: null,
          vendorId: "1002",
          deviceId: "164E",
          vramMb: 512,
          vramDynamic: true,
          bus: "Integrated",
          external: false,
        },
      ],
      displays: [
        {
          model: "PG27AQDM",
          main: true,
          connection: "DisplayPort",
          resolutionX: 2560,
          resolutionY: 1440,
          refreshRate: 240,
        },
        {
          model: "DELL U2723QE",
          main: false,
          connection: "HDMI",
          resolutionX: 3840,
          resolutionY: 2160,
          refreshRate: 60,
        },
      ],
    },
    memory: {
      totalMb: 32768,
      inferredDualChannel: true,
      sticks: [
        {
          slot: "DIMM_A2",
          bank: "BANK 0",
          sizeMb: 16384,
          type: "DDR5",
          clockMhz: 6000,
          configuredClockMhz: 6000,
          manufacturer: "G.Skill",
          partNum: "F5-6000J3038F16G",
        },
        {
          slot: "DIMM_B2",
          bank: "BANK 1",
          sizeMb: 16384,
          type: "DDR5",
          clockMhz: 6000,
          configuredClockMhz: 6000,
          manufacturer: "G.Skill",
          partNum: "F5-6000J3038F16G",
        },
      ],
    },
    storage: {
      layout: [
        { name: "Samsung 990 Pro", type: "NVMe SSD", interfaceType: "PCIe 4.0", sizeGb: 2000, serial: "storage-secret" },
        { name: "Seagate Barracuda", type: "HDD", interfaceType: "SATA", sizeGb: 4000, serial: "storage-secret-2" },
      ],
      filesystems: [
        { fs: "NTFS", mount: "C:", type: "local", sizeGb: 2000, usedGb: 400, usePct: 20 },
      ],
    },
    network: {
      defaultInterface: "Ethernet",
      defaultGateway: "192.168.1.1",
      interfaces: [
        {
          name: "Ethernet",
          type: "Ethernet",
          operstate: "up",
          internal: false,
          speedMbps: 1000,
          dhcp: true,
          ip4: "192.168.1.20",
          mac: "00:11:22:33:44:55",
          wifi: false,
        },
        {
          name: "Wi-Fi",
          type: "Wireless",
          operstate: "down",
          internal: false,
          speedMbps: 866,
          dhcp: true,
          ip4: "192.168.1.21",
          mac: "AA:BB:CC:DD:EE:FF",
          wifi: true,
        },
      ],
      activeConnections: [],
    },
    processes: { topCpu: [], topMemory: [] },
    platform: {
      os: "Windows 11",
      build: "26100",
      hostname: "TEST-HOST",
      uptimeSec: 3600,
      secureBootEnabled: true,
      tpmPresent: true,
      tpmVersion: "2.0",
      virtualizationEnabled: true,
      hypervisorPresent: true,
      memoryIntegrityEnabled: false,
      vbsEnabled: false,
      kernelDmaProtectionEnabled: true,
      resizeBarEnabled: true,
      uefiBoot: true,
    },
    device: { batteryPresent: false, batteryPercent: null, chassisType: "Desktop" },
    users: { currentUser: "test-user", sessions: [] },
    containers: { dockerDetected: false, containers: [] },
    inference: {
      expoOrXmp: { state: "confirmed", reason: "Configured memory profile detected" },
      biosFreshness: { state: "likely", reason: "Recent BIOS release" },
    },
    audio: { devices: [{ name: "Realtek Audio", manufacturer: "Realtek" }] },
    collectedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

test("AI hardware context serializes complete platform and multi-device inventory", async () => {
  const { buildAiHardwareDetails } = await import("../../client/src/lib/hardware-ai-context.ts");
  const details = buildAiHardwareDetails(profileWith());

  assert.deepEqual(details.platform, {
    tpmPresent: true,
    tpmVersion: "2.0",
    uefiBoot: true,
    virtualizationEnabled: true,
    hypervisorPresent: true,
  });
  assert.deepEqual(details.cpu, { physicalCores: 8, logicalCores: 16 });
  assert.equal(details.memory.inferredDualChannel, true);
  assert.equal(details.memory.sticks.length, 2);
  assert.equal(details.gpus.length, 2);
  assert.equal(details.storage.length, 2);
  assert.equal(details.displays.length, 2);
  assert.deepEqual(details.deviceCounts, {
    gpuControllers: 2,
    displays: 2,
    storageDevices: 2,
    networkInterfaces: 2,
    audioDevices: 1,
  });

  const serialized = JSON.stringify(details);
  assert.ok(!serialized.includes("storage-secret"));
  assert.ok(!serialized.includes("00:11:22:33:44:55"));
  assert.ok(!serialized.includes("TEST-HOST"));
  assert.ok(!serialized.includes("test-user"));
  assert.ok(!serialized.includes("C:"));
});

test("AI hardware context preserves unknown values instead of inventing facts", async () => {
  const [{ buildAiHardwareDetails }, aiRoutes] = await Promise.all([
    import("../../client/src/lib/hardware-ai-context.ts"),
    import("../../server/routes/ai.ts"),
  ]);
  const details = buildAiHardwareDetails(profileWith({
    cpu: {
      manufacturer: null,
      brand: null,
      physicalCores: null,
      logicalCores: null,
      socket: null,
      speedGHz: null,
    },
    gpu: { controllers: [], displays: [] },
    memory: { totalMb: null, inferredDualChannel: null, sticks: [] },
    storage: { layout: [], filesystems: [] },
    network: { defaultInterface: null, defaultGateway: null, interfaces: [], activeConnections: [] },
    audio: { devices: [] },
    platform: {
      os: null,
      build: null,
      hostname: null,
      uptimeSec: null,
      secureBootEnabled: null,
      tpmPresent: null,
      tpmVersion: null,
      virtualizationEnabled: null,
      hypervisorPresent: null,
      memoryIntegrityEnabled: null,
      vbsEnabled: null,
      kernelDmaProtectionEnabled: null,
      resizeBarEnabled: null,
      uefiBoot: null,
    },
  }));

  assert.equal(details.platform.tpmPresent, null);
  assert.equal(details.platform.tpmVersion, null);
  assert.equal(details.platform.uefiBoot, null);
  assert.equal(details.cpu.physicalCores, null);
  assert.equal(details.memory.inferredDualChannel, null);
  assert.deepEqual(details.gpus, []);
  assert.deepEqual(details.storage, []);
  assert.deepEqual(details.displays, []);
  assert.deepEqual(details.deviceCounts, {
    gpuControllers: 0,
    displays: 0,
    storageDevices: 0,
    networkInterfaces: 0,
    audioDevices: 0,
  });

  const prompt = aiRoutes.buildChatContext({
    system: {
      cpu: "Unknown CPU",
      gpu: "Unknown GPU",
      ram: "Unknown RAM",
      storage: "Unknown storage",
      os: "Windows",
      motherboard: "Unknown",
      display: "Unknown",
      network: "Unknown",
    },
    hardwareDetails: details,
  });
  assert.match(prompt, /TPM: not exposed/);
  assert.match(prompt, /Boot mode: not exposed/);
  assert.match(prompt, /CPU topology: not exposed physical cores, not exposed logical cores/);
  assert.match(prompt, /channel mode not exposed/);
  assert.match(prompt, /Device counts: 0 GPU controllers, 0 displays, 0 storage devices, 0 network interfaces, 0 audio devices/);
  assert.doesNotMatch(prompt, /Replit VM|EPYC|4 GB single stick/);
});