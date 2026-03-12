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
  "Did you know? Disabling HPET can reduce input lag.",
  "GPU scheduling optimization ready.",
  "Interrupt affinity tuning available.",
  "Network adapter buffers calibrated.",
  "CPU thread scheduling refined.",
  "Power plan intelligence active.",
  "System interrupt latency minimized.",
  "Timer resolution set to maximum precision.",
  "System readiness verified.",
  "Performance pathways aligned.",
  "Resource priorities balanced.",
  "Runtime environment stabilized.",
  "Execution channels opened.",
  "Latency profile calibrated.",
  "Hardware interface synchronized.",
  "Process scheduling optimized.",
  "Memory allocation inspected.",
  "Signal paths normalized.",
  "Thermal state evaluated.",
  "Foreground priorities established.",
  "Background load minimized.",
  "Driver state inspected.",
  "Timing precision verified.",
  "Runtime services initialized.",
  "Execution overhead reduced.",
  "Device handshake complete.",
  "Input response calibrated.",
  "Performance envelope prepared.",
  "Data channels synchronized.",
  "System topology mapped.",
  "Thread coordination refined.",
  "Adapter state evaluated.",
  "Scheduler alignment confirmed.",
  "Resource queues normalized.",
  "Live telemetry preparing.",
  "Process hierarchy stabilized.",
  "Runtime latency minimized.",
  "Load balancing complete.",
  "Hardware topology confirmed.",
  "Execution pipeline aligned.",
  "Driver handshake established.",
  "Resource scheduler prepared.",
  "Signal timing verified.",
  "Performance baseline recorded.",
  "Process coordination refined.",
  "Runtime overhead minimized.",
  "Hardware handshake validated.",
  "Execution timing stabilized.",
  "Foreground channels opened.",
  "Performance pipeline active.",
  "Device context prepared.",
  "Live monitoring initialized.",
  "Resource path inspected.",
  "Runtime readiness achieved.",
  "System coordination aligned.",
  "Execution state verified.",
  "Performance state engaged.",
  "Optimization environment ready.",
];

const LS_KEY = "sc_last_tagline_idx";

export function getTagline(): string {
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
