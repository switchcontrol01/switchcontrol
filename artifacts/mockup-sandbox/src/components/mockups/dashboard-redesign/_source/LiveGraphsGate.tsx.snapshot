import { Play } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useAppModeStore, useLiveGraphsActive } from "@/lib/appModeStore";

/**
 * Gates live dashboard graphs behind Light Mode.
 * In Light Mode graphs are paused by default (no redraw work at all) and the
 * user can opt back in per-session with "Resume Live Monitoring".
 */
export function LiveGraphsGate({
  title = "Live monitoring paused",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const active = useLiveGraphsActive();
  const setLiveGraphsResumed = useAppModeStore((s) => s.setLiveGraphsResumed);

  if (active) return <>{children}</>;

  return (
    <GlassCard className="p-6 flex flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex items-center justify-center size-10 rounded-xl"
        style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}
      >
        <Play className="size-4 text-[#C09BFF]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[#E6EAF0]">{title}</p>
        <p className="text-xs text-white/40 mt-1">
          Light Mode pauses live graphs to save resources. Everything else keeps working.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-[#8B5CF6]/40 text-[#C09BFF] hover:bg-[#8B5CF6]/10"
        onClick={() => setLiveGraphsResumed(true)}
        data-testid="button-resume-live-monitoring"
      >
        <Play className="size-3.5 mr-1.5" />
        Resume Live Monitoring
      </Button>
    </GlassCard>
  );
}
