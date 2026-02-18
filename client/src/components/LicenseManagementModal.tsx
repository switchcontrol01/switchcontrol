import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppAuth } from "@/App";
import { Shield, RefreshCw, RotateCcw, Mail, CheckCircle2, Monitor, Loader2, Copy } from "lucide-react";

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

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0c0c14] border-border/50 max-w-md backdrop-blur-xl"
        data-testid="modal-license-management"
        onInteractOutside={handleClose}
        onEscapeKeyDown={(e) => { e.preventDefault(); handleClose(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Shield className="size-5 text-emerald-400" />
            License Management
          </DialogTitle>
          <DialogDescription>
            Manage your SwitchControl license and device information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="relative rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 overflow-hidden">
            <div className="absolute inset-0 rounded-lg shadow-[inset_0_0_20px_rgba(16,185,129,0.08)]" />
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Plan</span>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                  Premium Lifetime
                </Badge>
              </div>
              <Separator className="bg-emerald-500/10" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</span>
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                  </span>
                  <span className="text-sm text-emerald-400 font-medium">Active</span>
                  {verified && <CheckCircle2 className="size-4 text-emerald-400" />}
                </div>
              </div>
              <Separator className="bg-emerald-500/10" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Activated On</span>
                <span className="text-sm text-white/70">Lifetime License</span>
              </div>
              {lastSync && (
                <>
                  <Separator className="bg-emerald-500/10" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Last Sync</span>
                    <span className="text-sm text-white/70 font-mono">{lastSync}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/40 bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Monitor className="size-4 text-purple-400" />
              <span className="text-sm font-medium text-white">Device Information</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Device ID</span>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs text-white/80 bg-white/5 px-2 py-0.5 rounded font-mono" data-testid="text-device-id">{deviceId}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(deviceId); toast({ title: "Copied", description: "Device ID copied." }); }}
                    className="text-white/30 hover:text-white/60 transition-colors"
                    data-testid="button-copy-device-id"
                  >
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">App Version</span>
                <span className="text-xs text-white/80 font-mono" data-testid="text-app-version">{appVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Platform</span>
                <span className="text-xs text-white/80" data-testid="text-platform">{platform}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-border/40 hover:bg-emerald-500/5 hover:border-emerald-500/30 hover:text-emerald-400 transition-all"
              onClick={handleRefreshLicense}
              disabled={isRefreshing || isRestoring}
              data-testid="button-refresh-license"
            >
              {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh License
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-border/40 hover:bg-purple-500/5 hover:border-purple-500/30 hover:text-purple-400 transition-all"
              onClick={handleRestorePurchase}
              disabled={isRefreshing || isRestoring}
              data-testid="button-restore-purchase"
            >
              {isRestoring ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Restore Purchase
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-border/40 hover:bg-white/5 transition-all"
              onClick={handleContactSupport}
              data-testid="button-contact-support"
            >
              <Mail className="size-4" />
              Contact Support
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
