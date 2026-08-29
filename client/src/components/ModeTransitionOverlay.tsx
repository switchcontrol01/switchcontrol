import { useAppModeStore } from "@/lib/appModeStore";

/**
 * Full-screen ~3s fade played while switching between Normal and Light Mode.
 * Pure CSS animation (works in both modes), no framer-motion so it stays cheap.
 */
export function ModeTransitionOverlay({ blocked = false }: { blocked?: boolean }) {
  const transitioning = useAppModeStore((s) => s.transitioning);
  const target = useAppModeStore((s) => s.transitionTarget);

  if (!transitioning || blocked) return null;

  return (
    <div className="mode-transition-overlay" data-testid="overlay-mode-transition">
      <div className="mode-transition-spinner" />
      <div className="text-sm font-medium text-[#E6EAF0]">
        {target === "light" ? "Enabling Light Mode…" : "Restoring Normal Mode…"}
      </div>
      <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
        {target === "light"
          ? "Reducing visual effects and background activity"
          : "Re-enabling full visual experience"}
      </div>
    </div>
  );
}
