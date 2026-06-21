import { Router, Request, Response } from "express";

/**
 * Driver Intelligence — cloud driver / firmware reference database.
 *
 * This is a SERVER-MAINTAINED static database of latest known driver and
 * firmware versions. It is NEVER live-scraped from vendor sites at request
 * time. The client compares the user's locally-detected versions against
 * this database to decide healthy / outdated / critical.
 *
 * The endpoint exposes reference data only (no user data), so it is left
 * unauthenticated for resilience — the Driver Intelligence page itself is
 * premium-gated on the client. If the cloud is unreachable, the client
 * falls back to its bundled local copy.
 */

const driverIntelRouter = Router();

export type SafetyLevel = "safe" | "caution" | "critical";

export interface DriverDbEntry {
  /** Latest known version / firmware / BIOS string. */
  latest: string;
  /** Human release date (ISO or display). */
  releaseDate?: string;
  /** Short release-note summary. */
  releaseNotes?: string;
  /** Known bugs / regressions worth surfacing. */
  knownIssues?: string[];
  /** Update safety guidance. */
  safety: SafetyLevel;
}

export interface DriverNewsItem {
  id: string;
  vendor: string;
  category: string;
  title: string;
  summary: string;
  date: string;
  safety: SafetyLevel;
}

/**
 * Versioned database. `dbVersion` lets the client invalidate its cache when
 * the server data changes. Keys are normalised vendor identifiers.
 */
const DATABASE = {
  dbVersion: "2026.06.1",
  updatedAt: "2026-06-15",

  gpu: {
    nvidia: {
      latest: "576.80",
      releaseDate: "2026-06-10",
      releaseNotes:
        "Game Ready driver. Adds optimisations for recent titles, fixes a DPC latency regression present in 575.x, improves DLSS frame generation stability.",
      knownIssues: [
        "Some users report idle clock fluctuations on multi-monitor high-refresh setups.",
      ],
      safety: "safe",
    } as DriverDbEntry,
    amd: {
      latest: "25.6.1",
      releaseDate: "2026-06-04",
      releaseNotes:
        "Adrenalin Edition. Performance uplift in DX12 titles, fixes for AFMF stutter, improved Radeon Anti-Lag compatibility.",
      knownIssues: ["Anti-Lag may be disabled in select anti-cheat titles."],
      safety: "safe",
    } as DriverDbEntry,
    intel: {
      latest: "32.0.101.6790",
      releaseDate: "2026-05-28",
      releaseNotes:
        "Arc & Iris Xe driver. Game optimisations and DX11 overhead reductions, several application-crash fixes.",
      safety: "safe",
    } as DriverDbEntry,
  },

  chipset: {
    amd: {
      latest: "7.10.13.408",
      releaseDate: "2026-05-20",
      releaseNotes:
        "AMD Chipset driver bundle. Updated power plan behaviour, preferred-core (CPPC) scheduling refinements, USB stability fixes.",
      knownIssues: [],
      safety: "safe",
    } as DriverDbEntry,
    intel: {
      latest: "10.1.19444.8378",
      releaseDate: "2026-04-30",
      releaseNotes:
        "Intel Chipset Device Software. Refreshes device identification for current platforms.",
      safety: "safe",
    } as DriverDbEntry,
  },

  bios: {
    // Keyed by motherboard manufacturer; latest is illustrative reference.
    gigabyte: {
      latest: "F10",
      releaseDate: "2026-05-12",
      releaseNotes:
        "AGESA ComboAM5 1.2.0.3 — improved memory training, stability for high-frequency EXPO kits, security microcode update.",
      knownIssues: [],
      safety: "caution",
    } as DriverDbEntry,
    asus: {
      latest: "2604",
      releaseDate: "2026-05-08",
      releaseNotes:
        "Updated AGESA microcode, improved fan-curve handling, resolved sporadic POST delay with certain NVMe drives.",
      safety: "caution",
    } as DriverDbEntry,
    msi: {
      latest: "7E12v1H",
      releaseDate: "2026-04-22",
      releaseNotes:
        "Memory compatibility improvements and updated CPU microcode.",
      safety: "caution",
    } as DriverDbEntry,
    asrock: {
      latest: "3.10",
      releaseDate: "2026-04-18",
      releaseNotes: "AGESA update, improved cold-boot reliability.",
      safety: "caution",
    } as DriverDbEntry,
  },

  ssd: {
    samsung: {
      latest: "4B2QJXD7",
      releaseNotes:
        "Endurance and power-state stability firmware via Samsung Magician.",
      safety: "caution",
    } as DriverDbEntry,
    crucial: {
      latest: "P9CR40A",
      releaseNotes: "Performance consistency firmware via Crucial Storage Executive.",
      safety: "caution",
    } as DriverDbEntry,
    wd: {
      latest: "731120WD",
      releaseNotes: "Thermal and latency improvements via WD Dashboard.",
      safety: "caution",
    } as DriverDbEntry,
    kingston: {
      latest: "EIFK51.6",
      releaseNotes: "Stability firmware via Kingston SSD Manager.",
      safety: "caution",
    } as DriverDbEntry,
  },

  network: {
    intel: {
      latest: "29.3",
      releaseDate: "2026-05-15",
      releaseNotes:
        "Intel Ethernet/Wi-Fi driver. RSS and interrupt-moderation tuning, latency improvements, security fixes.",
      knownIssues: [],
      safety: "safe",
    } as DriverDbEntry,
    realtek: {
      latest: "11.20.0610",
      releaseDate: "2026-06-10",
      releaseNotes:
        "Realtek LAN driver. Reduced CPU overhead at high throughput, fixes for wake-on-LAN.",
      safety: "safe",
    } as DriverDbEntry,
    killer: {
      latest: "3.1.1456",
      releaseDate: "2026-05-02",
      releaseNotes:
        "Killer Performance Suite. Improved traffic prioritisation, lower latency under load.",
      knownIssues: ["Killer Control Center can increase idle CPU; optional install."],
      safety: "caution",
    } as DriverDbEntry,
  },

  audio: {
    realtek: {
      latest: "6.0.9670.1",
      releaseDate: "2026-05-19",
      releaseNotes:
        "Realtek HD/UAD audio. DPC latency reductions, fixes for crackle on certain motherboards.",
      safety: "safe",
    } as DriverDbEntry,
    steelseries: {
      latest: "GG 90.0",
      releaseNotes: "SteelSeries Sonar / GG engine update.",
      safety: "caution",
    } as DriverDbEntry,
    creative: {
      latest: "6.0.105",
      releaseNotes: "Sound Blaster Command engine update.",
      safety: "caution",
    } as DriverDbEntry,
    logitech: {
      latest: "G HUB 2026.4",
      releaseNotes: "Logitech G HUB driver/firmware bundle.",
      safety: "caution",
    } as DriverDbEntry,
  },

  bluetooth: {
    intel: {
      latest: "23.60.0",
      releaseDate: "2026-05-15",
      releaseNotes: "Intel Bluetooth driver. Connection stability and pairing fixes.",
      safety: "safe",
    } as DriverDbEntry,
    realtek: {
      latest: "1.8.1061",
      releaseNotes: "Realtek Bluetooth driver update.",
      safety: "safe",
    } as DriverDbEntry,
  },
};

const NEWS: DriverNewsItem[] = [
  {
    id: "news-nv-57680",
    vendor: "NVIDIA",
    category: "GPU",
    title: "NVIDIA released Game Ready 576.80",
    summary:
      "Fixes a DPC latency regression from the 575 branch and improves frame-generation stability.",
    date: "2026-06-10",
    safety: "safe",
  },
  {
    id: "news-amd-chipset-710",
    vendor: "AMD",
    category: "Chipset",
    title: "AMD chipset 7.10 available",
    summary:
      "Preferred-core scheduling refinements and USB stability fixes for AM5 platforms.",
    date: "2026-05-20",
    safety: "safe",
  },
  {
    id: "news-giga-f10",
    vendor: "Gigabyte",
    category: "BIOS",
    title: "Gigabyte F10 BIOS (AGESA 1.2.0.3)",
    summary:
      "Improved memory training for high-frequency EXPO kits and a security microcode update.",
    date: "2026-05-12",
    safety: "caution",
  },
  {
    id: "news-intel-lan-293",
    vendor: "Intel",
    category: "Network",
    title: "Intel LAN/Wi-Fi 29.3 update",
    summary: "RSS and interrupt-moderation tuning with measurable latency improvements.",
    date: "2026-05-15",
    safety: "safe",
  },
  {
    id: "news-realtek-audio",
    vendor: "Realtek",
    category: "Audio",
    title: "Realtek UAD audio 6.0.9670.1",
    summary: "DPC latency reductions and crackle fixes on select motherboards.",
    date: "2026-05-19",
    safety: "safe",
  },
];

// GET /api/driver-intel/database — full reference DB
driverIntelRouter.get("/database", (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json(DATABASE);
});

// GET /api/driver-intel/news — driver news feed
driverIntelRouter.get("/news", (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ items: NEWS, updatedAt: DATABASE.updatedAt });
});

export default driverIntelRouter;
