import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { logHistory } from "@/lib/logHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GlassCard } from "@/components/ui/glass-card";
import { Settings as SettingsIcon, RotateCcw, Trash2, FolderOpen, ExternalLink, Mail, Copy, Crown, FileDown, AlertCircle, CheckCircle2, AlertTriangle, Palette, LayoutGrid, Accessibility, Bell, Rocket, ShieldCheck, ChevronRight, Eye, GripVertical, SlidersHorizontal } from "lucide-react";
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
import { ACCENT_COLORS, useUserPreferencesStore, type ThemeMode, type ConfirmationMode } from "@/stores/userPreferencesStore";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

function PreferenceSwitch({ label, description, checked, onChange, testId, status }: {
  label: string; description: string; checked: boolean; onChange: (value: boolean) => void; testId: string;
  status?: "not-active";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-3 -mx-3 rounded-xl hover:bg-white/[0.03] transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm">{label}</Label>
          {status === "not-active" && <span className="text-[9px] uppercase tracking-wide rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">Not yet active</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function PreferenceSelect({ label, description, value, options, onChange, testId }: {
  label: string; description: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="shrink-0 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function PreferenceCard({ icon: Icon, title, description, children, className = "", defaultOpen = false }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode; className?: string; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`bg-card/50 border-border/50 ${className}`}>
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            className="w-full text-left rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
            aria-expanded={open}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpen((value) => !value);
              }
            }}
          >
            <CardHeader className="pb-3 transition-colors hover:bg-white/[0.02]">
              <CardTitle className="flex items-center gap-2 text-base">
                <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                <Icon className="size-4 text-primary" />{title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

const DASHBOARD_LABELS: Record<string, string> = {
  cpu: "CPU", gpu: "GPU", memory: "Memory", storage: "Storage", network: "Network",
  stability: "Stability", problems: "Problems", responsiveness: "System Responsiveness",
};

const SIDEBAR_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard", "/tweaks": "Tweaks", "/network": "Network Tweaks", "/nic-tuning": "NIC Tuning",
  "/power-plan": "Power Plan", "/cleaner": "Cleaner", "/debloat": "Debloat", "/startup": "Startup",
  "/process-manager": "Process Manager", "/ai-advisor": "AI Advisor", "/bios-advisor": "BIOS Advisor",
  "/security": "Security", "/history": "History", "/driver-intel": "Driver Intel",
  "/latency-analyzer": "Latency Analyzer", "/settings": "Settings",
};

function ReorderList({ items, hidden, labels, onToggle, onReorder, testPrefix }: {
  items: string[]; hidden: string[]; labels: Record<string, string>;
  onToggle: (id: string) => void; onReorder: (fromIndex: number, toIndex: number) => void; testPrefix: string;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-1.5">
      {items.map((id, index) => (
        <div
          key={id}
          draggable
          onDragStart={(event) => {
            setDraggedIndex(index);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedIndex !== null && draggedIndex !== index) onReorder(draggedIndex, index);
            setDraggedIndex(null);
          }}
          onDragEnd={() => setDraggedIndex(null)}
          className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-grab active:cursor-grabbing select-none transition-all ${
            hidden.includes(id) ? "border-border/30 opacity-50" : "border-border/60 bg-background/20"
          } ${draggedIndex === index ? "opacity-40 border-primary/60" : "hover:border-primary/40"}`}
          aria-label={`Drag to reorder ${labels[id] || id}`}
          data-testid={`${testPrefix}-reorder-${id.replace(/[^a-z0-9]/gi, "-")}`}
        >
          <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary/80" aria-hidden="true" />
          <button type="button" onClick={() => onToggle(id)} aria-label={`${hidden.includes(id) ? "Show" : "Hide"} ${labels[id]}`}
            data-testid={`${testPrefix}-toggle-${id.replace(/[^a-z0-9]/gi, "-")}`} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground">
            <Eye className="size-3.5" />
          </button>
          <span className="flex-1 text-sm">{labels[id] || id}</span>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground/70">Click and hold a row, then drag it to reorder.</p>
    </div>
  );
}

function CustomizationSettings() {
  const preferences = useUserPreferencesStore();
  const set = preferences.setPreference;
  const { toast } = useToast();
  const clearHistory = useStore((s) => s.clearHistory);
  const exportSettings = () => {
    const settings = Object.fromEntries(Object.entries(preferences).filter(([, value]) => typeof value !== "function"));
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "switchcontrol-settings.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Settings exported", description: "Your local preferences were downloaded." });
  };
  const accentOptions = Object.entries(ACCENT_COLORS) as [Exclude<keyof typeof ACCENT_COLORS, "custom">, string][];
  return (
    <div className="space-y-6">
      <PreferenceCard icon={Palette} title="Appearance" description="Make SwitchControl feel like your workspace. Changes apply instantly and are saved locally." defaultOpen>
        <div className="space-y-4">
          <div>
            <Label>Accent color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {accentOptions.map(([name, color]) => (
                <button key={name} type="button" aria-label={`Use ${name} accent`} data-testid={`accent-${name}`}
                  onClick={() => set("accent", name)}
                  className={`size-8 rounded-full border-2 transition-transform hover:scale-110 ${preferences.accent === name ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: color, boxShadow: preferences.accent === name ? `0 0 16px ${color}88` : undefined }} />
              ))}
              <label className={`flex size-8 cursor-pointer items-center justify-center rounded-full border-2 ${preferences.accent === "custom" ? "border-foreground" : "border-border/70"}`} style={{ background: `conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)` }}>
                <input type="color" value={preferences.customAccent} onChange={(e) => { set("customAccent", e.target.value); set("accent", "custom"); }} className="sr-only" aria-label="Choose custom accent color" />
              </label>
            </div>
          </div>
          <PreferenceSelect label="Theme" description="Choose the surface treatment used throughout the app." value={preferences.theme}
            options={[["dark", "Dark"], ["light", "Light"], ["system", "System"], ["midnight", "Midnight"], ["oled", "OLED Black"], ["contrast", "High Contrast"]].map(([value, label]) => ({ value, label }))}
            onChange={(value) => set("theme", value as ThemeMode)} testId="select-theme" />
          <PreferenceSwitch label="Reduced motion" description="Minimize transitions and animated effects." checked={preferences.reducedMotion} onChange={(v) => set("reducedMotion", v)} testId="toggle-reduced-motion" />
          <PreferenceSwitch label="Disable graph animation" description="Keep live charts updating without animated redraws." checked={preferences.disableGraphAnimation} onChange={(v) => set("disableGraphAnimation", v)} testId="toggle-disable-graph-animation" />
        </div>
      </PreferenceCard>

      <PreferenceCard icon={Accessibility} title="Accessibility" description="Tune readability, contrast, focus, and interaction sizing.">
        <PreferenceSwitch label="Larger text" description="Increase the base application font size." checked={preferences.largerText} onChange={(v) => set("largerText", v)} testId="toggle-larger-text" />
        <PreferenceSwitch label="High contrast controls" description="Increase contrast for borders, labels, and secondary text." checked={preferences.highContrast} onChange={(v) => set("highContrast", v)} testId="toggle-high-contrast" />
        <PreferenceSwitch label="Larger click targets" description="Give buttons and fields more room to operate." checked={preferences.largeTargets} onChange={(v) => set("largeTargets", v)} testId="toggle-large-targets" />
        <PreferenceSwitch label="Color-blind-safe statuses" description="Use a shape and amber distinction alongside red status colors." checked={preferences.colorBlindSafe} onChange={(v) => set("colorBlindSafe", v)} testId="toggle-colorblind-safe" />
        <PreferenceSwitch label="Always show status labels" description="Keep text labels visible beside status indicators." checked={preferences.alwaysShowStatusLabels} onChange={(v) => set("alwaysShowStatusLabels", v)} testId="toggle-status-labels" />
      </PreferenceCard>

      <PreferenceCard icon={LayoutGrid} title="Layout" description="Arrange the navigation rail and dashboard around the information you use most.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label className="mb-2 block">Sidebar items</Label>
            <ReorderList
              items={preferences.sidebarOrder.filter((id) => id !== "/settings")}
              hidden={preferences.sidebarHidden}
              labels={SIDEBAR_LABELS}
              onToggle={preferences.toggleSidebarItem}
              onReorder={(from, to) => {
                const order = preferences.sidebarOrder.filter((id) => id !== "/settings");
                const [moved] = order.splice(from, 1);
                order.splice(to, 0, moved);
                preferences.setSidebarOrder([...order, "/settings"]);
              }}
              testPrefix="sidebar"
            />
            <p className="text-[11px] text-muted-foreground mt-2">Settings is always available so you can recover or reset your layout.</p>
          </div>
          <div>
            <Label className="mb-2 block">Dashboard cards</Label>
            <ReorderList
              items={preferences.dashboardOrder}
              hidden={preferences.dashboardHidden}
              labels={DASHBOARD_LABELS}
              onToggle={preferences.toggleDashboardCard}
              onReorder={(from, to) => {
                const order = [...preferences.dashboardOrder];
                const [moved] = order.splice(from, 1);
                order.splice(to, 0, moved);
                preferences.setDashboardOrder(order);
              }}
              testPrefix="dashboard"
            />
          </div>
        </div>
        <Separator className="my-5 bg-border/40" />
        <PreferenceSwitch label="Large sidebar" description="Use a wider navigation rail for longer labels." checked={preferences.largeSidebar} onChange={(v) => set("largeSidebar", v)} testId="toggle-large-sidebar" />
        <Button variant="outline" size="sm" onClick={() => { if (window.confirm("Reset layout and appearance preferences to their defaults?")) preferences.resetPreferences(); }} data-testid="button-reset-customization"><RotateCcw className="size-3.5 mr-2" />Reset customization</Button>
      </PreferenceCard>

      <PreferenceCard icon={SlidersHorizontal} title="Tweak behavior" description="Control sorting, confirmations, intelligence, and safety checks.">
        <PreferenceSelect label="Confirmation prompts" description="Choose which tweak actions ask before applying." value={preferences.confirmationMode}
          options={[["always", "Every change"], ["risky", "Risky changes only"], ["safe", "Never for safe changes"]].map(([value, label]) => ({ value, label }))}
          onChange={(value) => set("confirmationMode", value as ConfirmationMode)} testId="select-confirmation-mode" />
        <PreferenceSwitch label="Recommended tweaks first" description="Keep the safest recommendations at the top." checked={preferences.showRecommendedFirst} onChange={(v) => set("showRecommendedFirst", v)} testId="toggle-recommended-first" />
        <PreferenceSwitch label="Applied tweaks first" description="Group currently active tweaks above inactive ones." checked={preferences.showAppliedFirst} onChange={(v) => set("showAppliedFirst", v)} testId="toggle-applied-first" />
        <PreferenceSwitch label="Hide unsupported tweaks" description="Remove tweaks that cannot run on this device." checked={preferences.hideUnsupported} onChange={(v) => set("hideUnsupported", v)} testId="toggle-hide-unsupported" />
        <PreferenceSwitch label="Hide advanced tweaks" description="Keep advanced controls out of the default list." checked={preferences.hideAdvanced} onChange={(v) => set("hideAdvanced", v)} testId="toggle-hide-advanced" />
        <PreferenceSwitch label="Show experimental tweaks" description="Include clearly marked experimental options." checked={preferences.showExperimental} onChange={(v) => set("showExperimental", v)} testId="toggle-show-experimental" />
        <PreferenceSwitch label="Expand Performance Intelligence" description="Open the intelligence panel when it becomes available." checked={preferences.expandIntelligence} onChange={(v) => set("expandIntelligence", v)} testId="toggle-expand-intelligence" />
        <PreferenceSwitch label="Refresh intelligence automatically" description="Retry intelligence data after startup and on return." checked={preferences.autoRefreshIntelligence} onChange={(v) => set("autoRefreshIntelligence", v)} testId="toggle-auto-refresh-intelligence" />
        <PreferenceSwitch label="Create restore point" description="Request a Windows restore point before system changes." checked={preferences.createRestorePoint} onChange={(v) => set("createRestorePoint", v)} testId="toggle-create-restore-point" />
        <PreferenceSwitch label="Save registry backup" description="Keep a local backup before registry changes." checked={preferences.saveRegistryBackup} onChange={(v) => set("saveRegistryBackup", v)} testId="toggle-save-registry-backup" />
        <PreferenceSwitch label="Show verification results" description="Display post-change verification details." checked={preferences.showVerification} onChange={(v) => set("showVerification", v)} testId="toggle-show-verification" />
        <PreferenceSwitch label="Retry failed reverts automatically" description="Retry a failed revert during the next eligible check." checked={preferences.autoRevertFailed} onChange={(v) => set("autoRevertFailed", v)} testId="toggle-auto-revert" />
      </PreferenceCard>

      <PreferenceCard icon={Bell} title="Notifications & startup" description="Choose what deserves your attention and how the desktop app opens.">
        <PreferenceSelect label="Metrics refresh" description="Set the live metrics cadence, or pause it completely." value={String(preferences.metricsRefreshSeconds)}
          options={[["0", "Paused"], ["2", "Every 2 seconds"], ["5", "Every 5 seconds"], ["10", "Every 10 seconds"]].map(([value, label]) => ({ value, label }))}
          onChange={(value) => set("metricsRefreshSeconds", Number(value) as 0 | 2 | 5 | 10)} testId="select-metrics-refresh" />
        <PreferenceSwitch label="Tweak notifications" description="Show a confirmation when a tweak is applied or reverted." checked={preferences.showTweakNotifications} onChange={(v) => set("showTweakNotifications", v)} testId="toggle-tweak-notifications" />
        <PreferenceSwitch label="Verification warnings" description="Notify when a system change cannot be verified." checked={preferences.showVerificationWarnings} onChange={(v) => set("showVerificationWarnings", v)} testId="toggle-verification-warnings" />
        <PreferenceSwitch label="Health alerts" description="Show actionable warnings for elevated system pressure." checked={preferences.showHealthAlerts} onChange={(v) => set("showHealthAlerts", v)} testId="toggle-health-alerts" />
        <PreferenceSwitch label="Premium reminders" description="Allow reminders about premium-only optimization tools." checked={preferences.showPremiumReminders} onChange={(v) => set("showPremiumReminders", v)} testId="toggle-premium-reminders" />
        <PreferenceSwitch label="Start with Windows" description="Register the desktop app to launch when Windows starts." checked={preferences.startWithWindows} onChange={(v) => set("startWithWindows", v)} testId="toggle-start-with-windows" />
        <PreferenceSwitch label="Launch minimized" description="Start quietly in the background instead of opening the dashboard." checked={preferences.launchMinimized} onChange={(v) => set("launchMinimized", v)} testId="toggle-launch-minimized" />
        <PreferenceSwitch label="Open Dashboard on startup" description="Return to the dashboard after authentication." checked={preferences.openDashboardOnStartup} onChange={(v) => set("openDashboardOnStartup", v)} testId="toggle-dashboard-startup" />
        <PreferenceSwitch label="Check for updates automatically" description="Allow the desktop app to look for new releases." checked={preferences.autoUpdateChecks} onChange={(v) => set("autoUpdateChecks", v)} testId="toggle-auto-update-checks" />
      </PreferenceCard>

      <PreferenceCard icon={ShieldCheck} title="Privacy & diagnostics" description="Keep control of local diagnostics and optional product context.">
        <PreferenceSwitch label="Anonymous crash reports" description="Share anonymous crash details to help improve stability." checked={preferences.anonymousCrashReports} onChange={(v) => set("anonymousCrashReports", v)} testId="toggle-crash-reports" />
        <PreferenceSwitch label="Share performance diagnostics" description="Allow non-identifying performance diagnostics when support needs them." checked={preferences.sharePerformanceDiagnostics} onChange={(v) => set("sharePerformanceDiagnostics", v)} testId="toggle-performance-sharing" />
        <PreferenceSwitch label="Share hardware context with AI Advisor" description="Include your local CPU, GPU, and memory details in AI requests." checked={preferences.shareAiHardwareContext} onChange={(v) => set("shareAiHardwareContext", v)} testId="toggle-ai-hardware-context" />
        <Separator className="my-4 bg-border/40" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportSettings} data-testid="button-export-settings"><FileDown className="size-3.5 mr-2" />Export settings</Button>
          <Button variant="outline" size="sm" onClick={() => { if (!window.confirm("Clear all local history? This cannot be undone.")) return; clearHistory(); toast({ title: "History cleared", description: "Local activity history was removed." }); }} data-testid="button-clear-local-history" className="text-destructive hover:text-destructive"><Trash2 className="size-3.5 mr-2" />Clear local history</Button>
          <Button variant="outline" size="sm" onClick={() => { if (!window.confirm("Reset all local settings to their defaults?")) return; preferences.resetPreferences(); toast({ title: "Local settings reset", description: "Customization preferences were restored." }); }} data-testid="button-reset-local-settings"><RotateCcw className="size-3.5 mr-2" />Reset local settings</Button>
        </div>
      </PreferenceCard>
    </div>
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
      description: target === "light"
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
  } = useStore(
    useShallow((s) => ({
      account: s.account,
      resetData: s.resetData,
      realtimeMetricsEnabled: s.realtimeMetricsEnabled,
      setRealtimeMetricsEnabled: s.setRealtimeMetricsEnabled,
    })),
  );
  const { toast } = useToast();
  const { isPremium, user, factoryReset } = useAppAuth();
  const resetPreferences = useUserPreferencesStore((s) => s.resetPreferences);
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

          <Reveal delay={0.04}>
            <CustomizationSettings />
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
                        if (!window.confirm("Reset local settings and activity data to their defaults? Your login and premium status will be kept.")) return;
                        resetData();
                        resetPreferences();
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
