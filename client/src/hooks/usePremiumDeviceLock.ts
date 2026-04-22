/**
 * usePremiumDeviceLock.ts
 *
 * Validates the current Electron device against the premium-bound device
 * stored server-side. Only active when:
 *   - Running inside Electron (window.electronAPI present)
 *   - User is authenticated and premium
 *
 * Returns:
 *   - status: null (not checked) | 'ok' | 'not_premium' | 'locked' | 'error'
 *   - isChecking: true while the API call is in flight
 *   - isFirstBind: true on the very first device binding
 *   - retry: re-runs the validation (debounced — ignores calls within 3 s)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { cloudApiPost } from "@/lib/cloud-api";

export type DeviceLockStatus = null | "ok" | "not_premium" | "locked" | "error";

interface ValidateResponse {
  status: "ok" | "not_premium" | "locked";
  isFirstBind?: boolean;
  message?: string;
}

interface UsePremiumDeviceLockResult {
  status: DeviceLockStatus;
  isChecking: boolean;
  isFirstBind: boolean;
  retry: () => void;
}

const RETRY_DEBOUNCE_MS = 3000;

export function usePremiumDeviceLock(
  isElectron: boolean,
  isPremium: boolean,
  loggedIn: boolean
): UsePremiumDeviceLockResult {
  const [status, setStatus] = useState<DeviceLockStatus>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isFirstBind, setIsFirstBind] = useState(false);
  const lastCheckRef = useRef(0);
  const checkedRef = useRef(false);

  // Reset all state whenever the user logs out. This is critical for the case
  // where user A (locked) signs out and user B signs in on the same Electron
  // session — without this reset the stale "locked" status from A would
  // immediately show the DeviceLockModal for B before any server check runs.
  useEffect(() => {
    if (!loggedIn) {
      setStatus(null);
      setIsChecking(false);
      setIsFirstBind(false);
      checkedRef.current = false;
      lastCheckRef.current = 0;
      console.log("[DeviceLock] loggedIn=false — state reset");
    }
  }, [loggedIn]);

  const check = useCallback(async () => {
    if (!isElectron || !isPremium || !loggedIn) return;

    const now = Date.now();
    if (now - lastCheckRef.current < RETRY_DEBOUNCE_MS) return;
    lastCheckRef.current = now;

    setIsChecking(true);
    try {
      const result = await cloudApiPost<ValidateResponse>("/device/premium-validate");
      setStatus(result.status);
      setIsFirstBind(result.isFirstBind ?? false);

      if (result.status === "ok") {
        console.log(`[DeviceLock] ${result.isFirstBind ? "First bind — device registered" : "Valid device"}`);
      } else if (result.status === "locked") {
        console.warn("[DeviceLock] Device mismatch — premium locked on this machine");
      }
    } catch (err) {
      console.error("[DeviceLock] Validation failed:", err);
      setStatus("error");
    } finally {
      setIsChecking(false);
    }
  }, [isElectron, isPremium, loggedIn]);

  useEffect(() => {
    if (!isElectron || !isPremium || !loggedIn) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    check();
  }, [isElectron, isPremium, loggedIn, check]);

  const retry = useCallback(() => {
    checkedRef.current = false;
    lastCheckRef.current = 0;
    check();
  }, [check]);

  return { status, isChecking, isFirstBind, retry };
}
