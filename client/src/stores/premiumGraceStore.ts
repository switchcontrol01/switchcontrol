import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type PremiumVerificationStatus =
  | 'active'         // verified online, within grace
  | 'grace'          // offline/degraded but within 30-day window
  | 'expired'        // grace window elapsed — cannot trust
  | 'free'           // no premium, never was or explicitly false
  | 'unknown';       // no data yet

/** Per-feature entitlement flags cached from the server for offline use. */
export interface EntitlementFeatures {
  driverIntel:     boolean;
  biosAdvisor:     boolean;
  aiAdvisor:       boolean;
  historyRollback: boolean;
  extremeLabs:     boolean;
}

export interface PremiumGraceSnapshot {
  isPremium: boolean;
  plan: string | null;
  userId: string | null;
  lastVerifiedAt: number | null; // epoch ms
  /** Cached feature flags from /api/account/entitlements — null until first fetch. */
  features: EntitlementFeatures | null;
}

interface PremiumGraceStore extends PremiumGraceSnapshot {
  /**
   * True once setVerified() has been called at least once this session.
   * In-memory only — not persisted. When true, getStatus() trusts the
   * live snapshot unconditionally rather than falling back to grace cache.
   */
  sessionVerified: boolean;
  setVerified: (
    isPremium: boolean,
    plan: string | null,
    userId: string | null,
    features?: EntitlementFeatures | null,
  ) => void;
  clear: () => void;
  getStatus: (isBackendReachable: boolean) => PremiumVerificationStatus;
  graceRemainingMs: () => number;
}

export const usePremiumGraceStore = create<PremiumGraceStore>()(
  persist(
    (set, get) => ({
      isPremium: false,
      plan: null,
      userId: null,
      lastVerifiedAt: null,
      features: null,
      sessionVerified: false,

      setVerified(isPremium, plan, userId, features) {
        const prev = get();
        const now = Date.now();
        console.log(`[Premium] Grace snapshot updated — isPremium=${isPremium} plan=${plan} userId=${userId}`);
        set({
          isPremium,
          plan,
          userId,
          // Prefer newly supplied features; fall back to prev cached features
          features: features !== undefined ? features : prev.features,
          lastVerifiedAt: isPremium ? now : prev.lastVerifiedAt,
          sessionVerified: true,
        });
      },

      clear() {
        set({ isPremium: false, plan: null, userId: null, lastVerifiedAt: null, features: null, sessionVerified: false });
      },

      getStatus(isBackendReachable) {
        const { isPremium, lastVerifiedAt, sessionVerified } = get();

        // A fresh verification this session always wins — no grace-cache drift.
        if (sessionVerified) {
          if (isPremium) return 'active';
          return 'free';
        }

        if (isBackendReachable) {
          if (isPremium) return 'active';
          return 'free';
        }

        // Backend not reachable and no in-session verification — check grace cache.
        if (!isPremium || !lastVerifiedAt) return 'free';
        const age = Date.now() - lastVerifiedAt;
        if (age <= GRACE_WINDOW_MS) {
          console.log(`[Premium] Grace mode — verified ${Math.round(age / 3_600_000)}h ago`);
          return 'grace';
        }
        console.log('[Premium] Grace window expired');
        return 'expired';
      },

      graceRemainingMs() {
        const { lastVerifiedAt } = get();
        if (!lastVerifiedAt) return 0;
        return Math.max(0, GRACE_WINDOW_MS - (Date.now() - lastVerifiedAt));
      },
    }),
    {
      name: 'sc_premium_grace_v1',
      partialize: (s) => ({
        isPremium:      s.isPremium,
        plan:           s.plan,
        userId:         s.userId,
        lastVerifiedAt: s.lastVerifiedAt,
        features:       s.features,
        // sessionVerified intentionally excluded — reset on every page load
      }),
    }
  )
);
