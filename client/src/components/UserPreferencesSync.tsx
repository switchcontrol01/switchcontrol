import { useEffect, useState } from "react";
import { useUserPreferencesStore, getAccentColor } from "@/stores/userPreferencesStore";
import { useStore } from "@/lib/store";
import { useAppModeStore } from "@/lib/appModeStore";
import type { ApplicationMode } from "@/lib/appModeStore";
import type { AdaptivePerformanceOverride } from "@shared/adaptivePerformance";

const APPLICATION_MODES: ApplicationMode[] = ["normal", "light"];
const PERFORMANCE_PROFILE_OVERRIDES: AdaptivePerformanceOverride[] = [
  "automatic",
  "efficiency",
  "balanced",
  "enhanced",
];

function hexToHsl(hex: string): string {
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((x) => x + x).join("")
    : clean;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function UserPreferencesSync() {
  const preferences = useUserPreferencesStore();
  const appMode = useAppModeStore((state) => state.mode);
  const transitionTarget = useAppModeStore((state) => state.transitionTarget);
  const modeToPersist = transitionTarget ?? appMode;
  const setRealtimeMetricsEnabled = useStore((s) => s.setRealtimeMetricsEnabled);
  const setPreference = useUserPreferencesStore((state) => state.setPreference);
  const [desktopSettingsLoaded, setDesktopSettingsLoaded] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const accent = getAccentColor(preferences);
    const hsl = hexToHsl(accent);
    root.style.setProperty("--user-accent", accent);
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--accent", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.dataset.themeMode = preferences.theme;
    root.classList.toggle("sc-reduced-motion", preferences.reducedMotion);
    root.classList.toggle("sc-disable-graph-animation", preferences.disableGraphAnimation);
    root.classList.toggle("sc-large-text", preferences.largerText);
    root.classList.toggle("sc-high-contrast", preferences.highContrast || preferences.theme === "contrast");
    root.classList.toggle("sc-large-sidebar", preferences.largeSidebar);
    root.classList.toggle("sc-large-targets", preferences.largeTargets);
    root.classList.toggle("sc-colorblind-safe", preferences.colorBlindSafe);

    if (preferences.theme === "light") root.classList.add("app-light-mode");
    else if (preferences.theme === "dark" || preferences.theme === "midnight" || preferences.theme === "oled") root.classList.remove("app-light-mode");
    else if (preferences.theme === "system") root.classList.toggle("app-light-mode", window.matchMedia("(prefers-color-scheme: light)").matches);
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    const settings = window.electronAPI?.settings;
    if (!settings?.getApplicationPreferences) {
      setDesktopSettingsLoaded(true);
      return;
    }

    const initialMode = useAppModeStore.getState().mode;
    const initialOverride = useUserPreferencesStore.getState().performanceProfileOverride;
    settings.getApplicationPreferences()
      .then((saved) => {
        if (cancelled) return;

        const currentMode = useAppModeStore.getState();
        if (
          APPLICATION_MODES.includes(saved.applicationMode as ApplicationMode) &&
          currentMode.mode === initialMode &&
          !currentMode.transitioning &&
          !currentMode.transitionTarget
        ) {
          currentMode.setMode(saved.applicationMode as ApplicationMode);
        }

        const currentOverride = useUserPreferencesStore.getState().performanceProfileOverride;
        if (
          PERFORMANCE_PROFILE_OVERRIDES.includes(saved.performanceProfileOverride as AdaptivePerformanceOverride) &&
          currentOverride === initialOverride
        ) {
          setPreference("performanceProfileOverride", saved.performanceProfileOverride as AdaptivePerformanceOverride);
        }
      })
      .catch((error) => {
        console.warn("[Preferences] Could not restore desktop mode preferences:", error);
      })
      .finally(() => {
        if (!cancelled) setDesktopSettingsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [setPreference]);

  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api?.apply || !desktopSettingsLoaded) return;
    api.apply({
      startWithWindows: preferences.startWithWindows,
      launchMinimized: preferences.launchMinimized,
      openDashboardOnStartup: preferences.openDashboardOnStartup,
      autoUpdateChecks: preferences.autoUpdateChecks,
      anonymousCrashReports: preferences.anonymousCrashReports,
      sharePerformanceDiagnostics: preferences.sharePerformanceDiagnostics,
      shareAiHardwareContext: preferences.shareAiHardwareContext,
      showTweakNotifications: preferences.showTweakNotifications,
      showVerificationWarnings: preferences.showVerificationWarnings,
      showHealthAlerts: preferences.showHealthAlerts,
      showPremiumReminders: preferences.showPremiumReminders,
      autoRevertFailed: preferences.autoRevertFailed,
      applicationMode: modeToPersist,
      performanceProfileOverride: preferences.performanceProfileOverride,
    }).catch(() => {});
  }, [
    desktopSettingsLoaded,
    modeToPersist,
    preferences.performanceProfileOverride,
    preferences.startWithWindows, preferences.launchMinimized,
    preferences.openDashboardOnStartup, preferences.autoUpdateChecks,
    preferences.anonymousCrashReports, preferences.sharePerformanceDiagnostics,
    preferences.shareAiHardwareContext, preferences.showTweakNotifications,
    preferences.showVerificationWarnings, preferences.showHealthAlerts,
    preferences.showPremiumReminders, preferences.autoRevertFailed,
  ]);

  useEffect(() => {
    setRealtimeMetricsEnabled(preferences.metricsRefreshSeconds !== 0);
  }, [preferences.metricsRefreshSeconds, setRealtimeMetricsEnabled]);

  useEffect(() => {
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => document.documentElement.classList.toggle("app-light-mode", media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preferences.theme]);

  return null;
}
