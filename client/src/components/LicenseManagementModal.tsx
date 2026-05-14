import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/App";
import {
  Shield, RefreshCw, RotateCcw, Mail, CheckCircle2,
  Loader2, Copy, X, Cpu, Wifi, WifiOff, Clock, AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence, modalBackdrop, modalContent } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { usePremiumGraceStore, GRACE_WINDOW_MS } from "@/stores/premiumGraceStore";
import { useNetworkStore } from "@/stores/networkStore";

const SUPPORT_EMAIL = "Switchcontrol67@gmail.com";
const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

interface LicenseManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPremium: boolean;
  userId: string;
}

// ── Verified snapshot — set only after a live network check OR confirmed offline grace ──
type VerifiedStatus = "active" | "grace" | "expired" | "free" | "unknown";
interface VerifiedLicense {
  status: VerifiedStatus;
  plan: string | null;
  isPremium: boolean;
  lastVerifiedAt: number | null;
  graceRemainingMs: number;
}

function generateDeviceHash(userId: string): string {
  let hash = 0;
  const seed = `${userId}-${navigator.userAgent}-${screen.width}x${screen.height}`;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8).toUpperCase();
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] text-white/35 uppercase tracking-wider font-medium">{label}</span>
      {children}
    </div>
  );
}

function formatGraceRemaining(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "< 1 hour remaining";
}

function formatLastVerified(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
}

export function LicenseManagementModal({ open, onOpenChange, isPremium, userId }: LicenseManagementModalProps) {
  const { toast } = useToast();
  const { safeRefreshEntitlements } = useAppAuth();
  const grace = usePremiumGraceStore();
  const { isBackendReachable, networkState } = useNetworkStore();
  const isOffline = networkState === 'offline' || networkState === 'degraded';

  // ── Modal-local verified state — the ONLY source of truth for the status block ──
  // Never read directly from grace store for display until after one of these paths completes:
  //   a) live refresh   → result from server
  //   b) offline        → confirmed valid offline-grace entry from grace store
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [verifiedLicense, setVerifiedLicense] = useState<VerifiedLicense | null>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [appVersion, setAppVersion] = useState("1.0.7");
  const [platform, setPlatform] = useState("Web");
  const [deviceId, setDeviceId] = useState(() => generateDeviceHash(userId));

  // ── Resolve offline grace — reads grace store to confirm a real grace window ──
  function resolveOfflineGrace(): VerifiedLicense {
    const graceStatus = grace.getStatus(false); // pass false — we know we're offline
    const graceMs = grace.graceRemainingMs();

    if (graceStatus === 'grace' && graceMs > 0) {
      // Confirmed valid offline grace — premium remains accessible in the window
      return {
        status: 'grace',
        plan: grace.plan,
        isPremium: true,
        lastVerifiedAt: grace.lastVerifiedAt,
        graceRemainingMs: graceMs,
      };
    }
    if (graceStatus === 'expired') {
      return {
        status: 'expired',
        plan: grace.plan,
        isPremium: false,
        lastVerifiedAt: grace.lastVerifiedAt,
        graceRemainingMs: 0,
      };
    }
    // Anything else (unknown, active-but-unverifiable offline, free) → treat as free
    // This prevents stale 'active' from a previous premium session flashing through.
    return {
      status: 'free',
      plan: null,
      isPremium: false,
      lastVerifiedAt: grace.lastVerifiedAt,
      graceRemainingMs: 0,
    };
  }

  // ── On open: strict loading lock, then resolve the single source of truth ────
  useEffect(() => {
    if (!open) {
      // Reset when modal closes so next open always starts clean
      setVerifiedLicense(null);
      setLicenseLoading(false);
      return;
    }

    // Fetch device info (Electron only) — does not affect status display
    if (isElectron) {
      const api = (window as any).electronAPI;
      if (api?.system?.getInfo) {
        api.system.getInfo().then((info: any) => {
          if (info?.platform === "win32") setPlatform("Windows");
          else if (info?.platform === "darwin") setPlatform("macOS");
          else if (info?.platform === "linux") setPlatform("Linux");
          else setPlatform(info?.platform || "Desktop");
        });
      }
      if (api?.getAppVersion) api.getAppVersion().then((v: string) => setAppVersion(v));
      if (api?.getDeviceId) api.getDeviceId().then((id: string) => { if (id) setDeviceId(id); });
    }

    // Enter strict loading — status block renders nothing premium until this resolves.
    setLicenseLoading(true);
    setVerifiedLicense(null);

    if (isOffline) {
      // Offline path: read grace store's confirmed offline-grace data.
      // No server call possible — but we only pass through valid grace window state,
      // not raw stale 'active' which could be from a previous premium session.
      const offlineResult = resolveOfflineGrace();
      console.log('[PremiumTruth] modal opened offline — resolved:', offlineResult.status);
      setVerifiedLicense(offlineResult);
      setLicenseLoading(false);
      return;
    }

    // Online path: live server verification is the only truth.
    console.log('[PremiumTruth] modal opened online — starting strict load, ignoring stale grace store');
    safeRefreshEntitlements()
      .then((result) => {
        if (result.user) {
          // Write verified data back to grace store (persistence layer only)
          grace.setVerified(result.user.isPremium, result.user.plan ?? null, result.user.id ?? null);

          const verified: VerifiedLicense = {
            status: result.user.isPremium ? 'active' : 'free',
            plan: result.user.plan ?? null,
            isPremium: result.user.isPremium,
            lastVerifiedAt: Date.now(),
            graceRemainingMs: 0,
          };
          console.log('[PremiumTruth] modal auto-refresh done — isPremium:', result.user.isPremium, 'status:', verified.status);
          setVerifiedLicense(verified);
        } else {
          // Server responded but no user data — default to free
          setVerifiedLicense({
            status: 'free',
            plan: null,
            isPremium: false,
            lastVerifiedAt: null,
            graceRemainingMs: 0,
          });
        }
      })
      .catch((err) => {
        console.warn('[PremiumTruth] modal auto-refresh failed:', err);
        // Network error during online path — fall back to offline grace resolution
        // (same conservative logic: only pass through a confirmed grace window)
        const fallback = resolveOfflineGrace();
        console.log('[PremiumTruth] fallback after error — status:', fallback.status);
        setVerifiedLicense(fallback);
      })
      .finally(() => setLicenseLoading(false));
  }, [open]);

  const handleRefreshLicense = async () => {
    if (isOffline) {
      toast({ title: "Offline", description: "Cannot verify license while offline.", variant: "destructive" });
      return;
    }
    setLicenseLoading(true);
    setVerifiedLicense(null);
    try {
      const result = await safeRefreshEntitlements();
      if (result.user) {
        grace.setVerified(result.user.isPremium, result.user.plan ?? null, result.user.id ?? null);
        const verified: VerifiedLicense = {
          status: result.user.isPremium ? 'active' : 'free',
          plan: result.user.plan ?? null,
          isPremium: result.user.isPremium,
          lastVerifiedAt: Date.now(),
          graceRemainingMs: 0,
        };
        setVerifiedLicense(verified);
        if (result.user.isPremium) {
          toast({ title: "License Verified", description: "Your Premium license is active and up to date." });
        } else {
          toast({ title: "License Status", description: "No active premium license found.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Refresh Failed", description: "Could not verify license. Please try again.", variant: "destructive" });
      const fallback = resolveOfflineGrace();
      setVerifiedLicense(fallback);
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleRestorePurchase = async () => {
    if (isOffline) {
      toast({ title: "Offline", description: "Cannot restore purchase while offline.", variant: "destructive" });
      return;
    }
    setIsRestoring(true);
    setLicenseLoading(true);
    setVerifiedLicense(null);
    try {
      const result = await safeRefreshEntitlements();
      if (result.user) {
        grace.setVerified(result.user.isPremium, result.user.plan ?? null, result.user.id ?? null);
        const verified: VerifiedLicense = {
          status: result.user.isPremium ? 'active' : 'free',
          plan: result.user.plan ?? null,
          isPremium: result.user.isPremium,
          lastVerifiedAt: Date.now(),
          graceRemainingMs: 0,
        };
        setVerifiedLicense(verified);
        if (result.user.isPremium) {
          toast({ title: "Purchase Restored", description: "Your Premium license has been restored successfully." });
        } else {
          toast({ title: "No License Found", description: "No active Premium license found for this account.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Restore Failed", description: "Could not connect to the license server. Please try again later.", variant: "destructive" });
      const fallback = resolveOfflineGrace();
      setVerifiedLicense(fallback);
    } finally {
      setIsRestoring(false);
      setLicenseLoading(false);
    }
  };

  const handleContactSupport = () => {
    const subject = encodeURIComponent(`SwitchControl Support – Device ${deviceId || "UNKNOWN"}`);
    const body = encodeURIComponent(
      `\n\n--- Do not edit below this line ---\nDevice ID: ${deviceId || "UNKNOWN"}\nApp Version: ${appVersion}\nPlatform: ${platform}\n`
    );
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    if (isElectron && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(mailtoUrl).catch(() => { window.location.href = mailtoUrl; });
    } else {
      window.location.href = mailtoUrl;
    }
  };

  const handleClose = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); handleClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const busy = licenseLoading || isRestoring;

  // ── Status block — rendered ONLY from modal-local verified state ──────────────
  // Hard rule: while licenseLoading is true, never render any plan/status.
  const statusBlock = () => {
    // Strict loading gate — never bypassed by stale grace store state.
    if (licenseLoading || verifiedLicense === null) {
      return (
        <div className="relative rounded-xl border border-white/[0.08] bg-white/[0.025] flex items-center justify-center py-6 gap-2">
          <Loader2 className="size-4 animate-spin text-white/40" />
          <span className="text-[12px] text-white/40">Verifying license…</span>
        </div>
      );
    }

    // Render from verified modal-local snapshot — not from grace store.
    if (verifiedLicense.status === 'active') {
      return (
        <div className="relative rounded-xl overflow-hidden border border-emerald-500/[0.22] bg-emerald-500/[0.04] shadow-[inset_0_0_28px_rgba(16,185,129,0.07)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
          <div className="px-4 py-3.5 divide-y divide-emerald-500/[0.1]">
            <InfoRow label="Plan">
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[10px] font-medium px-2.5 py-0.5">
                {verifiedLicense.plan === 'premium' ? 'Premium Lifetime' : (verifiedLicense.plan || 'Premium')}
              </Badge>
            </InfoRow>
            <InfoRow label="Status">
              <div className="flex items-center gap-2">
                <span className="relative flex size-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full size-1.5 bg-emerald-400" />
                </span>
                <span className="text-[12px] text-emerald-400 font-medium">Active</span>
                <CheckCircle2 className="size-3.5 text-emerald-400" />
              </div>
            </InfoRow>
            <InfoRow label="Last Verified">
              <span className="text-[12px] text-white/55">{formatLastVerified(verifiedLicense.lastVerifiedAt)}</span>
            </InfoRow>
          </div>
        </div>
      );
    }

    if (verifiedLicense.status === 'grace') {
      return (
        <div className="relative rounded-xl overflow-hidden border border-amber-500/25 bg-amber-500/[0.04]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />
          <div className="px-4 py-3.5 divide-y divide-amber-500/[0.1]">
            <InfoRow label="Plan">
              <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px] font-medium px-2.5 py-0.5">
                Premium (Offline Grace)
              </Badge>
            </InfoRow>
            <InfoRow label="Status">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-amber-400" />
                <span className="text-[12px] text-amber-400 font-medium">Offline Grace</span>
              </div>
            </InfoRow>
            <InfoRow label="Grace Window">
              <span className="text-[12px] text-amber-300/70">{formatGraceRemaining(verifiedLicense.graceRemainingMs)}</span>
            </InfoRow>
            <InfoRow label="Last Verified">
              <span className="text-[12px] text-white/55">{formatLastVerified(verifiedLicense.lastVerifiedAt)}</span>
            </InfoRow>
          </div>
          <div className="px-4 pb-3 text-[11px] text-amber-400/60">
            Premium features remain available offline. Verify when back online.
          </div>
        </div>
      );
    }

    if (verifiedLicense.status === 'expired') {
      return (
        <div className="relative rounded-xl overflow-hidden border border-red-500/25 bg-red-500/[0.04]">
          <div className="px-4 py-3.5 divide-y divide-red-500/[0.1]">
            <InfoRow label="Status">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-red-400" />
                <span className="text-[12px] text-red-400 font-medium">Verification Required</span>
              </div>
            </InfoRow>
            <InfoRow label="Last Verified">
              <span className="text-[12px] text-white/55">{formatLastVerified(verifiedLicense.lastVerifiedAt)}</span>
            </InfoRow>
          </div>
          <div className="px-4 pb-3 text-[11px] text-red-400/70">
            Your 7-day offline grace period has expired. Connect to the internet and refresh your license to restore premium access.
          </div>
        </div>
      );
    }

    // 'free' or 'unknown' — render no-license state
    return (
      <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="px-4 py-3.5 divide-y divide-white/[0.05]">
          <InfoRow label="Plan">
            <Badge className="bg-white/[0.06] text-white/45 border-white/[0.1] text-[10px] font-medium px-2.5 py-0.5">Free</Badge>
          </InfoRow>
          <InfoRow label="Status">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex rounded-full size-1.5 bg-[#1A1F26]5" />
              <span className="text-[12px] text-white/45 font-medium">No License</span>
            </div>
          </InfoRow>
        </div>
      </div>
    );
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm pointer-events-auto"
            onClick={handleClose}
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />

          <motion.div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md pointer-events-auto px-4"
            role="dialog"
            aria-modal="true"
            aria-label="License Management"
            data-testid="modal-license-management"
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className="relative rounded-2xl overflow-hidden glass-surface-bg backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-none absolute -top-20 -right-20 w-60 h-60 rounded-full bg-emerald-500/[0.06] blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-purple-500/[0.06] blur-3xl" />

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_16px_rgba(16,185,129,0.12)]">
                    <Shield className="size-4 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white leading-tight">License Management</h2>
                    <p className="text-[10px] text-white/35 mt-0.5">Manage your SwitchControl license</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border",
                    isOffline
                      ? "bg-red-500/[0.08] border-red-500/20 text-red-400/70"
                      : "bg-emerald-500/[0.06] border-emerald-500/15 text-emerald-400/60"
                  )} data-testid="status-backend-reachable">
                    {isOffline ? <WifiOff className="size-2.5" /> : <Wifi className="size-2.5" />}
                    <span>{isOffline ? "Offline" : "Online"}</span>
                  </div>
                  <button
                    onClick={handleClose}
                    className="flex items-center justify-center size-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="relative px-6 py-5 space-y-4">
                {statusBlock()}

                {/* Device info */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.025]">
                  <div className="px-4 pt-3.5 pb-1 flex items-center gap-2 border-b border-white/[0.05]">
                    <Cpu className="size-3.5 text-purple-400/80" />
                    <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Device</span>
                  </div>
                  <div className="px-4 pb-3.5 divide-y divide-white/[0.05]">
                    <InfoRow label="Device ID">
                      <div className="flex items-center gap-1.5">
                        <code
                          className="text-[11px] text-white/75 bg-white/[0.05] px-2 py-0.5 rounded-md font-mono border border-white/[0.06]"
                          data-testid="text-device-id"
                        >
                          {deviceId}
                        </code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(deviceId); toast({ title: "Copied", description: "Device ID copied." }); }}
                          className="text-white/25 hover:text-white/60 transition-colors"
                          data-testid="button-copy-device-id"
                          aria-label="Copy device ID"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    </InfoRow>
                    <InfoRow label="App Version">
                      <span className="text-[12px] text-white/55 font-mono" data-testid="text-app-version">{appVersion}</span>
                    </InfoRow>
                    <InfoRow label="Platform">
                      <span className="text-[12px] text-white/55" data-testid="text-platform">{platform}</span>
                    </InfoRow>
                    <InfoRow label="Backend">
                      <span className={cn("text-[12px] font-medium", isBackendReachable ? "text-emerald-400/70" : "text-red-400/70")}>
                        {isBackendReachable ? "Reachable" : "Unavailable"}
                      </span>
                    </InfoRow>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border transition-all",
                      "border-emerald-500/20 text-emerald-400/80 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.09] hover:border-emerald-500/35 hover:text-emerald-300",
                      (busy || isOffline) && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={handleRefreshLicense}
                    disabled={busy || isOffline}
                    data-testid="button-refresh-license"
                    title={isOffline ? "Offline — cannot verify" : undefined}
                  >
                    {licenseLoading ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <RefreshCw className="size-3.5 shrink-0" />}
                    {isOffline ? "Unavailable Offline" : "Refresh License"}
                  </button>

                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border transition-all",
                      "border-purple-500/20 text-purple-400/80 bg-purple-500/[0.04] hover:bg-purple-500/[0.09] hover:border-purple-500/35 hover:text-purple-300",
                      (busy || isOffline) && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={handleRestorePurchase}
                    disabled={busy || isOffline}
                    data-testid="button-restore-purchase"
                    title={isOffline ? "Offline — cannot restore" : undefined}
                  >
                    {isRestoring ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <RotateCcw className="size-3.5 shrink-0" />}
                    {isOffline ? "Unavailable Offline" : "Restore Purchase"}
                  </button>

                  <button
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border border-white/[0.07] text-white/45 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] hover:text-white/70 transition-all"
                    onClick={handleContactSupport}
                    data-testid="button-contact-support"
                  >
                    <Mail className="size-3.5 shrink-0" />
                    Contact Support
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
