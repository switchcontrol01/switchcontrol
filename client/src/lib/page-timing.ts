import { useRef } from "react";

/**
 * Lightweight section-open timing utility.
 * Logs milestones relative to the moment usePageTiming() is first called.
 *
 * Usage:
 *   const { mark } = usePageTiming("Security");
 *   mark("shell");          // first render
 *   mark("data-ready");     // backend fetch complete
 *   mark("scan-complete");  // expensive scan done
 */

export function usePageTiming(section: string) {
  const t0Ref = useRef<number | null>(null);
  const mountedRef = useRef(false);

  if (t0Ref.current === null) {
    t0Ref.current = performance.now();
  }
  const t0 = t0Ref.current;

  if (!mountedRef.current) {
    mountedRef.current = true;
    console.log(`[Timing] ${section} | mount | +0ms`);
  }

  function mark(milestone: string) {
    const elapsed = Math.round(performance.now() - t0);
    console.log(`[Timing] ${section} | ${milestone} | +${elapsed}ms`);
  }

  return { mark, t0 };
}

/**
 * Run a callback after the browser is idle, with a maximum wait timeout.
 * Falls back to setTimeout(fn, 150) in environments that don't support rIC.
 */
export function runWhenIdle(fn: () => void, timeoutMs = 2000): void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as any).requestIdleCallback(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 150);
  }
}
