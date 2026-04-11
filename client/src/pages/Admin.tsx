import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/lib/auth-store";

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
  createdAt: string | null;
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

function fmtFull(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
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
  const cls = styles[plan] || styles.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {labels[plan] || plan}
    </span>
  );
}

function TrialCountdown({ endsAt }: { endsAt: string | null }) {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const now = new Date();
  if (end < now) return <span className="text-orange-400 text-xs">Expired</span>;
  const ms = end.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const text = d > 0 ? `${d}d ${h % 24}h remaining` : `${h}h remaining`;
  return <span className="text-cyan-400 text-xs">{text}</span>;
}

type PlanOption = "free" | "trial" | "premium";

function SetPlanDialog({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  onClose: () => void;
  onSuccess: (updated: AdminUser) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>(
    (["free", "trial", "premium"].includes(user.effectivePlan as any)
      ? user.effectivePlan
      : "free") as PlanOption
  );
  const [trialHours, setTrialHours] = useState(72);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body: any = { plan: selectedPlan, reason: reason || undefined };
      if (selectedPlan === "trial") body.trialDurationHours = trialHours;

      const r = await fetch(`/api/admin/users/${user.id}/plan`, {
        method: "PATCH",
        headers: buildHeaders() as any,
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to update plan");
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
                  ? p === "premium"
                    ? "bg-violet-500/30 border-violet-400/50 text-violet-200"
                    : p === "trial"
                    ? "bg-cyan-500/30 border-cyan-400/50 text-cyan-200"
                    : "bg-white/15 border-white/20 text-white"
                  : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {selectedPlan === "trial" && (
          <div className="mb-4">
            <label className="block text-xs text-white/50 mb-1.5">Trial Duration (hours)</label>
            <input
              type="number"
              min={1}
              max={8760}
              value={trialHours}
              onChange={(e) => setTrialHours(Number(e.target.value))}
              data-testid="input-trial-hours"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/60 focus:bg-white/8 transition-colors"
            />
            <p className="text-xs text-white/30 mt-1">
              = {Math.round(trialHours / 24)} day{Math.round(trialHours / 24) !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs text-white/50 mb-1.5">Reason (optional)</label>
          <input
            type="text"
            placeholder="e.g. Support request, compensation, test..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="input-reason"
            maxLength={500}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/60 focus:bg-white/8 transition-colors"
          />
        </div>

        {error && (
          <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="button-confirm-plan"
            onClick={submit}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border transition-all ${
              loading
                ? "opacity-50 cursor-not-allowed bg-violet-600/20 border-violet-500/20 text-violet-400"
                : "bg-violet-600/30 border-violet-500/40 text-violet-200 hover:bg-violet-600/40"
            }`}
          >
            {loading ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailPanel({
  user,
  logs,
  onClose,
  onPlanUpdated,
}: {
  user: AdminUser;
  logs: AdminLog[];
  onClose: () => void;
  onPlanUpdated: (u: AdminUser) => void;
}) {
  const [showSetPlan, setShowSetPlan] = useState(false);
  const [settingAdmin, setSettingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState(user);
  const [localLogs, setLocalLogs] = useState(logs);

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
      setLocalUser(data.user);
      onPlanUpdated(data.user);
    } catch (e: any) {
      setAdminError(e.message);
    } finally {
      setSettingAdmin(false);
    }
  };

  const handlePlanSuccess = (updated: AdminUser) => {
    setLocalUser(updated);
    onPlanUpdated(updated);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1" onClick={onClose} />
        <div
          className="w-full max-w-md h-full overflow-y-auto border-l border-white/8 shadow-2xl"
          style={{ background: "linear-gradient(180deg, rgba(20,12,45,0.98) 0%, rgba(7,9,13,0.99) 100%)" }}
        >
          <div className="flex items-center justify-between p-5 border-b border-white/8">
            <h3 className="text-base font-semibold text-white">User Detail</h3>
            <button
              onClick={onClose}
              data-testid="button-close-detail"
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Identity */}
            <div
              className="rounded-xl border border-white/8 p-4"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-semibold text-sm flex-shrink-0">
                  {(localUser.displayName || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{localUser.displayName}</p>
                  <p className="text-xs text-white/40 truncate">{localUser.email || "No email"}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <PlanBadge plan={localUser.effectivePlan} />
                    {localUser.isAdmin && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">
                        Admin
                      </span>
                    )}
                    <span className="text-xs text-white/30 capitalize">{localUser.provider}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Plan Details */}
            <div
              className="rounded-xl border border-white/8 p-4"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Plan Details</p>
              <div className="space-y-2.5 text-sm">
                <Row label="Effective Plan" value={<PlanBadge plan={localUser.effectivePlan} />} />
                <Row label="DB Plan" value={localUser.plan || "—"} />
                <Row label="Stripe Premium" value={localUser.isPremium ? "Yes" : "No"} />
                <Row label="Stripe ID" value={localUser.stripeCustomerId || "—"} mono />
                {localUser.plan === "trial" && (
                  <>
                    <Row label="Trial Started" value={fmtFull(localUser.trialStartedAt)} />
                    <Row
                      label="Trial Ends"
                      value={
                        <span className="flex items-center gap-2">
                          {fmtFull(localUser.trialEndsAt)}
                          <TrialCountdown endsAt={localUser.trialEndsAt} />
                        </span>
                      }
                    />
                    <Row label="Duration" value={`${localUser.trialDurationHours}h`} />
                    <Row label="Reason" value={localUser.trialReason || "—"} />
                  </>
                )}
                <Row label="Used Trial Before" value={localUser.hasUsedTrial ? "Yes" : "No"} />
              </div>
            </div>

            {/* Activity */}
            <div
              className="rounded-xl border border-white/8 p-4"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Activity</p>
              <div className="space-y-2.5 text-sm">
                <Row label="Last Login" value={fmtFull(localUser.lastLoginAt)} />
                <Row label="Last App Active" value={fmtFull(localUser.lastAppActiveAt)} />
                <Row label="Member Since" value={fmtFull(localUser.createdAt)} />
                <Row label="User ID" value={localUser.id} mono />
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                data-testid="button-set-plan"
                onClick={() => setShowSetPlan(true)}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium bg-violet-600/25 border border-violet-500/35 text-violet-200 hover:bg-violet-600/35 transition-all"
              >
                Set Plan
              </button>
              <button
                data-testid="button-toggle-admin"
                onClick={toggleAdmin}
                disabled={settingAdmin}
                className={`w-full rounded-xl px-4 py-3 text-sm font-medium border transition-all ${
                  localUser.isAdmin
                    ? "bg-orange-500/15 border-orange-500/25 text-orange-300 hover:bg-orange-500/25"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80"
                } ${settingAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {settingAdmin ? "Updating…" : localUser.isAdmin ? "Revoke Admin" : "Grant Admin"}
              </button>
              {adminError && (
                <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {adminError}
                </p>
              )}
            </div>

            {/* Admin Logs */}
            {localLogs.length > 0 && (
              <div
                className="rounded-xl border border-white/8 p-4"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Recent Actions
                </p>
                <div className="space-y-2">
                  {localLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-white/70">{log.action.replace(/_/g, " ")}</span>
                        {log.metadata?.reason && (
                          <span className="text-white/30"> — {log.metadata.reason}</span>
                        )}
                        <p className="text-white/25 mt-0.5">{fmtFull(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSetPlan && (
        <SetPlanDialog
          user={localUser}
          onClose={() => setShowSetPlan(false)}
          onSuccess={handlePlanSuccess}
        />
      )}
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 items-start">
      <span className="text-white/40 flex-shrink-0">{label}</span>
      <span className={`text-white/75 text-right truncate max-w-xs ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

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

  const checkAdmin = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/me", {
        headers: buildHeaders() as any,
      });
      setAuthorized(r.ok);
    } catch {
      setAuthorized(false);
    }
  }, []);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  const fetchUsers = useCallback(async (p: number, s: string, plan: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "30" });
      if (s) params.set("search", s);
      if (plan) params.set("plan", plan);
      const r = await fetch(`/api/admin/users?${params}`, {
        headers: buildHeaders() as any,
      });
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
    if (authorized === true) {
      fetchUsers(page, search, planFilter);
    }
  }, [authorized, page, planFilter]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchUsers(1, value, planFilter);
    }, 350);
  };

  const openUserDetail = async (u: AdminUser) => {
    setSelectedUser(u);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, {
        headers: buildHeaders() as any,
      });
      if (r.ok) {
        const data = await r.json();
        setSelectedUser(data.user);
        setSelectedLogs(data.logs || []);
      }
    } catch {}
  };

  const handlePlanUpdated = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    if (selectedUser?.id === updated.id) setSelectedUser(updated);
  };

  if (authorized === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#07090D" }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: "#07090D" }}
      >
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-white">Admin Access Required</h1>
        <p className="text-sm text-white/40">
          {user ? "Your account does not have admin privileges." : "Please log in with an admin account."}
        </p>
        <a href="/" className="text-violet-400 text-sm hover:text-violet-300 transition-colors mt-2">
          ← Back to home
        </a>
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
      <div className="border-b border-white/8 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-white/50 hover:text-white transition-colors text-sm">
              SwitchControl
            </a>
            <span className="text-white/20">/</span>
            <span className="text-white font-semibold">Admin</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/20 text-orange-300 border-orange-500/30">
              Internal
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <span
              className="w-2 h-2 rounded-full bg-green-400"
              style={{ boxShadow: "0 0 6px rgba(74,222,128,0.6)" }}
            />
            {total.toLocaleString()} users
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search + Filter */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="input-search-users"
              className="w-full rounded-xl bg-white/5 border border-white/10 pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 focus:bg-white/8 transition-colors"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            data-testid="select-plan-filter"
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white/70 outline-none focus:border-violet-500/50 cursor-pointer appearance-none pr-8"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", backgroundSize: "20px" }}
          >
            {planOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-gray-900">
                {o.label}
              </option>
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

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div
          className="rounded-2xl border border-white/8 overflow-hidden"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)" }}
        >
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_140px_160px_140px_130px_80px] gap-4 px-5 py-3 border-b border-white/6">
            {["User", "Plan", "Last Login", "Last App", "Joined", "Actions"].map((h) => (
              <span key={h} className="text-xs font-semibold text-white/35 uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
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
                className={`grid grid-cols-[1fr_140px_160px_140px_130px_80px] gap-4 px-5 py-3.5 items-center hover:bg-white/4 transition-colors cursor-pointer ${
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
                    <span className="flex-shrink-0 text-xs bg-orange-500/15 text-orange-300 border border-orange-500/25 rounded-full px-1.5 py-0.5">
                      Admin
                    </span>
                  )}
                </div>
                <div>
                  <PlanBadge plan={u.effectivePlan} />
                  {u.plan === "trial" && u.trialEndsAt && (
                    <div className="mt-0.5">
                      <TrialCountdown endsAt={u.trialEndsAt} />
                    </div>
                  )}
                </div>
                <span className="text-sm text-white/45">{fmt(u.lastLoginAt)}</span>
                <span className="text-sm text-white/45">{fmt(u.lastAppActiveAt)}</span>
                <span className="text-sm text-white/35">{fmt(u.createdAt)}</span>
                <button
                  data-testid={`button-detail-${u.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openUserDetail(u);
                  }}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
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
            <p className="text-sm text-white/30">
              Showing {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                data-testid="button-prev-page"
                className="rounded-lg px-3 py-1.5 text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="flex items-center px-3 text-sm text-white/40">
                {page} / {pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                data-testid="button-next-page"
                className="rounded-lg px-3 py-1.5 text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          logs={selectedLogs}
          onClose={() => {
            setSelectedUser(null);
            setSelectedLogs([]);
          }}
          onPlanUpdated={handlePlanUpdated}
        />
      )}
    </div>
  );
}
