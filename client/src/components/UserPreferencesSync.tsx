import { useEffect } from "react";
import { useUserPreferencesStore, getAccentColor } from "@/stores/userPreferencesStore";

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
    root.classList.toggle("sc-reduced-motion", preferences.reducedMotion || preferences.disableGraphAnimation);
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
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => document.documentElement.classList.toggle("app-light-mode", media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preferences.theme]);

  return null;
}
