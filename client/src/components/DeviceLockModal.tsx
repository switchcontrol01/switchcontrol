/**
 * DeviceLockModal.tsx
 *
 * Full-screen premium device lock state.
 * Rendered when the Electron app detects that the active device does not match
 * the premium-bound device stored server-side.
 *
 * ENFORCEMENT CONTRACT:
 *   - Not dismissible — no close button, no ESC handler
 *   - Covers the entire viewport at z-[9999] so no premium UI is accessible
 *   - The backend independently enforces device lock via requireCloudPremium
 *
 * Buttons:
 *   1. Contact Support — opens mailto: prefilled with device/account context
 *   2. Retry           — re-runs device validation against backend
 *   3. Exit App        — calls electronAPI.quitApp()
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "@/lib/motionTokens";
import { useTranslation } from "@/lib/i18n";

interface DeviceLockModalProps {
  userEmail?: string | null;
  userId?: string | null;
  onRetry: () => void;
  isRetrying: boolean;
  onLogout?: () => void;
}

const SUPPORT_EMAIL = "support@switchcontrol.gg";

function buildMailtoUrl(t: (key: string, fallback?: string, values?: Record<string, string | number>) => string, userEmail: string | null | undefined, userId: string | null | undefined, deviceId: string): string {
  const subject = t("SwitchControl Premium Device Lock Support");

  const now = new Date().toISOString();
  const appVersion =
    typeof (window as any).electronAPI?.getAppVersion === "function"
      ? t("loading…")
      : t("unknown");

  const body = [
    t("Hi SwitchControl Support,"),
    "",
    t("I'm unable to access premium because it is locked to another device."),
    "",
    t("Account: {account}", undefined, { account: userEmail ?? t("unknown") }),
    t("Device ID: {deviceId}", undefined, { deviceId }),
    t("App Version: {version}", undefined, { version: appVersion }),
    t("Timestamp: {timestamp}", undefined, { timestamp: now }),
    "",
    t("Please help me reset or transfer my premium device license."),
    "",
    "—".repeat(40),
    t("Don't edit below this line."),
    t("[DIAGNOSTIC]"),
    t("User ID: {userId}", undefined, { userId: userId ?? t("unknown") }),
    t("Request Time: {timestamp}", undefined, { timestamp: now }),
  ].join("\n");

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function useDeviceId(unavailable: string): string {
  const [deviceId, setDeviceId] = useState<string>("…");
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getDeviceId) {
      api.getDeviceId().then((id: string | null) => setDeviceId(id ?? unavailable)).catch(() => setDeviceId(unavailable));
    }
  }, [unavailable]);
  return deviceId;
}

export function DeviceLockModal({ userEmail, userId, onRetry, isRetrying, onLogout }: DeviceLockModalProps) {
  const { t } = useTranslation();
  const deviceId = useDeviceId(t("unavailable"));

  function handleContactSupport() {
    const url = buildMailtoUrl(t, userEmail, userId, deviceId);
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  }

  function handleRetry() {
    if (!isRetrying) onRetry();
  }

  function handleExit() {
    const api = (window as any).electronAPI;
    if (api?.quitApp) {
      api.quitApp();
    } else {
      window.close();
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="device-lock-overlay"
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        data-testid="device-lock-overlay"
      >
        {/* Matte dark overlay */}
        <div className="absolute inset-0 bg-[#14181D]" />

        {/* Vignette focus isolation */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 20%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* Glass card — backdrop-filter on its own layer, never on overflow-hidden */}
        <motion.div
          className="relative z-10 w-full max-w-sm mx-6"
          initial={{ y: 32, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Glass blur background */}
          <div
            className="absolute inset-0 rounded-2xl border border-[#2A313A]"
            style={{
              backdropFilter: "blur(28px) saturate(1.5)",
              WebkitBackdropFilter: "blur(28px) saturate(1.5)",
              background: "rgba(255,255,255,0.06)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.08) inset, 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(255,255,255,0.04)",
            }}
          />

          {/* Card content */}
          <div className="relative px-8 py-10 flex flex-col items-center text-center select-none">
            {/* Lock icon with glow pulse */}
            <LockGlowIcon />

            {/* Title */}
            <motion.h1
              className="mt-7 text-xl font-semibold tracking-tight text-[#E6EAF0]/95 leading-snug"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              data-testid="device-lock-title"
            >
              {t("Premium Locked to Another Device")}
            </motion.h1>

            {/* Body */}
            <motion.p
              className="mt-3 text-sm text-[#A0A8B3] leading-relaxed max-w-[260px]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.4 }}
              data-testid="device-lock-body"
            >
              {t("This premium license is already linked to a different device and can't be used here.")}
            </motion.p>

            {/* Device ID display */}
            <motion.div
              className="mt-4 px-3 py-1.5 rounded-lg text-[11px] font-mono text-[#6B7380] border border-[#2A313A] tracking-widest"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              {deviceId}
            </motion.div>

            {/* Actions */}
            <motion.div
              className="mt-8 w-full flex flex-col gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44, duration: 0.4 }}
            >
              {/* Contact Support */}
              <motion.button
                onClick={handleContactSupport}
                className="w-full rounded-xl py-3 px-4 text-sm font-medium tracking-wide transition-all"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                whileHover={{ scale: 1.015, backgroundColor: "rgba(255,255,255,0.18)" }}
                whileTap={{ scale: 0.985 }}
                data-testid="device-lock-contact-support"
              >
                {t("Contact Support")}
              </motion.button>

              {/* Retry */}
              <motion.button
                onClick={handleRetry}
                disabled={isRetrying}
                className="w-full rounded-xl py-3 px-4 text-sm font-medium tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.65)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
                whileHover={!isRetrying ? { scale: 1.015, backgroundColor: "rgba(255,255,255,0.11)" } : {}}
                whileTap={!isRetrying ? { scale: 0.985 } : {}}
                data-testid="device-lock-retry"
              >
                {isRetrying ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon />
                    {t("Checking…")}
                  </span>
                ) : (
                  t("Retry")
                )}
              </motion.button>

              {/* Log Out / Switch Account */}
              {onLogout && (
                <motion.button
                  onClick={onLogout}
                  className="w-full rounded-xl py-3 px-4 text-sm font-medium tracking-wide transition-all"
                  style={{
                    background: "transparent",
                    color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  whileHover={{ scale: 1.015, color: "rgba(255,255,255,0.7)" }}
                  whileTap={{ scale: 0.985 }}
                  data-testid="device-lock-logout"
                >
                  {t("Log Out / Switch Account")}
                </motion.button>
              )}

              {/* Exit App */}
              <motion.button
                onClick={handleExit}
                className="w-full rounded-xl py-3 px-4 text-sm font-medium tracking-wide transition-all"
                style={{
                  background: "transparent",
                  color: "rgba(255,255,255,0.3)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                whileHover={{ scale: 1.015, color: "rgba(255,255,255,0.55)" }}
                whileTap={{ scale: 0.985 }}
                data-testid="device-lock-exit"
              >
                  {t("Exit App")}
              </motion.button>
            </motion.div>

            {/* Footer note */}
            <motion.p
              className="mt-6 text-[10px] text-[#6B7380]/50 tracking-wide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65, duration: 0.5 }}
            >
              {t("Premium desktop access is tied to the original activated device")}
            </motion.p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LockGlowIcon() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Glow ring pulse */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 80,
          height: 80,
          background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
          filter: "blur(8px)",
        }}
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 2.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Outer ring */}
      <motion.div
        className="absolute rounded-full border border-[#2A313A]"
        style={{ width: 68, height: 68 }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />

      {/* Icon container */}
      <motion.div
        className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </motion.div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <motion.svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </motion.svg>
  );
}
