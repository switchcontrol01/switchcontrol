import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Zap, Gauge } from "lucide-react";
import { useAppModeStore, type ModeRecommendation } from "@/lib/appModeStore";

interface Props {
  open: boolean;
  recommendation: ModeRecommendation;
  onClose: () => void;
}

/**
 * One-time post-onboarding recommendation modal.
 * Shows recommended mode + confidence. Choosing Light Mode asks a confirm step.
 */
export function LightModeRecommendationModal({ open, recommendation, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const switchModeWithTransition = useAppModeStore((s) => s.switchModeWithTransition);
  const setDontAskAgain = useAppModeStore((s) => s.setDontAskAgain);

  const finish = () => {
    if (dontAsk) setDontAskAgain(true);
    onClose();
  };

  const enableLightMode = () => {
    if (dontAsk) setDontAskAgain(true);
    onClose();
    switchModeWithTransition("light");
  };

  const isLight = recommendation.recommendedMode === "light";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent
        className="max-w-md border-[#2A2F3A] bg-[#0C0F14] p-0 overflow-hidden"
        data-testid="modal-light-mode-recommendation"
      >
        {/* Header accent */}
        <div
          className="px-6 pt-6 pb-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(236,72,153,0.06) 60%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center size-10 rounded-xl"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}
            >
              {isLight ? (
                <Zap className="size-5 text-[#C09BFF]" />
              ) : (
                <Gauge className="size-5 text-[#C09BFF]" />
              )}
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-[#C09BFF]/60">
                System Analysis Complete
              </div>
              <div className="text-sm font-semibold text-[#E6EAF0]">
                Recommended: {isLight ? "Light Mode" : "Normal Mode"}
                <span className="ml-2 text-xs font-normal text-white/40">
                  {recommendation.confidence}% confidence
                </span>
              </div>
            </div>
          </div>

          {!confirming ? (
            <>
              <h2 className="text-lg font-semibold text-[#E6EAF0] mb-1.5">
                {isLight
                  ? "SwitchControl detected a lower-performance PC"
                  : "Your PC handles SwitchControl comfortably"}
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">
                {isLight
                  ? "For the smoothest experience, we recommend enabling Light Mode. Light Mode reduces resource usage while keeping all optimization features available."
                  : "You can still enable Light Mode anytime in Settings if you want the lowest possible resource usage."}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#E6EAF0] mb-1.5">Are you sure?</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Light Mode strips visual effects and slows background monitoring.
                You can change this later in Settings.
              </p>
            </>
          )}

          {!confirming && recommendation.reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {recommendation.reasons.slice(0, 4).map((r, i) => (
                <li key={i} className="text-xs text-white/40 flex items-start gap-1.5">
                  <span className="text-[#C09BFF]/60 mt-0.5">•</span>
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 pb-5 pt-1 space-y-3">
          {!confirming ? (
            <>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-[#8B5CF6] hover:bg-[#7C4FE0] text-white"
                  onClick={() => (isLight ? setConfirming(true) : finish())}
                  data-testid="button-enable-light-mode"
                >
                  {isLight ? "Enable Light Mode" : "Keep Normal Mode"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-[#2A2F3A] text-white/70 hover:bg-[#1A1F26]"
                  onClick={isLight ? finish : () => setConfirming(true)}
                  data-testid="button-stay-normal-mode"
                >
                  {isLight ? "Stay on Normal Mode" : "Try Light Mode"}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer select-none">
                <Checkbox
                  checked={dontAsk}
                  onCheckedChange={(v) => setDontAsk(v === true)}
                  data-testid="checkbox-dont-ask-again"
                />
                Don't ask again
              </label>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-[#8B5CF6] hover:bg-[#7C4FE0] text-white"
                onClick={enableLightMode}
                data-testid="button-confirm-light-mode"
              >
                Yes, enable Light Mode
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-[#2A2F3A] text-white/70 hover:bg-[#1A1F26]"
                onClick={() => setConfirming(false)}
                data-testid="button-cancel-light-mode"
              >
                Go back
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
