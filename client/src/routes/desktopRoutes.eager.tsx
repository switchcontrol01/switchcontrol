import Home from "@/pages/Home";
import Tweaks from "@/pages/Tweaks";
import NetworkTweaks from "@/pages/NetworkTweaks";
import SystemCleaner from "@/pages/SystemCleaner";
import Settings from "@/pages/Settings";
import PowerPlan from "@/pages/PowerPlan";
import Debloater from "@/pages/Debloater";
import StartupApps from "@/pages/StartupApps";
import NicTuningPage from "@/pages/NicTuning";
import BiosAdvisor from "@/pages/BiosAdvisor";
import AiAdvisor from "@/pages/AiAdvisor";
import DriverIntelligence from "@/pages/DriverIntelligence";
import LatencyAnalyzer from "@/pages/LatencyAnalyzer";
import Security from "@/pages/Security";
import History from "@/pages/History";
import ProcessManager from "@/pages/ProcessManager";

export const desktopRoutes = {
  Home,
  Tweaks,
  NetworkTweaks,
  SystemCleaner,
  Settings,
  PowerPlan,
  Debloater,
  StartupApps,
  NicTuningPage,
  BiosAdvisor,
  AiAdvisor,
  DriverIntelligence,
  LatencyAnalyzer,
  Security,
  History,
  ProcessManager,
} as const;