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

// Track which IDs we created so we can unregister on clearInterval
const _guardedIds = new Map<number, number>(); // native id -> registryId
let _registrySeq = 10_000; // offset to avoid collisions with real component IDs
let _installed = false;

export function installIntervalGuard(): void {
  if (_installed) return;
  _installed = true;

  const _nativeSetInterval   = window.setInterval.bind(window);
  const _nativeClearInterval = window.clearInterval.bind(window);

  // Save native ref so internal tooling (PerformanceOverlay) can bypass the guard
  (window as any).__nativeSetInterval   = _nativeSetInterval;
  (window as any).__nativeClearInterval = _nativeClearInterval;

  // ── setInterval override ────────────────────────────────────────────────────
  (window as any).setInterval = function guardedSetInterval(
    fn: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ): number {
    let ms = typeof delay === 'number' ? delay : MIN_INTERVAL_MS;

    if (ms < MIN_INTERVAL_MS) {
      const stack = new Error().stack?.split('\n').slice(2, 4).join(' | ') ?? '';
      console.warn(
        `[IntervalGuard] ⚠ setInterval(${ms}ms) clamped to ${MIN_INTERVAL_MS}ms. Caller: ${stack}`
      );
      ms = MIN_INTERVAL_MS;
    }

    const nativeId = _nativeSetInterval(fn, ms, ...args) as unknown as number;
    const registryId = _registrySeq++;
    _guardedIds.set(nativeId, registryId);
    pollingRegistry.register(registryId, `guarded#${nativeId}`, 'intervalGuard', ms);
    return nativeId;
  };

  // ── clearInterval override ──────────────────────────────────────────────────
  (window as any).clearInterval = function guardedClearInterval(id?: number): void {
    if (id !== undefined && _guardedIds.has(id)) {
      pollingRegistry.unregister(_guardedIds.get(id)!);
      _guardedIds.delete(id);
    }
    _nativeClearInterval(id as any);
  };

  console.log('[IntervalGuard] installed — min interval enforced at ' + MIN_INTERVAL_MS + 'ms');
}
