/**
 * NIC Tuning — standalone top-level page.
 * Moved out of Tweaks, fully free (no premium gating).
 * Rich diagnostics: capability ring, property heatmap, grouped controls,
 * buffer visuals, RSS / power / flow feature status indicators.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { logHistory } from "@/lib/logHistory";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, Loader2, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, RotateCcw, Info, Ban, Wifi, Zap, Activity,
  Server, Shield, ChevronRight, ChevronDown,
  ArrowDownToLine, ArrowUpFromLine, Radio,
} from "lucide-react";
import { useLiveTelemetry, formatKbps } from "@/hooks/useLiveTelemetry";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { isElectronWithTweaks } from "@/hooks/use-tweak-executor";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NicAdapter {
  name: string;
  description: string;
  status: string;
  mediaType: string;
  macAddress: string;
}

interface PropertyCapability {
  supported: boolean;
  currentValue: string | null;
  registryKeyword?: string;
  displayName?: string;
  validValues?: string[] | null;
}

interface PropertyMeta {
  key: string;
  label: string;
  type: "toggle" | "numeric" | "stepped";
  description: string;
  risk: string;
  requiresAdmin: boolean;
  defaultValue?: string | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  recommendedValue?: number | null;
  presets?: string[] | null;
  presetLabels?: string[] | null;
  enabledValue?: string | null;
  disabledValue?: string | null;
}

type NicOutcome =
  | "write_succeeded_verified"
  | "write_succeeded_verify_failed"
  | "write_failed"
  | "invalid_value"
  | "unsupported_on_adapter"
  | "elevation_denied"
  | "reset_verified"
  | "reset_failed";

interface PropertyState {
  pending: string | null;
  applying: boolean;
  result: {
    ok: boolean;
    outcome: NicOutcome | null;
    verified: boolean;
    error: string | null;
    actualValue: string | null;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNicAPI() {
  return (window as any).electronAPI?.nic;
}

function sanitizeNicError(err: string | null | undefined): string {
  if (!err) return "Unknown error.";
  if (/no matching.*MSFT_NetAdapter/i.test(err) || /CIM.*server/i.test(err))
    return "Property not found on this NIC — the driver may not support it.";
  if (/no matching keyword value/i.test(err)) {
    const m = err.match(/valid keyword values?:\s*([\d,\s]+)/i);
    return m
      ? `Your NIC doesn't support this option. Supported values: ${m[1].trim()}.`
      : "Your NIC doesn't support this specific value.";
  }
  if (/access.?denied|uac|cancel/i.test(err)) return "Access denied — run as administrator.";
  return err.length > 120 ? err.slice(0, 117) + "…" : err;
}

// ── Property group config ─────────────────────────────────────────────────────

const PROPERTY_GROUPS: {
  label: string;
  subtitle: string;
  color: string;
  icon: React.ElementType;
  keys: string[];
}[] = [
  {
    label: "Queue & Buffering",
    subtitle: "Ring buffer sizes for receive and transmit paths",
    color: "cyan",
    icon: Activity,
    keys: ["ReceiveBuffers", "TransmitBuffers"],
  },
  {
    label: "CPU Distribution & RSS",
    subtitle: "Receive Side Scaling and queue allocation across cores",
    color: "cyan",
    icon: Server,
    keys: ["RSS", "NumRssQueues"],
  },
  {
    label: "Interrupt & Latency",
    subtitle: "Hardware interrupt coalescing — lower latency vs. lower CPU load",
    color: "amber",
    icon: Zap,
    keys: ["InterruptModeration"],
  },
  {
    label: "Power & Link Behavior",
    subtitle: "Energy efficiency features — disable for lowest latency",
    color: "emerald",
    icon: Shield,
    keys: ["EEE", "GreenEthernet"],
  },
  {
    label: "Flow & Packet Handling",
    subtitle: "Flow control and jumbo frame configuration",
    color: "indigo",
    icon: Network,
    keys: ["FlowControl", "JumboPacket"],
  },
];

const GROUP_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/20",    dot: "bg-cyan-400" },
  violet:  { bg: "bg-[#00D4FF]",  text: "text-[#00D4FF]",  border: "border-[#00D4FF]",  dot: "bg-[#00D4FF]" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20",   dot: "bg-amber-400" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  indigo:  { bg: "bg-indigo-500/10",  text: "text-indigo-400",  border: "border-indigo-500/20",  dot: "bg-indigo-400" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === "Safe"     ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : risk === "Moderate" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
    : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", cls)}>
      {risk}
    </span>
  );
}

// SVG radial capability score ring
function CapabilityRing({ supported, total }: { supported: number; total: number }) {
  const pct = total > 0 ? supported / total : 0;
  const r = 40;
  const stroke = 6;
  const size = (r + stroke) * 2 + 4;
  const circ = 2 * Math.PI * r;
  const scoreColor = pct >= 0.75 ? "#22d3ee" : pct >= 0.5 ? "#a78bfa" : "#f59e0b";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={scoreColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 6px ${scoreColor})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          className="text-xl font-bold tabular-nums leading-none"
          style={{ color: scoreColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {supported}
        </motion.span>
        <span className="text-[10px] text-[#6B7380] leading-none mt-0.5">/ {total}</span>
      </div>
    </div>
  );
}

// Horizontal bar showing buffer value in range
function BufferBar({ value, min, max, label }: { value: number; min: number; max: number; label: string }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-[#6B7380]">
        <span>{label}</span>
        <span className="text-cyan-400 font-mono">{value}</span>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden bg-[#21262D]">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ background: "linear-gradient(90deg, rgba(34,211,238,0.6), rgba(139,92,246,0.8))" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#6B7380]/50">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// Feature status pill (on/off/unknown)
function FeaturePill({
  label,
  value,
  onValue,
  offValue,
}: {
  label: string;
  value: string | null | undefined;
  onValue: string;
  offValue: string;
}) {
  const isOn   = value === onValue;
  const isOff  = value === offValue;
  const isNone = !isOn && !isOff;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium",
      isOn  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : isOff ? "bg-red-500/[0.08] border-red-500/15 text-red-400/80"
      : "bg-[#1A1F26] border-[#2A313A] text-[#6B7380]"
    )}>
      <span className={cn(
        "size-1.5 rounded-full",
        isOn ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]"
        : isOff ? "bg-red-400/60"
        : "bg-[#1A1F26]0"
      )} />
      {label}
    </div>
  );
}

// Property support heatmap strip
function PropertyHeatmap({
  propertyMeta,
  capabilities,
}: {
  propertyMeta: Record<string, PropertyMeta>;
  capabilities: Record<string, PropertyCapability> | null;
}) {
  const entries = Object.entries(propertyMeta);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, meta]) => {
        const cap = capabilities?.[key];
        const supported = cap?.supported ?? false;
        const loading = capabilities === null;
        return (
          <div
            key={key}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-medium transition-all",
              loading
                ? "bg-[#1A1F26] border-[#2A313A] text-[#6B7380]/50 animate-pulse"
                : supported
                ? "bg-cyan-500/[0.08] border-cyan-500/15 text-cyan-400/80"
                : "bg-[#1A1F26] border-[#2A313A] text-[#6B7380]"
            )}
          >
            <span className={cn(
              "size-1.5 rounded-full",
              loading ? "bg-[#2A313A]"
              : supported ? "bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.7)]"
              : "bg-[#2A313A]"
            )} />
            {meta.label.replace(" (EEE)", "").replace(" (RSS)", "").replace("Receive Side Scaling", "RSS")}
          </div>
        );
      })}
    </div>
  );
}

// ── PropertyControl (full implementation, adapted from existing component) ────

interface PropertyControlProps {
  adapterName: string;
  propKey: string;
  meta: PropertyMeta;
  capability: PropertyCapability;
}

function PropertyControl({ adapterName, propKey, meta, capability }: PropertyControlProps) {
  const { toast } = useToast();
  const [state, setState] = useState<PropertyState>({
    pending:  capability.currentValue,
    applying: false,
    result:   null,
  });
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isElectron = isElectronWithTweaks();
  const isDirty = state.pending !== null && state.pending !== capability.currentValue;

  useEffect(() => {
    setState(s => ({ ...s, pending: capability.currentValue }));
  }, [capability.currentValue]);

  const scheduleResultDismiss = useCallback(() => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    resultTimerRef.current = setTimeout(() => setState(s => ({ ...s, result: null })), 5000);
  }, []);

  const apply = useCallback(async () => {
    if (!state.pending) return;
    setState(s => ({ ...s, applying: true, result: null }));
    const api = getNicAPI();
    if (!api || !isElectron) {
      setState(s => ({ ...s, applying: false, result: { ok: true, outcome: "write_succeeded_verified", verified: true, error: null, actualValue: state.pending } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.setProperty(adapterName, propKey, state.pending);
    setState(s => ({ ...s, applying: false, result: { ok: res.ok, outcome: (res.outcome ?? null) as NicOutcome | null, verified: res.verified ?? false, error: res.error, actualValue: res.actualValue } }));
    if (res.ok) {
      const verified = res.outcome === "write_succeeded_verified";
      logHistory(`NIC Tuning: ${meta.label}`, "NIC Tuning", verified ? "Applied & Verified" : "Applied", `${propKey}=${state.pending} on ${adapterName}`);
      toast({ title: verified ? `${meta.label} Applied & Verified` : `${meta.label} Applied`, description: verified ? `Registry confirmed ${res.actualValue} on ${adapterName}.` : `Written to adapter. Readback pending driver confirmation.` });
      scheduleResultDismiss();
    } else {
      const msgs: Record<string, string> = { unsupported_on_adapter: "Property not supported on this NIC driver.", elevation_denied: "Access denied — run as administrator.", invalid_value: sanitizeNicError(res.error), write_failed: sanitizeNicError(res.error) };
      toast({ title: "Apply Failed", description: msgs[res.outcome] ?? sanitizeNicError(res.error), variant: "destructive" });
    }
  }, [adapterName, propKey, meta.label, state.pending, isElectron, toast, scheduleResultDismiss]);

  const reset = useCallback(async () => {
    setState(s => ({ ...s, applying: true, result: null }));
    const api = getNicAPI();
    if (!api || !isElectron) {
      setState(s => ({ ...s, applying: false, pending: meta.defaultValue ?? null, result: { ok: true, outcome: "reset_verified", verified: true, error: null, actualValue: meta.defaultValue ?? null } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.resetProperty(adapterName, propKey);
    if (res.ok) {
      setState(s => ({ ...s, applying: false, pending: res.actualValue ?? null, result: { ok: true, outcome: (res.outcome ?? "reset_verified") as NicOutcome, verified: true, error: null, actualValue: res.actualValue } }));
      logHistory(`NIC Tuning: ${meta.label} Reset`, "NIC Tuning", "Reset to Default", `${propKey} restored to driver default on ${adapterName}`);
      toast({ title: "Reset to Default", description: `${meta.label} restored to driver default.` });
      scheduleResultDismiss();
    } else {
      const msgs: Record<string, string> = { unsupported_on_adapter: "Not supported on this NIC driver.", elevation_denied: "Access denied — run as administrator.", reset_failed: sanitizeNicError(res.error) };
      setState(s => ({ ...s, applying: false, result: { ok: false, outcome: (res.outcome ?? "reset_failed") as NicOutcome, verified: false, error: res.error, actualValue: null } }));
      toast({ title: "Reset Failed", description: msgs[res.outcome] ?? sanitizeNicError(res.error), variant: "destructive" });
    }
  }, [adapterName, propKey, meta.label, meta.defaultValue, isElectron, toast, scheduleResultDismiss]);

  return (
    <div className={cn(
      "py-3 px-3 rounded-xl border transition-all duration-300",
      isDirty ? "bg-cyan-500/[0.03] border-cyan-500/15" : "bg-[#1A1F26] border-[#2A313A]"
    )}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-medium text-[#E6EAF0]">{meta.label}</span>
        <RiskBadge risk={meta.risk} />
        {meta.requiresAdmin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">Admin</span>}
        {capability.supported
          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Supported</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#21262D] text-[#6B7380] border border-[#2A313A]">Unverified</span>
        }
      </div>
      <p className="text-[11px] text-[#6B7380] mb-3 leading-relaxed">{meta.description}</p>

      {meta.type === "toggle" && meta.enabledValue && meta.disabledValue && (
        <div className="flex items-center gap-2">
          <button onClick={() => setState(s => ({ ...s, pending: meta.enabledValue! }))} disabled={state.applying} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", state.pending === meta.enabledValue ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A]")}>Enabled</button>
          <button onClick={() => setState(s => ({ ...s, pending: meta.disabledValue! }))} disabled={state.applying} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", state.pending === meta.disabledValue ? "bg-red-500/15 text-red-400 border-red-500/25" : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A]")}>Disabled</button>
          <span className="text-[10px] text-[#6B7380] ml-1">Current: <span className="text-[#6B7380]">{capability.currentValue ?? "—"}</span></span>
        </div>
      )}

      {meta.type === "stepped" && meta.presets && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {meta.presets.map((preset, i) => {
            const ok = !capability.validValues || capability.validValues.includes(preset);
            if (!ok) return null;
            return (
              <button key={preset} onClick={() => setState(s => ({ ...s, pending: preset }))} disabled={state.applying} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border transition-all", state.pending === preset ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/25" : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A] hover:text-[#A0A8B3]")}>
                {meta.presetLabels?.[i] ?? preset}
              </button>
            );
          })}
          <span className="text-[10px] text-[#6B7380] ml-1">Current: <span className="text-[#6B7380]">{capability.currentValue ?? "—"}</span></span>
        </div>
      )}

      {meta.type === "numeric" && meta.min !== null && meta.max !== null && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#6B7380]">Current: <span className="text-[#A0A8B3]">{capability.currentValue ?? "—"}</span></span>
            {isDirty && <span className="text-cyan-400 font-medium">Pending: {state.pending}</span>}
            {meta.recommendedValue != null && <span className="text-cyan-400/50">Rec: {meta.recommendedValue}</span>}
          </div>
          <Slider min={meta.min!} max={meta.max!} step={meta.step ?? 1} value={[Number(state.pending) || meta.min!]} onValueChange={([v]) => setState(s => ({ ...s, pending: String(v) }))} disabled={state.applying} className="w-full cursor-pointer" />
          <div className="flex justify-between text-[10px] text-[#6B7380]/50">
            <span>{meta.min}</span>
            <span>{meta.max}</span>
          </div>
          {meta.recommendedValue != null && (
            <BufferBar value={Number(state.pending) || meta.min!} min={meta.min!} max={meta.max!} label="Buffer position" />
          )}
        </div>
      )}

      <AnimatePresence>
        {state.result && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            {(() => {
              const r = state.result;
              const isWarn = r.outcome === "write_succeeded_verify_failed";
              const colorCls = r.ok ? isWarn ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : r.outcome === "elevation_denied" ? "border-orange-500/20 bg-orange-500/10 text-orange-300" : r.outcome === "unsupported_on_adapter" ? "border-[#2A313A] bg-[#21262D] text-[#6B7380]" : "border-red-500/20 bg-red-500/10 text-red-300";
              const icon = r.ok ? isWarn ? <AlertTriangle className="size-3 shrink-0" /> : <CheckCircle2 className="size-3 shrink-0" /> : r.outcome === "unsupported_on_adapter" ? <Ban className="size-3 shrink-0" /> : <XCircle className="size-3 shrink-0" />;
              const LABELS: Record<string, string> = { write_succeeded_verified: `Verified — registry confirmed ${r.actualValue ?? ""}`, write_succeeded_verify_failed: `Written — readback pending (read: ${r.actualValue ?? "?"})`, write_failed: sanitizeNicError(r.error), invalid_value: sanitizeNicError(r.error), unsupported_on_adapter: "Property not supported on this NIC driver.", elevation_denied: "Access denied — run as administrator.", reset_verified: `Reset to default${r.actualValue ? ` — read back: ${r.actualValue}` : ""}`, reset_failed: sanitizeNicError(r.error) };
              const msg = r.outcome ? LABELS[r.outcome] : (r.ok ? `Done — ${r.actualValue ?? ""}` : sanitizeNicError(r.error));
              return (
                <div className={cn("flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-lg text-xs border", colorCls)}>
                  {icon}
                  <span className="flex-1">{msg}</span>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 mt-2.5">
        <Button size="sm" onClick={apply} disabled={state.applying || !isDirty} className={cn("h-7 px-3 text-[11px] gap-1.5", isDirty ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30" : "bg-[#21262D] text-[#6B7380] border border-[#2A313A]")}>
          {state.applying ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={state.applying} className="h-7 px-2.5 text-[11px] gap-1.5 text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#21262D] border border-[#2A313A]">
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>
    </div>
  );
}

// ── Property group section ────────────────────────────────────────────────────

function PropertyGroupSection({
  group,
  adapterName,
  propertyMeta,
  capabilities,
}: {
  group: typeof PROPERTY_GROUPS[number];
  adapterName: string;
  propertyMeta: Record<string, PropertyMeta>;
  capabilities: Record<string, PropertyCapability>;
}) {
  const [open, setOpen] = useState(true);
  const col = GROUP_COLORS[group.color];
  const GroupIcon = group.icon;

  const keys = group.keys.filter(k => propertyMeta[k]);
  if (keys.length === 0) return null;

  const supportedInGroup = keys.filter(k => capabilities[k]?.supported).length;

  return (
    <GlassCard blur="sm" hoverEffect={false} className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#1A1F26] transition-colors"
      >
        <div className={cn("size-8 rounded-xl flex items-center justify-center shrink-0 border", col.bg, col.border)}>
          <GroupIcon className={cn("size-4", col.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#E6EAF0]">{group.label}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", col.bg, col.text, col.border)}>
              {supportedInGroup}/{keys.length} supported
            </span>
          </div>
          <p className="text-[11px] text-[#6B7380] mt-0.5">{group.subtitle}</p>
        </div>
        <ChevronDown className={cn("size-4 text-[#6B7380] shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2  pt-3">
              {keys.map(k => (
                <PropertyControl
                  key={k}
                  adapterName={adapterName}
                  propKey={k}
                  meta={propertyMeta[k]}
                  capability={capabilities[k] ?? { supported: false, currentValue: null }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Live Network Throughput Card ──────────────────────────────────────────

function buildSparkPath(
  data: number[],
  w: number,
  h: number,
  padding = 4,
): string {
  if (data.length < 2) return "";
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - padding - ((v / max) * (h - padding * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(" L ")}`;
}

function buildAreaPath(
  data: number[],
  w: number,
  h: number,
  padding = 4,
): string {
  if (data.length < 2) return "";
  const line = buildSparkPath(data, w, h, padding);
  return `${line} L ${w},${h} L 0,${h} Z`;
}

function NetworkThroughputCard({ adapterName }: { adapterName: string }) {
  const { telemetry, history, connected } = useLiveTelemetry();
  const peakRxRef = useRef(0);
  const peakTxRef = useRef(0);
  const [peakRx, setPeakRx] = useState(0);
  const [peakTx, setPeakTx] = useState(0);

  const rxSec   = telemetry?.network?.rx_sec  ?? 0;
  const txSec   = telemetry?.network?.tx_sec  ?? 0;
  const rxKbps  = rxSec / 1024;
  const txKbps  = txSec / 1024;
  const rxHist  = history?.rxKbps ?? [];
  const txHist  = history?.txKbps ?? [];

  useEffect(() => {
    if (rxKbps > peakRxRef.current) { peakRxRef.current = rxKbps; setPeakRx(rxKbps); }
    if (txKbps > peakTxRef.current) { peakTxRef.current = txKbps; setPeakTx(txKbps); }
  }, [rxKbps, txKbps]);

  const W = 500, H = 72;
  const rxLinePath  = buildSparkPath(rxHist, W, H);
  const rxAreaPath  = buildAreaPath(rxHist, W, H);
  const txLinePath  = buildSparkPath(txHist, W, H);
  const txAreaPath  = buildAreaPath(txHist, W, H);

  const rxMbps  = rxSec / (1024 * 1024);
  const txMbps  = txSec / (1024 * 1024);
  const fmtRx   = rxMbps >= 1 ? `${rxMbps.toFixed(2)} MB/s` : formatKbps(rxKbps);
  const fmtTx   = txMbps >= 1 ? `${txMbps.toFixed(2)} MB/s` : formatKbps(txKbps);
  const fmtPkRx = peakRx >= 1024 ? `${(peakRx / 1024).toFixed(2)} MB/s` : formatKbps(peakRx);
  const fmtPkTx = peakTx >= 1024 ? `${(peakTx / 1024).toFixed(2)} MB/s` : formatKbps(peakTx);

  const hasActivity = rxSec > 0 || txSec > 0;

  return (
    <GlassCard blur="sm" hoverEffect={false} className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Activity className="size-3.5 text-cyan-400" />
          </div>
          <span className="text-xs font-semibold text-[#E6EAF0]">Live Network Throughput</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connected
                ? hasActivity
                  ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)] animate-pulse"
                  : "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]"
                : "bg-[#1A1F26]0",
            )}
          />
          <span className={cn("text-[10px] font-medium", connected ? "text-[#6B7380]" : "text-[#6B7380]/50")}>
            {connected ? (hasActivity ? "Active" : "Idle") : "Disconnected"}
          </span>
          <Radio className="size-3 text-[#6B7380]/50" />
          <span className="text-[10px] text-[#6B7380] max-w-[160px] truncate">{adapterName}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-px bg-[#21262D] mx-4 rounded-xl overflow-hidden border border-[#2A313A]">
        {/* Download */}
        <div className="bg-[rgba(10,12,18,0.7)] p-3.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <ArrowDownToLine className="size-3 text-cyan-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">Download</span>
          </div>
          <motion.p
            key={fmtRx}
            className="text-2xl font-bold tabular-nums text-cyan-300 leading-none tracking-tight"
            initial={{ opacity: 0.6, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {fmtRx}
          </motion.p>
          <p className="text-[10px] text-[#6B7380]">
            Peak: <span className="text-[#6B7380]">{fmtPkRx}</span>
          </p>
        </div>
        {/* Upload */}
        <div className="bg-[rgba(10,12,18,0.7)] p-3.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <ArrowUpFromLine className="size-3 text-[#00D4FF]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7380]">Upload</span>
          </div>
          <motion.p
            key={fmtTx}
            className="text-2xl font-bold tabular-nums text-[#33E0FF] leading-none tracking-tight"
            initial={{ opacity: 0.6, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {fmtTx}
          </motion.p>
          <p className="text-[10px] text-[#6B7380]">
            Peak: <span className="text-[#6B7380]">{fmtPkTx}</span>
          </p>
        </div>
      </div>

      {/* Sparkline chart */}
      <div className="relative mx-4 mt-3 mb-4 rounded-xl overflow-hidden border border-[#2A313A]"
        style={{ background: "rgba(8,10,16,0.6)", height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.35)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0)" />
            </linearGradient>
            <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(139,92,246,0.30)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0)" />
            </linearGradient>
          </defs>
          {/* RX area fill */}
          {rxAreaPath && (
            <path d={rxAreaPath} fill="url(#rxGrad)" />
          )}
          {/* TX area fill */}
          {txAreaPath && (
            <path d={txAreaPath} fill="url(#txGrad)" />
          )}
          {/* TX line */}
          {txLinePath && (
            <path
              d={txLinePath}
              fill="none"
              stroke="rgba(139,92,246,0.7)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {/* RX line on top */}
          {rxLinePath && (
            <path
              d={rxLinePath}
              fill="none"
              stroke="rgba(34,211,238,0.9)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 3px rgba(34,211,238,0.6))" }}
            />
          )}
          {/* Idle state label */}
          {!hasActivity && (
            <text x={W / 2} y={H / 2 + 4} textAnchor="middle"
              fill="rgba(255,255,255,0.12)" fontSize="10" fontFamily="monospace">
              No traffic
            </text>
          )}
        </svg>
        {/* Legend */}
        <div className="absolute bottom-2 right-3 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-4 h-px bg-cyan-400/80 inline-block" />
            <span className="text-[9px] text-[#6B7380]">RX</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-px bg-[#00D4FF]/70 inline-block" />
            <span className="text-[9px] text-[#6B7380]">TX</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Adapter overview + diagnostics ───────────────────────────────────────────

function AdapterDiagnostics({
  adapter,
  propertyMeta,
  capabilities,
  capLoading,
}: {
  adapter: NicAdapter;
  propertyMeta: Record<string, PropertyMeta>;
  capabilities: Record<string, PropertyCapability> | null;
  capLoading: boolean;
}) {
  const isOnline = adapter.status === "Up" || adapter.status === "up";
  const total = Object.keys(propertyMeta).length;
  const supported = capabilities ? Object.values(capabilities).filter(c => c.supported).length : 0;

  const rxCap = capabilities?.ReceiveBuffers;
  const txCap = capabilities?.TransmitBuffers;
  const rxMeta = propertyMeta.ReceiveBuffers;
  const txMeta = propertyMeta.TransmitBuffers;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Adapter info card */}
      <GlassCard blur="sm" hoverEffect={false} className="p-4 lg:col-span-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn("size-7 rounded-lg flex items-center justify-center", isOnline ? "bg-cyan-500/15" : "bg-[#21262D]")}>
            <Wifi className={cn("size-3.5", isOnline ? "text-cyan-400" : "text-[#6B7380]")} />
          </div>
          <span className="text-xs font-semibold text-[#E6EAF0]">Adapter Info</span>
        </div>
        <div className="space-y-2">
          {[
            { label: "Interface", value: adapter.name },
            { label: "Description", value: adapter.description },
            { label: "Link State", value: adapter.status },
            { label: "Media Type", value: adapter.mediaType || "—" },
            { label: "MAC Address", value: adapter.macAddress || "—" },
          ].map(row => (
            <div key={row.label} className="flex justify-between gap-2">
              <span className="text-[10px] text-[#6B7380] shrink-0">{row.label}</span>
              <span className="text-[11px] text-[#E6EAF0]/65 text-right font-mono truncate max-w-[60%]">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Feature status pills */}
        {capabilities && (
          <div className="space-y-1.5 pt-1 ">
            <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Feature State</p>
            <div className="flex flex-wrap gap-1.5">
              <FeaturePill label="RSS" value={capabilities.RSS?.currentValue} onValue="1" offValue="0" />
              <FeaturePill label="Int. Mod" value={capabilities.InterruptModeration?.currentValue} onValue="1" offValue="0" />
              <FeaturePill label="EEE" value={capabilities.EEE?.currentValue} onValue="1" offValue="0" />
              <FeaturePill label="Flow Ctrl" value={capabilities.FlowControl?.currentValue} onValue="1" offValue="0" />
              <FeaturePill label="Green Eth" value={capabilities.GreenEthernet?.currentValue} onValue="1" offValue="0" />
            </div>
          </div>
        )}
      </GlassCard>

      {/* Capability ring + heatmap */}
      <GlassCard blur="sm" hoverEffect={false} className="p-4 lg:col-span-2 space-y-4">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-[#00D4FF] flex items-center justify-center">
            <Activity className="size-3.5 text-[#00D4FF]" />
          </div>
          <span className="text-xs font-semibold text-[#E6EAF0]">Property Support Intelligence</span>
        </div>

        <div className="flex items-center gap-6">
          {capLoading ? (
            <div className="size-24 rounded-full border-4 border-[#2A313A] flex items-center justify-center animate-pulse">
              <Loader2 className="size-5 text-[#6B7380]/50 animate-spin" />
            </div>
          ) : (
            <CapabilityRing supported={supported} total={total} />
          )}
          <div className="flex-1 space-y-1.5">
            <p className="text-sm font-medium text-[#E6EAF0]">
              {capLoading ? "Querying adapter…" : `${supported} of ${total} properties supported`}
            </p>
            <p className="text-[11px] text-[#6B7380] leading-relaxed">
              {capLoading
                ? "Detecting which advanced properties your NIC driver exposes…"
                : supported >= total * 0.75
                ? "Excellent driver coverage — full tuning suite available."
                : supported >= total * 0.5
                ? "Partial coverage — some advanced controls may be unavailable."
                : "Limited coverage — this driver exposes few tunable properties."}
            </p>
            {!capLoading && capabilities && (
              <div className="flex gap-3 text-[10px] text-[#6B7380] pt-1">
                <span className="text-cyan-400">{supported} supported</span>
                <span>·</span>
                <span>{total - supported} unsupported</span>
              </div>
            )}
          </div>
        </div>

        {/* Heatmap */}
        <div className="space-y-2  pt-3">
          <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Property Coverage</p>
          <PropertyHeatmap propertyMeta={propertyMeta} capabilities={capabilities} />
        </div>

        {/* Buffer bars — only if both are supported + loaded */}
        {capabilities && rxCap?.supported && rxMeta?.min != null && rxMeta?.max != null && (
          <div className="space-y-2  pt-3">
            <p className="text-[10px] text-[#6B7380] uppercase tracking-wider">Buffer Allocation</p>
            <div className="grid grid-cols-2 gap-3">
              {rxCap.supported && rxMeta && rxMeta.min != null && rxMeta.max != null && (
                <BufferBar value={Number(rxCap.currentValue) || rxMeta.min!} min={rxMeta.min!} max={rxMeta.max!} label="Receive Buffers" />
              )}
              {txCap?.supported && txMeta && txMeta.min != null && txMeta.max != null && (
                <BufferBar value={Number(txCap.currentValue) || txMeta.min!} min={txMeta.min!} max={txMeta.max!} label="Transmit Buffers" />
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NicTuningPage() {
  const isElectron = isElectronWithTweaks();
  const [adapters, setAdapters] = useState<NicAdapter[]>([]);
  const [propertyMeta, setPropertyMeta] = useState<Record<string, PropertyMeta>>({});
  const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, PropertyCapability> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const capLoadedRef = useRef<Set<string>>(new Set());

  const loadAdapters = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const api = getNicAPI();
      if (!api) {
        setAdapters([]);
        setLoading(false);
        return;
      }
      const [adaptersResult, metaResult] = await Promise.all([
        api.getAdapters(),
        api.getPropertyMeta(),
      ]);
      if (adaptersResult.error && adaptersResult.adapters?.length === 0) {
        setLoadError(adaptersResult.error);
      } else {
        const list: NicAdapter[] = adaptersResult.adapters ?? [];
        setAdapters(list);
        if (list.length > 0) {
          setSelectedAdapter(list[0].name);
        }
      }
      if (metaResult) setPropertyMeta(metaResult);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load adapters");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCapabilities = useCallback(async (adapterName: string) => {
    if (capLoadedRef.current.has(adapterName)) return;
    setCapLoading(true);
    setCapError(null);
    setCapabilities(null);
    try {
      const api = getNicAPI();
      if (!api) {
        setCapabilities({});
        setCapLoading(false);
        return;
      }
      const result = await api.getCapabilities(adapterName);
      if (result.error && !result.capabilities) {
        setCapError(result.error);
      } else {
        setCapabilities(result.capabilities ?? {});
        capLoadedRef.current.add(adapterName);
      }
    } catch (e) {
      setCapError(e instanceof Error ? e.message : "Failed to query adapter capabilities");
    } finally {
      setCapLoading(false);
    }
  }, []);

  // Load adapters on mount
  useEffect(() => {
    loadAdapters();
  }, [loadAdapters]);

  // Load capabilities when adapter selection changes
  useEffect(() => {
    if (selectedAdapter) {
      setCapabilities(null);
      capLoadedRef.current.delete(selectedAdapter);
      loadCapabilities(selectedAdapter);
    }
  }, [selectedAdapter, loadCapabilities]);

  const activeAdapter = adapters.find(a => a.name === selectedAdapter) ?? null;
  const isOnline = activeAdapter?.status === "Up" || activeAdapter?.status === "up";

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── Hero strip ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="relative rounded-2xl overflow-hidden border border-[#2A313A] p-5"
            style={{
              background: "linear-gradient(135deg, rgba(0,190,255,0.06) 0%, rgba(139,92,246,0.08) 50%, rgba(7,9,13,0) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Ambient glow */}
            <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(0,190,255,0.10) 0%, transparent 70%)", filter: "blur(40px)" }} />
            <div className="absolute -bottom-10 right-0 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)", filter: "blur(40px)" }} />

            <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="size-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/10 border border-[#2A313A] flex items-center justify-center shrink-0">
                  <Network className="size-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-lg font-bold text-[#E6EAF0] tracking-tight">NIC Tuning</h1>
                  </div>
                  <p className="text-[12px] text-[#A0A8B3] mt-0.5">
                    Advanced Network Adapter Control Center — Buffers · RSS · Interrupt Moderation · Power
                  </p>
                </div>
              </div>

              {/* Live status strip */}
              {activeAdapter && (
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className={cn("size-1.5 rounded-full", isOnline ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.9)]" : "bg-[#1A1F26]0")} />
                      <span className={cn("text-xs font-medium", isOnline ? "text-emerald-400" : "text-[#6B7380]")}>{activeAdapter.status}</span>
                    </div>
                    <p className="text-[10px] text-[#6B7380] mt-0.5 truncate max-w-[200px]">{activeAdapter.name}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <span className="text-xs font-mono text-[#A0A8B3]">{adapters.length}</span>
                    <p className="text-[10px] text-[#6B7380]">adapter{adapters.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Non-Electron notice ─────────────────────────────────────────────── */}
        {!isElectron && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <GlassCard blur="sm" hoverEffect={false} className="p-4">
              <div className="flex items-start gap-3 text-sm text-[#A0A8B3]">
                <Info className="size-4 shrink-0 text-cyan-400/60 mt-0.5" />
                <div>
                  <p className="font-medium text-[#A0A8B3] mb-1">Desktop app required</p>
                  <p className="text-xs leading-relaxed">
                    NIC adapter tuning requires the Windows desktop app to detect your adapters and query supported properties via PowerShell. All controls and diagnostics shown here are live data from the Electron app.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── Loading state ────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center gap-2.5 py-6 text-sm text-[#6B7380]">
            <Loader2 className="size-4 animate-spin text-cyan-400/60" />
            Detecting network adapters…
          </div>
        )}

        {/* ── Load error ───────────────────────────────────────────────────────── */}
        {loadError && !loading && (
          <GlassCard blur="sm" hoverEffect={false} className="p-4">
            <div className="flex items-center gap-2 text-xs text-red-400">
              <XCircle className="size-4 shrink-0" />
              <span className="flex-1">{loadError}</span>
              <button onClick={loadAdapters} className="underline hover:no-underline text-[#6B7380] hover:text-[#A0A8B3]">Retry</button>
            </div>
          </GlassCard>
        )}

        {/* ── Adapter selector tabs (multiple adapters only) ──────────────────── */}
        {adapters.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex gap-2 flex-wrap"
          >
            {adapters.map(adapter => {
              const on = adapter.status === "Up" || adapter.status === "up";
              const isSelected = adapter.name === selectedAdapter;
              return (
                <button
                  key={adapter.name}
                  onClick={() => setSelectedAdapter(adapter.name)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                    isSelected
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                      : "bg-[#1A1F26] border-[#2A313A] text-[#A0A8B3] hover:bg-[#21262D] hover:text-[#E6EAF0]"
                  )}
                >
                  <span className={cn("size-1.5 rounded-full shrink-0", on ? "bg-emerald-400" : "bg-[#1A1F26]0")} />
                  {adapter.name}
                </button>
              );
            })}
            <button
              onClick={() => { capLoadedRef.current.clear(); loadAdapters(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#2A313A] text-xs text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#21262D] transition-all ml-auto"
            >
              <RefreshCw className="size-3" />
              Refresh
            </button>
          </motion.div>
        )}

        {/* Single adapter + refresh */}
        {adapters.length === 1 && (
          <div className="flex justify-end">
            <button
              onClick={() => { capLoadedRef.current.clear(); loadAdapters(); }}
              className="flex items-center gap-1.5 text-[11px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
            >
              <RefreshCw className="size-3" />
              Refresh adapter list
            </button>
          </div>
        )}

        {/* ── No adapters found (Electron mode) ──────────────────────────────── */}
        {isElectron && !loading && adapters.length === 0 && !loadError && (
          <GlassCard blur="sm" hoverEffect={false} className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="size-10 rounded-xl bg-[#21262D] flex items-center justify-center">
              <Network className="size-5 text-[#6B7380]/50" />
            </div>
            <p className="text-sm text-[#6B7380]">No physical network adapters found.</p>
            <button onClick={loadAdapters} className="text-xs text-cyan-400/60 hover:text-cyan-400 underline">Retry detection</button>
          </GlassCard>
        )}

        {/* ── Main content — shown when adapter is selected ───────────────────── */}
        {activeAdapter && (
          <motion.div
            key={activeAdapter.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {/* Admin warning */}
            {isElectron && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] text-xs text-amber-300/70">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>
                  NIC property changes require admin rights and take effect immediately — some changes may briefly interrupt your connection. Only unsupported properties are hidden.
                </span>
              </div>
            )}

            {/* Cap query error */}
            {capError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <XCircle className="size-3.5 shrink-0" />
                <span className="flex-1">{capError}</span>
                <button onClick={() => loadCapabilities(activeAdapter.name)} className="underline hover:no-underline">Retry</button>
              </div>
            )}

            {/* Overview + diagnostics */}
            <AdapterDiagnostics
              adapter={activeAdapter}
              propertyMeta={propertyMeta}
              capabilities={capabilities}
              capLoading={capLoading}
            />

            {/* Live throughput graph */}
            <NetworkThroughputCard adapterName={activeAdapter.name} />

            {/* Property groups — only render once capabilities are loaded */}
            {capabilities && Object.keys(propertyMeta).length > 0 && (
              <div className="space-y-3">
                {PROPERTY_GROUPS.map(group => (
                  <PropertyGroupSection
                    key={group.label}
                    group={group}
                    adapterName={activeAdapter.name}
                    propertyMeta={propertyMeta}
                    capabilities={capabilities}
                  />
                ))}

                {/* Uncategorised fallback — any keys not in any group */}
                {(() => {
                  const covered = new Set(PROPERTY_GROUPS.flatMap(g => g.keys));
                  const leftover = Object.keys(propertyMeta).filter(k => !covered.has(k));
                  if (leftover.length === 0) return null;
                  return (
                    <GlassCard blur="sm" hoverEffect={false} className="p-4 space-y-3">
                      <p className="text-xs font-semibold text-[#A0A8B3]">Additional Properties</p>
                      <div className="space-y-2">
                        {leftover.map(k => (
                          <PropertyControl
                            key={k}
                            adapterName={activeAdapter.name}
                            propKey={k}
                            meta={propertyMeta[k]}
                            capability={capabilities[k] ?? { supported: false, currentValue: null }}
                          />
                        ))}
                      </div>
                    </GlassCard>
                  );
                })()}
              </div>
            )}

            {/* Capability loading skeleton for property groups */}
            {capLoading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-[#1A1F26] border border-[#2A313A] animate-pulse" />
                ))}
              </div>
            )}
          </motion.div>
        )}

      </div>
    </AppLayout>
  );
}
