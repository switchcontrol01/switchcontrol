import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore, refreshEntitlements, triggerFlowReset } from "@/lib/auth-store";

const AUTH_DOMAIN = "https://switchcontrol.org";

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  provider: string;
  isPremium: boolean;
  plan: string | null;
  effectivePlan: "free" | "trial" | "trial_expired" | "premium";
  isActive: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDurationHours: number | null;
  trialGrantedByAdminId: string | null;
  trialReason: string | null;
  hasUsedTrial: boolean;
  isAdmin: boolean;
  stripeCustomerId: string | null;
  premiumActivatedAt: string | null;
  lastLoginAt: string | null;
  lastAppActiveAt: string | null;
  hasInstalledApp: boolean;
  hasSeenPremiumUnlock: boolean;
  hasSeenPremiumTour: boolean;
  createdAt: string | null;
  premiumBoundDeviceId: string | null;
  premiumBoundAt: string | null;
}

interface AdminLog {
  id: string;
  adminUserId: string;
  targetUserId: string;
  action: string;
  previousValue: any;
  newValue: any;
  metadata: any;
  createdAt: string;
}

function buildHeaders(): HeadersInit {
  const jwt = useAuthStore.getState().jwt;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
  try {
    const m = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    if (m) headers["x-csrf-token"] = decodeURIComponent(m[1]);
  } catch {}
  return headers;
}

function fmt(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  const now = new Date();
  const diff = now.getTime() - dt.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function fmtFull(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function trialMsRemaining(endsAt: string | null): number {
  if (!endsAt) return -1;
  return new Date(endsAt).getTime() - Date.now();
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    premium: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    trial: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    trial_expired: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    free: "bg-white/5 text-white/40 border-white/10",
  };
  const labels: Record<string, string> = {
    premium: "Premium",
    trial: "Trial",
    trial_expired: "Trial Expired",
    free: "Free",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[plan] ?? styles.free}`}>
      {labels[plan] ?? plan}
    </span>
  );
}

function TrialCountdown({ endsAt }: { endsAt: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return null;
  const ms = trialMsRemaining(endsAt);
  if (ms <= 0) return <span className="text-orange-400 text-xs font-medium">Expired</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const d = Math.floor(h / 24);
  if (ms < 3600000) return <span className="text-red-400 text-xs font-semibold animate-pulse">{m}m left — ends soon!</span>;
  if (d > 0) return <span className="text-cyan-400 text-xs">{d}d {h % 24}h left</span>;
  return <span className="text-yellow-400 text-xs">{h}h {m}m left</span>;
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

function ConfirmModal({ title, description, confirmLabel = "Confirm", danger, onConfirm, onClose, loading, error }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(7,9,13,0.97) 100%)" }}
      >
        <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
        <div className="text-sm text-white/55 mb-5">{description}</div>
        {error && (
          <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            data-testid="button-modal-confirm"
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              danger
                ? "bg-red-600/25 border-red-500/35 text-red-300 hover:bg-red-600/40"
                : "bg-violet-600/25 border-violet-500/35 text-violet-200 hover:bg-violet-600/40"
            }`}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete User Modal ────────────────────────────────────────────────────────

function DeleteUserModal({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirm === (user.email || user.id);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: buildHeaders() as any,
        body: JSON.stringify({ confirm: true }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to delete");
      onDeleted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-red-500/20 p-6 shadow-2xl"
        style={{ background: "linear-gradient(145deg, rgba(239,68,68,0.05) 0%, rgba(7,9,13,0.97) 100%)" }}
      >
        <h3 className="text-base font-semibold text-red-300 mb-1">Delete User</h3>
        <p className="text-sm text-white/50 mb-4">
          This will permanently delete <strong className="text-white/80">{user.displayName}</strong> and all their associated data. This action cannot be undone.
        </p>
        <label className="block text-xs text-white/40 mb-1.5">
          Type <span className="font-mono text-white/60">{user.email || user.id}</span> to confirm
        </label>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          data-testid="input-delete-confirm"
          placeholder={user.email || user.id || ""}
          className="w-full rounded-lg bg-white/5 border border-red-500/20 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-red-500/50 transition-colors mb-4"
        />
        {error && (
          <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canDelete || loading}
            data-testid="button-delete-confirm"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border bg-red-600/25 border-red-500/35 text-red-300 hover:bg-red-600/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting…" : "Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Set Plan Dialog ──────────────────────────────────────────────────────────

type PlanOption = "free" | "trial" | "premium";

const TRIAL_PRESETS = [
  { label: "1m", hours: 1 / 60 },
  { label: "30m", hours: 0.5 },
  { label: "1h", hours: 1 },
  { label: "1 Day", hours: 24 },
  { label: "3 Days", hours: 72 },
];

function SetPlanDialog({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: (u: AdminUser) => void }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>(
    (["free", "trial", "premium"].includes(user.effectivePlan as any) ? user.effectivePlan : "free") as PlanOption
  );
  const [trialPreset, setTrialPreset] = useState<number>(72);
  const [customHours, setCustomHours] = useState<string>("72");
  const [useCustom, setUseCustom] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trialHours = useCustom ? (parseFloat(customHours) || 1 / 60) : trialPreset;
  const trialHoursInt = Math.max(1 / 60, Math.round(trialHours * 10000) / 10000);

  const previewEnd = selectedPlan === "trial"
    ? new Date(Date.now() + trialHours * 3600000)
    : null;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body: any = { plan: selectedPlan, reason: reason || undefined };
      if (selectedPlan === "trial") body.trialDurationHours = trialHoursInt;
      const r = await fetch(`/api/admin/users/${user.id}/plan`, {
        method: "PATCH",
        headers: buildHeaders() as any,
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onSuccess(data.user);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(10,7,28,0.95) 100%)" }}
      >
        <h3 className="text-lg font-semibold text-white mb-1">Set Plan</h3>
        <p className="text-sm text-white/50 mb-5">{user.displayName}</p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {(["free", "trial", "premium"] as PlanOption[]).map((p) => (
            <button
              key={p}
              data-testid={`plan-option-${p}`}
              onClick={() => setSelectedPlan(p)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium border transition-all ${
                selectedPlan === p
                  ? p === "premium" ? "bg-violet-500/30 border-violet-400/50 text-violet-200"
                  : p === "trial" ? "bg-cyan-500/30 border-cyan-400/50 text-cyan-200"
                  : "bg-white/15 border-white/20 text-white"
                  : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {selectedPlan === "trial" && (
          <div className="mb-4 space-y-3">
            <label className="block text-xs text-white/50">Trial Duration</label>
            <div className="grid grid-cols-5 gap-2">
              {TRIAL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  data-testid={`trial-preset-${p.label}`}
                  onClick={() => { setTrialPreset(p.hours); setUseCustom(false); }}
                  className={`rounded-lg px-2 py-2 text-xs font-medium border transition-all ${
                    !useCustom && trialPreset === p.hours
                      ? "bg-cyan-500/25 border-cyan-400/45 text-cyan-200"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUseCustom(true)}
                className={`text-xs rounded-lg px-3 py-1.5 border transition-all ${
                  useCustom ? "bg-cyan-500/20 border-cyan-400/35 text-cyan-300" : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                }`}
              >
                Custom
              </button>
              {useCustom && (
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  data-testid="input-custom-hours"
                  placeholder="Hours"
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-500/60 transition-colors"
                />
              )}
            </div>
            {previewEnd && (
              <p className="text-xs text-white/35">
                Expires: <span className="text-cyan-300/70">{fmtFull(previewEnd)}</span>
              </p>
            )}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs text-white/50 mb-1.5">Reason (optional)</label>
          <input
            type="text"
            placeholder="Support request, compensation, test…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="input-reason"
            maxLength={500}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            data-testid="button-confirm-plan"
            onClick={submit}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all disabled:opacity-50 bg-violet-600/30 border-violet-500/40 text-violet-200 hover:bg-violet-600/40`}
          >
            {loading ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reset Flags Dialog ───────────────────────────────────────────────────────

function ResetFlagsDialog({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: (u: AdminUser) => void }) {
  const [onboarding, setOnboarding] = useState(false);
  const [premiumTour, setPremiumTour] = useState(false);
  const [premiumUnlock, setPremiumUnlock] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noneSelected = !onboarding && !premiumTour && !premiumUnlock;

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/reset-flags`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({ onboarding, premiumTour, premiumUnlock, reason: reason || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onSuccess(data.user);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(7,9,13,0.97) 100%)" }}
      >
        <h3 className="text-base font-semibold text-white mb-1">Reset User Flags</h3>
        <p className="text-sm text-white/45 mb-4">{user.displayName}</p>

        <div className="space-y-3 mb-4">
          {[
            { label: "Reset Onboarding State", hint: "Clears premiumFirstSeenAt", val: onboarding, set: setOnboarding, id: "onboarding" },
            { label: "Reset Premium Tour", hint: "hasSeenPremiumTour → false", val: premiumTour, set: setPremiumTour, id: "premiumTour" },
            { label: "Reset Premium Unlock Screen", hint: "hasSeenPremiumUnlock → false", val: premiumUnlock, set: setPremiumUnlock, id: "premiumUnlock" },
          ].map((f) => (
            <label key={f.id} className="flex items-start gap-3 cursor-pointer group">
              <div
                onClick={() => f.set(!f.val)}
                data-testid={`checkbox-${f.id}`}
                className={`mt-0.5 w-4 h-4 rounded border transition-colors flex-shrink-0 cursor-pointer ${
                  f.val ? "bg-violet-500 border-violet-400" : "bg-white/5 border-white/20 group-hover:border-white/40"
                }`}
              >
                {f.val && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4 -mt-0 -ml-0 text-white">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm text-white/75">{f.label}</p>
                <p className="text-xs text-white/30">{f.hint}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mb-4">
          <label className="block text-xs text-white/40 mb-1.5">Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Re-testing onboarding flow"
            maxLength={500}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={noneSelected || loading}
            data-testid="button-confirm-reset-flags"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border bg-violet-600/20 border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "Resetting…" : "Reset Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extend Trial Modal ───────────────────────────────────────────────────────

function ExtendTrialModal({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: (u: AdminUser) => void }) {
  const [extraHours, setExtraHours] = useState(1);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewEnd = user.trialEndsAt
    ? new Date(Math.max(Date.now(), new Date(user.trialEndsAt).getTime()) + extraHours * 3600000)
    : new Date(Date.now() + extraHours * 3600000);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/extend-trial`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({ extraHours, reason: reason || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onSuccess(data.user);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(7,9,13,0.97) 100%)" }}
      >
        <h3 className="text-base font-semibold text-white mb-1">Extend Trial</h3>
        <p className="text-sm text-white/45 mb-4">{user.displayName}</p>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {[0.5, 1, 24, 72].map((h) => (
            <button
              key={h}
              onClick={() => setExtraHours(h)}
              className={`rounded-lg px-2 py-2 text-xs font-medium border transition-all ${
                extraHours === h ? "bg-cyan-500/25 border-cyan-400/40 text-cyan-200" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
              }`}
            >
              {h < 1 ? `${h * 60}m` : h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <label className="block text-xs text-white/40 mb-1.5">Custom hours</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={extraHours}
            onChange={(e) => setExtraHours(parseFloat(e.target.value) || 1)}
            data-testid="input-extend-hours"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60 transition-colors"
          />
          <p className="text-xs text-white/30 mt-1">New end: <span className="text-cyan-300/60">{fmtFull(previewEnd)}</span></p>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-white/40 mb-1.5">Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Support extension"
            maxLength={500}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {error && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            data-testid="button-confirm-extend"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border bg-cyan-600/20 border-cyan-500/30 text-cyan-300 hover:bg-cyan-600/30 transition-all disabled:opacity-50"
          >
            {loading ? "Extending…" : "Extend"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Trial Grant ────────────────────────────────────────────────────────

function QuickTrialButton({ label, hours, userId, onSuccess }: { label: string; hours: number; userId: string; onSuccess: (u: AdminUser) => void }) {
  const [loading, setLoading] = useState(false);

  const grant = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${userId}/set-trial`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({ durationHours: hours }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      onSuccess(data.user);
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={grant}
      disabled={loading}
      data-testid={`button-quick-trial-${label}`}
      className="rounded-lg px-3 py-1.5 text-xs font-medium border border-cyan-500/25 bg-cyan-500/10 text-cyan-300/80 hover:bg-cyan-500/20 hover:text-cyan-200 transition-all disabled:opacity-50"
    >
      {loading ? "…" : `+${label}`}
    </button>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 items-start">
      <span className="text-white/40 flex-shrink-0">{label}</span>
      <span className={`text-white/75 text-right truncate max-w-xs ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ─── User Detail Panel ────────────────────────────────────────────────────────

function UserDetailPanel({ user, logs, onClose, onPlanUpdated, onDeleted }: {
  user: AdminUser;
  logs: AdminLog[];
  onClose: () => void;
  onPlanUpdated: (u: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const [localUser, setLocalUser] = useState(user);
  const [localLogs, setLocalLogs] = useState(logs);
  const [showSetPlan, setShowSetPlan] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [showResetFlags, setShowResetFlags] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [settingAdmin, setSettingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Confirm-modal state
  const [confirm, setConfirm] = useState<null | {
    title: string; description: React.ReactNode; action: () => Promise<void>; danger?: boolean; confirmLabel?: string;
  }>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => { setLocalUser(user); setLocalLogs(logs); }, [user, logs]);

  const update = (u: AdminUser) => { setLocalUser(u); onPlanUpdated(u); };

  const runConfirmed = async () => {
    if (!confirm) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      await confirm.action();
      setConfirm(null);
    } catch (e: any) {
      setConfirmError(e.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const postAction = async (url: string, body?: any) => {
    const r = await fetch(url, {
      method: "POST",
      headers: buildHeaders() as any,
      body: JSON.stringify(body ?? {}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed");
    if (data.user) update(data.user);
  };

  const revokeTrial = () => setConfirm({
    title: "Revoke Trial",
    description: <>Revoke active trial for <strong className="text-white/80">{localUser.displayName}</strong>? They will immediately lose access.</>,
    confirmLabel: "Revoke Trial",
    danger: true,
    action: async () => { await postAction(`/api/admin/users/${localUser.id}/revoke-trial`); },
  });

  const resetTrial = () => setConfirm({
    title: "Reset Trial Fields",
    description: <>Clear all trial data for <strong className="text-white/80">{localUser.displayName}</strong>? This resets hasUsedTrial and all trial timestamps.</>,
    confirmLabel: "Reset Trial",
    danger: true,
    action: async () => { await postAction(`/api/admin/users/${localUser.id}/reset-trial`); },
  });

  const revertToFree = () => setConfirm({
    title: "Revert to Free",
    description: <>Set <strong className="text-white/80">{localUser.displayName}</strong> to Free plan? This will revoke premium and any active trial immediately.</>,
    confirmLabel: "Revert to Free",
    danger: true,
    action: async () => {
      const r = await fetch(`/api/admin/users/${localUser.id}/revert-plan`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({ plan: "free" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      if (data.user) update(data.user);
    },
  });

  const upgradePremium = () => setConfirm({
    title: "Upgrade to Premium",
    description: <>Grant permanent premium access to <strong className="text-white/80">{localUser.displayName}</strong>?</>,
    confirmLabel: "Grant Premium",
    action: async () => {
      const r = await fetch(`/api/admin/users/${localUser.id}/revert-plan`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({ plan: "premium" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      if (data.user) update(data.user);
    },
  });

  const resetDeviceLock = () => setConfirm({
    title: "Reset Device Lock",
    description: (
      <>
        Clear the device binding for <strong className="text-white/80">{localUser.displayName}</strong>?
        {localUser.premiumBoundDeviceId && (
          <span className="block mt-1 text-xs text-white/40 font-mono">{localUser.premiumBoundDeviceId}</span>
        )}
        {" "}Their premium will re-bind to whichever machine they next log in from.
      </>
    ),
    confirmLabel: "Clear Device Lock",
    danger: true,
    action: async () => {
      const r = await fetch(`/api/admin/users/${localUser.id}/reset-premium-device`, {
        method: "POST",
        headers: buildHeaders() as any,
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      update({ ...localUser, premiumBoundDeviceId: null, premiumBoundAt: null });
    },
  });

  const toggleAdmin = async () => {
    setSettingAdmin(true);
    setAdminError(null);
    try {
      const r = await fetch(`/api/admin/users/${localUser.id}/admin-status`, {
        method: "PATCH",
        headers: buildHeaders() as any,
        body: JSON.stringify({ isAdmin: !localUser.isAdmin }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      update(data.user);
    } catch (e: any) {
      setAdminError(e.message);
    } finally {
      setSettingAdmin(false);
    }
  };

  const { effectivePlan } = localUser;
  const isActiveTrial = effectivePlan === "trial";
  const isExpiredTrial = effectivePlan === "trial_expired" || (localUser.plan === "trial" && localUser.trialEndsAt && new Date(localUser.trialEndsAt) <= new Date());

  return (
    <>
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1" onClick={onClose} />
        <div
          className="w-full max-w-md h-full overflow-y-auto border-l border-white/8 shadow-2xl"
          style={{ background: "linear-gradient(180deg, rgba(20,12,45,0.98) 0%, rgba(7,9,13,0.99) 100%)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/8 sticky top-0 z-10"
            style={{ background: "rgba(10,7,28,0.95)", backdropFilter: "blur(12px)" }}>
            <h3 className="text-base font-semibold text-white">User Detail</h3>
            <button onClick={onClose} data-testid="button-close-detail"
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4 pb-12">
            {/* Identity */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-semibold text-sm flex-shrink-0">
                  {(localUser.displayName || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{localUser.displayName}</p>
                  <p className="text-xs text-white/40 truncate">{localUser.email || "No email"}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <PlanBadge plan={localUser.effectivePlan} />
                    {localUser.isAdmin && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">Admin</span>}
                    <span className="text-xs text-white/30 capitalize">{localUser.provider}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Details */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Plan Details</p>
              <div className="space-y-2.5 text-sm">
                <Row label="Effective Plan" value={<PlanBadge plan={localUser.effectivePlan} />} />
                <Row label="DB Plan" value={localUser.plan || "—"} />
                <Row label="Stripe Premium" value={localUser.isPremium ? "Yes" : "No"} />
                <Row label="Stripe ID" value={localUser.stripeCustomerId || "—"} mono />
                <Row label="Used Trial Before" value={localUser.hasUsedTrial ? "Yes" : "No"} />
              </div>
            </div>

            {/* Trial Panel */}
            {(isActiveTrial || isExpiredTrial || localUser.plan === "trial") && (
              <div className={`rounded-xl border p-4 ${isActiveTrial ? "border-cyan-500/20" : "border-orange-500/15"}`}
                style={{ background: isActiveTrial ? "rgba(6,182,212,0.04)" : "rgba(251,146,60,0.04)" }}>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Trial Status</p>
                <div className="space-y-2.5 text-sm">
                  <Row label="Status" value={<TrialCountdown endsAt={localUser.trialEndsAt} />} />
                  <Row label="Started" value={fmtFull(localUser.trialStartedAt)} />
                  <Row label="Ends" value={fmtFull(localUser.trialEndsAt)} />
                  <Row label="Duration" value={localUser.trialDurationHours != null ? `${localUser.trialDurationHours}h` : "—"} />
                  {localUser.trialReason && <Row label="Reason" value={localUser.trialReason} />}
                </div>
                {isActiveTrial && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button onClick={() => setShowExtend(true)} data-testid="button-extend-trial"
                      className="text-xs rounded-lg px-3 py-1.5 border border-cyan-500/25 bg-cyan-500/10 text-cyan-300/80 hover:bg-cyan-500/20 transition-all">
                      Extend
                    </button>
                    <button onClick={revokeTrial} data-testid="button-revoke-trial"
                      className="text-xs rounded-lg px-3 py-1.5 border border-red-500/20 bg-red-500/8 text-red-400/70 hover:bg-red-500/15 transition-all">
                      Revoke
                    </button>
                    <button onClick={resetTrial} data-testid="button-reset-trial"
                      className="text-xs rounded-lg px-3 py-1.5 border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 transition-all">
                      Reset Fields
                    </button>
                  </div>
                )}
                {isExpiredTrial && (
                  <div className="mt-3">
                    <button onClick={resetTrial} data-testid="button-reset-expired-trial"
                      className="text-xs rounded-lg px-3 py-1.5 border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 transition-all">
                      Clear Trial Data
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Device Binding — visible for all users who have (or had) a bound device,
                regardless of current plan. Trial users can inherit a stale binding from
                a previous premium period; admins need to see and clear it in those cases. */}
            {(localUser.isPremium || localUser.premiumBoundDeviceId) && (
              <div className={`rounded-xl border p-4 ${localUser.premiumBoundDeviceId ? "border-amber-500/20" : "border-white/8"}`}
                style={{ background: localUser.premiumBoundDeviceId ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Device Lock</p>
                  {localUser.premiumBoundDeviceId && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300/80 font-medium">Locked</span>
                  )}
                </div>
                <div className="space-y-2.5 text-sm">
                  <Row label="Bound Device ID" value={localUser.premiumBoundDeviceId ? <span className="font-mono text-amber-300/80">{localUser.premiumBoundDeviceId}</span> : <span className="text-white/30">None</span>} />
                  <Row label="Bound At" value={localUser.premiumBoundAt ? fmtFull(localUser.premiumBoundAt) : "—"} />
                </div>
                {localUser.premiumBoundDeviceId && (
                  <div className="mt-3">
                    <button onClick={resetDeviceLock} data-testid="button-reset-device-lock"
                      className="text-xs rounded-lg px-3 py-1.5 border border-amber-500/25 bg-amber-500/10 text-amber-300/80 hover:bg-amber-500/20 transition-all">
                      Clear Device Lock
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Activity */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Activity</p>
              <div className="space-y-2.5 text-sm">
                <Row label="Last Login" value={fmtFull(localUser.lastLoginAt)} />
                <Row label="Last App Active" value={fmtFull(localUser.lastAppActiveAt)} />
                <Row
                  label="App Installed"
                  value={
                    localUser.hasInstalledApp
                      ? <span className="text-green-400 text-xs font-medium">Yes</span>
                      : <span className="text-white/30 text-xs">No</span>
                  }
                />
                <Row label="Member Since" value={fmtFull(localUser.createdAt)} />
                <Row label="User ID" value={localUser.id} mono />
              </div>
            </div>

            {/* Quick Trial Grants */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Quick Trial Grant</p>
              <div className="flex gap-2 flex-wrap">
                {TRIAL_PRESETS.map((p) => (
                  <QuickTrialButton key={p.label} label={p.label} hours={p.hours} userId={localUser.id} onSuccess={update} />
                ))}
              </div>
            </div>

            {/* Main Actions */}
            <div className="space-y-2">
              <button onClick={() => setShowSetPlan(true)} data-testid="button-set-plan"
                className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-violet-600/22 border border-violet-500/30 text-violet-200 hover:bg-violet-600/32 transition-all">
                Set Plan
              </button>

              {effectivePlan !== "premium" && (
                <button onClick={upgradePremium} data-testid="button-upgrade-premium"
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-violet-500/15 border border-violet-400/25 text-violet-300 hover:bg-violet-500/22 transition-all">
                  Upgrade to Premium
                </button>
              )}

              {(effectivePlan === "premium" || effectivePlan === "trial") && (
                <button onClick={revertToFree} data-testid="button-revert-free"
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:bg-orange-500/18 transition-all">
                  Revert to Free
                </button>
              )}

              <button onClick={() => setShowResetFlags(true)} data-testid="button-reset-flags"
                className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-white/5 border border-white/10 text-white/55 hover:bg-white/10 hover:text-white/75 transition-all">
                Reset Flags
              </button>

              <button
                onClick={toggleAdmin}
                disabled={settingAdmin}
                data-testid="button-toggle-admin"
                className={`w-full rounded-xl px-4 py-3 text-sm font-medium border transition-all disabled:opacity-50 ${
                  localUser.isAdmin
                    ? "bg-orange-500/15 border-orange-500/25 text-orange-300 hover:bg-orange-500/22"
                    : "bg-white/5 border-white/10 text-white/55 hover:bg-white/10 hover:text-white/75"
                }`}
              >
                {settingAdmin ? "Updating…" : localUser.isAdmin ? "Revoke Admin" : "Grant Admin"}
              </button>

              {adminError && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{adminError}</p>}

              <button onClick={() => setShowDelete(true)} data-testid="button-delete-user"
                className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-red-500/8 border border-red-500/15 text-red-400/60 hover:bg-red-500/15 hover:text-red-300 transition-all mt-1">
                Delete User
              </button>
            </div>

            {/* Flags */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Flags</p>
              <div className="space-y-2.5 text-sm">
                <Row label="Seen Unlock Screen" value={localUser.hasSeenPremiumUnlock ? "Yes" : "No"} />
                <Row label="Seen Premium Tour" value={localUser.hasSeenPremiumTour ? "Yes" : "No"} />
              </div>
            </div>

            {/* Admin Logs */}
            <div className="rounded-xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Recent Admin Actions</p>
              {localLogs.length === 0 ? (
                <p className="text-xs text-white/25 italic">No admin actions recorded for this user.</p>
              ) : (
                <div className="space-y-2.5">
                  {localLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-white/70 font-medium">{log.action.replace(/_/g, " ")}</span>
                        {log.metadata?.reason && <span className="text-white/30"> — {log.metadata.reason}</span>}
                        <p className="text-white/25 mt-0.5">{fmtFull(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {showSetPlan && <SetPlanDialog user={localUser} onClose={() => setShowSetPlan(false)} onSuccess={update} />}
      {showExtend && <ExtendTrialModal user={localUser} onClose={() => setShowExtend(false)} onSuccess={update} />}
      {showResetFlags && <ResetFlagsDialog user={localUser} onClose={() => setShowResetFlags(false)} onSuccess={update} />}
      {showDelete && (
        <DeleteUserModal
          user={localUser}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onClose(); onDeleted(localUser.id); }}
        />
      )}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={runConfirmed}
          onClose={() => { setConfirm(null); setConfirmError(null); }}
          loading={confirmLoading}
          error={confirmError}
        />
      )}
    </>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, jwt } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<AdminLog[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Device lock lookup
  const [deviceLookupId, setDeviceLookupId] = useState("");
  const [deviceLookupResult, setDeviceLookupResult] = useState<AdminUser | null>(null);
  const [deviceLookupError, setDeviceLookupError] = useState<string | null>(null);
  const [deviceLookupLoading, setDeviceLookupLoading] = useState(false);

  const lookupByDeviceId = async () => {
    const id = deviceLookupId.trim();
    if (!id) return;
    setDeviceLookupLoading(true);
    setDeviceLookupError(null);
    setDeviceLookupResult(null);
    try {
      const r = await fetch(`/api/admin/devices/by-device-id/${encodeURIComponent(id)}`, { headers: buildHeaders() as any });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Not found");
      setDeviceLookupResult(data.user);
    } catch (e: any) {
      setDeviceLookupError(e.message);
    } finally {
      setDeviceLookupLoading(false);
    }
  };

  const checkAdmin = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/me", { headers: buildHeaders() as any });
      setAuthorized(r.ok);
    } catch { setAuthorized(false); }
  }, []);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);

  const fetchUsers = useCallback(async (p: number, s: string, plan: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "30" });
      if (s) params.set("search", s);
      if (plan) params.set("plan", plan);
      const r = await fetch(`/api/admin/users?${params}`, { headers: buildHeaders() as any });
      if (!r.ok) throw new Error("Failed to fetch users");
      const data = await r.json();
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized === true) fetchUsers(page, search, planFilter);
  }, [authorized, page, planFilter]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); fetchUsers(1, value, planFilter); }, 350);
  };

  const openUserDetail = async (u: AdminUser) => {
    setSelectedUser(u);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, { headers: buildHeaders() as any });
      if (r.ok) { const data = await r.json(); setSelectedUser(data.user); setSelectedLogs(data.logs || []); }
    } catch {}
  };

  const handlePlanUpdated = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    if (selectedUser?.id === updated.id) setSelectedUser(updated);
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.id === updated.id) {
      // ── Immediate auth-store patch ──────────────────────────────────────────
      // The admin grant response comes from the same DB connection that just
      // wrote the new plan, so serializeUser(updated) is always correct. We
      // apply it directly to the auth store so the AppFlow/unlock animation
      // triggers instantly — without waiting for a separate /api/me round-trip
      // that may hit a different DB connection and see a stale snapshot.
      const isActive = updated.effectivePlan === "premium" || updated.effectivePlan === "trial";
      useAuthStore.getState().setUser({
        ...currentUser,
        isPremium:             isActive && updated.effectivePlan === "premium",
        plan:                  updated.effectivePlan ?? updated.plan ?? (isActive ? "premium" : "free"),
        trialEndsAt:           updated.trialEndsAt ?? null,
        isAdmin:               updated.isAdmin,
        hasSeenPremiumUnlock:  updated.hasSeenPremiumUnlock,
        hasSeenPremiumTour:    updated.hasSeenPremiumTour,
      });

      // Signal App.tsx to clear all session-level animation guards so the
      // AppFlow re-evaluates the new state immediately.
      triggerFlowReset();

      // Background confirmation fetch — refreshes any fields not in AdminUser
      // (e.g. hasSeenTrialActivation) and re-syncs in case of edge-case drift.
      refreshEntitlements();
    }
  };

  const handleDeleted = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setSelectedUser(null);
    setSelectedLogs([]);
    setTotal((t) => t - 1);
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07090D" }}>
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#07090D" }}>
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-white">Admin Access Required</h1>
        <p className="text-sm text-white/40">
          {user ? "Your account does not have admin privileges." : "Please log in with an admin account."}
        </p>
        <a href="/" className="text-violet-400 text-sm hover:text-violet-300 transition-colors mt-2">← Back to home</a>
      </div>
    );
  }

  const planOptions = [
    { value: "", label: "All Plans" },
    { value: "premium", label: "Premium" },
    { value: "trial", label: "Trial" },
    { value: "free", label: "Free" },
  ];

  return (
    <div className="min-h-screen text-white" style={{ background: "#07090D" }}>
      {/* Header */}
      <div className="border-b border-white/8 px-6 py-4 sticky top-0 z-20"
        style={{ background: "rgba(7,9,13,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-white/50 hover:text-white transition-colors text-sm">SwitchControl</a>
            <span className="text-white/20">/</span>
            <span className="text-white font-semibold">Admin</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">
              Internal
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <span className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
            {total.toLocaleString()} users
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search + Filter */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="input-search-users"
              className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            data-testid="select-plan-filter"
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/70 outline-none focus:border-violet-500/50 cursor-pointer appearance-none pr-8"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "20px" }}
          >
            {planOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => fetchUsers(page, search, planFilter)}
            data-testid="button-refresh-users"
            className="rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Device Lock Lookup */}
        <div className="mb-6 rounded-xl border border-amber-500/20 p-4" style={{ background: "rgba(245,158,11,0.04)" }}>
          <p className="text-xs font-semibold text-amber-300/60 uppercase tracking-wider mb-3">Device Lock Lookup</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste device ID (e.g. 29818AA82C374727)…"
              value={deviceLookupId}
              onChange={(e) => setDeviceLookupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupByDeviceId()}
              data-testid="input-device-lookup"
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white font-mono placeholder-white/25 outline-none focus:border-amber-500/50 transition-colors"
            />
            <button
              onClick={lookupByDeviceId}
              disabled={deviceLookupLoading || !deviceLookupId.trim()}
              data-testid="button-device-lookup"
              className="rounded-xl px-4 py-2 text-sm font-medium bg-amber-500/15 border border-amber-500/25 text-amber-300/80 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deviceLookupLoading ? "…" : "Find"}
            </button>
          </div>
          {deviceLookupError && (
            <p className="mt-2 text-xs text-red-400">{deviceLookupError}</p>
          )}
          {deviceLookupResult && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-white">{deviceLookupResult.displayName}</p>
                <p className="text-xs text-white/40">{deviceLookupResult.email || deviceLookupResult.id}</p>
              </div>
              <button
                onClick={() => { setSelectedUser(deviceLookupResult); setSelectedLogs([]); }}
                data-testid="button-open-device-user"
                className="text-xs rounded-lg px-3 py-1.5 border border-amber-500/25 bg-amber-500/10 text-amber-300/80 hover:bg-amber-500/20 transition-all"
              >
                Open User
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-white/8 overflow-hidden"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
          <div className="grid grid-cols-[1fr_140px_150px_150px_100px_80px] gap-4 px-5 py-3 border-b border-white/6">
            {["User", "Plan", "Last Login", "Last App", "App?", ""].map((h) => (
              <span key={h} className="text-xs font-semibold text-white/35 uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-white/30">
              {search ? "No users match your search." : "No users yet."}
            </div>
          ) : (
            users.map((u, i) => (
              <div
                key={u.id}
                data-testid={`row-user-${u.id}`}
                className={`grid grid-cols-[1fr_140px_150px_150px_100px_80px] gap-4 px-5 py-3.5 items-center hover:bg-white/4 transition-colors cursor-pointer ${
                  i !== users.length - 1 ? "border-b border-white/5" : ""
                }`}
                onClick={() => openUserDetail(u)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-300 font-semibold text-xs flex-shrink-0">
                    {(u.displayName || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white/85 truncate">{u.displayName}</p>
                    <p className="text-xs text-white/30 truncate">{u.email || "—"}</p>
                  </div>
                  {u.isAdmin && (
                    <span className="flex-shrink-0 text-xs bg-orange-500/15 text-orange-300 border border-orange-500/25 rounded-full px-1.5 py-0.5">Admin</span>
                  )}
                </div>
                <div>
                  <PlanBadge plan={u.effectivePlan} />
                  {u.plan === "trial" && u.trialEndsAt && (
                    <div className="mt-0.5"><TrialCountdown endsAt={u.trialEndsAt} /></div>
                  )}
                </div>
                <span className="text-sm text-white/45">{fmt(u.lastLoginAt)}</span>
                <span className="text-sm text-white/45">{fmt(u.lastAppActiveAt)}</span>
                <span className={`text-xs font-medium ${u.hasInstalledApp ? "text-green-400/80" : "text-white/20"}`}>
                  {u.hasInstalledApp ? "✓ Yes" : "No"}
                </span>
                <button
                  data-testid={`button-detail-${u.id}`}
                  onClick={(e) => { e.stopPropagation(); openUserDetail(u); }}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors text-right"
                >
                  Details →
                </button>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-white/30">Showing {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} of {total}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page"
                className="rounded-lg px-3 py-1.5 text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                ← Prev
              </button>
              <span className="flex items-center px-3 text-sm text-white/40">{page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page"
                className="rounded-lg px-3 py-1.5 text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          logs={selectedLogs}
          onClose={() => { setSelectedUser(null); setSelectedLogs([]); }}
          onPlanUpdated={handlePlanUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
