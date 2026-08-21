/**
 * Short-lived guard used while a live entitlement change is settling.
 *
 * Entitlement refreshes are allowed to hydrate UI state, but must never
 * replay an optimizer/apply batch. Manual card actions are intentionally not
 * blocked; only automatic/bulk apply callers consult this guard.
 */

let blockedUntil = 0;
let blockedReason = '';

export function beginEntitlementTransition(reason: string): void {
  blockedUntil = Date.now() + 4_000;
  blockedReason = reason;
  console.info(`[EntitlementGuard] automatic applies blocked for 4s — ${reason}`);
}

export function clearEntitlementTransition(): void {
  if (blockedUntil > 0) {
    blockedUntil = 0;
    blockedReason = '';
    console.info('[EntitlementGuard] automatic applies unblocked');
  }
}

export function isAutomaticApplyBlocked(): boolean {
  if (blockedUntil === 0) return false;
  if (Date.now() >= blockedUntil) {
    clearEntitlementTransition();
    return false;
  }
  return true;
}

export function entitlementGuardReason(): string {
  return blockedReason || 'entitlement transition is still settling';
}