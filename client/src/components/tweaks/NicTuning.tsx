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
  ChevronRight, Network,
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

interface PropertyState {
  pending: string | null;
  applying: boolean;
  result: { ok: boolean; error: string | null; actualValue: string | null } | null;
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
      setState(s => ({ ...s, applying: false, result: { ok: true, error: null, actualValue: state.pending } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.setProperty(adapterName, propKey, state.pending);
    setState(s => ({ ...s, applying: false, result: { ok: res.ok, error: res.error, actualValue: res.actualValue } }));
    if (res.ok) {
      toast({ title: `${meta.label} Applied`, description: `Set to ${state.pending} on ${adapterName}.` });
      scheduleResultDismiss();
    } else {
      toast({ title: 'Apply Failed', description: sanitizeNicError(res.error) ?? 'Could not set property.', variant: 'destructive' });
    }
  }, [adapterName, propKey, meta.label, state.pending, isElectron, toast, scheduleResultDismiss]);

  const reset = useCallback(async () => {
    setState(s => ({ ...s, applying: true, result: null }));
    const api = getNicAPI();
    if (!api || !isElectron) {
      setState(s => ({ ...s, applying: false, pending: meta.defaultValue ?? null, result: { ok: true, error: null, actualValue: meta.defaultValue ?? null } }));
      scheduleResultDismiss();
      return;
    }
    const res = await api.resetProperty(adapterName, propKey);
    if (res.ok) {
      setState(s => ({ ...s, applying: false, pending: res.actualValue ?? null, result: { ok: true, error: null, actualValue: res.actualValue } }));
      toast({ title: 'Reset to Default', description: `${meta.label} restored to driver default.` });
      scheduleResultDismiss();
    } else {
      setState(s => ({ ...s, applying: false, result: { ok: false, error: res.error, actualValue: null } }));
      toast({ title: 'Reset Failed', description: sanitizeNicError(res.error) ?? 'Could not reset.', variant: 'destructive' });
    }
  }, [adapterName, propKey, meta.label, meta.defaultValue, isElectron, toast, scheduleResultDismiss]);

  if (!capability.supported) {
    return (
      <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 font-medium">{meta.label}</span>
          <RiskBadge risk={meta.risk} />
        </div>
        <span className="text-[10px] text-white/20 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          Not supported on this adapter
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "py-3 px-3 rounded-xl border transition-all duration-300",
      isDirty
        ? "bg-cyan-500/[0.03] border-cyan-500/15"
        : "bg-white/[0.03] border-white/[0.06]"
    )}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-medium text-white/80">{meta.label}</span>
        <RiskBadge risk={meta.risk} />
        {meta.requiresAdmin && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">Admin</span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Supported</span>
      </div>

      <p className="text-[11px] text-white/35 mb-3 leading-relaxed">{meta.description}</p>

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
                : "bg-white/[0.04] text-white/40 border-white/[0.08] hover:border-white/20"
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
                : "bg-white/[0.04] text-white/40 border-white/[0.08] hover:border-white/20"
            )}
          >
            Disabled
          </button>
          <span className="text-[10px] text-white/25 ml-1">
            Current: <span className="text-white/40">{capability.currentValue ?? '—'}</span>
          </span>
        </div>
      )}

      {/* Stepped selector */}
      {meta.type === 'stepped' && meta.presets && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {meta.presets.map((preset, i) => (
            <button
              key={preset}
              onClick={() => setState(s => ({ ...s, pending: preset }))}
              disabled={state.applying}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                state.pending === preset
                  ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/25"
                  : "bg-white/[0.04] text-white/40 border-white/[0.08] hover:border-white/20 hover:text-white/60"
              )}
            >
              {meta.presetLabels?.[i] ?? preset}
            </button>
          ))}
          <span className="text-[10px] text-white/25 ml-1">
            Current: <span className="text-white/40">{capability.currentValue ?? '—'}</span>
          </span>
        </div>
      )}

      {/* Numeric slider */}
      {meta.type === 'numeric' && meta.min !== null && meta.max !== null && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-white/30">Current: <span className="text-white/60">{capability.currentValue ?? '—'}</span></span>
            <span className={cn("font-medium", isDirty ? "text-cyan-400" : "text-white/30")}>
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
          <div className="flex justify-between text-[10px] text-white/20">
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
            <div className={cn(
              "flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-lg text-xs border",
              state.result.ok
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/20 bg-red-500/10 text-red-300"
            )}>
              {state.result.ok
                ? <CheckCircle2 className="size-3 shrink-0" />
                : <XCircle className="size-3 shrink-0" />}
              <span className="flex-1">
                {state.result.ok
                  ? `Verified${state.result.actualValue ? ` — read back: ${state.result.actualValue}` : ''}`
                  : sanitizeNicError(state.result.error)}
              </span>
            </div>
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
              : "bg-white/5 text-white/25 border border-white/[0.06]"
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
          className="h-7 px-2.5 text-[11px] gap-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 border border-white/[0.04]"
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
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className={cn(
          "size-8 rounded-xl flex items-center justify-center shrink-0",
          isOnline ? "bg-cyan-500/15 text-cyan-400" : "bg-white/[0.06] text-white/30"
        )}>
          <Network className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white/90">{adapter.name}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-white/[0.06] text-white/30 border-white/[0.08]"
            )}>
              {adapter.status}
            </span>
            {supportedCount !== null && (
              <span className="text-[10px] text-white/30">
                {supportedCount}/{Object.keys(propertyMeta).length} properties supported
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/30 truncate mt-0.5">{adapter.description}</p>
        </div>
        <ChevronRight className={cn(
          "size-4 text-white/30 shrink-0 transition-transform duration-200",
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
            <div className="px-4 pb-4 space-y-2 border-t border-white/[0.05] pt-3">
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
                <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/40">
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
          <div className="size-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 flex items-center justify-center border border-white/[0.08]">
            <Network className="size-4 text-indigo-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">
              NIC Adapter Tuning
            </h3>
            <p className="text-[11px] text-white/30">
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
            "size-4 text-white/30 transition-transform duration-200",
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
                  <div className="flex items-start gap-3 text-sm text-white/50">
                    <Info className="size-4 shrink-0 text-cyan-400/60 mt-0.5" />
                    <div>
                      <p className="font-medium text-white/60 mb-1">Desktop app required</p>
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
                <div className="text-center py-8 text-sm text-white/30">
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
                  className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/50 transition-colors"
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
