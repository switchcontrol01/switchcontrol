/**
 * Shared desktop route loaders.
 *
 * Keeping the importer and lazy route on the same promise cache means a
 * sidebar hover can warm the exact chunk that the router will consume later.
 * This preserves code splitting without making first navigation look blank.
 */
type DesktopRoute =
  | "tweaks"
  | "network"
  | "cleaner"
  | "settings"
  | "power-plan"
  | "debloat"
  | "startup"
  | "nic-tuning"
  | "bios-advisor"
  | "ai-advisor"
  | "driver-intel"
  | "latency-analyzer"
  | "security"
  | "history"
  | "process-manager";

const loaders: Record<DesktopRoute, () => Promise<unknown>> = {
  tweaks: () => import("@/pages/Tweaks"),
  network: () => import("@/pages/NetworkTweaks"),
  cleaner: () => import("@/pages/SystemCleaner"),
  settings: () => import("@/pages/Settings"),
  "power-plan": () => import("@/pages/PowerPlan"),
  debloat: () => import("@/pages/Debloater"),
  startup: () => import("@/pages/StartupApps"),
  "nic-tuning": () => import("@/pages/NicTuning"),
  "bios-advisor": () => import("@/pages/BiosAdvisor"),
  "ai-advisor": () => import("@/pages/AiAdvisor"),
  "driver-intel": () => import("@/pages/DriverIntelligence"),
  "latency-analyzer": () => import("@/pages/LatencyAnalyzer"),
  security: () => import("@/pages/Security"),
  history: () => import("@/pages/History"),
  "process-manager": () => import("@/pages/ProcessManager"),
};

const loaded = new Map<DesktopRoute, Promise<unknown>>();

export function loadDesktopRoute(route: DesktopRoute): Promise<any> {
  const existing = loaded.get(route);
  if (existing) return existing;

  const promise = loaders[route]();
  loaded.set(route, promise);
  return promise;
}

export function preloadDesktopRoute(path: string): void {
  const route = path.replace(/^\/+/, "") as DesktopRoute;
  if (!loaders[route]) return;
  void loadDesktopRoute(route).catch(() => {
    // The lazy route will retry through the same importer on navigation and
    // ErrorBoundary will surface a real failure if the chunk remains broken.
    loaded.delete(route);
  });
}