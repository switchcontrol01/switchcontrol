import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n";
import {
  FIRST_RUN_EASE,
  FIRST_RUN_TRANSITION_MS,
} from "@/lib/firstRunTransition";

export type FirstRunHandoffKind =
  | "login-to-language"
  | "language-to-consent"
  | "consent-to-disclaimer"
  | "disclaimer-to-welcome";

export const FIRST_RUN_HANDOFF_MS = FIRST_RUN_TRANSITION_MS;
export const FIRST_RUN_HANDOFF_COVER_MS = FIRST_RUN_HANDOFF_MS / 2;

interface FirstRunHandoffProps {
  kind: FirstRunHandoffKind;
  prefersReducedMotion: boolean;
  onCover: () => void;
  onComplete: () => void;
}

export function FirstRunHandoff({
  kind,
  prefersReducedMotion,
  onCover,
  onComplete,
}: FirstRunHandoffProps) {
  const { t } = useTranslation();
  const onCoverRef = React.useRef(onCover);
  const onCompleteRef = React.useRef(onComplete);
  onCoverRef.current = onCover;
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    if (prefersReducedMotion) {
      onCoverRef.current();
      onCompleteRef.current();
      return;
    }

    const coverTimer = window.setTimeout(
      () => onCoverRef.current(),
      FIRST_RUN_HANDOFF_COVER_MS,
    );
    return () => window.clearTimeout(coverTimer);
  }, [prefersReducedMotion]);

  return (
    <motion.div
      key={kind}
      className="pointer-events-none fixed inset-0 z-[10001] overflow-hidden"
      initial={{
        opacity: 0,
        filter: "blur(0px)",
        backdropFilter: "blur(0px)",
        WebkitBackdropFilter: "blur(0px)",
      }}
      animate={{
        opacity: [0, 1, 0],
        filter: ["blur(0px)", "blur(18px)", "blur(0px)"],
        backdropFilter: ["blur(0px)", "blur(18px)", "blur(0px)"],
        WebkitBackdropFilter: ["blur(0px)", "blur(18px)", "blur(0px)"],
      }}
      transition={{
        duration: FIRST_RUN_HANDOFF_MS / 1000,
        times: [0, 0.5, 1],
        ease: FIRST_RUN_EASE,
      }}
      onAnimationStart={() =>
        console.info(`[FirstRunHandoff] ${kind} blur-in/fade-in started`)
      }
      onAnimationComplete={() => {
        console.info(
          `[FirstRunHandoff] ${kind} fade-out/blur-out complete`,
        );
        onCompleteRef.current();
      }}
      data-testid="first-run-blue-handoff"
      data-handoff={kind}
      data-animation-state="cover-swap-reveal"
      data-transition-contract="blur-in-fade-in-swap-fade-out-blur-out"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 42%, rgba(20,134,255,0.98) 0%, rgba(20,82,190,0.98) 42%, rgba(4,24,75,0.995) 100%)",
        }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[min(54vw,560px)] w-[min(54vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(125,224,255,0.34) 0%, rgba(37,126,255,0.16) 38%, transparent 72%)",
          filter: "blur(26px)",
        }}
        animate={
          prefersReducedMotion
            ? undefined
            : { scale: [0.82, 1.08, 0.96], opacity: [0.42, 0.8, 0.58] }
        }
        transition={{ duration: 1.8, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/20 bg-white/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80 shadow-[0_0_35px_rgba(111,211,255,0.3)]">
          {kind === "language-to-consent"
            ? t("Preparing your setup")
            : kind === "consent-to-disclaimer"
              ? t("Saving your preferences")
              : t("Preparing your setup")}
        </div>
      </div>
    </motion.div>
  );
}