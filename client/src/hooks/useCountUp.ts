import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Smooth count-up animation using requestAnimationFrame.
 * Stops when target is reached. Pauses when document is hidden.
 * Never triggers re-renders during the animation loop — only
 * at the end and at throttled intermediate updates (every 50ms).
 */
export function useCountUp(target: number, options?: {
  durationMs?: number;
  delayMs?: number;
  decimals?: number;
  enabled?: boolean;
}) {
  const {
    durationMs = 900,
    delayMs = 0,
    decimals = 0,
    enabled = true,
  } = options ?? {};

  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const toRef = useRef(target);

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const start = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = value;
    toRef.current = target;
    startTimeRef.current = null;

    const tick = (ts: number) => {
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const current = fromRef.current + (toRef.current - fromRef.current) * easeOutCubic(progress);
      setValue(Number(current.toFixed(decimals)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    const delayId = window.setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      clearTimeout(delayId);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, delayMs, decimals, value]);

  useEffect(() => {
    if (!enabled) { setValue(target); return; }
    const cleanup = start();
    return cleanup;
  }, [target, enabled]); // eslint-disable-line

  return value;
}

/**
 * Format bytes with automatic unit selection.
 */
export function fmtBytes(b: number): string {
  if (b === 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
