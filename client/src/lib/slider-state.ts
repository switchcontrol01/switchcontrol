/**
 * Determine whether a slider has a user change ready to apply.
 *
 * A native read can be temporarily unavailable while the shared PowerShell
 * limiter is busy. In that case currentValue is null, but an explicit user
 * interaction still represents valid intent and must enable Apply.
 */
export function isSliderDirty(
  currentValue: number | null,
  pendingValue: number | null,
  pendingTouched: boolean,
): boolean {
  if (pendingValue === null) return false;
  if (currentValue === null) return pendingTouched;
  return pendingValue !== currentValue;
}