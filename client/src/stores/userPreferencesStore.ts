import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system" | "midnight" | "oled" | "contrast";
export type AccentName = "cyan" | "purple" | "blue" | "green" | "orange" | "red" | "custom";
export type ConfirmationMode = "always" | "risky" | "safe";

export const ACCENT_COLORS: Record<Exclude<AccentName, "custom">, string> = {
  cyan: "#00D4FF",
  purple: "#A78BFA",
  blue: "#60A5FA",
  green: "#34D399",
  orange: "#FB923C",
  red: "#F87171",
};

export const DEFAULT_SIDEBAR_ORDER = [
  "/dashboard", "/tweaks", "/network", "/nic-tuning", "/power-plan",
  "/cleaner", "/debloat", "/startup", "/process-manager", "/ai-advisor",
  "/bios-advisor", "/security", "/history", "/driver-intel", "/latency-analyzer",
  "/settings",
] as const;

export const DEFAULT_DASHBOARD_CARDS = [
  "cpu", "gpu", "memory", "storage", "network", "stability", "problems", "responsiveness",
] as const;

export interface UserPreferences {
  accent: AccentName;
  customAccent: string;
  theme: ThemeMode;
  reducedMotion: boolean;
  largerText: boolean;
  highContrast: boolean;
  largeSidebar: boolean;
  largeTargets: boolean;
  disableGraphAnimation: boolean;
  colorBlindSafe: boolean;
  alwaysShowStatusLabels: boolean;
  sidebarHidden: string[];
  sidebarOrder: string[];
  dashboardHidden: string[];
  dashboardOrder: string[];
  showAppliedFirst: boolean;
  showRecommendedFirst: boolean;
  hideUnsupported: boolean;
  hideAdvanced: boolean;
  showExperimental: boolean;
  expandIntelligence: boolean;
  autoRefreshIntelligence: boolean;
  confirmationMode: ConfirmationMode;
  createRestorePoint: boolean;
  saveRegistryBackup: boolean;
  showVerification: boolean;
  autoRevertFailed: boolean;
  showTweakNotifications: boolean;
  showVerificationWarnings: boolean;
  showPremiumReminders: boolean;
  showHealthAlerts: boolean;
  startWithWindows: boolean;
  launchMinimized: boolean;
  openDashboardOnStartup: boolean;
  autoUpdateChecks: boolean;
  anonymousCrashReports: boolean;
  sharePerformanceDiagnostics: boolean;
  shareAiHardwareContext: boolean;
  metricsRefreshSeconds: 0 | 2 | 5 | 10;
}

const DEFAULTS: UserPreferences = {
  accent: "cyan",
  customAccent: "#00D4FF",
  theme: "dark",
  reducedMotion: false,
  largerText: false,
  highContrast: false,
  largeSidebar: false,
  largeTargets: false,
  disableGraphAnimation: false,
  colorBlindSafe: false,
  alwaysShowStatusLabels: false,
  sidebarHidden: [],
  sidebarOrder: [...DEFAULT_SIDEBAR_ORDER],
  dashboardHidden: [],
  dashboardOrder: [...DEFAULT_DASHBOARD_CARDS],
  showAppliedFirst: false,
  showRecommendedFirst: true,
  hideUnsupported: false,
  hideAdvanced: false,
  showExperimental: false,
  expandIntelligence: true,
  autoRefreshIntelligence: true,
  confirmationMode: "risky",
  createRestorePoint: true,
  saveRegistryBackup: true,
  showVerification: true,
  autoRevertFailed: false,
  showTweakNotifications: true,
  showVerificationWarnings: true,
  showPremiumReminders: true,
  showHealthAlerts: false,
  startWithWindows: false,
  launchMinimized: false,
  openDashboardOnStartup: true,
  autoUpdateChecks: true,
  anonymousCrashReports: true,
  sharePerformanceDiagnostics: false,
  shareAiHardwareContext: true,
  metricsRefreshSeconds: 2,
};

interface UserPreferencesState extends UserPreferences {
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  toggleSidebarItem: (href: string) => void;
  moveSidebarItem: (href: string, direction: -1 | 1) => void;
  toggleDashboardCard: (id: string) => void;
  moveDashboardCard: (id: string, direction: -1 | 1) => void;
  resetPreferences: () => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setPreference: (key, value) => set({ [key]: value } as Partial<UserPreferencesState>),
      toggleSidebarItem: (href) => set((s) => ({
        ...(href === "/settings" ? { sidebarHidden: s.sidebarHidden.filter((x) => x !== href) } : {
        sidebarHidden: s.sidebarHidden.includes(href)
          ? s.sidebarHidden.filter((x) => x !== href)
          : [...s.sidebarHidden, href],
        }),
      })),
      moveSidebarItem: (href, direction) => set((s) => {
        const order = [...s.sidebarOrder];
        const index = order.indexOf(href);
        const next = index + direction;
        if (index < 0 || next < 0 || next >= order.length) return s;
        [order[index], order[next]] = [order[next], order[index]];
        return { sidebarOrder: order };
      }),
      toggleDashboardCard: (id) => set((s) => ({
        dashboardHidden: s.dashboardHidden.includes(id)
          ? s.dashboardHidden.filter((x) => x !== id)
          : [...s.dashboardHidden, id],
      })),
      moveDashboardCard: (id, direction) => set((s) => {
        const order = [...s.dashboardOrder];
        const index = order.indexOf(id);
        const next = index + direction;
        if (index < 0 || next < 0 || next >= order.length) return s;
        [order[index], order[next]] = [order[next], order[index]];
        return { dashboardOrder: order };
      }),
      resetPreferences: () => set({ ...DEFAULTS, sidebarOrder: [...DEFAULT_SIDEBAR_ORDER], dashboardOrder: [...DEFAULT_DASHBOARD_CARDS] }),
    }),
    {
      name: "sc-user-preferences",
      version: 1,
      migrate: (persisted) => ({ ...DEFAULTS, ...(persisted as Partial<UserPreferences>) }),
    },
  ),
);

export function getAccentColor(preferences: Pick<UserPreferences, "accent" | "customAccent">): string {
  return preferences.accent === "custom"
    ? preferences.customAccent
    : ACCENT_COLORS[preferences.accent];
}
