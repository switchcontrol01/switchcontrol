import type { Request, Response, NextFunction } from "express";

/**
 * Kill switches — runtime feature flags driven by environment variables.
 *
 * Set any of these to "true" in Replit Secrets to instantly disable that
 * feature without redeploying the app.  The frontend receives a 503 with
 * a graceful explanation so the app stays stable.
 *
 * Env vars:
 *   KILL_AI=true           disables /api/ai routes (AI advisor only)
 *   KILL_TELEMETRY=true    disables /ws/telemetry broadcasts
 *   KILL_UPDATER=true      disables updater check endpoint
 *   KILL_CLEANER=true      disables /api/cleaner
 *   KILL_BIOS=true         disables /api/bios (independent of KILL_AI)
 *   KILL_NETWORK_DIAG=true disables /api/network diagnostics
 *   KILL_SECURITY=true     disables /api/security (image analysis, OpenAI calls)
 */

export type KillSwitchFeature =
  | "ai"
  | "telemetry"
  | "updater"
  | "cleaner"
  | "bios"
  | "network_diag"
  | "security";

const ENV_MAP: Record<KillSwitchFeature, string> = {
  ai:           "KILL_AI",
  telemetry:    "KILL_TELEMETRY",
  updater:      "KILL_UPDATER",
  cleaner:      "KILL_CLEANER",
  bios:         "KILL_BIOS",
  network_diag: "KILL_NETWORK_DIAG",
  security:     "KILL_SECURITY",
};

// Tracks which features have already logged a kill-switch warning so the message
// appears once at startup (or first hit) rather than spamming on every request.
const _warnedFeatures = new Set<KillSwitchFeature>();

export function isKilled(feature: KillSwitchFeature): boolean {
  const val = process.env[ENV_MAP[feature]];
  const killed = val === "true" || val === "1";
  if (killed && !_warnedFeatures.has(feature)) {
    _warnedFeatures.add(feature);
    console.warn(`[KillSwitch] feature=${feature} enabled=false reason=env_override`);
  }
  return killed;
}

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
