import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader, AnimatedSection } from "@/components/layout/PageHeader";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GlassCard } from "@/components/ui/glass-card";
import { Settings as SettingsIcon, RotateCcw, Trash2, FolderOpen, ExternalLink, Mail, Copy, Crown } from "lucide-react";
import { UpdateCard } from "@/components/UpdateCard";
import { useToast } from "@/hooks/use-toast";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAppAuth } from "@/App";
import { useAuthStore } from "@/lib/auth-store";
import { LicenseManagementModal } from "@/components/LicenseManagementModal";
import { useState, useEffect } from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { PATCH_NOTES_STORAGE_KEY } from "@/components/PatchNotesModal";

interface PatchNotes {
  version: string;
  title: string;
  headline: string;
  date: string;
  changes: string[];
  type: string;
}

function PatchNotesSection() {
  const [notes, setNotes] = useState<PatchNotes | null>(null);

  useEffect(() => {
    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then(setNotes)
      .catch(() => {});
  }, []);

  if (!notes) return null;

  const lastSeen = localStorage.getItem(PATCH_NOTES_STORAGE_KEY);
  const isNew = lastSeen !== notes.version;

  return (
    <GlassCard blur="sm" hoverEffect={false} className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-lg"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)" }}>
            <Sparkles className="size-4" style={{ color: "rgba(192,155,255,0.85)" }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">What's New</h3>
              {isNew && (
                <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(139,92,246,0.18)", color: "rgba(192,155,255,0.9)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  New
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{notes.title}</p>
          </div>
        </div>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.30)", border: "1px solid rgba(255,255,255,0.07)" }}>
          v{notes.version}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
        {notes.headline}
      </p>

      <div className="space-y-2.5 pt-1">
        {notes.changes.map((change, i) => (
          <motion.div
            key={i}
            className="flex items-start gap-2.5"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <CheckCircle2 className="size-3.5 mt-[2px] shrink-0" style={{ color: "rgba(139,92,246,0.65)" }} />
            <p className="text-[12.5px] leading-snug" style={{ color: "rgba(255,255,255,0.50)" }}>{change}</p>
          </motion.div>
        ))}
      </div>

      <p className="text-[10px] pt-1" style={{ color: "rgba(255,255,255,0.18)" }}>
        {new Date(notes.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>
    </GlassCard>
  );
}

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
  const { account, resetData, enhancedSensorsEnabled, setEnhancedSensorsEnabled } = useStore();
  const { toast } = useToast();
  const { isPremium, user, factoryReset } = useAppAuth();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
  const isAdmin = !!(user as any)?.isAdmin;
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl" data-reveal>
        <PageHeader
          icon={SettingsIcon}
          title="Settings"
          subtitle="Manage application preferences and account details."
        />

        <div className="space-y-6">
          <AnimatedSection index={0}>
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Configure general app behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { label: "Enable App Booster", desc: "Automatically optimize priority for active games." },
                { label: "Real-time Metrics", desc: "Update dashboard stats every second." },
                { label: "Pause when minimized", desc: "Stop polling stats when app is in background." },
              ].map((row, i) => (
                <motion.div
                  key={row.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex items-center justify-between py-1 px-2 -mx-2 rounded-lg hover:bg-white/[0.025] transition-colors">
                    <div className="space-y-0.5">
                      <Label>{row.label}</Label>
                      <p className="text-xs text-muted-foreground">{row.desc}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  {i < 2 && <Separator className="bg-border/50 mt-5" />}
                </motion.div>
              ))}
              {isElectron && (
                <>
                  <Separator className="bg-border/50" />
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.23, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-center justify-between py-1 px-2 -mx-2 rounded-lg hover:bg-white/[0.025] transition-colors">
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
                  </motion.div>
                </>
              )}
            </CardContent>
          </Card>
          </AnimatedSection>

          {/* Account Settings */}
          <AnimatedSection index={1}>
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
              {isPremium ? (
                <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-md">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-emerald-400">Premium (Lifetime)</span>
                    <p className="text-xs text-emerald-500/70">One-time purchase - Lifetime access</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-500/20 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    onClick={() => setLicenseModalOpen(true)}
                    data-testid="button-manage-license"
                  >
                    Manage
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.08] p-3 rounded-md">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-white/60">Free Plan</span>
                    <p className="text-xs text-white/35">Upgrade to unlock all premium features</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/[0.1] text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                    onClick={() => setLicenseModalOpen(true)}
                    data-testid="button-manage-license"
                  >
                    Manage
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </AnimatedSection>

          {/* What's New — patch notes */}
          <AnimatedSection index={2}>
            <PatchNotesSection />
          </AnimatedSection>

          {/* Software Update — Electron only */}
          {isElectron && (
            <AnimatedSection index={3}>
              <UpdateCard />
            </AnimatedSection>
          )}

          {isPremium && (
            <AnimatedSection index={2}>
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
            </AnimatedSection>
          )}

          {/* Data Management */}
          <AnimatedSection index={3}>
          <Card className="bg-red-500/5 border-red-500/10">
            <CardHeader>
              <CardTitle className="text-red-400">Data Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4">
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="w-fit">
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetData();
                        toast({ title: "Settings Reset", description: "Your preferences have been restored to defaults. You are still logged in." });
                      }}
                      className="border-border/50 hover:bg-muted/50 text-white"
                      data-testid="button-reset-settings"
                    >
                      <RotateCcw className="size-4 mr-2" />
                      Reset Settings
                    </Button>
                  </motion.div>
                  <p className="text-xs text-muted-foreground">Resets UI preferences to defaults. Keeps your login and premium status.</p>
                </motion.div>
                <Separator className="bg-border/30" />
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="w-fit">
                    <Button
                      variant="outline"
                      onClick={() => factoryReset()}
                      className="border-red-500/20 hover:bg-red-500/10 text-red-400"
                      data-testid="button-factory-reset"
                    >
                      <Trash2 className="size-4 mr-2" />
                      Factory Reset
                    </Button>
                  </motion.div>
                  <p className="text-xs text-muted-foreground">Logs you out and wipes all local data. You will need to sign in again.</p>
                </motion.div>
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
          </AnimatedSection>

          {/* Admin Panel — only visible to admin users */}
          {isAdmin && (
            <AnimatedSection index={4}>
            <Card className="border-orange-500/20" style={{ background: "rgba(251,146,60,0.04)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-300">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 10c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Admin Panel
                </CardTitle>
                <CardDescription>Internal admin tools. Visible to admins only.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/15 p-3 rounded-md">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-orange-300">User Management</span>
                    <p className="text-xs text-orange-500/60">Manage users, plans, trials, and account flags</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-open-admin"
                    className="border-orange-500/20 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                    onClick={() => {
                      if (isElectron && (window as any).electronAPI?.openExternal) {
                        (window as any).electronAPI.openExternal('https://switchcontrol.org/admin');
                      } else {
                        window.open('/admin', '_blank');
                      }
                    }}
                  >
                    Open Admin
                  </Button>
                </div>
              </CardContent>
            </Card>
            </AnimatedSection>
          )}

          {/* Join the Community */}
          <AnimatedSection index={4}>
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Join the Community</CardTitle>
              <CardDescription>Connect with other gamers and get the latest updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <motion.button
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
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
                </motion.button>
                <motion.button
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
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
                </motion.button>
              </div>
            </CardContent>
          </Card>
          </AnimatedSection>
        </div>
      </div>

      <LicenseManagementModal
        open={licenseModalOpen}
        onOpenChange={setLicenseModalOpen}
        isPremium={isPremium}
        userId={user?.id || ""}
      />
    </AppLayout>
  );
}
