import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStore } from "@/lib/store";
import { logHistory } from "@/lib/logHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GlassCard } from "@/components/ui/glass-card";
import { Settings as SettingsIcon, RotateCcw, Trash2, FolderOpen, ExternalLink, Mail, Copy, Crown, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { UpdateCard } from "@/components/UpdateCard";
import { useToast } from "@/hooks/use-toast";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAppAuth } from "@/lib/appAuthContext";
import { useAuthStore } from "@/lib/auth-store";
import { LicenseManagementModal } from "@/components/LicenseManagementModal";
import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Zap, Gauge } from "lucide-react";
import { useAppModeStore, type ApplicationMode } from "@/lib/appModeStore";
import { motion } from "framer-motion";
import { Reveal } from "@/lib/motion";
import { PATCH_NOTES_STORAGE_KEY, PatchNotesModal } from "@/components/PatchNotesModal";

interface PatchNotes {
  version: string;
  title: string;
  headline: string;
  date: string;
  changes: string[];
  type: string;
}

// Module-level cache — one fetch per app session regardless of how many times
// the Settings page is mounted. In Electron file:// mode there is no browser
// HTTP cache, so without this we'd re-fetch on every Settings visit.
let _patchNotesCache: PatchNotes | null = null;

function PatchNotesSection({ onViewFull }: { onViewFull: () => void }) {
  const [notes, setNotes] = useState<PatchNotes | null>(_patchNotesCache);

  useEffect(() => {
    if (_patchNotesCache) return;
    fetch("/patch-notes.json")
      .then((r) => r.json())
      .then((data: PatchNotes) => { _patchNotesCache = data; setNotes(data); })
      .catch(() => {});
  }, []);

  if (!notes) return null;

  const lastSeen = localStorage.getItem(PATCH_NOTES_STORAGE_KEY);
  const isNew = lastSeen !== notes.version;

  const preview = notes.changes.slice(0, 3);
  const extra  = notes.changes.length - preview.length;

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl flex cursor-pointer group"
      style={{
        background: "linear-gradient(105deg, rgba(139,92,246,0.07) 0%, rgba(255,255,255,0.02) 60%)",
        border: "1px solid rgba(139,92,246,0.18)",
        boxShadow: "0 0 0 1px rgba(139,92,246,0.06) inset",
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onClick={onViewFull}
      whileHover={{ borderColor: "rgba(139,92,246,0.32)" }}
    >
      {/* Purple left accent stripe */}
      <div className="w-1 shrink-0 rounded-l-xl"
        style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.9) 0%, rgba(109,40,217,0.5) 100%)" }} />

      <div className="flex items-start gap-6 px-5 py-4 flex-1 min-w-0">
        {/* Left — icon + label */}
        <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
          <div className="flex items-center justify-center size-8 rounded-lg transition-colors"
            style={{ background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.28)" }}>
            <Sparkles className="size-4" style={{ color: "rgba(192,155,255,0.9)" }} />
          </div>
          <span className="text-[9px] font-bold tracking-widest uppercase leading-none"
            style={{ color: "rgba(192,155,255,0.55)" }}>
            What's New
          </span>
        </div>

        {/* Middle — title + headline + date */}
        <div className="min-w-0 shrink-0 w-48">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] font-semibold text-[#E6EAF0] leading-snug truncate">{notes.title}</h3>
            {isNew && (
              <span className="text-[8px] font-bold tracking-widest uppercase px-1.5 py-[3px] rounded-full shrink-0"
                style={{ background: "rgba(139,92,246,0.22)", color: "rgba(192,155,255,0.95)", border: "1px solid rgba(139,92,246,0.30)" }}>
                New
              </span>
            )}
          </div>
          <p className="text-[11.5px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
            {notes.headline}
          </p>
          <p className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.18)" }}>
            {new Date(notes.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Right — change list preview */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {preview.map((change, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-2"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.055, ease: [0.22, 1, 0.36, 1] }}
            >
              <CheckCircle2 className="size-3 mt-[3px] shrink-0" style={{ color: "rgba(139,92,246,0.6)" }} />
              <p className="text-[11.5px] leading-snug truncate" style={{ color: "rgba(255,255,255,0.48)" }}>{change}</p>
            </motion.div>
          ))}
          {extra > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFull(); }}
              className="text-[10.5px] pl-5 transition-colors hover:text-[rgba(192,155,255,0.8)]"
              style={{ color: "rgba(139,92,246,0.55)" }}
            >
              +{extra} more — view all →
            </button>
          )}
        </div>

        {/* Version badge */}
        <span className="text-[10.5px] font-medium px-2 py-1 rounded-md self-start shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.07)" }}>
          v{notes.version}
        </span>
      </div>
    </motion.div>
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

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

// ── DiagnosticsCard ───────────────────────────────────────────────────────────

interface CriticalEvent {
  ts: string;
  category: string;
  severity: string;
  source: string;
  message: string;
  count?: number;
}

function DiagnosticsCard() {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; path?: string } | null>(null);
  const [events, setEvents] = useState<CriticalEvent[]>([]);
  const [expanded, setExpanded] = useState(false);

  const logsApi = (window as any).electronAPI?.logs;

  useEffect(() => {
    if (!logsApi?.getRecentCritical) return;
    logsApi.getRecentCritical(10)
      .then((data: CriticalEvent[]) => { if (Array.isArray(data)) setEvents(data); })
      .catch(() => {});
  }, []);

  const handleExport = useCallback(async () => {
    if (!logsApi?.exportDiagnostics) {
      toast({ title: 'Not available', description: 'Diagnostic export is only available in the desktop app.' });
      return;
    }
    setExporting(true);
    setExportResult(null);
    try {
      const result = await logsApi.exportDiagnostics(notes);
      setExportResult(result);
      if (result?.ok) {
        toast({
          title: 'Diagnostics exported',
          description: `Saved to your Desktop. Folder opened automatically.`,
        });
        setNotes('');
      } else {
        toast({ title: 'Export failed', description: result?.error ?? 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Export error', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [logsApi, notes, toast]);

  const categoryColor: Record<string, string> = {
    startup_failure:     'text-red-400',
    backend_failure:     'text-red-400',
    auth_failure:        'text-orange-400',
    updater_failure:     'text-yellow-400',
    tweak_failure:       'text-yellow-400',
    renderer_failure:    'text-pink-400',
    performance_warning: 'text-blue-400',
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="size-4 text-muted-foreground" />
          Export Diagnostics
        </CardTitle>
        <CardDescription>
          Package log files and system info into a folder for issue reporting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Recent critical events summary */}
        {events.length > 0 && (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="size-3 text-yellow-500" />
                {events.length} critical event{events.length !== 1 ? 's' : ''} this session
              </p>
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition"
                data-testid="button-toggle-critical-events"
              >
                {expanded ? 'Hide' : 'Show'}
              </button>
            </div>
            {expanded && (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {events.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs" data-testid={`row-critical-event-${i}`}>
                    <span className={`shrink-0 font-mono ${categoryColor[e.category] ?? 'text-muted-foreground'}`}>
                      [{e.category.replace(/_/g, '-')}]
                    </span>
                    <span className="text-foreground/70 break-all">
                      {e.message}
                      {(e.count ?? 1) > 1 && (
                        <span className="text-muted-foreground ml-1">(×{e.count})</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {events.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3 text-green-500/70 shrink-0" />
            No critical events recorded this session.
          </div>
        )}

        {/* Optional user notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Notes for support team <span className="font-normal">(optional)</span>
          </label>
          <Textarea
            placeholder="Describe what you were doing when the issue occurred..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="text-sm h-20 resize-none bg-background/50"
            data-testid="input-diagnostic-notes"
            maxLength={2000}
          />
        </div>

        {/* Export button */}
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            className="w-fit border-border/60"
            onClick={handleExport}
            disabled={exporting}
            data-testid="button-export-diagnostics"
          >
            <FileDown className="size-4 mr-2" />
            {exporting ? 'Exporting…' : 'Export Diagnostics'}
          </Button>
          {exportResult?.ok && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Exported to Desktop. Folder opened automatically.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Exports startup, latest, critical, and backend logs plus a summary to a folder on your Desktop.
          </p>
        </div>

      </CardContent>
    </Card>
  );
}

const SUPPORT_EMAIL = 'switchcontrol67@gmail.com';

// ── ApplicationModeSection ────────────────────────────────────────────────────

function ApplicationModeSection() {
  const { toast } = useToast();
  const mode = useAppModeStore((s) => s.mode);
  const transitioning = useAppModeStore((s) => s.transitioning);
  const dontAskAgain = useAppModeStore((s) => s.dontAskAgain);
  const recommendationShown = useAppModeStore((s) => s.recommendationShown);
  const lastRecommendation = useAppModeStore((s) => s.lastRecommendation);
  const switchModeWithTransition = useAppModeStore((s) => s.switchModeWithTransition);
  const resetRecommendations = useAppModeStore((s) => s.resetRecommendations);

  const selectMode = (target: ApplicationMode) => {
    if (target === mode || transitioning) return;
    switchModeWithTransition(target);
    logHistory(`Settings: Application Mode → ${target === "light" ? "Light" : "Normal"}`, "Settings", "Saved");
    toast({
      title: target === "light" ? "Light Mode enabled" : "Normal Mode restored",
      description:
        target === "light"
          ? "Visual effects reduced and background activity slowed."
          : "Full visual experience and live monitoring restored.",
    });
  };

  const options: { value: ApplicationMode; label: string; desc: string; Icon: typeof Zap }[] = [
    { value: "normal", label: "Normal Mode", desc: "Full visuals, animations and live monitoring.", Icon: Gauge },
    { value: "light", label: "Light Mode", desc: "Minimal effects, slower polling — lowest resource usage.", Icon: Zap },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ value, label, desc, Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              onClick={() => selectMode(value)}
              disabled={transitioning}
              data-testid={`button-mode-${value}`}
              className={`text-left rounded-lg border p-4 transition-colors disabled:opacity-60 ${
                selected
                  ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/10"
                  : "border-[#2A313A] bg-[#12151B] hover:bg-[#1A1F26]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`size-4 ${selected ? "text-[#C09BFF]" : "text-[#6B7380]"}`} />
                <span className={`text-sm font-medium ${selected ? "text-[#E6EAF0]" : "text-[#A0A8B3]"}`}>
                  {label}
                </span>
                {selected && (
                  <span className="ml-auto text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(139,92,246,0.22)", color: "rgba(192,155,255,0.95)" }}>
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </button>
          );
        })}
      </div>

      {lastRecommendation && (
        <p className="text-xs text-muted-foreground" data-testid="text-last-recommendation">
          Last system analysis recommended{" "}
          <span className="text-[#C09BFF]">
            {lastRecommendation.recommendedMode === "light" ? "Light Mode" : "Normal Mode"}
          </span>{" "}
          ({lastRecommendation.confidence}% confidence).
        </p>
      )}

      {(recommendationShown || dontAskAgain) && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Run the system analysis again on next launch.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-border/50"
            data-testid="button-reset-mode-recommendations"
            onClick={() => {
              resetRecommendations();
              toast({
                title: "Recommendations reset",
                description: "SwitchControl will analyse your system again on the next launch.",
              });
            }}
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Reset Recommendations
          </Button>
        </div>
      )}
    </>
  );
}

export default function Settings() {
  const { 
    account, resetData, 
    realtimeMetricsEnabled, setRealtimeMetricsEnabled,
  } = useStore();
  const { toast } = useToast();
  const { isPremium, user, factoryReset } = useAppAuth();
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
  const isAdmin = !!(user as any)?.isAdmin;
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [showPatchNotesModal, setShowPatchNotesModal] = useState(false);

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <AppLayout>
      <Reveal className="space-y-6 max-w-4xl">
        <PageHeader
          icon={SettingsIcon}
          title="Settings"
          subtitle="Manage application preferences and account details."
        />

        <PatchNotesSection onViewFull={() => setShowPatchNotesModal(true)} />
        <PatchNotesModal
          show={showPatchNotesModal}
          onDismiss={() => setShowPatchNotesModal(false)}
        />

        <div className="space-y-6">
          <Reveal delay={0}>
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Configure general app behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Real-time Metrics */}
              <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.11, ease: [0.22, 1, 0.36, 1] }}>
                <div className="flex items-center justify-between py-1 px-2 -mx-2 rounded-lg hover:bg-[#1A1F26] transition-colors">
                  <div className="space-y-0.5">
                    <Label>Real-time Metrics</Label>
                     <p className="text-xs text-muted-foreground">Updates while visible and pauses automatically in the background.</p>
                  </div>
                  <Switch
                    checked={realtimeMetricsEnabled}
                    data-testid="toggle-realtime-metrics"
                    onCheckedChange={(checked) => {
                      setRealtimeMetricsEnabled(checked);
                      toast({ title: checked ? "Live Metrics Enabled" : "Live Metrics Paused", description: checked ? "Dashboard stats updating in real time." : "Stats display is frozen — no polling overhead." });
                      logHistory(`Settings: Real-time Metrics ${checked ? "Enabled" : "Disabled"}`, "Settings", "Saved");
                    }}
                  />
                </div>
                <Separator className="bg-border/50 mt-5" />
              </motion.div>

            </CardContent>
          </Card>
          </Reveal>

          {/* Account Settings */}
          <Reveal delay={0.06}>
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
                <div className="flex items-center justify-between bg-[#1A1F26] border border-[#2A313A] p-3 rounded-md">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-[#A0A8B3]">Free Plan</span>
                    <p className="text-xs text-[#6B7380]">Upgrade to unlock all premium features</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#21262D]"
                    onClick={() => setLicenseModalOpen(true)}
                    data-testid="button-manage-license"
                  >
                    Manage
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </Reveal>

          {/* Software Update — Electron only */}
          {isElectron && (
            <Reveal delay={0.18}>
              <UpdateCard />
            </Reveal>
          )}

          {isPremium && (
            <Reveal delay={0.12}>
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
                    <p className="text-sm text-[#E6EAF0] font-mono select-all" data-testid="text-support-email">{SUPPORT_EMAIL}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[#6B7380] hover:text-[#E6EAF0]"
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
            </Reveal>
          )}

          {/* Data Management */}
          <Reveal delay={0.18}>
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
                      className="border-border/50 hover:bg-muted/50 text-[#E6EAF0]"
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
          </Reveal>

          {/* Diagnostics — export + issue report */}
          {isElectron && (
            <Reveal delay={0.22}>
              <DiagnosticsCard />
            </Reveal>
          )}

          {/* Admin Panel — only visible to admin users */}
          {isAdmin && (
            <Reveal delay={0.24}>
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
              <CardContent className="space-y-3">
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
            </Reveal>
          )}

          {/* Join the Community */}
          <Reveal delay={0.24}>
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>Join the Community</CardTitle>
              <CardDescription>Connect with other gamers and get the latest updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Discord */}
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
                          <span className="font-medium text-[#E6EAF0] group-hover:text-[#5865F2] transition-colors">Discord</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">Get support and share configs</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.button>

                {/* YouTube */}
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    if (isElectron && window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(SOCIAL_LINKS.youtube);
                    } else {
                      window.open(SOCIAL_LINKS.youtube, '_blank');
                    }
                  }}
                  data-testid="link-youtube"
                  className="text-left"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassCard className="p-4 group cursor-pointer hover:border-red-500/30 hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                        <YouTubeIcon className="size-5 text-red-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#E6EAF0] group-hover:text-red-500 transition-colors">YouTube</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">Videos, guides, and updates</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.button>

                {/* TikTok — SwitchTech */}
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    if (isElectron && window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(SOCIAL_LINKS.tiktokSwitchTech);
                    } else {
                      window.open(SOCIAL_LINKS.tiktokSwitchTech, '_blank');
                    }
                  }}
                  data-testid="link-tiktok-switchtech"
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
                          <span className="font-medium text-[#E6EAF0] group-hover:text-pink-500 transition-colors">SwitchTech</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">TikTok · Tips, tricks, and tutorials</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.button>

                {/* TikTok — SwitchControl */}
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    if (isElectron && window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(SOCIAL_LINKS.tiktokSwitchControl);
                    } else {
                      window.open(SOCIAL_LINKS.tiktokSwitchControl, '_blank');
                    }
                  }}
                  data-testid="link-tiktok-switchcontrol"
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
                          <span className="font-medium text-[#E6EAF0] group-hover:text-pink-500 transition-colors">SwitchControl</span>
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground">TikTok · Join the community</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.button>
              </div>
            </CardContent>
          </Card>
          </Reveal>

          {/* Application Mode */}
          <Reveal delay={0.27}>
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-4 text-[#C09BFF]" />
                Application Mode
              </CardTitle>
              <CardDescription>
                Choose how much system power SwitchControl uses. All features stay available in both modes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ApplicationModeSection />
            </CardContent>
          </Card>
          </Reveal>

        </div>
      </Reveal>

      <LicenseManagementModal
        open={licenseModalOpen}
        onOpenChange={setLicenseModalOpen}
        isPremium={isPremium}
        userId={user?.id || ""}
      />
    </AppLayout>
  );
}
