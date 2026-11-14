import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface DriverIntelRouteTransitionProps {
  children: ReactNode;
  reducedMotion: boolean;
}

const ROUTE_TRANSITION_SECONDS = 1.5;
const ROUTE_BLUR_PX = 7;

/**
 * Shared by the production Electron route and its rendered transition test.
 * The feature's own Reduce Motion preference controls this transition; the
 * operating-system Animation Effects toggle does not.
 */
export function DriverIntelRouteTransition({
  children,
  reducedMotion,
}: DriverIntelRouteTransitionProps) {
  const duration = reducedMotion ? 0 : ROUTE_TRANSITION_SECONDS;
  const hidden = { opacity: 0, filter: `blur(${ROUTE_BLUR_PX}px)` };
  const shown = { opacity: 1, filter: "blur(0px)" };

  return (
    <motion.div
      className="w-full min-h-full"
      initial={reducedMotion ? false : hidden}
      animate={shown}
      exit={{
        ...hidden,
        pointerEvents: "none",
        transition: { duration, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: reducedMotion ? "auto" : "filter, opacity" }}
      data-driver-intel-route-transition
      data-route-transition-duration={duration}
    >
      {children}
    </motion.div>
  );
}
