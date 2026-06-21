/**
 * ComponentPanel.tsx
 *
 * Sliding right-hand detail panel for a single component. Shows detected
 * device, installed vs latest version, release notes, benefits, known issues
 * and safety guidance. Action buttons are entitlement-gated:
 *  - premium: full access (open vendor tool / ask AI)
 *  - trial:   read-only (buttons disabled with an upsell hint)
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import {
  X,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Sparkles,
  Lock,
  Info,
  Rocket,
  ClipboardCheck,
} from "lucide-react";
import {
  type DriverComponent,
  type SafetyLevel,
  type UpdateAction,
  HEALTH_META,
} from "@/lib/driver-intel-data";

const SAFETY_META: Record<
  SafetyLevel,
  { label: string; color: string; Icon: React.ElementType; note: string }
> = {
  safe: {
    label: "Safe to update",
    color: "#34d399",
    Icon: ShieldCheck,
    note: "Low-risk update. Reverting is straightforward.",
  },
  caution: {
    label: "Update with care",
    color: "#fbbf24",
    Icon: ShieldAlert,
    note: "Follow the official instructions. Don't interrupt the process.",
  },
  critical: {
    label: "High-impact update",
    color: "#f87171",
    Icon: ShieldX,
    note: "Only proceed if you understand the risks (e.g. BIOS flashing).",
  },
};

interface ComponentPanelProps {
  component: DriverComponent | null;
  readOnly: boolean; // trial users
  onClose: () => void;
  onAction: (action: UpdateAction) => void;
  /** appKey -> installed? (desktop only) to pick the right button label. */
  detectedApps?: Record<string, boolean>;
  onAskAi: (component: DriverComponent) => void;
  /** Log "I updated this" as a restore point (current -> latest). */
  onRecordUpdate?: (component: DriverComponent) => void;
}

export function ComponentPanel({
  component,
  readOnly,
  onClose,
  onAction,
  detectedApps,
  onAskAi,
  onRecordUpdate,
}: ComponentPanelProps) {
  // Lock body scroll and handle Escape when panel is open.
  useEffect(() => {
    if (!component) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKey);
    };
  }, [component, onClose]);

  return (
    <AnimatePresence>
      {component && (
        <>
          {/* Backdrop — starts after the sidebar (left-64 = 256px) so the
              sidebar navigation stays accessible even when the panel is open. */}
          <motion.div
            className="fixed inset-0 left-64 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            data-testid="panel-backdrop"
          />

          {/* Panel — z-[55] sits above the sidebar (z-50) so it renders cleanly
              on top of the content area when it slides in from the right. */}
          <motion.aside
            className="fixed right-0 top-0 z-[55] h-full w-full max-w-md overflow-y-auto border-l border-white/10"
            style={{ background: "rgba(8,11,18,0.97)" }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            data-testid="component-panel"
          >
            <PanelBody
              component={component}
              readOnly={readOnly}
              onClose={onClose}
              onAction={onAction}
              detectedApps={detectedApps}
              onAskAi={onAskAi}
              onRecordUpdate={onRecordUpdate}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function PanelBody({
  component: c,
  readOnly,
  onClose,
  onAction,
  detectedApps,
  onAskAi,
  onRecordUpdate,
}: {
  component: DriverComponent;
  readOnly: boolean;
  onClose: () => void;
  onAction: (action: UpdateAction) => void;
  detectedApps?: Record<string, boolean>;
  onAskAi: (component: DriverComponent) => void;
  onRecordUpdate?: (component: DriverComponent) => void;
}) {
  const health = HEALTH_META[c.health];
  const safety = SAFETY_META[c.safety];
  const SafetyIcon = safety.Icon;

  // Pick the button label: if the vendor's app is detected as installed, show
  // "Open <app>"; otherwise show the download/page label.
  const appInstalled =
    !!c.action?.appKey && !!detectedApps?.[c.action.appKey];
  const actionLabel =
    appInstalled && c.action?.appLabel ? c.action.appLabel : c.action?.label;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {c.title}
          </div>
          <h2 className="text-lg font-semibold mt-1" data-testid="text-panel-device">
            {c.device}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-white/15 bg-white/[0.06] border border-white/10 transition-colors"
          data-testid="button-close-panel"
          aria-label="Close panel (Esc)"
          title="Close (Esc)"
        >
          <X className="size-4.5 text-[#E6EAF0]" />
        </button>
      </div>

      {/* Status pill */}
      <div
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium"
        style={{
          background: `${health.color}1a`,
          color: health.color,
          border: `1px solid ${health.color}55`,
        }}
        data-testid="status-panel-health"
      >
        <span className="size-2 rounded-full" style={{ background: health.color }} />
        {health.label}
      </div>

      {/* Versions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Installed
          </div>
          <div className="text-sm font-medium mt-1 break-words" data-testid="text-current-version">
            {c.current ?? "Not detected"}
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Latest known
          </div>
          <div className="text-sm font-medium mt-1 break-words" data-testid="text-latest-version">
            {c.latest ?? "—"}
          </div>
        </div>
      </div>
      {c.releaseDate && (
        <div className="text-xs text-muted-foreground -mt-3">
          Latest released {c.releaseDate}
        </div>
      )}

      {/* Rationale */}
      <div className="flex gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <Info className="size-4 shrink-0 mt-0.5 text-[#33E0FF]" />
        <p className="text-sm text-muted-foreground leading-relaxed">{c.rationale}</p>
      </div>

      {/* Release notes */}
      {c.releaseNotes && (
        <section>
          <h3 className="text-sm font-semibold mb-2">What's new</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{c.releaseNotes}</p>
        </section>
      )}

      {/* Known issues */}
      {c.knownIssues && c.knownIssues.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Known issues</h3>
          <ul className="space-y-1.5">
            {c.knownIssues.map((k, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-amber-400">•</span>
                {k}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Safety guidance */}
      <div
        className="rounded-xl p-3"
        style={{ background: `${safety.color}12`, border: `1px solid ${safety.color}40` }}
      >
        <div className="flex items-center gap-2 font-medium" style={{ color: safety.color }}>
          <SafetyIcon className="size-4" />
          {safety.label}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">{safety.note}</p>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        {c.action && (
          <ActionButton
            disabled={readOnly}
            primary
            onClick={() => onAction(c.action!)}
            testId="button-open-vendor"
            icon={readOnly ? Lock : appInstalled ? Rocket : ExternalLink}
            label={readOnly ? "Updates are Premium" : actionLabel ?? "Open"}
            note={readOnly ? "Upgrade to act on recommendations." : c.action.note}
          />
        )}
        <ActionButton
          disabled={readOnly}
          onClick={() => onAskAi(c)}
          testId="button-ask-ai"
          icon={readOnly ? Lock : Sparkles}
          label={readOnly ? "AI guidance is Premium" : "Ask the AI Advisor"}
          note={
            readOnly
              ? undefined
              : "Get a plain-language explanation tailored to your system."
          }
        />
        {onRecordUpdate && c.latest && (
          <ActionButton
            disabled={readOnly}
            onClick={() => onRecordUpdate(c)}
            testId="button-log-update"
            icon={readOnly ? Lock : ClipboardCheck}
            label={
              readOnly ? "History is Premium" : `Mark as updated to ${c.latest}`
            }
            note={
              readOnly
                ? undefined
                : "Saves a restore point so you can roll back later."
            }
          />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/70 text-center pt-2">
        SwitchControl never auto-installs or flashes firmware. We only detect and
        open the official manufacturer page.
      </p>
    </div>
  );
}

function ActionButton({
  disabled,
  primary,
  onClick,
  icon: Icon,
  label,
  note,
  testId,
}: {
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  note?: string;
  testId: string;
}) {
  return (
    <div>
      <button
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
        className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed"
        style={
          disabled
            ? { background: "rgba(255,255,255,0.04)", color: "rgba(230,234,240,0.5)", border: "1px solid rgba(255,255,255,0.08)" }
            : primary
              ? { background: "linear-gradient(135deg,#00D4FF,#3b82f6)", color: "#04070d", boxShadow: "0 0 18px rgba(0,212,255,0.35)" }
              : { background: "rgba(255,255,255,0.05)", color: "#E6EAF0", border: "1px solid rgba(255,255,255,0.12)" }
        }
      >
        <Icon className="size-4" />
        {label}
      </button>
      {note && <p className="text-[11px] text-muted-foreground mt-1 text-center">{note}</p>}
    </div>
  );
}
