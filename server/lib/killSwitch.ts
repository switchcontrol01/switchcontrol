/**
 * Kill switches — runtime feature flags driven by environment variables.
 *
 * Set any of these to "true" in Replit Secrets to instantly disable that
 * feature without redeploying the app.  The frontend receives a 503 with
 * a graceful explanation so the app stays stable.
 *
 * Env vars:
 *   KILL_AI=true           disables /api/ai and /api/bios
 *   KILL_TELEMETRY=true    disables /ws/telemetry broadcasts
 *   KILL_UPDATER=true      disables updater check endpoint
 *   KILL_EXTREME_LABS=true disables Extreme Labs endpoints
 *   KILL_CLEANER=true      disables /api/cleaner
 *   KILL_BIOS=true         disables /api/bios
 *   KILL_NETWORK_DIAG=true disables /api/network diagnostics
 */

export type KillSwitchFeature =
  | "ai"
  | "telemetry"
  | "updater"
  | "extreme_labs"
  | "cleaner"
  | "bios"
  | "network_diag";

const ENV_MAP: Record<KillSwitchFeature, string> = {
  ai:           "KILL_AI",
  telemetry:    "KILL_TELEMETRY",
  updater:      "KILL_UPDATER",
  extreme_labs: "KILL_EXTREME_LABS",
  cleaner:      "KILL_CLEANER",
  bios:         "KILL_BIOS",
  network_diag: "KILL_NETWORK_DIAG",
};

export function isKilled(feature: KillSwitchFeature): boolean {
  const val = process.env[ENV_MAP[feature]];
  const killed = val === "true" || val === "1";
  if (killed) {
    console.warn(`[KillSwitch] feature=${feature} enabled=false reason=env_override`);
  }
  return killed;
}

import type { Request, Response, NextFunction } from "express";

export function killSwitchMiddleware(feature: KillSwitchFeature) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (isKilled(feature)) {
      return res.status(503).json({
        success: false,
        error: `${feature} is temporarily disabled`,
        code: "feature_disabled",
      });
    }
    next();
  };
}
