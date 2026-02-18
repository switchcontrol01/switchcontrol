import { AppLayout } from "@/components/layout/AppLayout";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GlassCard } from "@/components/ui/glass-card";
import { Settings as SettingsIcon, Save, RotateCcw, Trash2, FolderOpen, ExternalLink, Volume2, Mail, Copy, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAppAuth } from "@/App";
import { useAuthStore, performFullLogout } from "@/lib/auth-store";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  );
}

const SUPPORT_EMAIL = 'switchcontrol67@gmail.com';

export default function Settings() {
  const { account, resetData, enhancedSensorsEnabled, setEnhancedSensorsEnabled, soundEffectsEnabled, setSoundEffectsEnabled } = useStore();
  const { toast } = useToast();
  const { isPremium, user } = useAppAuth();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <SettingsIcon className="size-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage application preferences and account details.
          </p>
        </div>

        <div className="grid gap-6">
          {/* General Settings */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Configure general app behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable App Booster</Label>
                  <p className="text-xs text-muted-foreground">Automatically optimize priority for active games.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Real-time Metrics</Label>
                  <p className="text-xs text-muted-foreground">Update dashboard stats every second.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Pause when minimized</Label>
                  <p className="text-xs text-muted-foreground">Stop polling stats when app is in background.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator className="bg-border/50" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Volume2 className="size-4 text-purple-400" />
                    Enable Sound Effects
                  </Label>
                  <p className="text-xs text-muted-foreground">Play audio feedback for premium animations and system events.</p>
                </div>
                <Switch
                  checked={soundEffectsEnabled}
                  onCheckedChange={(checked) => {
                    setSoundEffectsEnabled(checked);
                    toast({
                      title: checked ? "Sound Effects Enabled" : "Sound Effects Disabled",
                      description: checked
                        ? "Audio feedback is now active."
                        : "All sound effects are muted.",
                    });
                  }}
                  data-testid="toggle-sound-effects"
                />
              </div>
              {isElectron && (
                <>
                  <Separator className="bg-border/50" />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        Enhanced Sensors
                        <span className="text-[9px] text-amber-400 uppercase font-medium px-1.5 py-0.5 bg-amber-500/10 rounded">Experimental</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">Use LibreHardwareMonitor for motherboard, VRM, and chipset temps.</p>
                    </div>
                    <Switch 
                      checked={enhancedSensorsEnabled} 
                      onCheckedChange={(checked) => {
                        setEnhancedSensorsEnabled(checked);
                        toast({
                          title: checked ? "Enhanced Sensors Enabled" : "Enhanced Sensors Disabled",
                          description: checked 
                            ? "Motherboard temps may now be available if supported." 
                            : "Using default system sensors.",
                        });
                      }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Account Settings */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Your license details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.email && (
                <div className="grid gap-2">
                  <Label>Account Email</Label>
                  <Input value={user.email} readOnly disabled className="bg-muted/50 text-muted-foreground" data-testid="input-account-email" />
                </div>
              )}
              <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-md">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-emerald-400">Premium (Lifetime)</span>
                  <p className="text-xs text-emerald-500/70">One-time purchase - Lifetime access</p>
                </div>
                <Button variant="outline" size="sm" className="border-emerald-500/20 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                  Manage
                </Button>
              </div>
            </CardContent>
          </Card>

          {isPremium && (
            <Card className="bg-card/50 border-emerald-500/20" data-tour="settings-email">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="size-5 text-amber-400" />
                  Priority Support
                </CardTitle>
                <CardDescription>As a Premium member, you get direct priority email support.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-4">
                  <div className="size-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Mail className="size-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider mb-1">Priority Email</p>
                    <p className="text-sm text-white font-mono select-all" data-testid="text-support-email">{SUPPORT_EMAIL}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-white/40 hover:text-white/80"
                      onClick={() => {
                        navigator.clipboard.writeText(SUPPORT_EMAIL);
                        toast({ title: "Copied", description: "Email address copied to clipboard." });
                      }}
                      data-testid="button-copy-email"
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-emerald-400/60 hover:text-emerald-400"
                      asChild
                    >
                      <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="link-mailto-support">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">We typically reply within 24 hours.</p>
              </CardContent>
            </Card>
          )}

          {/* Data Management */}
          <Card className="bg-red-500/5 border-red-500/10">
            <CardHeader>
              <CardTitle className="text-red-400">Data Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetData();
                      toast({ title: "Settings Reset", description: "Your preferences have been restored to defaults. You are still logged in." });
                    }}
                    className="border-border/50 hover:bg-muted/50 text-white w-fit"
                    data-testid="button-reset-settings"
                  >
                    <RotateCcw className="size-4 mr-2" />
                    Reset Settings
                  </Button>
                  <p className="text-xs text-muted-foreground">Resets UI preferences to defaults. Keeps your login and premium status.</p>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex flex-col gap-1.5">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      document.querySelectorAll('[class*="fixed"][class*="z-"]').forEach(el => {
                        (el as HTMLElement).style.display = 'none';
                      });
                      await performFullLogout('factory_reset');
                      localStorage.clear();
                      sessionStorage.clear();
                      if (isElectron && (window as any).electronAPI?.resetAppData) {
                        await (window as any).electronAPI.resetAppData();
                      } else {
                        window.location.reload();
                      }
                    }}
                    className="border-red-500/20 hover:bg-red-500/10 text-red-400 w-fit"
                    data-testid="button-factory-reset"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Factory Reset
                  </Button>
                  <p className="text-xs text-muted-foreground">Logs you out and wipes all local data. You will need to sign in again.</p>
                </div>
                <Separator className="bg-border/30" />
                <Button
                  variant="outline"
                  className="border-border/50 w-fit"
                  data-testid="button-open-logs"
                  onClick={async () => {
                    if (isElectron && (window as any).electronAPI?.openLogs) {
                      await (window as any).electronAPI.openLogs();
                    } else {
                      toast({ title: "Not Available", description: "Log directory is only accessible in the desktop app." });
                    }
                  }}
                >
                  <FolderOpen className="size-4 mr-2" />
                  Open Log Directory
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Join the Community */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Join the Community</CardTitle>
              <CardDescription>Connect with other gamers and get the latest updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (isElectron && window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(SOCIAL_LINKS.discord);
                    } else {
                      window.open(SOCIAL_LINKS.discord, '_blank');
                    }
                  }}
                  data-testid="link-discord"
                  className="text-left"
                >
                  <GlassCard className="p-4 group cursor-pointer hover:border-[#5865F2]/30 hover:shadow-[0_0_20px_-5px_rgba(88,101,242,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-[#5865F2]/20 flex items-center justify-center group-hover:bg-[#5865F2]/30 transition-colors">
                        <DiscordIcon className="size-5 text-[#5865F2]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white group-hover:text-[#5865F2] transition-colors">Discord</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">Get support and share configs</p>
                      </div>
                    </div>
                  </GlassCard>
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (isElectron && window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(SOCIAL_LINKS.tiktok);
                    } else {
                      window.open(SOCIAL_LINKS.tiktok, '_blank');
                    }
                  }}
                  data-testid="link-tiktok"
                  className="text-left"
                >
                  <GlassCard className="p-4 group cursor-pointer hover:border-pink-500/30 hover:shadow-[0_0_20px_-5px_rgba(236,72,153,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/30 transition-colors">
                        <TikTokIcon className="size-5 text-pink-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white group-hover:text-pink-500 transition-colors">TikTok</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">Tips, tricks, and tutorials</p>
                      </div>
                    </div>
                  </GlassCard>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
