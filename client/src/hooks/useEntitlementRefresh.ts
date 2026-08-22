import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore, refreshEntitlements, safeGetJwt, AUTH_DOMAIN } from '@/lib/auth-store';
import { usePremiumGraceStore, type EntitlementFeatures } from '@/stores/premiumGraceStore';

interface UseEntitlementRefreshOptions {
  refreshOnFocus?: boolean;
  refreshOnMount?: boolean;
}

export function useEntitlementRefresh(options: UseEntitlementRefreshOptions = {}) {
  const { 
    refreshOnFocus = true, 
    refreshOnMount = true 
  } = options;
  
  const user = useAuthStore((state) => state.user);
  const setVerified = usePremiumGraceStore((s) => s.setVerified);
  const isRefreshing = useRef(false);
  const lastRefreshTime = useRef(0);
  const MIN_REFRESH_INTERVAL = 10000;

  const doRefresh = useCallback(async () => {
    if (!user?.loggedIn) return;
    if (isRefreshing.current) return;

    const now = Date.now();
    if (now - lastRefreshTime.current < MIN_REFRESH_INTERVAL) return;

    isRefreshing.current = true;
    lastRefreshTime.current = now;

    try {
      // Fetch user plan and features in parallel — server is the source of truth.
      const [result, features] = await Promise.all([
        refreshEntitlements(),
        _fetchEntitlementFeatures(),
      ]);
      if (result?.verified && result.user) {
        setVerified(result.user.isPremium, result.user.plan ?? null, result.user.id ?? null, features);
        console.log(`[Premium] Grace snapshot saved — isPremium=${result.user.isPremium} features=${!!features}`);

        // Clear the post-update grace flag now that auth has successfully verified
        // entitlements for this session.  This unblocks the startup premium-revert
        // check (usePremiumExpiry) and prevents the flag from persisting across
        // multiple launches.
        try {
          const appAPI = (window as any).electronAPI;
          if (appAPI?.clearPostUpdateGrace) {
            appAPI.clearPostUpdateGrace().catch(() => {});
          }
        } catch {
          // Non-fatal — worst case the flag stays until the next successful auth
        }
      } else if (!result?.verified) {
        console.warn('[Entitlement] refresh was not verified — cached entitlement snapshot unchanged');
      }
    } catch (err) {
      console.error('[Entitlement] Refresh failed:', err);
    } finally {
      isRefreshing.current = false;
    }
  }, [user?.loggedIn, setVerified]);

  useEffect(() => {
    if (refreshOnMount && user?.loggedIn) {
      doRefresh();
    }
  }, [refreshOnMount, user?.loggedIn, doRefresh]);

  useEffect(() => {
    if (!refreshOnFocus || !user?.loggedIn) return;

    // Track blur time to skip brief focus-loss from file pickers / child dialogs
    const lastBlurTime = { ts: 0 };
    const DIALOG_THRESHOLD_MS = 3000;

    const handleBlur = () => { lastBlurTime.ts = Date.now(); };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // visibilitychange = real tab/window hide, always refresh
        doRefresh();
      }
    };

    const handleFocus = () => {
      // Skip if focus returned in under 3 s — likely a file picker or child dialog
      const awayMs = Date.now() - lastBlurTime.ts;
      if (awayMs < DIALOG_THRESHOLD_MS && lastBlurTime.ts > 0) return;
      doRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshOnFocus, user?.loggedIn, doRefresh]);

  return { refresh: doRefresh };
}

// ── Internal helper — fetch per-feature flags from the server ─────────────────
// Returns null on any error (network failure, 401, etc.) so the caller can
// fall back to previously cached features in the grace store.
async function _fetchEntitlementFeatures(): Promise<EntitlementFeatures | null> {
  try {
    const jwt = safeGetJwt();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    const resp = await fetch(`${AUTH_DOMAIN}/api/account/entitlements`, {
      headers,
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && typeof data.features === 'object' && data.features !== null) {
      return data.features as EntitlementFeatures;
    }
    return null;
  } catch {
    return null;
  }
}
