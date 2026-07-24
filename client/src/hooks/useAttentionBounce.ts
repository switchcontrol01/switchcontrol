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

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ATTENTION_BOUNCE_DURATION_MS } from "@/lib/themeTokens";

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
  // Ref-backed guard so trigger() has a stable identity across the component
  // lifetime.  Previously isAnimating was in trigger's dep array, which caused
  // a new function reference on every state flip — consumers that memoized their
  // own callbacks with trigger in their dep array would re-render unnecessarily.
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsAnimating(true);
    timerRef.current = setTimeout(() => {
      isAnimatingRef.current = false;
      if (mountedRef.current) setIsAnimating(false);
    }, ATTENTION_BOUNCE_DURATION_MS);
  }, []); // stable — reads isAnimatingRef, never needs re-creation

  // Memoize the animation objects — recreating them every render causes
  // downstream TweakCards and premium overlays to rerender unnecessarily.
  // boxShadow intentionally omitted: animating box-shadow forces a full CPU
  // repaint on every frame and cannot be GPU-composited.  The scale bounce
  // alone is sufficient as an attention signal and is compositor-friendly.
  const animateActive = useMemo(() => ({
    opacity: 1,
    y: 0,
    scale: [1, 1.03, 1],
  }), []);

  const animateIdle = useMemo(() => ({
    opacity: 1,
    y: 0,
    scale: 1,
  }), []);

  const transition = useMemo(() => ({
    duration: ATTENTION_BOUNCE_DURATION_MS / 1000,
    ease: "easeOut",
  }), []);

  const bounceProps = useMemo<BounceProps>(() => ({
    animate: isAnimating ? animateActive : animateIdle,
    transition,
  }), [isAnimating, animateActive, animateIdle, transition]);

  return { isAnimating, trigger, bounceProps };
}
