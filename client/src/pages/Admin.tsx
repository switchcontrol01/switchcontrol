  import React, { useState, useEffect, useCallback, useRef } from "react";
  import { useAuthStore, refreshEntitlements, triggerFlowReset } from "@/lib/auth-store";
  import { useToast } from "@/hooks/use-toast";
  import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";
  
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
    premiumLastSeenDeviceId: string | null;
    premiumDeviceLastSeenAt: string | null;
    deviceLocked: boolean;
    appVersion: string | null;
    platform: string | null;
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
  
  interface DownloadMaintenanceSettings {
    enabled: boolean;
    message: string;
    returnTime: string | null;
    updatedAt?: string;
    updatedBy?: string | null;
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
      premium: "bg-[#00D4FF] text-[#0A0E14] border-[#00D4FF]",
      trial: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      // trial_expired renders identically to free — the trial has ended, the
      // user is on the free tier. Showing "Trial Expired" is misleading once
      // the trial window has closed; "Free" is the accurate ongoing status.
      trial_expired: "bg-[#21262D] text-[#6B7380] border-[#2A313A]",
      free: "bg-[#21262D] text-[#6B7380] border-[#2A313A]",
    };
    const labels: Record<string, string> = {
      premium: "Premium",
      trial: "Trial",
      trial_expired: "Free",
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
    const countdownActive = !!endsAt && trialMsRemaining(endsAt) > 0;
    useVisibilityInterval(
      () => tick((n) => n + 1),
      30_000,
      "Admin:trialCountdown",
      "Admin.tsx",
      countdownActive,
    );
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
    requiresReason?: boolean;
    onConfirm: (reason?: string) => void;
    onClose: () => void;
    loading?: boolean;
    error?: string | null;
  }
  
  function ConfirmModal({ title, description, confirmLabel = "Confirm", danger, requiresReason, onConfirm, onClose, loading, error }: ConfirmModalProps) {
    const [reason, setReason] = useState("");
    const canConfirm = !requiresReason || reason.trim().length > 0;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#14181D]/80 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-sm rounded-2xl border border-[#2A313A] p-6 shadow-2xl"
          style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(7,9,13,0.97) 100%)" }}
        >
          <h3 className="text-base font-semibold text-[#E6EAF0] mb-2">{title}</h3>
          <div className="text-sm text-[#A0A8B3] mb-4">{description}</div>
          {requiresReason && (
            <div className="mb-4">
              <label className="block text-xs text-[#6B7380] mb-1.5">Reason (required)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you taking this action?"
                className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
              />
            </div>
          )}
          {error && (
            <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason || undefined)}
              disabled={loading || !canConfirm}
              data-testid="button-modal-confirm"
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                danger
                  ? "bg-red-600/25 border-red-500/35 text-red-300 hover:bg-red-600/40"
                  : "bg-[#00D4FF]/25 border-[#00D4FF] text-[#00D4FF] hover:bg-[#00D4FF]/40"
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
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);
  
    const canConfirm = true;
  
    const planLabel: Record<string, string> = {
      premium: "Premium",
      trial:   "Trial",
      free:    "Free",
    };
  
    const submit = async () => {
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/admin/users/${user.id}`, {
          method: "DELETE",
          headers: buildHeaders() as any,
          body: JSON.stringify({ confirm: true }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.success === false) {
          throw new Error(data.error || `Server returned ${r.status}`);
        }
        console.log(`[Admin] Deleted user ${user.id} (${user.email ?? "no email"})`);
        onDeleted();
      } catch (e: any) {
        console.error("[Admin] Delete user failed:", e.message);
        setError(e.message);
        setLoading(false);
      }
    };
  
    const createdLabel = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "Unknown";
  
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#07090D]/85 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
        <div
          className="relative w-full max-w-md rounded-2xl border border-red-500/25 p-6 shadow-2xl"
          style={{ background: "linear-gradient(160deg, rgba(239,68,68,0.06) 0%, rgba(7,9,13,0.98) 50%, rgba(7,9,13,0.98) 100%)" }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#E6EAF0] leading-tight">Delete User Account</h3>
              <p className="text-xs text-[#6B7380] mt-0.5">Are you sure? This action is permanent and cannot be undone.</p>
            </div>
          </div>
  
          {/* User details card */}
          <div className="rounded-xl bg-[#0F1318] border border-[#1E252E] p-4 mb-4 space-y-2">
            <DetailRow label="Email"    value={user.email || "—"} mono />
            <DetailRow label="Name"     value={user.displayName} />
            <DetailRow label="Plan"     value={planLabel[user.effectivePlan] ?? user.effectivePlan ?? "Free"} />
            <DetailRow label="User ID"  value={user.id} mono truncate />
            <DetailRow label="Created"  value={createdLabel} />
          </div>
  
          {/* Warning */}
          <div className="flex gap-2.5 rounded-xl bg-red-500/8 border border-red-500/20 px-3.5 py-3 mb-5">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-red-300 leading-relaxed">
              This permanently deletes the account, all settings, history, AI scans, and active sessions.
              Any active Stripe subscription will be cancelled.
            </p>
          </div>
  
  
          {/* Error banner */}
          {error && (
            <div className="flex gap-2 rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2.5 mb-4" data-testid="text-delete-error">
              <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-red-300 text-xs leading-relaxed">{error}</p>
            </div>
          )}
  
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              data-testid="button-delete-cancel"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#1A1F27] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:border-[#3A424E] transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading || !canConfirm}
              data-testid="button-delete-confirm"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border bg-red-600/30 border-red-500/40 text-red-300 hover:bg-red-600/50 hover:border-red-500/60 hover:text-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deleting…
                </>
              ) : (
                "Delete Permanently"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  function DetailRow({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
    return (
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="text-xs text-[#6B7380] flex-shrink-0">{label}</span>
        <span className={`text-xs text-[#C4CAD4] text-right ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[180px]" : ""}`}>
          {value}
        </span>
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
        <div className="absolute inset-0 bg-[#14181D] backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-md rounded-2xl border border-[#2A313A] p-6 shadow-2xl"
          style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(10,7,28,0.95) 100%)" }}
        >
          <h3 className="text-lg font-semibold text-[#E6EAF0] mb-1">Set Plan</h3>
          <p className="text-sm text-[#A0A8B3] mb-5">{user.displayName}</p>
  
          <div className="grid grid-cols-3 gap-2 mb-5">
            {(["free", "trial", "premium"] as PlanOption[]).map((p) => (
              <button
                key={p}
                data-testid={`plan-option-${p}`}
                onClick={() => setSelectedPlan(p)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium border transition-all ${
                  selectedPlan === p
                    ? p === "premium" ? "bg-[#00D4FF] border-[#00D4FF]/50 text-[#00D4FF]"
                    : p === "trial" ? "bg-cyan-500/30 border-cyan-400/50 text-cyan-200"
                    : "bg-[#2A313A] border-[#2A313A] text-[#E6EAF0]"
                    : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:bg-[#2A313A] hover:text-[#E6EAF0]"
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
  
          {selectedPlan === "trial" && (
            <div className="mb-4 space-y-3">
              <label className="block text-xs text-[#A0A8B3]">Trial Duration</label>
              <div className="grid grid-cols-5 gap-2">
                {TRIAL_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    data-testid={`trial-preset-${p.label}`}
                    onClick={() => { setTrialPreset(p.hours); setUseCustom(false); }}
                    className={`rounded-lg px-2 py-2 text-xs font-medium border transition-all ${
                      !useCustom && trialPreset === p.hours
                        ? "bg-cyan-500/25 border-cyan-400/45 text-cyan-200"
                        : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:bg-[#2A313A] hover:text-[#E6EAF0]"
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
                    useCustom ? "bg-cyan-500/20 border-cyan-400/35 text-cyan-300" : "bg-[#21262D] border-[#2A313A] text-[#6B7380] hover:text-[#A0A8B3]"
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
                    className="flex-1 rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-1.5 text-sm text-[#E6EAF0] outline-none focus:border-cyan-500/60 transition-colors"
                  />
                )}
              </div>
              {previewEnd && (
                <p className="text-xs text-[#6B7380]">
                  Expires: <span className="text-cyan-300/70">{fmtFull(previewEnd)}</span>
                </p>
              )}
            </div>
          )}
  
          <div className="mb-5">
            <label className="block text-xs text-[#A0A8B3] mb-1.5">Reason (optional)</label>
            <input
              type="text"
              placeholder="Support request, compensation, test…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-reason"
              maxLength={500}
              className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
            />
          </div>
  
          {error && <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
  
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors">
              Cancel
            </button>
            <button
              data-testid="button-confirm-plan"
              onClick={submit}
              disabled={loading}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all disabled:opacity-50 bg-[#00D4FF]/30 border-[#00D4FF] text-[#00D4FF] hover:bg-[#00D4FF]/40`}
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
        <div className="absolute inset-0 bg-[#14181D] backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-sm rounded-2xl border border-[#2A313A] p-6 shadow-2xl"
          style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(7,9,13,0.97) 100%)" }}
        >
          <h3 className="text-base font-semibold text-[#E6EAF0] mb-1">Reset User Flags</h3>
          <p className="text-sm text-[#A0A8B3] mb-4">{user.displayName}</p>
  
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
                    f.val ? "bg-#00D4FF border-[#00D4FF]" : "bg-[#21262D] border-[#2A313A] group-hover:border-[#2A313A]"
                  }`}
                >
                  {f.val && (
                    <svg viewBox="0 0 12 12" fill="none" className="w-4 h-4 -mt-0 -ml-0 text-[#E6EAF0]">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[#E6EAF0]/75">{f.label}</p>
                  <p className="text-xs text-[#6B7380]">{f.hint}</p>
                </div>
              </label>
            ))}
          </div>
  
          <div className="mb-4">
            <label className="block text-xs text-[#6B7380] mb-1.5">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Re-testing onboarding flow"
              maxLength={500}
              className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
            />
          </div>
  
          {error && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
  
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={noneSelected || loading}
              data-testid="button-confirm-reset-flags"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border bg-[#00D4FF]/20 border-[#00D4FF] text-[#33E0FF] hover:bg-[#00D4FF]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
        <div className="absolute inset-0 bg-[#14181D] backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-sm rounded-2xl border border-[#2A313A] p-6 shadow-2xl"
          style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(7,9,13,0.97) 100%)" }}
        >
          <h3 className="text-base font-semibold text-[#E6EAF0] mb-1">Extend Trial</h3>
          <p className="text-sm text-[#A0A8B3] mb-4">{user.displayName}</p>
  
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[0.5, 1, 24, 72].map((h) => (
              <button
                key={h}
                onClick={() => setExtraHours(h)}
                className={`rounded-lg px-2 py-2 text-xs font-medium border transition-all ${
                  extraHours === h ? "bg-cyan-500/25 border-cyan-400/40 text-cyan-200" : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:bg-[#2A313A]"
                }`}
              >
                {h < 1 ? `${h * 60}m` : h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
  
          <div className="mb-3">
            <label className="block text-xs text-[#6B7380] mb-1.5">Custom hours</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={extraHours}
              onChange={(e) => setExtraHours(parseFloat(e.target.value) || 1)}
              data-testid="input-extend-hours"
              className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] outline-none focus:border-cyan-500/60 transition-colors"
            />
            <p className="text-xs text-[#6B7380] mt-1">New end: <span className="text-cyan-300/60">{fmtFull(previewEnd)}</span></p>
          </div>
  
          <div className="mb-4">
            <label className="block text-xs text-[#6B7380] mb-1.5">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Support extension"
              maxLength={500}
              className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
            />
          </div>
  
          {error && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
  
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors">
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
        <span className="text-[#6B7380] flex-shrink-0">{label}</span>
        <span className={`text-[#E6EAF0]/75 text-right truncate max-w-xs ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
      </div>
    );
  }
  
  // ─── CopyButton ────────────────────────────────────────────────────────────────
  
  function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
      try {
        // Modern API (requires secure context + focus)
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          // Fallback for non-secure / modal contexts
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          if (!ok) throw new Error("execCommand copy returned false");
        }
        setCopied(true);
        console.log(`[AdminDevice] Copied to clipboard`);
        setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        console.error("[AdminDevice] Copy failed:", err);
      }
    };
    return (
      <button
        onClick={handleCopy}
        data-testid="button-copy-device-id"
        title="Copy to clipboard"
        className="flex-shrink-0 text-xs rounded-md px-1.5 py-0.5 border border-[#2A313A] bg-[#21262D] text-[#6B7380] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-colors"
      >
        {copied ? "Copied" : "Copy"}
      </button>
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
    const { toast } = useToast();
  
    // Confirm-modal state
    const [confirm, setConfirm] = useState<null | {
      title: string; description: React.ReactNode; action: (reason?: string) => Promise<void>; danger?: boolean; confirmLabel?: string; requiresReason?: boolean;
    }>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
  
    // Stripe status (lazy-loaded)
    const [stripeStatus, setStripeStatus] = useState<any>(null);
    const [stripeStatusLoading, setStripeStatusLoading] = useState(false);
  
    useEffect(() => { setLocalUser(user); setLocalLogs(logs); }, [user, logs]);
  
    const update = useCallback((u: AdminUser) => { setLocalUser(u); onPlanUpdated(u); }, [onPlanUpdated]);
  
    const runConfirmed = async (reason?: string) => {
      if (!confirm) return;
      setConfirmLoading(true);
      setConfirmError(null);
      try {
        await confirm.action(reason);
        setConfirm(null);
      } catch (e: any) {
        setConfirmError(e.message);
      } finally {
        setConfirmLoading(false);
      }
    };
  
    const loadStripeStatus = async () => {
      if (stripeStatus) return;
      setStripeStatusLoading(true);
      try {
        const r = await fetch(`/api/admin/users/${localUser.id}/stripe-status`, { headers: buildHeaders() as any });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          setStripeStatus(data);
        } else {
          // Surface the error so the UI shows it rather than staying stuck on "Click Load"
          setStripeStatus({ error: data.error || `Request failed (${r.status})` });
        }
      } catch (e: any) {
        setStripeStatus({ error: e.message || "Network error loading Stripe data" });
      }
      setStripeStatusLoading(false);
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
      toast({ title: "Updated", description: "User plan changed successfully." });
    };
  
    const revokeTrial = () => setConfirm({
      title: "Revoke Trial",
      description: <>Revoke active trial for <strong className="text-[#E6EAF0]">{localUser.displayName}</strong>? They will immediately lose access.</>,
      confirmLabel: "Revoke Trial",
      danger: true,
      requiresReason: true,
      action: async (reason) => { await postAction(`/api/admin/users/${localUser.id}/revoke-trial`, { reason }); },
    });
  
    const resetTrial = () => setConfirm({
      title: "Reset Trial Fields",
      description: <>Clear all trial data for <strong className="text-[#E6EAF0]">{localUser.displayName}</strong>? This resets hasUsedTrial and all trial timestamps.</>,
      confirmLabel: "Reset Trial",
      danger: true,
      requiresReason: true,
      action: async (reason) => { await postAction(`/api/admin/users/${localUser.id}/reset-trial`, { reason }); },
    });
  
    const revertToFree = () => setConfirm({
      title: "Revert to Free",
      description: <>Set <strong className="text-[#E6EAF0]">{localUser.displayName}</strong> to Free plan? This will revoke premium and any active trial immediately.</>,
      confirmLabel: "Revert to Free",
      danger: true,
      requiresReason: true,
      action: async (reason) => {
        const r = await fetch(`/api/admin/users/${localUser.id}/revert-plan`, {
          method: "POST",
          headers: buildHeaders() as any,
          body: JSON.stringify({ plan: "free", reason }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        if (data.user) update(data.user);
        toast({ title: "Reverted to Free", description: "Premium / trial access revoked immediately." });
      },
    });
  
    const upgradePremium = () => setConfirm({
      title: "Upgrade to Premium",
      description: <>Grant permanent premium access to <strong className="text-[#E6EAF0]">{localUser.displayName}</strong>?</>,
      confirmLabel: "Grant Premium",
      requiresReason: true,
      action: async (reason) => {
        const r = await fetch(`/api/admin/users/${localUser.id}/revert-plan`, {
          method: "POST",
          headers: buildHeaders() as any,
          body: JSON.stringify({ plan: "premium", reason }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        if (data.user) update(data.user);
        toast({ title: "Premium granted", description: "User upgraded to Premium immediately." });
      },
    });
  
    const resetDeviceLock = () => setConfirm({
      title: "Reset Device Lock",
      description: (
        <>
          Clear the device binding for <strong className="text-[#E6EAF0]">{localUser.displayName}</strong>?
          {localUser.premiumBoundDeviceId && (
            <span className="block mt-1 text-xs text-[#6B7380] font-mono">{localUser.premiumBoundDeviceId}</span>
          )}
          {" "}Their premium will re-bind to whichever machine they next log in from.
        </>
      ),
      confirmLabel: "Clear Device Lock",
      danger: true,
      requiresReason: true,
      action: async (reason) => {
        const r = await fetch(`/api/admin/users/${localUser.id}/reset-premium-device`, {
          method: "POST",
          headers: buildHeaders() as any,
          body: JSON.stringify({ reason }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed");
        update({
          ...localUser,
          premiumBoundDeviceId: null,
          premiumBoundAt: null,
          premiumLastSeenDeviceId: null,
          premiumDeviceLastSeenAt: null,
          deviceLocked: false,
          appVersion: null,
          platform: null,
        });
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
            className="w-full max-w-md h-full overflow-y-auto border-l border-[#2A313A] shadow-2xl"
            style={{ background: "linear-gradient(180deg, rgba(20,12,45,0.98) 0%, rgba(7,9,13,0.99) 100%)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5  sticky top-0 z-10"
              style={{ background: "rgba(10,7,28,0.95)", backdropFilter: "blur(12px)" }}>
              <h3 className="text-base font-semibold text-[#E6EAF0]">User Detail</h3>
              <button onClick={onClose} data-testid="button-close-detail"
                className="w-8 h-8 rounded-lg bg-[#21262D] border border-[#2A313A] flex items-center justify-center text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors">
                ✕
              </button>
            </div>
  
            <div className="p-5 space-y-4 pb-12">
              {/* Identity */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00D4FF] border border-[#00D4FF] flex items-center justify-center text-[#33E0FF] font-semibold text-sm flex-shrink-0">
                    {(localUser.displayName || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#E6EAF0] truncate">{localUser.displayName}</p>
                    <p className="text-xs text-[#6B7380] truncate">{localUser.email || "No email"}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <PlanBadge plan={localUser.effectivePlan} />
                      {localUser.isAdmin && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">Admin</span>}
                      <span className="text-xs text-[#6B7380] capitalize">{localUser.provider}</span>
                    </div>
                  </div>
                </div>
              </div>
  
              {/* Plan Details */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Plan Details</p>
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
                  <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Trial Status</p>
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
                        className="text-xs rounded-lg px-3 py-1.5 border border-[#2A313A] bg-[#21262D] text-[#6B7380] hover:bg-[#2A313A] transition-all">
                        Reset Fields
                      </button>
                    </div>
                  )}
                  {isExpiredTrial && (
                    <div className="mt-3">
                      <button onClick={resetTrial} data-testid="button-reset-expired-trial"
                        className="text-xs rounded-lg px-3 py-1.5 border border-[#2A313A] bg-[#21262D] text-[#6B7380] hover:bg-[#2A313A] transition-all">
                        Clear Trial Data
                      </button>
                    </div>
                  )}
                </div>
              )}
  
              {/* Device Information — always visible so admins can see (and clear) bindings
                  even for free users who inherited a stale device from a previous premium period,
                  or spot users who have never connected from the desktop app at all. */}
              <div className={`rounded-xl border p-4 ${localUser.deviceLocked ? "border-amber-500/20" : "border-[#2A313A]"}`}
                style={{ background: localUser.deviceLocked ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Device Information</p>
                  {localUser.deviceLocked && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300/80 font-medium">Locked</span>
                  )}
                </div>
                  <div className="space-y-2.5 text-sm">
                    <Row
                      label="Device ID"
                      value={
                        localUser.premiumBoundDeviceId ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-amber-300/80 truncate">{localUser.premiumBoundDeviceId}</span>
                            <CopyButton value={localUser.premiumBoundDeviceId} />
                          </div>
                        ) : (
                          <span className="text-[#6B7380]">None</span>
                        )
                      }
                    />
                    <Row label="Linked At" value={localUser.premiumBoundAt ? fmtFull(localUser.premiumBoundAt) : "—"} />
                    <Row
                      label="Last Seen Device ID"
                      value={
                        localUser.premiumLastSeenDeviceId ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[#A0A8B3] truncate">{localUser.premiumLastSeenDeviceId}</span>
                            <CopyButton value={localUser.premiumLastSeenDeviceId} />
                          </div>
                        ) : (
                          <span className="text-[#6B7380]">—</span>
                        )
                      }
                    />
                    <Row label="Last Seen At" value={localUser.premiumDeviceLastSeenAt ? fmtFull(localUser.premiumDeviceLastSeenAt) : "—"} />
                    <Row label="App Version" value={localUser.appVersion || "—"} />
                    <Row label="Platform" value={localUser.platform || "—"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      data-testid="button-view-device-inspector"
                      onClick={() => {
                        const q = encodeURIComponent(localUser.premiumBoundDeviceId || localUser.premiumLastSeenDeviceId || localUser.email || localUser.id);
                        window.location.href = `/admin/device-inspector?q=${q}`;
                      }}
                      className="text-xs rounded-lg px-3 py-1.5 border border-[#3A4150] bg-white/[0.03] text-[#A0A8B3] hover:bg-white/[0.06] hover:text-white transition-all"
                    >
                      View in Inspector →
                    </button>
                    {localUser.premiumBoundDeviceId && (
                      <button onClick={resetDeviceLock} data-testid="button-reset-device-lock"
                        className="text-xs rounded-lg px-3 py-1.5 border border-amber-500/25 bg-amber-500/10 text-amber-300/80 hover:bg-amber-500/20 transition-all">
                        Clear Device Lock
                      </button>
                    )}
                  </div>
                </div>
  
              {/* Activity */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Activity</p>
                <div className="space-y-2.5 text-sm">
                  <Row label="Last Login" value={fmtFull(localUser.lastLoginAt)} />
                  <Row label="Last App Active" value={fmtFull(localUser.lastAppActiveAt)} />
                  <Row
                    label="App Installed"
                    value={
                      localUser.hasInstalledApp
                        ? <span className="text-green-400 text-xs font-medium">Yes</span>
                        : <span className="text-[#6B7380] text-xs">No</span>
                    }
                  />
                  <Row label="Member Since" value={fmtFull(localUser.createdAt)} />
                  <Row label="User ID" value={localUser.id} mono />
                </div>
              </div>
  
              {/* Stripe Status — lazy-loaded */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider">Stripe</p>
                  {!stripeStatus && !stripeStatusLoading && (
                    <button onClick={loadStripeStatus} className="text-xs rounded-lg px-2.5 py-1 border border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:bg-[#2A313A] transition-all">
                      Load
                    </button>
                  )}
                  {stripeStatusLoading && <span className="text-xs text-[#6B7380] animate-pulse">Loading…</span>}
                </div>
                {!stripeStatus ? (
                  <p className="text-xs text-[#6B7380] italic">{stripeStatusLoading ? "Fetching Stripe data…" : "Click Load to fetch live Stripe customer data."}</p>
                ) : stripeStatus.error ? (
                  <p className="text-xs text-red-400">{stripeStatus.error}</p>
                ) : !stripeStatus.hasStripeCustomer ? (
                  <p className="text-xs text-[#6B7380]">No Stripe customer linked.</p>
                ) : stripeStatus.status === "deleted" ? (
                  <p className="text-xs text-orange-400">Customer deleted in Stripe.</p>
                ) : (
                  <div className="space-y-2.5 text-sm">
                    <Row label="Customer ID" value={<span className="font-mono text-[#A0A8B3]">{stripeStatus.customerId}</span>} />
                    <Row label="Email" value={stripeStatus.email || <span className="text-[#6B7380]">—</span>} />
                    <Row label="Balance" value={stripeStatus.balance != null ? `${stripeStatus.balance} ${stripeStatus.currency || ""}` : <span className="text-[#6B7380]">—</span>} />
                    {stripeStatus.recentCharges && stripeStatus.recentCharges.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-[#6B7380] mb-1.5">Recent Charges</p>
                        <div className="space-y-1">
                          {stripeStatus.recentCharges.map((c: any) => (
                            <div key={c.id} className="flex items-center justify-between text-xs bg-[#21262D] rounded-lg px-2.5 py-1.5 border border-[#2A313A]">
                              <span className="font-mono text-[#A0A8B3]">{c.id.slice(0, 12)}…</span>
                              <span className={c.status === "succeeded" ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                                {c.amount != null ? `$${(c.amount / 100).toFixed(2)}` : "—"} {c.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
  
              {/* Quick Trial Grants */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Quick Trial Grant</p>
                <div className="flex gap-2 flex-wrap">
                  {TRIAL_PRESETS.map((p) => (
                    <QuickTrialButton key={p.label} label={p.label} hours={p.hours} userId={localUser.id} onSuccess={update} />
                  ))}
                </div>
              </div>
  
              {/* Main Actions */}
              <div className="space-y-2">
                <button onClick={() => setShowSetPlan(true)} data-testid="button-set-plan"
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/18 transition-all">
                  Set Plan
                </button>
  
                {effectivePlan !== "premium" && (
                  <button onClick={upgradePremium} data-testid="button-upgrade-premium"
                    className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-purple-500/15 border border-purple-500/35 text-purple-300 hover:bg-purple-500/25 transition-all">
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
                  className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:bg-[#2A313A] hover:text-[#E6EAF0]/75 transition-all">
                  Reset Flags
                </button>
  
                <button
                  onClick={toggleAdmin}
                  disabled={settingAdmin}
                  data-testid="button-toggle-admin"
                  className={`w-full rounded-xl px-4 py-3 text-sm font-medium border transition-all disabled:opacity-50 ${
                    localUser.isAdmin
                      ? "bg-orange-500/15 border-orange-500/25 text-orange-300 hover:bg-orange-500/22"
                      : "bg-[#21262D] border-[#2A313A] text-[#A0A8B3] hover:bg-[#2A313A] hover:text-[#E6EAF0]/75"
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
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Flags</p>
                <div className="space-y-2.5 text-sm">
                  <Row label="Seen Unlock Screen" value={localUser.hasSeenPremiumUnlock ? "Yes" : "No"} />
                  <Row label="Seen Premium Tour" value={localUser.hasSeenPremiumTour ? "Yes" : "No"} />
                </div>
              </div>
  
              {/* Admin Logs */}
              <div className="rounded-xl border border-[#2A313A] p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                <p className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider mb-3">Recent Admin Actions</p>
                {localLogs.length === 0 ? (
                  <p className="text-xs text-[#6B7380] italic">No admin actions recorded for this user.</p>
                ) : (
                  <div className="space-y-2.5">
                    {localLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[#E6EAF0] font-medium">{log.action.replace(/_/g, " ")}</span>
                          {log.metadata?.reason && <span className="text-[#6B7380]"> — {log.metadata.reason}</span>}
                          <p className="text-[#6B7380] mt-0.5">{fmtFull(log.createdAt)}</p>
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
            requiresReason={confirm.requiresReason}
            onConfirm={runConfirmed}
            onClose={() => { setConfirm(null); setConfirmError(null); }}
            loading={confirmLoading}
            error={confirmError}
          />
        )}
      </>
    );
  }
  
  // ─── Driver Database Control Plane ────────────────────────────────────────────
  
  const DRIVER_CATEGORIES = [
    "gpu",
    "chipset",
    "bios",
    "ssd",
    "network",
    "audio",
    "bluetooth",
  ] as const;
  
  interface DriverOverview {
    dbVersion: string;
    updatedAt: string;
    baseUpdatedAt: string;
    ageDays: number;
    stale: boolean;
    stats: {
      vendorCount: number;
      overrideCount: number;
      hotfixCount: number;
      disabledCount: number;
    };
    vendors: Array<{
      category: string;
      vendorKey: string;
      latest: string;
      safety: "safe" | "caution" | "critical";
      disabled: boolean;
      hotfix: boolean;
      overridden: boolean;
    }>;
  }
  
  interface DriverOverrideRow {
    id: string;
    category: string;
    vendorKey: string;
    latest: string | null;
    releaseDate: string | null;
    releaseNotes: string | null;
    safety: string | null;
    disabled: boolean;
    isHotfix: boolean;
    note: string | null;
    updatedAt: string;
  }
  
  interface FetchStatusRow {
    category: string;
    vendorKey: string;
    latest: string | null;
    releaseDate: string | null;
    fetchedAt: string;
    source: string | null;
    error: string | null;
  }
  
  interface FetchStatus {
    lastRunAt: string | null;
    lastRunResults: Record<string, "ok" | "error">;
    vendorCount: number;
    vendors: string[];
    cache: FetchStatusRow[];
  }
  
  function DriverDbAdmin() {
    const [overview, setOverview] = useState<DriverOverview | null>(null);
    const [overrides, setOverrides] = useState<DriverOverrideRow[]>([]);
    const [fetchStatus, setFetchStatus] = useState<FetchStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  
    // Form state for upserting an override.
    const [fCategory, setFCategory] = useState<string>("gpu");
    const [fVendor, setFVendor] = useState("");
    const [fLatest, setFLatest] = useState("");
    const [fSafety, setFSafety] = useState("");
    const [fNote, setFNote] = useState("");
    const [fDisabled, setFDisabled] = useState(false);
    const [fHotfix, setFHotfix] = useState(false);
  
    const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [ovR, orR, fsR] = await Promise.all([
          fetch("/api/driver-intel/admin/overview", { headers: buildHeaders() as any }),
          fetch("/api/driver-intel/admin/overrides", { headers: buildHeaders() as any }),
          fetch("/api/driver-intel/admin/fetch-status", { headers: buildHeaders() as any }),
        ]);
        if (!ovR.ok) throw new Error("Failed to load overview");
        if (!orR.ok) throw new Error("Failed to load overrides");
        setOverview(await ovR.json());
        setOverrides((await orR.json()).items);
        if (fsR.ok) setFetchStatus(await fsR.json());
      } catch (e: any) {
        setError(e.message || "Network error");
      } finally {
        setLoading(false);
      }
    }, []);
  
    const triggerFetchNow = async () => {
      setFetching(true);
      setFetchMsg(null);
      setError(null);
      try {
        const r = await fetch("/api/driver-intel/admin/fetch-now", {
          method: "POST",
          headers: buildHeaders(),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to trigger fetch");
        setFetchMsg(data.message ?? "Fetch triggered — reload in ~30s to see results.");
        // Reload status after a delay so admin sees the new results
        setTimeout(() => load(), 35_000);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setFetching(false);
      }
    };
  
    useEffect(() => { load(); }, [load]);
  
    const saveOverride = async () => {
      if (!fVendor.trim()) { setError("Vendor key is required."); return; }
      setSaving(true);
      setError(null);
      try {
        const body: Record<string, any> = {
          category: fCategory,
          vendorKey: fVendor.trim().toLowerCase(),
          disabled: fDisabled,
          isHotfix: fHotfix,
        };
        if (fLatest.trim()) body.latest = fLatest.trim();
        if (fSafety) body.safety = fSafety;
        if (fNote.trim()) body.note = fNote.trim();
        const r = await fetch("/api/driver-intel/admin/overrides", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to save");
        setFVendor(""); setFLatest(""); setFSafety(""); setFNote("");
        setFDisabled(false); setFHotfix(false);
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    };
  
    const deleteOverride = async (id: string) => {
      try {
        const r = await fetch(`/api/driver-intel/admin/overrides/${id}`, {
          method: "DELETE",
          headers: buildHeaders() as any,
        });
        if (!r.ok) throw new Error("Failed to delete");
        await load();
      } catch (e: any) {
        setError(e.message);
      }
    };
  
    const safetyColor = (s: string) =>
      s === "critical"
        ? "text-red-400"
        : s === "caution"
          ? "text-amber-400"
          : "text-green-400";
  
    return (
      <div
        className="mb-6 rounded-xl border border-purple-500/15 p-4"
        style={{ background: "rgba(168,85,247,0.04)" }}
        data-testid="panel-driver-db"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-purple-400/70 uppercase tracking-wider">
            Driver Database
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={triggerFetchNow}
              disabled={fetching}
              data-testid="button-fetch-now"
              className="text-xs rounded-lg px-3 py-1 border border-[#00D4FF]/30 bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-all disabled:opacity-50"
            >
              {fetching ? "Fetching…" : "Fetch now"}
            </button>
            <button
              onClick={load}
              className="text-xs text-purple-300/70 hover:text-purple-300 underline"
              data-testid="button-driver-db-refresh"
            >
              Refresh
            </button>
          </div>
        </div>
  
        {fetchMsg && (
          <div className="mb-3 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/20 px-3 py-2 text-xs text-[#00D4FF]">
            {fetchMsg}
          </div>
        )}
  
        {error && (
          <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400" data-testid="text-driver-db-error">
            {error}
          </div>
        )}
  
        {loading && !overview ? (
          <div className="py-4 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
        ) : overview ? (
          <>
            {/* Freshness + stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {[
                { label: "DB Version", value: overview.dbVersion },
                {
                  label: "Updated",
                  value: `${overview.updatedAt} (${overview.ageDays}d)`,
                  warn: overview.stale,
                },
                { label: "Overrides", value: String(overview.stats.overrideCount) },
                {
                  label: "Disabled",
                  value: String(overview.stats.disabledCount),
                  warn: overview.stats.disabledCount > 0,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`rounded-lg border px-3 py-2 ${s.warn ? "border-amber-500/30 bg-amber-500/5" : "border-[#2A313A] bg-[#21262D]/50"}`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-[#6B7380]">{s.label}</p>
                  <p className={`text-sm font-medium ${s.warn ? "text-amber-400" : "text-[#E6EAF0]"}`} data-testid={`stat-driver-${s.label}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
  
            {overview.stale && (
              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
                Driver database is over 30 days old — consider refreshing reference data.
              </div>
            )}
  
            {/* Auto-fetch status */}
            {fetchStatus && (
              <div className="mb-3 rounded-lg border border-[#2A313A] bg-[#1A1F27]/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-[#A0A8B3] uppercase tracking-wider">
                    Auto-Fetch Status
                  </p>
                  <span className="text-[10px] text-[#6B7380]">
                    {fetchStatus.lastRunAt
                      ? `Last run: ${new Date(fetchStatus.lastRunAt).toLocaleString()}`
                      : "Not yet run (fires 60s after restart)"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {fetchStatus.vendors.map((key) => {
                    const cacheRow = fetchStatus.cache.find(
                      (c) => `${c.category}:${c.vendorKey}` === key,
                    );
                    const runResult = fetchStatus.lastRunResults?.[key];
                    const hasData = !!cacheRow?.latest;
                    const hasError = !!cacheRow?.error;
                    return (
                      <div
                        key={key}
                        title={cacheRow?.error ?? cacheRow?.latest ?? "pending"}
                        className={`rounded px-2 py-1 text-[10px] font-medium border ${
                          hasError
                            ? "border-red-500/25 bg-red-500/5 text-red-400"
                            : hasData
                              ? "border-green-500/25 bg-green-500/5 text-green-400"
                              : "border-[#2A313A] bg-[#21262D]/50 text-[#6B7380]"
                        }`}
                        data-testid={`fetch-status-${key}`}
                      >
                        {key}
                        {hasData && !hasError && (
                          <span className="ml-1 text-[#6B7380] font-mono">{cacheRow!.latest}</span>
                        )}
                        {hasError && <span className="ml-1">✗</span>}
                        {!hasData && !hasError && !runResult && <span className="ml-1 opacity-50">…</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
  
            {/* Vendor status grid */}
            <div className="mb-4 max-h-44 overflow-y-auto scrollbar-none rounded-lg border border-[#2A313A]">
              {overview.vendors.map((v) => (
                <div
                  key={`${v.category}-${v.vendorKey}`}
                  className="grid grid-cols-[80px_1fr_120px_auto] gap-2 items-center px-3 py-1.5 text-xs border-b border-[#2A313A]/50 last:border-0"
                  data-testid={`row-vendor-${v.category}-${v.vendorKey}`}
                >
                  <span className="text-[#6B7380] uppercase">{v.category}</span>
                  <span className="text-[#E6EAF0] font-medium">{v.vendorKey}</span>
                  <span className="text-[#A0A8B3] font-mono">{v.latest}</span>
                  <span className="flex items-center gap-1.5 justify-end">
                    {v.overridden && <span className="text-purple-400" title="Has override">●</span>}
                    {v.hotfix && <span className="text-[#00D4FF]" title="Hotfix">hotfix</span>}
                    {v.disabled && <span className="text-red-400" title="Disabled">disabled</span>}
                    <span className={safetyColor(v.safety)}>{v.safety}</span>
                  </span>
                </div>
              ))}
            </div>
  
            {/* Override form */}
            <div className="rounded-lg border border-[#2A313A] bg-[#1A1F27]/60 p-3">
              <p className="text-[11px] font-semibold text-[#A0A8B3] uppercase tracking-wider mb-2">
                Add / Update Override
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                <select
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  className="text-xs rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1.5 text-[#E6EAF0]"
                  data-testid="select-override-category"
                >
                  {DRIVER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={fVendor}
                  onChange={(e) => setFVendor(e.target.value)}
                  placeholder="vendor key (e.g. nvidia)"
                  className="text-xs rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1.5 text-[#E6EAF0]"
                  data-testid="input-override-vendor"
                />
                <input
                  value={fLatest}
                  onChange={(e) => setFLatest(e.target.value)}
                  placeholder="latest version (optional)"
                  className="text-xs rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1.5 text-[#E6EAF0]"
                  data-testid="input-override-latest"
                />
                <select
                  value={fSafety}
                  onChange={(e) => setFSafety(e.target.value)}
                  className="text-xs rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1.5 text-[#E6EAF0]"
                  data-testid="select-override-safety"
                >
                  <option value="">safety (keep)</option>
                  <option value="safe">safe</option>
                  <option value="caution">caution</option>
                  <option value="critical">critical</option>
                </select>
                <input
                  value={fNote}
                  onChange={(e) => setFNote(e.target.value)}
                  placeholder="admin note (shown to users)"
                  className="text-xs rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1.5 text-[#E6EAF0] col-span-2 md:col-span-1"
                  data-testid="input-override-note"
                />
              </div>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-[#A0A8B3] cursor-pointer">
                  <input type="checkbox" checked={fDisabled} onChange={(e) => setFDisabled(e.target.checked)} className="accent-red-500" data-testid="checkbox-override-disabled" />
                  Emergency disable (warn, don't recommend)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#A0A8B3] cursor-pointer">
                  <input type="checkbox" checked={fHotfix} onChange={(e) => setFHotfix(e.target.checked)} className="accent-[#00D4FF]" data-testid="checkbox-override-hotfix" />
                  Hotfix
                </label>
              </div>
              <button
                onClick={saveOverride}
                disabled={saving}
                className="text-xs font-medium rounded-lg px-4 py-1.5 border border-purple-500/40 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition-all disabled:opacity-50"
                data-testid="button-save-override"
              >
                {saving ? "Saving…" : "Save override"}
              </button>
            </div>
  
            {/* Existing overrides */}
            {overrides.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-[#A0A8B3] uppercase tracking-wider">
                  Active Overrides ({overrides.length})
                </p>
                {overrides.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded-lg bg-[#21262D]/50 border border-[#2A313A] px-3 py-2"
                    data-testid={`row-override-${o.id}`}
                  >
                    <div className="text-xs min-w-0">
                      <span className="text-[#6B7380] uppercase mr-2">{o.category}</span>
                      <span className="text-[#E6EAF0] font-medium">{o.vendorKey}</span>
                      {o.latest && <span className="text-[#A0A8B3] font-mono ml-2">{o.latest}</span>}
                      {o.disabled && <span className="text-red-400 ml-2">disabled</span>}
                      {o.isHotfix && <span className="text-[#00D4FF] ml-2">hotfix</span>}
                      {o.note && <p className="text-[#6B7380] mt-0.5 truncate">{o.note}</p>}
                    </div>
                    <button
                      onClick={() => deleteOverride(o.id)}
                      className="text-xs text-red-400 hover:text-red-300 ml-3 shrink-0"
                      data-testid={`button-delete-override-${o.id}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-[#6B7380] italic">Driver database data unavailable.</p>
        )}
      </div>
    );
  }
  
  // ─── Main Admin Page ──────────────────────────────────────────────────────────
  
  export default function AdminPage() {
    const user = useAuthStore((s) => s.user);
    const jwt = useAuthStore((s) => s.jwt);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState("");
    const [planFilter, setPlanFilter] = useState("");
    const [appFilter, setAppFilter] = useState<"" | "yes" | "no">("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authorized, setAuthorized] = useState<boolean | null>(null);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [selectedLogs, setSelectedLogs] = useState<AdminLog[]>([]);
    const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  
    // Enhanced search
    const [stripeSearch, setStripeSearch] = useState("");
    const [deviceSearch, setDeviceSearch] = useState("");
  
    // Stats
    const [stats, setStats] = useState<any>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
  
    // Trials expiring
    const [trialsExpiring, setTrialsExpiring] = useState<AdminUser[]>([]);
    const [trialsExpiringHours, setTrialsExpiringHours] = useState(24);
    const [trialsLoading, setTrialsLoading] = useState(false);
  
    // Stripe events
    const [stripeEvents, setStripeEvents] = useState<any[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
  
    // Health
    const [health, setHealth] = useState<any>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [showHealth, setShowHealth] = useState(false);
  
    // Public download maintenance control
    const [downloadMaintenance, setDownloadMaintenance] = useState<DownloadMaintenanceSettings | null>(null);
    const [maintenanceMessage, setMaintenanceMessage] = useState("We are updating the download service.");
    const [maintenanceReturnTime, setMaintenanceReturnTime] = useState("");
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);
    const [maintenanceSaving, setMaintenanceSaving] = useState(false);
    const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
    const [maintenanceSaved, setMaintenanceSaved] = useState(false);
    const [showDownloadMaintenance, setShowDownloadMaintenance] = useState(false);
  
    // Driver database control plane
    const [showDriverDb, setShowDriverDb] = useState(false);
  
    // Device lock lookup
    const [deviceLookupId, setDeviceLookupId] = useState("");
    const [deviceLookupResult, setDeviceLookupResult] = useState<AdminUser | null>(null);
    const [deviceLookupError, setDeviceLookupError] = useState<string | null>(null);
    const [deviceLookupLoading, setDeviceLookupLoading] = useState(false);
  
    // Batch selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchDeleting, setBatchDeleting] = useState(false);
    const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
    const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  
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
  
    const fetchUsers = useCallback(async (p: number, s: string, plan: string, stripeCid?: string, devId?: string, app?: "" | "yes" | "no") => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: "30" });
        if (s) params.set("search", s);
        if (plan) params.set("plan", plan);
        if (stripeCid) params.set("stripeCustomerId", stripeCid);
        if (devId) params.set("deviceId", devId);
        if (app === "yes") params.set("hasInstalledApp", "true");
        if (app === "no") params.set("hasInstalledApp", "false");
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
      if (authorized === true) fetchUsers(page, search, planFilter, stripeSearch || undefined, deviceSearch || undefined, appFilter);
    }, [authorized, page, planFilter, appFilter]);
  
    const handleSearchChange = (value: string) => {
      setSearch(value);
      clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => { setPage(1); fetchUsers(1, value, planFilter, stripeSearch || undefined, deviceSearch || undefined, appFilter); }, 350);
    };
  
    const fetchStats = useCallback(async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const r = await fetch("/api/admin/stats", { headers: buildHeaders() as any });
        if (r.ok) {
          setStats(await r.json());
        } else {
          const d = await r.json().catch(() => ({}));
          setStatsError(d.error || `Stats unavailable (${r.status})`);
        }
      } catch (e: any) {
        setStatsError(e.message || "Network error fetching stats");
      }
      setStatsLoading(false);
    }, []);
  
    const fetchTrialsExpiring = useCallback(async (hours: number) => {
      setTrialsLoading(true);
      try {
        const r = await fetch(`/api/admin/trials-expiring?hours=${hours}`, { headers: buildHeaders() as any });
        if (r.ok) {
          const data = await r.json();
          setTrialsExpiring(data.users);
        }
      } catch {}
      setTrialsLoading(false);
    }, []);
  
    const fetchStripeEvents = useCallback(async () => {
      setEventsLoading(true);
      try {
        const r = await fetch("/api/admin/stripe-events", { headers: buildHeaders() as any });
        if (r.ok) {
          const data = await r.json();
          setStripeEvents(data.events);
        }
      } catch {}
      setEventsLoading(false);
    }, []);
  
    const fetchHealth = useCallback(async () => {
      setHealthLoading(true);
      try {
        const r = await fetch("/api/admin/health", { headers: buildHeaders() as any });
        if (r.ok) setHealth(await r.json());
      } catch {}
      setHealthLoading(false);
    }, []);
  
    const fetchDownloadMaintenance = useCallback(async () => {
      setMaintenanceLoading(true);
      setMaintenanceError(null);
      try {
        const r = await fetch("/api/admin/download-maintenance", { headers: buildHeaders() as any });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Failed to fetch download maintenance settings.");
        setDownloadMaintenance(data);
        setMaintenanceMessage(data.message || "We are updating the download service.");
        setMaintenanceReturnTime(data.returnTime || "");
      } catch (e: any) {
        setMaintenanceError(e.message || "Failed to fetch maintenance settings.");
      } finally {
        setMaintenanceLoading(false);
      }
    }, []);
  
    const saveDownloadMaintenance = async (enabled: boolean) => {
      if (maintenanceSaving) return;
      setMaintenanceSaving(true);
      setMaintenanceError(null);
      setMaintenanceSaved(false);
      try {
        const r = await fetch("/api/admin/download-maintenance", {
          method: "PATCH",
          headers: buildHeaders() as any,
          body: JSON.stringify({
            enabled,
            message: maintenanceMessage.trim(),
            returnTime: maintenanceReturnTime.trim() || null,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Failed to save maintenance settings.");
        setDownloadMaintenance(data);
        setMaintenanceMessage(data.message);
        setMaintenanceReturnTime(data.returnTime || "");
        setMaintenanceSaved(true);
        setTimeout(() => setMaintenanceSaved(false), 2500);
      } catch (e: any) {
        setMaintenanceError(e.message || "Failed to save maintenance settings.");
      } finally {
        setMaintenanceSaving(false);
      }
    };
  
    const exportCsv = () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);
      if (stripeSearch) params.set("stripeCustomerId", stripeSearch);
      if (deviceSearch) params.set("deviceId", deviceSearch);
      if (appFilter === "yes") params.set("hasInstalledApp", "true");
      if (appFilter === "no") params.set("hasInstalledApp", "false");
      window.location.href = `/api/admin/users/export?${params}`;
    };
  
    useEffect(() => {
      if (authorized === true) {
        fetchStats();
        fetchTrialsExpiring(trialsExpiringHours);
        fetchDownloadMaintenance();
      }
    }, [authorized, fetchStats, fetchTrialsExpiring, fetchDownloadMaintenance, trialsExpiringHours]);
  
    const openUserDetail = async (u: AdminUser) => {
      setSelectedUser(u);
      try {
        const r = await fetch(`/api/admin/users/${u.id}`, { headers: buildHeaders() as any });
        if (r.ok) { const data = await r.json(); setSelectedUser(data.user); setSelectedLogs(data.logs || []); }
      } catch {}
    };
  
    const handlePlanUpdated = useCallback((updated: AdminUser) => {
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
        const newPlan = updated.effectivePlan ?? updated.plan ?? "free";
        // Resolve isPremium using the same defensive logic as refreshEntitlements()
        // so that trial users also get isPremium=true in the optimistic update.
        const newIsPremium = !!(
          newPlan === "premium" ||
          (newPlan === "trial" && !!updated.trialEndsAt && new Date() < new Date(updated.trialEndsAt))
        );
        useAuthStore.getState().setUser({
          ...currentUser,
          isPremium:             newIsPremium,
          plan:                  newPlan,
          trialEndsAt:           updated.trialEndsAt ?? null,
          isAdmin:               updated.isAdmin,
          hasSeenPremiumUnlock:  updated.hasSeenPremiumUnlock,
          hasSeenPremiumTour:    updated.hasSeenPremiumTour,
        });
        console.log("[Premium] Updated user:", newPlan, "isPremium:", newIsPremium);
  
        // Signal App.tsx to clear all session-level animation guards so the
        // AppFlow re-evaluates the new state immediately.
        triggerFlowReset();
  
        // Delay the confirmation fetch to avoid stomping the optimistic update.
        // If /api/me is called immediately it may return a stale snapshot (the DB
        // write just committed on one connection; a different read connection can
        // still see the pre-write row).  A short delay lets the DB commit fully
        // and makes the confirmation always agree with the optimistic state.
        // Trial grants use a shorter delay because they can also be resolved
        // defensively via plan+trialEndsAt even if isPremium is briefly stale.
        setTimeout(() => refreshEntitlements(), newPlan === "premium" ? 3000 : 500);
      }
    }, [selectedUser]);
  
    const handleDeleted = useCallback((id: string) => {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setSelectedUser(null);
      setSelectedLogs([]);
      setTotal((t) => t - 1);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }, []);
  
    const toggleSelect = (id: string) => {
      setSelectedIds((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
    };
  
    const toggleSelectAll = () => {
      if (selectedIds.size === users.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(users.map((u) => u.id)));
      }
    };
  
    const doBatchDelete = async () => {
      if (selectedIds.size === 0) return;
      setBatchDeleting(true);
      setBatchDeleteError(null);
      try {
        const r = await fetch("/api/admin/users/batch-delete", {
          method: "POST",
          headers: buildHeaders() as any,
          body: JSON.stringify({ userIds: Array.from(selectedIds) }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.success === false) {
          throw new Error(data.error || `Server returned ${r.status}`);
        }
        const deletedIds = new Set(data.results?.filter((r: any) => r.status === "deleted").map((r: any) => r.id));
        setUsers((prev) => prev.filter((u) => !deletedIds.has(u.id)));
        setTotal((t) => Math.max(0, t - deletedIds.size));
        setSelectedIds(new Set());
        setShowBatchConfirm(false);
      } catch (e: any) {
        setBatchDeleteError(e.message || "Batch delete failed.");
      } finally {
        setBatchDeleting(false);
      }
    };
  
    if (authorized === null) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#14181D" }}>
          <div className="w-8 h-8 rounded-full border-2 border-[#00D4FF] border-t-[#00D4FF] animate-spin" />
        </div>
      );
    }
  
    if (authorized === false) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#14181D" }}>
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-[#E6EAF0]">Admin Access Required</h1>
          <p className="text-sm text-[#6B7380]">
            {user ? "Your account does not have admin privileges." : "Please log in with an admin account."}
          </p>
          <a href="/" className="text-[#00D4FF] text-sm hover:text-[#33E0FF] transition-colors mt-2">← Back to home</a>
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
      <div className="min-h-screen text-[#E6EAF0]" style={{ background: "#14181D" }}>
        {/* Header */}
        <div className=" px-6 py-4 sticky top-0 z-20"
          style={{ background: "rgba(7,9,13,0.95)", backdropFilter: "blur(12px)" }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="text-[#A0A8B3] hover:text-[#E6EAF0] transition-colors text-sm">SwitchControl</a>
              <span className="text-[#6B7380]/50">/</span>
              <span className="text-[#E6EAF0] font-semibold">Admin</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">
                Internal
              </span>
              <a href="/admin/performance" className="text-xs text-[#6B7380] hover:text-[#A0A8B3] transition-colors ml-2 underline underline-offset-2">
                Performance
              </a>
              <a href="/admin/device-inspector" className="text-xs text-[#6B7380] hover:text-[#A0A8B3] transition-colors ml-2 underline underline-offset-2">
                Device Inspector
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#6B7380]">
              <span className="w-2 h-2 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px rgba(74,222,128,0.6)" }} />
              {total.toLocaleString()} users
            </div>
          </div>
        </div>
  
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Stats Bar */}
          {statsError && (
            <div className="mb-4 rounded-xl border border-red-500/25 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2" style={{ background: "rgba(239,68,68,0.06)" }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Stats failed to load: {statsError}
              <button onClick={fetchStats} className="ml-auto text-xs underline hover:text-red-300">Retry</button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            {[
              { label: "Users", value: stats?.totalUsers, color: "text-[#E6EAF0]" },
              { label: "Premium", value: stats?.premiumUsers, color: "text-[#00D4FF]" },
              { label: "Trial", value: stats?.trialUsers, color: "text-cyan-300" },
              { label: "Free", value: stats?.freeUsers, color: "text-[#6B7380]" },
              { label: "Admins", value: stats?.adminCount, color: "text-orange-300" },
              { label: "Locked", value: stats?.deviceLockedUsers, color: "text-amber-300" },
              { label: "Stripe Events", value: stats?.totalStripeEvents, color: "text-[#A0A8B3]" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[#2A313A] p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className={`text-lg font-semibold ${s.color}`}>{statsLoading ? "—" : (statsError ? "?" : (s.value ?? "—"))}</p>
                <p className="text-xs text-[#6B7380]">{s.label}</p>
              </div>
            ))}
          </div>
  
          {/* Download maintenance control */}
          <div className={`mb-6 rounded-xl border p-4 ${
            downloadMaintenance?.enabled
              ? "border-amber-400/30 bg-amber-500/[0.06]"
              : "border-[#2A313A] bg-white/[0.02]"
          }`}>
            <button
              type="button"
              onClick={() => setShowDownloadMaintenance((open) => !open)}
              aria-expanded={showDownloadMaintenance}
              className="w-full flex items-center justify-between gap-4 text-left"
            >
              <span className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                  downloadMaintenance?.enabled
                    ? "bg-amber-500/15 border-amber-400/30 text-amber-300"
                    : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                }`}>
                  <span className="text-lg">⚙</span>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#E6EAF0]">Download page maintenance</span>
                  <span className="block text-xs text-[#6B7380] mt-1">
                    {downloadMaintenance?.enabled ? "Enabled — visitors see the maintenance page." : "Disabled — downloads are available normally."}
                  </span>
                </span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold border border-[#2A313A] bg-[#21262D] text-[#A0A8B3]">
                {showDownloadMaintenance ? "Hide settings" : "Show settings"}
                <span aria-hidden="true">{showDownloadMaintenance ? "↑" : "↓"}</span>
              </span>
            </button>
  
            {showDownloadMaintenance && (
            <>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
               <div className="min-w-0">
                 <p className="text-xs text-[#6B7380] max-w-2xl">
                   Show visitors a clear maintenance notice instead of sending them to unavailable installer or update links.
                 </p>
                 {downloadMaintenance?.enabled && (
                   <p className="text-xs text-amber-300/80 mt-2 font-medium">Visitors currently see the maintenance page.</p>
                 )}
              </div>
              <button
                onClick={() => saveDownloadMaintenance(!downloadMaintenance?.enabled)}
                disabled={maintenanceLoading || maintenanceSaving || !maintenanceMessage.trim()}
                data-testid="button-toggle-download-maintenance"
                className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold border transition-all disabled:opacity-50 ${
                  downloadMaintenance?.enabled
                    ? "bg-amber-500/20 border-amber-400/35 text-amber-200 hover:bg-amber-500/30"
                    : "bg-cyan-500/15 border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/25"
                }`}
              >
                {maintenanceSaving ? "Saving…" : downloadMaintenance?.enabled ? "Turn maintenance off" : "Turn maintenance on"}
              </button>
            </div>
  
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 mt-4">
              <div>
                <label className="block text-xs text-[#A0A8B3] mb-1.5">Visitor message</label>
                <textarea
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  maxLength={500}
                  rows={2}
                  data-testid="input-download-maintenance-message"
                  placeholder="We are updating the download service."
                  className="w-full resize-y rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
                />
                <p className="text-[10px] text-[#6B7380] mt-1">{maintenanceMessage.length}/500 characters</p>
              </div>
              <div>
                <label className="block text-xs text-[#A0A8B3] mb-1.5">Expected return (optional)</label>
                <input
                  value={maintenanceReturnTime}
                  onChange={(e) => setMaintenanceReturnTime(e.target.value)}
                  maxLength={160}
                  data-testid="input-download-maintenance-return-time"
                  placeholder="e.g. Today at 6:00 PM NZT"
                  className="w-full rounded-lg bg-[#21262D] border border-[#2A313A] px-3 py-2 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
                />
                <button
                  onClick={() => saveDownloadMaintenance(downloadMaintenance?.enabled ?? false)}
                  disabled={maintenanceLoading || maintenanceSaving || !maintenanceMessage.trim()}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium border border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:text-[#E6EAF0] hover:border-[#3A424E] transition-all disabled:opacity-50"
                >
                  Save message
                </button>
              </div>
            </div>
            {maintenanceError && <p className="text-xs text-red-300 mt-3">{maintenanceError}</p>}
            {maintenanceSaved && <p className="text-xs text-emerald-300 mt-3">Download maintenance settings saved.</p>}
            </>
            )}
          </div>
  
          {/* Trials Expiring Panel */}
          <div className="mb-6 rounded-xl border border-cyan-500/15 p-4" style={{ background: "rgba(6,182,212,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-cyan-300/70 uppercase tracking-wider">
                Trials Expiring Soon ({trialsExpiring.length})
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6B7380]">Within</span>
                <select
                  value={trialsExpiringHours}
                  onChange={(e) => { setTrialsExpiringHours(Number(e.target.value)); fetchTrialsExpiring(Number(e.target.value)); }}
                  className="rounded-lg bg-[#21262D] border border-[#2A313A] px-2 py-1 text-xs text-[#E6EAF0] outline-none"
                >
                  {[6, 12, 24, 48, 72, 168].map((h) => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
                <button
                  onClick={() => fetchTrialsExpiring(trialsExpiringHours)}
                  className="text-xs rounded-lg px-2 py-1 border border-cyan-500/25 bg-cyan-500/10 text-cyan-300/80 hover:bg-cyan-500/20 transition-all"
                >
                  Refresh
                </button>
              </div>
            </div>
            {trialsLoading ? (
              <div className="py-4 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
              </div>
            ) : trialsExpiring.length === 0 ? (
              <p className="text-xs text-[#6B7380] italic">No trials expiring in the selected window.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-none">
                {trialsExpiring.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg bg-[#21262D]/50 border border-[#2A313A] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[#E6EAF0] truncate">{u.displayName || u.email || u.id}</p>
                      <p className="text-xs text-[#6B7380]">{u.email || "—"}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <TrialCountdown endsAt={u.trialEndsAt} />
                      <button
                        onClick={() => { setSelectedUser(u); setSelectedLogs([]); }}
                        className="text-xs rounded-lg px-2 py-1 border border-cyan-500/25 bg-cyan-500/10 text-cyan-300/80 hover:bg-cyan-500/20 transition-all"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
  
          {/* Search + Filter + Export */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7380]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by email or name…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                data-testid="input-search-users"
                className="w-full rounded-xl bg-[#21262D] border border-[#2A313A] pl-9 pr-4 py-2.5 text-sm text-[#E6EAF0] placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
              />
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7380]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <input
                type="text"
                placeholder="Stripe Customer ID…"
                value={stripeSearch}
                onChange={(e) => setStripeSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchUsers(1, search, planFilter, e.currentTarget.value, deviceSearch, appFilter)}
                className="w-full rounded-xl bg-[#21262D] border border-[#2A313A] pl-9 pr-4 py-2.5 text-sm text-[#E6EAF0] font-mono placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
              />
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7380]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2z" />
              </svg>
              <input
                type="text"
                placeholder="Device ID…"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchUsers(1, search, planFilter, stripeSearch, e.currentTarget.value, appFilter)}
                className="w-full rounded-xl bg-[#21262D] border border-[#2A313A] pl-9 pr-4 py-2.5 text-sm text-[#E6EAF0] font-mono placeholder-[#6B7380] outline-none focus:border-[#00D4FF] transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={planFilter}
                onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
                data-testid="select-plan-filter"
                className="flex-1 rounded-xl bg-[#21262D] border border-[#2A313A] px-4 py-2.5 text-sm text-[#E6EAF0] outline-none focus:border-[#00D4FF] cursor-pointer appearance-none pr-8"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "20px" }}
              >
                {planOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => fetchUsers(page, search, planFilter, stripeSearch, deviceSearch, appFilter)}
                data-testid="button-refresh-users"
                className="rounded-xl px-4 py-2.5 text-sm font-medium bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#2A313A] transition-colors"
              >
                Search
              </button>
              <button
                onClick={exportCsv}
                className="rounded-xl px-4 py-2.5 text-sm font-medium bg-green-500/10 border border-green-500/20 text-green-400/80 hover:bg-green-500/18 transition-colors"
                title="Export CSV with current filters"
              >
                Export CSV
              </button>
            </div>
          </div>
          {/* Has App Filter Row */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-[#6B7380] font-medium">Has App:</span>
            {(["", "yes", "no"] as const).map((val) => {
              const label = val === "" ? "All" : val === "yes" ? "Yes" : "No";
              const active = appFilter === val;
              return (
                <button
                  key={val}
                  onClick={() => { setAppFilter(val); setPage(1); }}
                  data-testid={`filter-app-${label.toLowerCase()}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                    active
                      ? val === "yes"
                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                        : val === "no"
                        ? "bg-[#6B7380]/20 border-[#6B7380]/50 text-[#A0A8B3]"
                        : "bg-[#2A313A] border-[#3A424D] text-[#E6EAF0]"
                      : "bg-transparent border-[#2A313A] text-[#6B7380] hover:border-[#3A424D] hover:text-[#A0A8B3]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
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
                className="flex-1 rounded-xl bg-[#21262D] border border-[#2A313A] px-4 py-2 text-sm text-[#E6EAF0] font-mono placeholder-[#6B7380] outline-none focus:border-amber-500/50 transition-colors"
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
                  <p className="text-sm font-medium text-[#E6EAF0]">{deviceLookupResult.displayName}</p>
                  <p className="text-xs text-[#6B7380]">{deviceLookupResult.email || deviceLookupResult.id}</p>
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
  
          {/* Collapsible Operations Panels */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { if (!showEvents) fetchStripeEvents(); setShowEvents(!showEvents); }}
              className={`text-xs rounded-lg px-3 py-1.5 border transition-all ${showEvents ? "border-[#00D4FF]/50 bg-[#00D4FF]/15 text-[#00D4FF]" : "border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:text-[#E6EAF0]"}`}
            >
              Stripe Webhook Events
            </button>
            <button
              onClick={() => { if (!showHealth) fetchHealth(); setShowHealth(!showHealth); }}
              className={`text-xs rounded-lg px-3 py-1.5 border transition-all ${showHealth ? "border-green-500/50 bg-green-500/15 text-green-400" : "border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:text-[#E6EAF0]"}`}
            >
              System Health
            </button>
            <button
              onClick={() => setShowDriverDb(!showDriverDb)}
              data-testid="button-toggle-driver-db"
              className={`text-xs rounded-lg px-3 py-1.5 border transition-all ${showDriverDb ? "border-purple-500/50 bg-purple-500/15 text-purple-400" : "border-[#2A313A] bg-[#21262D] text-[#A0A8B3] hover:text-[#E6EAF0]"}`}
            >
              Driver Database
            </button>
          </div>
  
          {showDriverDb && <DriverDbAdmin />}
  
          {showHealth && (
            <div className="mb-6 rounded-xl border border-green-500/15 p-4" style={{ background: "rgba(74,222,128,0.04)" }}>
              <p className="text-xs font-semibold text-green-400/70 uppercase tracking-wider mb-3">System Health</p>
              {healthLoading ? (
                <div className="py-4 flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
              ) : health ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Object.entries(health.checks).map(([name, check]: [string, any]) => (
                    <div key={name} className={`rounded-lg border px-3 py-2 text-xs ${check.ok ? "border-green-500/20 bg-green-500/5 text-green-400" : "border-red-500/20 bg-red-500/5 text-red-400"}`}>
                      <p className="font-medium">{name}</p>
                      <p className="opacity-70 mt-0.5">{check.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#6B7380] italic">Health data unavailable.</p>
              )}
            </div>
          )}
  
          {showEvents && (
            <div className="mb-6 rounded-xl border border-[#00D4FF]/15 p-4" style={{ background: "rgba(0,212,255,0.04)" }}>
              <p className="text-xs font-semibold text-[#00D4FF]/70 uppercase tracking-wider mb-3">Stripe Webhook Events</p>
              {eventsLoading ? (
                <div className="py-4 flex items-center justify-center"><div className="w-5 h-5 rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" /></div>
              ) : stripeEvents.length === 0 ? (
                <p className="text-xs text-[#6B7380] italic">No Stripe events recorded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-none">
                  {stripeEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between rounded-lg bg-[#21262D]/50 border border-[#2A313A] px-3 py-2">
                      <div>
                        <span className="text-xs font-medium text-[#E6EAF0]">{ev.eventType}</span>
                        <span className="text-xs text-[#6B7380] ml-2">{ev.eventId}</span>
                      </div>
                      <span className="text-xs text-[#6B7380]">{fmt(ev.processedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
  
          {error && (
            <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
  
          {/* Table */}
          <div className="rounded-2xl border border-[#2A313A] overflow-hidden"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}>
            <div className="grid grid-cols-[32px_1fr_140px_150px_150px_100px_80px] gap-4 px-5 py-3 items-center">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={users.length > 0 && selectedIds.size === users.length}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 accent-[#00D4FF] cursor-pointer"
                />
              </div>
              {["User", "Plan", "Last Login", "Last App", "App?", ""].map((h) => (
                <span key={h} className="text-xs font-semibold text-[#6B7380] uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-5 py-2 border-t border-[#2A313A] bg-[#1A1F27]/60">
                <span className="text-xs text-[#6B7380]">{selectedIds.size} selected</span>
                <button
                  onClick={() => setShowBatchConfirm(true)}
                  disabled={batchDeleting}
                  className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete selected
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-[#6B7380] hover:text-[#A0A8B3] transition-colors">
                  Clear
                </button>
              </div>
            )}
  
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-[#00D4FF] border-t-[#00D4FF] animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center text-sm text-[#6B7380]">
                {search ? "No users match your search." : "No users yet."}
              </div>
            ) : (
              users.map((u, i) => (
                <div
                  key={u.id}
                  data-testid={`row-user-${u.id}`}
                  className={`grid grid-cols-[32px_1fr_140px_150px_150px_100px_80px] gap-4 px-5 py-3.5 items-center hover:bg-[#21262D] transition-colors cursor-pointer ${
                    i !== users.length - 1 ? "" : ""
                  }`}
                  onClick={() => openUserDetail(u)}
                >
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(u.id)}
                      onChange={() => toggleSelect(u.id)}
                      className="w-3.5 h-3.5 accent-[#00D4FF] cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#00D4FF] border border-[#00D4FF] flex items-center justify-center text-[#33E0FF] font-semibold text-xs flex-shrink-0">
                      {(u.displayName || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-[#E6EAF0]/85 truncate">{u.displayName}</p>
                      <p className="text-xs text-[#6B7380] truncate">{u.email || "—"}</p>
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
                  <span className="text-sm text-[#A0A8B3]">{fmt(u.lastLoginAt)}</span>
                  <span className="text-sm text-[#A0A8B3]">{fmt(u.lastAppActiveAt)}</span>
                  <span className={`text-xs font-medium ${u.hasInstalledApp ? "text-green-400/80" : "text-[#6B7380]/50"}`}>
                    {u.hasInstalledApp ? "✓ Yes" : "No"}
                  </span>
                  <button
                    data-testid={`button-detail-${u.id}`}
                    onClick={(e) => { e.stopPropagation(); openUserDetail(u); }}
                    className="text-xs text-[#00D4FF] hover:text-[#33E0FF] transition-colors text-right"
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
              <p className="text-sm text-[#6B7380]">Showing {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} of {total}</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page"
                  className="rounded-lg px-3 py-1.5 text-sm bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#2A313A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  ← Prev
                </button>
                <span className="flex items-center px-3 text-sm text-[#6B7380]">{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page"
                  className="rounded-lg px-3 py-1.5 text-sm bg-[#21262D] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:bg-[#2A313A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
  
        {/* Batch delete confirmation modal */}
        {showBatchConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#07090D]/85 backdrop-blur-sm" onClick={() => !batchDeleting && setShowBatchConfirm(false)} />
            <div className="relative w-full max-w-md rounded-2xl border border-red-500/25 p-6 shadow-2xl"
              style={{ background: "linear-gradient(160deg, rgba(239,68,68,0.06) 0%, rgba(7,9,13,0.98) 50%, rgba(7,9,13,0.98) 100%)" }}>
              <div className="flex items-start gap-3 mb-5">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#E6EAF0] leading-tight">Delete {selectedIds.size} Users</h3>
                  <p className="text-xs text-[#6B7380] mt-0.5">This is permanent and cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-xl bg-red-500/8 border border-red-500/20 px-3.5 py-3 mb-5">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-xs text-red-300 leading-relaxed">
                  This permanently deletes the selected accounts, all settings, history, AI scans, and active sessions.
                  Any active Stripe subscriptions will be cancelled.
                </p>
              </div>
              {batchDeleteError && (
                <div className="flex gap-2 rounded-lg bg-red-500/10 border border-red-500/25 px-3 py-2.5 mb-4">
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-red-300 text-xs leading-relaxed">{batchDeleteError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBatchConfirm(false)}
                  disabled={batchDeleting}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-[#1A1F27] border border-[#2A313A] text-[#A0A8B3] hover:text-[#E6EAF0] hover:border-[#3A424E] transition-all disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={doBatchDelete}
                  disabled={batchDeleting}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold border bg-red-600/30 border-red-500/40 text-red-300 hover:bg-red-600/50 hover:border-red-500/60 hover:text-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {batchDeleting ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    `Delete ${selectedIds.size} selected`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  