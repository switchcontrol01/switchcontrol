import { lazy } from "react";
import { loadDesktopRoute } from "@/lib/route-prefetch";

export const desktopRoutes = {
  Home: lazy(() => loadDesktopRoute("home")),
  Tweaks: lazy(() => loadDesktopRoute("tweaks")),
  NetworkTweaks: lazy(() => loadDesktopRoute("network")),
  SystemCleaner: lazy(() => loadDesktopRoute("cleaner")),
  Settings: lazy(() => loadDesktopRoute("settings")),
  PowerPlan: lazy(() => loadDesktopRoute("power-plan")),
  Debloater: lazy(() => loadDesktopRoute("debloat")),
  StartupApps: lazy(() => loadDesktopRoute("startup")),
  NicTuningPage: lazy(() => loadDesktopRoute("nic-tuning")),
  BiosAdvisor: lazy(() => loadDesktopRoute("bios-advisor")),
  AiAdvisor: lazy(() => loadDesktopRoute("ai-advisor")),
  DriverIntelligence: lazy(() => loadDesktopRoute("driver-intel")),
  LatencyAnalyzer: lazy(() => loadDesktopRoute("latency-analyzer")),
  Security: lazy(() => loadDesktopRoute("security")),
  History: lazy(() => loadDesktopRoute("history")),
  ProcessManager: lazy(() => loadDesktopRoute("process-manager")),
} as const;