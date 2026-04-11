import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore, refreshEntitlements } from '@/lib/auth-store';
import { usePremiumGraceStore } from '@/stores/premiumGraceStore';

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
      const result = await refreshEntitlements();
      if (result?.user) {
        setVerified(result.user.isPremium, result.user.plan ?? null, result.user.id ?? null);
        console.log(`[Premium] Grace snapshot saved — isPremium=${result.user.isPremium}`);
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
