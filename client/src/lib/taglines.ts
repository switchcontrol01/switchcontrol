import { useMemo } from "react";

const TAGLINES = [
  "System calibration in progress.",
  "Performance stability prioritized.",
  "Latency pathways optimized.",
  "Bottlenecks under review.",
  "Resource allocation aligned.",
  "Core efficiency stabilized.",
  "Throughput consistency active.",
  "Thermal margin monitored.",
  "Frame pacing prepared.",
  "Memory pressure assessed.",
  "Elite performance profile loaded.",
  "Advanced telemetry initialized.",
  "Precision mode engaged.",
  "High performance pathway enabled.",
  "Optimization consistency verified.",
];

const LS_KEY = "sc_last_tagline_idx";

function getTagline(): string {
  const lastIdx = parseInt(localStorage.getItem(LS_KEY) ?? "-1", 10);
  let idx: number;
  do {
    idx = Math.floor(Math.random() * TAGLINES.length);
  } while (idx === lastIdx && TAGLINES.length > 1);
  localStorage.setItem(LS_KEY, String(idx));
  return TAGLINES[idx];
}

export function useDashboardTagline(): string {
  return useMemo(() => getTagline(), []);
}
