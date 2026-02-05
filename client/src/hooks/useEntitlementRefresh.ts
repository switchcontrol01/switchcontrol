import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore, refreshEntitlements } from '@/lib/auth-store';

interface UseEntitlementRefreshOptions {
  onUpgrade?: () => void;
  refreshOnFocus?: boolean;
  refreshOnMount?: boolean;
}

export function useEntitlementRefresh(options: UseEntitlementRefreshOptions = {}) {
  const { 
    onUpgrade, 
    refreshOnFocus = true, 
    refreshOnMount = true 
  } = options;
  
  const user = useAuthStore((state) => state.user);
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
      if (result.upgraded && onUpgrade) {
        console.log('[Entitlement] User upgraded to premium!');
        onUpgrade();
      }
    } catch (err) {
      console.error('[Entitlement] Refresh failed:', err);
    } finally {
      isRefreshing.current = false;
    }
  }, [user?.loggedIn, onUpgrade]);

  useEffect(() => {
    if (refreshOnMount && user?.loggedIn) {
      doRefresh();
    }
  }, [refreshOnMount, user?.loggedIn, doRefresh]);

  useEffect(() => {
    if (!refreshOnFocus || !user?.loggedIn) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Entitlement] App focused, checking entitlements...');
        doRefresh();
      }
    };

    const handleFocus = () => {
      console.log('[Entitlement] Window focused, checking entitlements...');
      doRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshOnFocus, user?.loggedIn, doRefresh]);

  return { refresh: doRefresh };
}
