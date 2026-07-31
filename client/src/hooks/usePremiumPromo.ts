/**
 * usePremiumPromo.ts — free-user premium promo popup (Discord CTA).
 *
 * Once per app session, after the user is authenticated and entitlements are
 * verified as FREE, this hook asks the cloud whether the promo popup should
 * show on this launch. ALL cadence/lockout state lives server-side keyed by
 * the permanent hardware fingerprint (survives reinstall/factory reset) — the
 * client only ever learns { show, discordUrl }.
 *
 * Design notes:
 *  - Fires ~6 s after the gates pass so it never interrupts the launch
 *    animation / dashboard reveal.
 *  - Fingerprint comes from Electron IPC; if unavailable (non-Windows or
 *    MachineGuid read failure) the check is skipped entirely — fail closed.
 *  - Dismissing the popup makes NO server call: the launch counter simply
 *    keeps marching toward the next 30th launch (server-side rule).
 *  - Entirely non-critical: every failure path is silent.
 */

import { useState, useEffect, useCallback } from "react";
import { cloudApiPost } from "@/lib/cloud-api";

interface PromoCheckResponse {
  show: boolean;
  discordUrl?: string;
  legacyMigrated?: boolean;
}

interface UsePremiumPromoOpts {
  isElectron: boolean;
  loggedIn: boolean;
  entitlementsVerified: boolean;
  isFreePlan: boolean;
}

const FINGERPRINT_REGEX = /^[a-f0-9]{64}$/;
const SETTLE_DELAY_MS = 6000;

// Module-level: at most one promo check per app session, even across
// component remounts or gate flapping.
let _promoCheckedThisSession = false;

export function usePremiumPromo({
  isElectron,
  loggedIn,
  entitlementsVerified,
  isFreePlan,
}: UsePremiumPromoOpts) {
  const [discordUrl, setDiscordUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron || !loggedIn || !entitlementsVerified || !isFreePlan) return;
    if (_promoCheckedThisSession) return;
    _promoCheckedThisSession = true;

    const timer = setTimeout(async () => {
      try {
        const api = (window as any).electronAPI;
        const fingerprint: string | null =
          (await api?.getDeviceFingerprint?.().catch(() => null)) ?? null;
        if (!fingerprint || !FINGERPRINT_REGEX.test(fingerprint)) {
          console.log("[Promo] No hardware fingerprint available — skipping promo check");
          return;
        }

        const resp = await cloudApiPost<PromoCheckResponse>(
          "/promo/check-and-increment",
          { fingerprint },
        );

        // Server confirmed the one-time legacy device-ID migration — stop
        // sending the legacy header on future launches.
        if (resp?.legacyMigrated) {
          api?.clearLegacyDeviceId?.().catch?.(() => {});
        }

        if (resp?.show && resp.discordUrl) {
          console.log("[Promo] Server says show — opening promo popup");
          setDiscordUrl(resp.discordUrl);
        }
      } catch (err) {
        // Non-critical by design — never surface promo failures to the user.
        console.log("[Promo] Check failed (non-critical):", (err as Error)?.message);
      }
    }, SETTLE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isElectron, loggedIn, entitlementsVerified, isFreePlan]);

  const closePromo = useCallback(() => setDiscordUrl(null), []);

  return {
    promoOpen: discordUrl !== null,
    discordUrl,
    closePromo,
  };
}
