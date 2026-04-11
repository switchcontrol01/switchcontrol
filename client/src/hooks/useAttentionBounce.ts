/**
 * useAttentionBounce
 *
 * Extracted from the 4× duplicated `isAnimating`/`triggerAttentionAnimation`
 * pattern in premium-lock-overlay, premium-page-overlay, and TweakCard.
 *
 * Returns:
 *  - `isAnimating`   — current bounce state
 *  - `trigger`       — call on click to fire the bounce
 *  - `bounceProps`   — ready-to-spread `animate` and `transition` for framer-motion
 *
 * Usage:
 *   const { isAnimating, trigger, bounceProps } = useAttentionBounce();
 *   <motion.div {...bounceProps} onClick={trigger} />
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { ATTENTION_BOUNCE_DURATION_MS, premiumGlow } from "@/lib/themeTokens";

interface BounceProps {
  animate: Record<string, unknown>;
  transition: Record<string, unknown>;
}

interface UseAttentionBounceReturn {
  isAnimating: boolean;
  trigger: () => void;
  bounceProps: BounceProps;
}

export function useAttentionBounce(): UseAttentionBounceReturn {
  const [isAnimating, setIsAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setIsAnimating(false);
    }, ATTENTION_BOUNCE_DURATION_MS);
  }, [isAnimating]);

  const bounceProps: BounceProps = {
    animate: isAnimating
      ? {
          opacity: 1,
          y: 0,
          scale: [1, 1.03, 1],
          boxShadow: [premiumGlow.card, premiumGlow.cardPeak, premiumGlow.card],
        }
      : {
          opacity: 1,
          y: 0,
          scale: 1,
          boxShadow: premiumGlow.card,
        },
    transition: {
      duration: ATTENTION_BOUNCE_DURATION_MS / 1000,
      ease: "easeOut",
    },
  };

  return { isAnimating, trigger, bounceProps };
}
