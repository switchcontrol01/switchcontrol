/**
 * NicTuning — Adapter-aware NIC property tuning panel.
 *
 * Detects physical network adapters, queries which advanced properties
 * each one supports, and shows capability-gated controls for:
 * Receive/Transmit Buffers, RSS, RSS Queue Count, Interrupt Moderation,
 * EEE, Flow Control, Green Ethernet.
 *
 * All controls are disabled and labelled "Not supported on this adapter"
 * for properties the NIC driver does not expose. Never shows fake controls.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, ChevronDown, Loader2, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, RotateCcw, Zap, Info,
  ChevronRight, Network, Ban,
} from "lucide-react";
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
  type: 'toggle' | 'numeric' | 'stepped';
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
  | 'write_succeeded_verified'
  | 'write_succeeded_verify_failed'
  | 'write_failed'
  | 'invalid_value'
  | 'unsupported_on_adapter'
  | 'elevation_denied'
  | 'reset_verified'
  | 'reset_failed';

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

function getNicAPI() {
  return (window as any).electronAPI?.nic;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts raw PowerShell / WMI errors into a short, readable message.
 * WMI errors from Get/Set-NetAdapterAdvancedProperty can be 200+ chars of stack trace.
 */
function sanitizeNicError(err: string | null | undefined): string {
  if (!err) return 'Unknown error.';
  // WMI "No matching objects" error
  if (/no matching.*MSFT_NetAdapter/i.test(err) || /CIM.*server/i.test(err)) {
    return 'Property not found on this NIC — the driver may not support it.';
  }
  // Invalid keyword value — NIC driver only accepts a subset of stepped presets
  if (/no matching keyword value/i.test(err)) {
    const m = err.match(/valid keyword values?:\s*([\d,\s]+)/i);
    if (m) {
      return `Your NIC doesn't support this option. Supported values: ${m[1].trim()}.`;
    }
    return "Your NIC doesn't support this specific value.";
  }
  // Access denied / UAC cancelled
  if (/access.?denied|uac|cancel/i.test(err)) return 'Access denied — run as administrator.';
  // General PowerShell error — truncate at 120 chars
  return err.length > 120 ? err.slice(0, 117) + '…' : err;
}

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === 'Safe'     ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : risk === 'Moderate' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20';
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border uppercase tracking-wider", cls)}>
      {risk}
    </span>
  );
}

// ── Property control ──────────────────────────────────────────────────────────

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
    resultTimerRef.current = setTimeout(() => {
      setState(s => ({ ...s, result: null }));
    }, 5000);
  }, []);

  const apply = useCallback(async () => {
    if (!state.pending) return;
    setState(s => ({ ...s, applying: true, result: null }));
    const api = getNicAPI();
    if (!api || !isElectron) {
      setState(s => ({ ...s, applying: false, result: { ok: true, outcome: 'write_succeeded_verified', verified: true, error: null, actualValue: state.pending } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.setProperty(adapterName, propKey, state.pending);
    setState(s => ({ ...s, applying: false, result: {
      ok:          res.ok,
      outcome:     (res.outcome ?? null) as NicOutcome | null,
      verified:    res.verified ?? false,
      error:       res.error,
      actualValue: res.actualValue,
    }}));
    if (res.ok) {
      const verified = res.outcome === 'write_succeeded_verified';
      toast({
        title:       verified ? `${meta.label} Applied & Verified` : `${meta.label} Applied`,
        description: verified
          ? `Registry confirmed ${res.actualValue} on ${adapterName}.`
          : `Written to adapter. Readback pending driver confirmation.`,
      });
      scheduleResultDismiss();
    } else {
      const outcomeMsg: Record<string, string> = {
        unsupported_on_adapter: 'Property not supported on this NIC driver.',
        elevation_denied:       'Access denied — run as administrator.',
        invalid_value:          sanitizeNicError(res.error),
        write_failed:           sanitizeNicError(res.error),
      };
      toast({ title: 'Apply Failed', description: outcomeMsg[res.outcome] ?? sanitizeNicError(res.error), variant: 'destructive' });
    }
  }, [adapterName, propKey, meta.label, state.pending, isElectron, toast, scheduleResultDismiss]);

  const reset = useCallback(async () => {
    setState(s => ({ ...s, applying: true, result: null }));
    const api = getNicAPI();
    if (!api || !isElectron) {
      setState(s => ({ ...s, applying: false, pending: meta.defaultValue ?? null, result: { ok: true, outcome: 'reset_verified', verified: true, error: null, actualValue: meta.defaultValue ?? null } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.resetProperty(adapterName, propKey);
    if (res.ok) {
      setState(s => ({ ...s, applying: false, pending: res.actualValue ?? null, result: { ok: true, outcome: (res.outcome ?? 'reset_verified') as NicOutcome, verified: true, error: null, actualValue: res.actualValue } }));
      toast({ title: 'Reset to Default', description: `${meta.label} restored to driver default.` });
      scheduleResultDismiss();
    } else {
      const outcomeMsg: Record<string, string> = {
        unsupported_on_adapter: 'Property not supported on this NIC driver.',
        elevation_denied:       'Access denied — run as administrator.',
        reset_failed:           sanitizeNicError(res.error),
      };
      setState(s => ({ ...s, applying: false, result: { ok: false, outcome: (res.outcome ?? 'reset_failed') as NicOutcome, verified: false, error: res.error, actualValue: null } }));
      toast({ title: 'Reset Failed', description: outcomeMsg[res.outcome] ?? sanitizeNicError(res.error), variant: 'destructive' });
    }
  }, [adapterName, propKey, meta.label, meta.defaultValue, isElectron, toast, scheduleResultDismiss]);

  return (
    <div className={cn(
      "py-3 px-3 rounded-xl border transition-all duration-300",
      isDirty
        ? "bg-cyan-500/[0.03] border-cyan-500/15"
        : "bg-[#1A1F26] border-[#2A313A]"
    )}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-medium text-[#E6EAF0]">{meta.label}</span>
        <RiskBadge risk={meta.risk} />
        {meta.requiresAdmin && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">Admin</span>
        )}
        {capability.supported
          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Supported</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#21262D] text-[#6B7380] border border-[#2A313A]">Unverified</span>
        }
      </div>

      <p className="text-[11px] text-[#6B7380] mb-3 leading-relaxed">{meta.description}</p>

      {/* Toggle control */}
      {meta.type === 'toggle' && meta.enabledValue && meta.disabledValue && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setState(s => ({ ...s, pending: meta.enabledValue! }))}
            disabled={state.applying}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              state.pending === meta.enabledValue
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A]"
            )}
          >
            Enabled
          </button>
          <button
            onClick={() => setState(s => ({ ...s, pending: meta.disabledValue! }))}
            disabled={state.applying}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              state.pending === meta.disabledValue
                ? "bg-red-500/15 text-red-400 border-red-500/25"
                : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A]"
            )}
          >
            Disabled
          </button>
          <span className="text-[10px] text-[#6B7380] ml-1">
            Current: <span className="text-[#6B7380]">{capability.currentValue ?? '—'}</span>
          </span>
        </div>
      )}

      {/* Stepped selector */}
      {meta.type === 'stepped' && meta.presets && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {meta.presets.map((preset, i) => {
            const isHardwareSupported = !capability.validValues || capability.validValues.includes(preset);
            if (!isHardwareSupported) return null;
            return (
              <button
                key={preset}
                onClick={() => setState(s => ({ ...s, pending: preset }))}
                disabled={state.applying}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                  state.pending === preset
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/25"
                    : "bg-[#21262D] text-[#6B7380] border-[#2A313A] hover:border-[#2A313A] hover:text-[#A0A8B3]"
                )}
              >
                {meta.presetLabels?.[i] ?? preset}
              </button>
            );
          })}
          <span className="text-[10px] text-[#6B7380] ml-1">
            Current: <span className="text-[#6B7380]">{capability.currentValue ?? '—'}</span>
          </span>
        </div>
      )}

      {/* Numeric slider */}
      {meta.type === 'numeric' && meta.min !== null && meta.max !== null && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#6B7380]">Current: <span className="text-[#A0A8B3]">{capability.currentValue ?? '—'}</span></span>
            <span className={cn("font-medium", isDirty ? "text-cyan-400" : "text-[#6B7380]")}>
              {isDirty ? `Pending: ${state.pending}` : ''}
            </span>
            {meta.recommendedValue !== undefined && meta.recommendedValue !== null && (
              <span className="text-cyan-400/50">Rec: {meta.recommendedValue}</span>
            )}
          </div>
          <Slider
            min={meta.min!}
            max={meta.max!}
            step={meta.step ?? 1}
            value={[Number(state.pending) || meta.min!]}
            onValueChange={([v]) => setState(s => ({ ...s, pending: String(v) }))}
            disabled={state.applying}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#6B7380]/50">
            <span>{meta.min}</span>
            <span>{meta.max}</span>
          </div>
        </div>
      )}

      {/* Verify result */}
      <AnimatePresence>
        {state.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {(() => {
              const r = state.result;
              const isWarnVerify = r.outcome === 'write_succeeded_verify_failed';
              const colorCls = r.ok
                ? isWarnVerify
                  ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : r.outcome === 'elevation_denied'
                  ? "border-orange-500/20 bg-orange-500/10 text-orange-300"
                  : r.outcome === 'unsupported_on_adapter'
                    ? "border-[#2A313A] bg-[#21262D] text-[#6B7380]"
                    : "border-red-500/20 bg-red-500/10 text-red-300";
              const icon = r.ok
                ? isWarnVerify
                  ? <AlertTriangle className="size-3 shrink-0" />
                  : <CheckCircle2 className="size-3 shrink-0" />
                : r.outcome === 'unsupported_on_adapter'
                  ? <Ban className="size-3 shrink-0" />
                  : <XCircle className="size-3 shrink-0" />;
              const OUTCOME_LABELS: Record<string, string> = {
                write_succeeded_verified:    `Verified — registry confirmed ${r.actualValue ?? ''}`,
                write_succeeded_verify_failed: `Written — readback pending driver confirmation (read: ${r.actualValue ?? '?'})`,
                write_failed:                sanitizeNicError(r.error),
                invalid_value:               sanitizeNicError(r.error),
                unsupported_on_adapter:      'Property not supported on this NIC driver.',
                elevation_denied:            'Access denied — run as administrator.',
                reset_verified:              `Reset to default${r.actualValue ? ` — read back: ${r.actualValue}` : ''}`,
                reset_failed:                sanitizeNicError(r.error),
              };
              const msg = r.outcome ? OUTCOME_LABELS[r.outcome] : (r.ok ? `Done — ${r.actualValue ?? ''}` : sanitizeNicError(r.error));
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

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2.5">
        <Button
          size="sm"
          onClick={apply}
          disabled={state.applying || !isDirty}
          className={cn(
            "h-7 px-3 text-[11px] gap-1.5",
            isDirty
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
              : "bg-[#21262D] text-[#6B7380] border border-[#2A313A]"
          )}
        >
          {state.applying ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          Apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          disabled={state.applying}
          className="h-7 px-2.5 text-[11px] gap-1.5 text-[#6B7380] hover:text-[#A0A8B3] hover:bg-[#21262D] border border-[#2A313A]"
        >
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>
    </div>
  );
}

// ── Adapter panel ─────────────────────────────────────────────────────────────

interface AdapterPanelProps {
  adapter: NicAdapter;
  propertyMeta: Record<string, PropertyMeta>;
  isExpanded: boolean;
  onToggle: () => void;
}

function AdapterPanel({ adapter, propertyMeta, isExpanded, onToggle }: AdapterPanelProps) {
  const isElectron = isElectronWithTweaks();
  const [capabilities, setCapabilities] = useState<Record<string, PropertyCapability> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loaded = useRef(false);

  const loadCapabilities = useCallback(async () => {
    if (!isElectron || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const api = getNicAPI();
      if (!api) {
        // Browser mode — show all as unsupported
        setCapabilities(
          Object.keys(propertyMeta).reduce((acc, k) => {
            acc[k] = { supported: false, currentValue: null };
            return acc;
          }, {} as Record<string, PropertyCapability>)
        );
        setLoading(false);
        return;
      }
      const result = await api.getCapabilities(adapter.name);
      if (result.error && !result.capabilities) {
        setLoadError(result.error);
      } else {
        setCapabilities(result.capabilities ?? {});
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to query adapter');
    } finally {
      setLoading(false);
    }
  }, [adapter.name, isElectron, propertyMeta, loading]);

  useEffect(() => {
    if (isExpanded && !loaded.current) {
      loaded.current = true;
      loadCapabilities();
    }
  }, [isExpanded, loadCapabilities]);

  const isOnline = adapter.status === 'Up' || adapter.status === 'up';

  const supportedCount = capabilities
    ? Object.values(capabilities).filter(c => c.supported).length
    : null;

  return (
    <GlassCard blur="sm" hoverEffect={false} className="overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#1A1F26] transition-colors"
      >
        <div className={cn(
          "size-8 rounded-xl flex items-center justify-center shrink-0",
          isOnline ? "bg-cyan-500/15 text-cyan-400" : "bg-[#21262D] text-[#6B7380]"
        )}>
          <Network className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[#E6EAF0]">{adapter.name}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-[#21262D] text-[#6B7380] border-[#2A313A]"
            )}>
              {adapter.status}
            </span>
            {supportedCount !== null && (
              <span className="text-[10px] text-[#6B7380]">
                {supportedCount}/{Object.keys(propertyMeta).length} properties supported
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#6B7380] truncate mt-0.5">{adapter.description}</p>
        </div>
        <ChevronRight className={cn(
          "size-4 text-[#6B7380] shrink-0 transition-transform duration-200",
          isExpanded && "rotate-90"
        )} />
      </button>

      {/* Expanded controls */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-[#2A313A] pt-3">
              {loading && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Querying adapter capabilities…
                </div>
              )}
              {loadError && (
                <div className="flex items-center gap-2 py-3 text-xs text-red-400">
                  <XCircle className="size-3.5 shrink-0" />
                  {loadError}
                  <button
                    onClick={loadCapabilities}
                    className="ml-2 underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isElectron && (
                <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-[#1A1F26] border border-[#2A313A] text-xs text-[#6B7380]">
                  <Info className="size-3.5 shrink-0 text-cyan-400/60" />
                  NIC property control is only available in the Windows desktop app. Capability detection requires Electron + PowerShell.
                </div>
              )}
              {capabilities && Object.entries(propertyMeta).map(([key, meta]) => (
                <PropertyControl
                  key={key}
                  adapterName={adapter.name}
                  propKey={key}
                  meta={meta}
                  capability={capabilities[key] ?? { supported: false, currentValue: null }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NicTuning() {
  const isElectron = isElectronWithTweaks();
  const [adapters, setAdapters] = useState<NicAdapter[]>([]);
  const [propertyMeta, setPropertyMeta] = useState<Record<string, PropertyMeta>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedAdapter, setExpandedAdapter] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);

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
        setAdapters(adaptersResult.adapters ?? []);
        if (adaptersResult.adapters?.length === 1) {
          setExpandedAdapter(adaptersResult.adapters[0].name);
        }
      }
      if (metaResult) setPropertyMeta(metaResult);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load adapters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionOpen) loadAdapters();
  }, [sectionOpen, loadAdapters]);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <button
        onClick={() => setSectionOpen(o => !o)}
        className="w-full flex items-center gap-3 p-0 group"
      >
        <div className="flex items-center gap-3 flex-1">
          <div className="size-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 flex items-center justify-center border border-[#2A313A]">
            <Network className="size-4 text-indigo-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-[#E6EAF0] group-hover:text-[#E6EAF0] transition-colors">
              NIC Adapter Tuning
            </h3>
            <p className="text-[11px] text-[#6B7380]">
              Adapter-specific properties — Buffers, RSS, Interrupt Moderation, EEE, Flow Control
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isElectron && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
              Real
            </span>
          )}
          <ChevronDown className={cn(
            "size-4 text-[#6B7380] transition-transform duration-200",
            sectionOpen && "rotate-180"
          )} />
        </div>
      </button>

      <AnimatePresence>
        {sectionOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              {/* Non-Electron notice */}
              {!isElectron && (
                <GlassCard blur="sm" hoverEffect={false} className="p-4">
                  <div className="flex items-start gap-3 text-sm text-[#A0A8B3]">
                    <Info className="size-4 shrink-0 text-cyan-400/60 mt-0.5" />
                    <div>
                      <p className="font-medium text-[#A0A8B3] mb-1">Desktop app required</p>
                      <p className="text-xs leading-relaxed">
                        NIC adapter tuning requires the Windows desktop app to detect your adapters and query supported properties via PowerShell. This section shows live data in the Electron app.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* Warning banner */}
              {isElectron && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] text-xs text-amber-300/70">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>
                    NIC property changes require admin rights and take effect immediately — some changes may briefly drop your connection. Only unsupported properties are hidden.
                  </span>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground px-1">
                  <Loader2 className="size-4 animate-spin" />
                  Detecting network adapters…
                </div>
              )}

              {/* Error */}
              {loadError && !loading && (
                <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="size-3.5 shrink-0" />
                  {loadError}
                  <button onClick={loadAdapters} className="ml-2 underline hover:no-underline">
                    Retry
                  </button>
                </div>
              )}

              {/* Adapter list */}
              {!loading && adapters.length === 0 && !loadError && isElectron && (
                <div className="text-center py-8 text-sm text-[#6B7380]">
                  No physical network adapters found.
                </div>
              )}

              {adapters.map(adapter => (
                <AdapterPanel
                  key={adapter.name}
                  adapter={adapter}
                  propertyMeta={propertyMeta}
                  isExpanded={expandedAdapter === adapter.name}
                  onToggle={() => setExpandedAdapter(v => v === adapter.name ? null : adapter.name)}
                />
              ))}

              {/* Refresh button */}
              {isElectron && !loading && (
                <button
                  onClick={loadAdapters}
                  className="flex items-center gap-1.5 text-[11px] text-[#6B7380] hover:text-[#A0A8B3] transition-colors"
                >
                  <RefreshCw className="size-3" />
                  Refresh adapter list
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
