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
  deviceSignature?: string;
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
      // Device identity is sent automatically via the x-device-id request header —
      // cloudApiPost() reads window.electronAPI.getDeviceId() and attaches it as a
      // header on every request (see cloud-api.ts). The server reads req.headers['x-device-id']
      // in requireCloudPremium / the premium-validate endpoint. No explicit body payload needed.
      console.log(`[DeviceLock] target=cloud userId=present deviceIdPresent=true`);
      const result = await cloudApiPost<ValidateResponse>("/device/premium-validate");
      setStatus(result.status);
      setIsFirstBind(result.isFirstBind ?? false);

      if (result.status === "ok") {
        // On first bind or stale rebind, the server returns a fresh device signature.
        // Persist it locally so every subsequent cloud request includes x-device-signature.
        if (result.deviceSignature && (window as any).electronAPI?.setDeviceSignature) {
          (window as any).electronAPI.setDeviceSignature(result.deviceSignature);
        }
        // Track last successful check for offline grace period
        try {
          localStorage.setItem('sc_device_lock_last_ok', Date.now().toString());
        } catch {}
        console.log(`[DeviceLock] ${result.isFirstBind ? "First bind — device registered" : "Valid device"}`);
      } else if (result.status === "locked") {
        console.warn("[DeviceLock] Device mismatch — premium locked on this machine");
      }
    } catch (err) {
      console.error("[DeviceLock] Validation failed:", err);
      // On network error, check if we have a recent successful check within the grace period.
      // If so, keep status as 'ok' so the user isn't locked out during temporary connectivity issues.
      const GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours
      let hasGrace = false;
      try {
        const lastOk = localStorage.getItem('sc_device_lock_last_ok');
        if (lastOk && Date.now() - parseInt(lastOk, 10) < GRACE_MS) {
          hasGrace = true;
        }
      } catch {}
      setStatus(hasGrace ? "ok" : "error");
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
