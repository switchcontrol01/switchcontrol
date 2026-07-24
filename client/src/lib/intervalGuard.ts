/**
 * Interval Guard
 *
 * Monkey-patches window.setInterval to enforce a global minimum of 2000ms.
 * Any call below that threshold is clamped and logged so we can catch regressions.
 *
 * Also integrates with pollingRegistry so every interval shows up in
 * window.__pollingRegistry.summary().
 *
 * Install ONCE at app bootstrap (before any component code runs):
 *   import { installIntervalGuard } from '@/lib/intervalGuard';
 *   installIntervalGuard();
 */

import { pollingRegistry } from '@/lib/pollingRegistry';

export const MIN_INTERVAL_MS = 2_000;

// Maps native interval ID → string registry key ("guard-<nativeId>").
// String keys keep guard entries in a truly separate namespace from the numeric
// native interval IDs that real components register directly — a plain integer
// offset like 10_000 could still collide with native IDs in long-running apps.
const _guardedIds = new Map<number, string>(); // native id -> registry key
let _installed = false;

export function installIntervalGuard(): void {
  if (_installed) return;
  _installed = true;

  // HMR guard: if a previous module load already saved the real native, reuse
  // it instead of wrapping the already-wrapped guardedSetInterval a second time.
  const _nativeSetInterval: typeof window.setInterval =
    (window as any).__nativeSetInterval ?? window.setInterval.bind(window);
  const _nativeClearInterval: typeof window.clearInterval =
    (window as any).__nativeClearInterval ?? window.clearInterval.bind(window);

  // Save native refs so internal tooling (PerformanceOverlay) can bypass the
  // guard — gated on DEV to avoid exposing a guard-bypass surface in production.
  if (import.meta.env.DEV) {
    (window as any).__nativeSetInterval   = _nativeSetInterval;
    (window as any).__nativeClearInterval = _nativeClearInterval;
  }

  // ── setInterval override ────────────────────────────────────────────────────
  (window as any).setInterval = function guardedSetInterval(
    fn: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): number {
    let ms = typeof delay === 'number' ? delay : MIN_INTERVAL_MS;

    if (ms < MIN_INTERVAL_MS) {
      // Gate the entire warning on DEV — third-party libraries calling
      // setInterval(fn, 100) would otherwise spam the production console.
      if (import.meta.env.DEV) {
        // Stack unwinding is expensive — only in dev.
        const stack = new Error().stack?.split('\n').slice(2, 4).join(' | ') ?? '';
        console.warn(
          `[IntervalGuard] ⚠ setInterval(${ms}ms) clamped to ${MIN_INTERVAL_MS}ms. Caller: ${stack}`
        );
      }
      ms = MIN_INTERVAL_MS;
    }

    const nativeId   = _nativeSetInterval(fn, ms, ...args) as unknown as number;
    const registryKey = `guard-${nativeId}`;
    _guardedIds.set(nativeId, registryKey);
    pollingRegistry.register(registryKey, `guarded#${nativeId}`, 'intervalGuard', ms);
    return nativeId;
  };

  // ── clearInterval override ──────────────────────────────────────────────────
  (window as any).clearInterval = function guardedClearInterval(id?: number): void {
    if (id !== undefined && _guardedIds.has(id)) {
      pollingRegistry.unregister(_guardedIds.get(id)!); // string key
      _guardedIds.delete(id);
    }
    _nativeClearInterval(id as any);
  };

  console.log('[IntervalGuard] installed — min interval enforced at ' + MIN_INTERVAL_MS + 'ms');
}
