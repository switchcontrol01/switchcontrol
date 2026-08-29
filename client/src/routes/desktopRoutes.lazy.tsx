import { lazy } from "react";

export const desktopRoutes = {
  Home: lazy(() => import("@/pages/Home")),
  Tweaks: lazy(() => import("@/pages/Tweaks")),
  NetworkTweaks: lazy(() => import("@/pages/NetworkTweaks")),
  SystemCleaner: lazy(() => import("@/pages/SystemCleaner")),
  Settings: lazy(() => import("@/pages/Settings")),
  PowerPlan: lazy(() => import("@/pages/PowerPlan")),
  Debloater: lazy(() => import("@/pages/Debloater")),
  StartupApps: lazy(() => import("@/pages/StartupApps")),
  NicTuningPage: lazy(() => import("@/pages/NicTuning")),
  BiosAdvisor: lazy(() => import("@/pages/BiosAdvisor")),
  AiAdvisor: lazy(() => import("@/pages/AiAdvisor")),
  DriverIntelligence: lazy(() => import("@/pages/DriverIntelligence")),
  LatencyAnalyzer: lazy(() => import("@/pages/LatencyAnalyzer")),
  Security: lazy(() => import("@/pages/Security")),
  History: lazy(() => import("@/pages/History")),
  ProcessManager: lazy(() => import("@/pages/ProcessManager")),
} as const;