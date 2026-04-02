import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/App";
import {
  Shield, RefreshCw, RotateCcw, Mail, CheckCircle2,
  Loader2, Copy, X, Cpu,
} from "lucide-react";
import { motion, AnimatePresence, modalBackdrop, modalContent } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "Switchcontrol67@gmail.com";
const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.isElectron;

interface LicenseManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPremium: boolean;
  userId: string;
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

export function LicenseManagementModal({ open, onOpenChange, isPremium, userId }: LicenseManagementModalProps) {
  const { toast } = useToast();
  const { safeRefreshEntitlements } = useAppAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [verified, setVerified] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [platform, setPlatform] = useState("Web");
  const [deviceId, setDeviceId] = useState(() => generateDeviceHash(userId));

  useEffect(() => {
    if (!open) {
      setVerified(false);
      return;
    }

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
      if (api?.getAppVersion) {
        api.getAppVersion().then((v: string) => setAppVersion(v));
      }
      if (api?.getDeviceId) {
        api.getDeviceId().then((id: string) => { if (id) setDeviceId(id); });
      }
    }
  }, [open]);

  const handleRefreshLicense = async () => {
    setIsRefreshing(true);
    setVerified(false);
    try {
      const result = await safeRefreshEntitlements();
      const now = new Date().toLocaleTimeString();
      setLastSync(now);

      if (result.user?.isPremium) {
        setVerified(true);
        toast({ title: "License Verified", description: "Your Premium license is active and up to date." });
      } else {
        toast({ title: "License Status", description: "No active premium license found.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Refresh Failed", description: "Could not verify license. Please try again.", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRestorePurchase = async () => {
    setIsRestoring(true);
    setVerified(false);
    try {
      const result = await safeRefreshEntitlements();
      const now = new Date().toLocaleTimeString();
      setLastSync(now);

      if (result.user?.isPremium) {
        setVerified(true);
        toast({ title: "Purchase Restored", description: "Your Premium license has been restored successfully." });
      } else {
        toast({ title: "No License Found", description: "We couldn't find an active Premium license for this account. If you believe this is an error, please contact support.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Restore Failed", description: "Could not connect to the license server. Please try again later.", variant: "destructive" });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleContactSupport = () => {
    console.log("[DEBUG] CONTACT SUPPORT CLICKED");
    console.log("[DEBUG] DEVICE ID:", deviceId);
    console.log("[DEBUG] IS ELECTRON:", isElectron);
    console.log("[DEBUG] HAS openExternal:", !!(window as any).electronAPI?.openExternal);

    const subject = encodeURIComponent(`SwitchControl Support – Device ${deviceId || "UNKNOWN"}`);
    const body = encodeURIComponent(
      `\n\n--- Do not edit below this line ---\nDevice ID: ${deviceId || "UNKNOWN"}\nApp Version: ${appVersion}\nPlatform: ${platform}\n`
    );
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    console.log("[DEBUG] MAILTO URL:", mailtoUrl);

    if (isElectron && (window as any).electronAPI?.openExternal) {
      console.log("[DEBUG] Calling electronAPI.openExternal with mailto");
      (window as any).electronAPI.openExternal(mailtoUrl)
        .then(() => console.log("[DEBUG] openExternal resolved"))
        .catch((err: any) => console.error("[DEBUG] openExternal rejected:", err));
    } else {
      console.log("[DEBUG] Falling back to window.location.href");
      window.location.href = mailtoUrl;
    }
  };

  const handleClose = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const busy = isRefreshing || isRestoring;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm pointer-events-auto"
            onClick={handleClose}
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
          />

          {/* Panel */}
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
              className="relative rounded-2xl overflow-hidden bg-[#0c0e12]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Subtle corner glow */}
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
                <button
                  onClick={handleClose}
                  className="flex items-center justify-center size-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="relative px-6 py-5 space-y-4">
                {/* License status block */}
                <div className="relative rounded-xl overflow-hidden border border-emerald-500/[0.22] bg-emerald-500/[0.04] shadow-[inset_0_0_28px_rgba(16,185,129,0.07)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />

                  <div className="px-4 py-3.5 space-y-0 divide-y divide-emerald-500/[0.1]">
                    <InfoRow label="Plan">
                      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25 text-[10px] font-medium px-2.5 py-0.5">
                        Premium Lifetime
                      </Badge>
                    </InfoRow>

                    <InfoRow label="Status">
                      <div className="flex items-center gap-2">
                        <span className="relative flex size-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex rounded-full size-1.5 bg-emerald-400" />
                        </span>
                        <span className="text-[12px] text-emerald-400 font-medium">Active</span>
                        {verified && <CheckCircle2 className="size-3.5 text-emerald-400" />}
                      </div>
                    </InfoRow>

                    <InfoRow label="Activated On">
                      <span className="text-[12px] text-white/55">Lifetime License</span>
                    </InfoRow>

                    {lastSync && (
                      <InfoRow label="Last Sync">
                        <span className="text-[12px] text-white/55 font-mono">{lastSync}</span>
                      </InfoRow>
                    )}
                  </div>
                </div>

                {/* Device info block */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.025]">
                  <div className="px-4 pt-3.5 pb-1 flex items-center gap-2 border-b border-white/[0.05]">
                    <Cpu className="size-3.5 text-purple-400/80" />
                    <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Device</span>
                  </div>

                  <div className="px-4 pb-3.5 space-y-0 divide-y divide-white/[0.05]">
                    <InfoRow label="Device ID">
                      <div className="flex items-center gap-1.5">
                        <code
                          className="text-[11px] text-white/75 bg-white/[0.05] px-2 py-0.5 rounded-md font-mono border border-white/[0.06]"
                          data-testid="text-device-id"
                        >
                          {deviceId}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(deviceId);
                            toast({ title: "Copied", description: "Device ID copied." });
                          }}
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
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border transition-all",
                      "border-emerald-500/20 text-emerald-400/80 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.09] hover:border-emerald-500/35 hover:text-emerald-300",
                      busy && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={handleRefreshLicense}
                    disabled={busy}
                    data-testid="button-refresh-license"
                  >
                    {isRefreshing
                      ? <Loader2 className="size-3.5 animate-spin shrink-0" />
                      : <RefreshCw className="size-3.5 shrink-0" />
                    }
                    Refresh License
                  </button>

                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border transition-all",
                      "border-purple-500/20 text-purple-400/80 bg-purple-500/[0.04] hover:bg-purple-500/[0.09] hover:border-purple-500/35 hover:text-purple-300",
                      busy && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={handleRestorePurchase}
                    disabled={busy}
                    data-testid="button-restore-purchase"
                  >
                    {isRestoring
                      ? <Loader2 className="size-3.5 animate-spin shrink-0" />
                      : <RotateCcw className="size-3.5 shrink-0" />
                    }
                    Restore Purchase
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
    </AnimatePresence>
  );
}
