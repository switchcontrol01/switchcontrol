import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/lib/authStore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SerializedUser {
  id: string;
  email: string | null;
  displayName: string;
  plan: string | null;
  effectivePlan: string;
  isPremium: boolean;
  hasUsedTrial: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialGrantedByAdminId: string | null;
  trialReason: string | null;
  premiumBoundDeviceId: string | null;
  premiumLastSeenDeviceId: string | null;
  premiumBoundAt: string | null;
  premiumDeviceLastSeenAt: string | null;
  lastLoginAt: string | null;
  appVersion: string | null;
  platform: string | null;
  createdAt: string | null;
}

interface RiskInfo {
  level: "green" | "yellow" | "orange" | "red" | "unknown";
  score: number;
  reasons: string[];
}

interface InspectResult {
  query: string;
  found: boolean;
  hasDeviceHistory: boolean;
  accountsLinked: number;
  emailsLinked: string[];
  primaryUser: SerializedUser | null;
  allUsers: SerializedUser[];
  firstSeen: string | null;
  lastSeen: string | null;
  trialUsed: boolean;
  trialActive: boolean;
  manualGrant: boolean;
  premiumStatus: boolean;
  appVersion: string | null;
  platform: string | null;
  risk: RiskInfo;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtPlan(plan: string | null, effectivePlan: string): string {
  const p = effectivePlan || plan || "free";
  if (p === "premium") return "Premium";
  if (p === "trial") return "Trial";
  return "Free";
}

const RISK_CONFIG = {
  green:   { label: "Clean",               color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)"  },
  yellow:  { label: "Previously Trialled", color: "#eab308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.3)"  },
  orange:  { label: "Multiple Accounts",   color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)" },
  red:     { label: "High Risk",           color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)"  },
  unknown: { label: "Not Found",           color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.3)"},
};
const RISK_EMOJI = { green: "🟢", yellow: "🟡", orange: "🟠", red: "🔴", unknown: "⚫" };

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color: "#6b7280", fontSize: "13px", width: "170px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#e6eaf0", fontSize: "13px", fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === null ? "#6b7280" : ok ? "#22c55e" : "#ef4444";
  const bg    = ok === null ? "rgba(107,114,128,0.1)" : ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  const icon  = ok === null ? "○" : ok ? "✓" : "✗";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "6px", background: bg }}>
      <span style={{ color, fontSize: "12px", fontWeight: 700 }}>{icon}</span>
      <span style={{ color: "#e6eaf0", fontSize: "12px" }}>{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#14181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden", marginBottom: "16px" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <span style={{ color: "#9ca3af", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

function PlanBadge({ plan, effectivePlan }: { plan: string | null; effectivePlan: string }) {
  const p = effectivePlan || plan || "free";
  const styles =
    p === "premium"
      ? { bg: "rgba(168,85,247,0.15)", color: "#c084fc" }
      : p === "trial"
      ? { bg: "rgba(234,179,8,0.15)", color: "#fbbf24" }
      : { bg: "rgba(107,114,128,0.12)", color: "#9ca3af" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 600, background: styles.bg, color: styles.color }}>
      {fmtPlan(plan, effectivePlan)}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminDeviceInspectorPage() {
  const user = useAuthStore((s) => s.user);
  // Pre-fill from ?q= URL param (e.g. linked from admin user card)
  const _initialQ = useRef(
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("q") ?? "") : ""
  );
  const [query, setQuery] = useState(_initialQ.current);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  if (!user?.isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0c0e12", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6b7280" }}>Access denied.</p>
      </div>
    );
  }

  const handleInspect = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/devices/inspect/${encodeURIComponent(q)}`, {
        headers: buildHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inspection failed.");
      setResult(data as InspectResult);
    } catch (e: any) {
      setError(e.message ?? "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Auto-search when the page loads with a pre-filled ?q= param
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (_initialQ.current.trim()) handleInspect(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleInspect();
  };

  const handleGrantTrial = useCallback(async (userId: string) => {
    setActionLoading("trial-" + userId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/set-trial`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ durationHours: 72, reason: "Admin Device Inspector grant" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setActionMsg("✓ 72-hour trial granted.");
    } catch (e: any) {
      setActionMsg("✗ " + (e.message ?? "Failed."));
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleGrantPremium = useCallback(async (userId: string) => {
    setActionLoading("premium-" + userId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify({ plan: "premium", reason: "Admin Device Inspector grant" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setActionMsg("✓ Premium granted.");
    } catch (e: any) {
      setActionMsg("✗ " + (e.message ?? "Failed."));
    } finally {
      setActionLoading(null);
    }
  }, []);

  const risk    = result?.risk;
  const rc      = risk ? RISK_CONFIG[risk.level] : null;
  const primary = result?.primaryUser;

  return (
    <div style={{ minHeight: "100vh", background: "#0c0e12", color: "#e6eaf0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "16px 32px", display: "flex", alignItems: "center", gap: "8px" }}>
        <a href="/admin" style={{ color: "#6b7280", fontSize: "14px", textDecoration: "none" }}>Admin</a>
        <span style={{ color: "#374151", fontSize: "14px" }}>/</span>
        <span style={{ color: "#e6eaf0", fontSize: "14px", fontWeight: 500 }}>Device Inspector</span>
        <span style={{ marginLeft: "8px", padding: "2px 8px", background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: "4px", color: "#9ca3af", fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em" }}>INTERNAL</span>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>

        {/* Title + description */}
        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 6px 0" }}>Device Inspector</h1>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 20px 0" }}>
          Paste a Device ID to look up all linked accounts, trial history, and risk analysis.
          Records are stored permanently — results survive app close, logout, device rebind, and admin plan changes.
        </p>

        {/* Search */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "28px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Device ID (e.g. A1B2C3D4E5F60001) or fingerprint hash"
            style={{
              flex: 1,
              background: "#14181d",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#e6eaf0",
              fontSize: "14px",
              fontFamily: "monospace",
              outline: "none",
            }}
          />
          <button
            onClick={handleInspect}
            disabled={loading || !query.trim()}
            style={{
              padding: "10px 24px",
              background: loading ? "rgba(99,102,241,0.4)" : "#6366f1",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Inspecting…" : "Inspect"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#f87171", fontSize: "13px", marginBottom: "20px" }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Risk Banner */}
            {rc && (
              <div style={{ padding: "16px 20px", background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: "10px", marginBottom: "20px", display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "28px", flexShrink: 0, marginTop: "2px" }}>{RISK_EMOJI[risk!.level]}</span>
                <div style={{ flex: 1, minWidth: "160px" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: rc.color }}>{rc.label}</div>
                  <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
                    Risk score: {risk!.score} · {result.accountsLinked} account{result.accountsLinked !== 1 ? "s" : ""} linked
                    {result.hasDeviceHistory ? " · Permanent record found" : " · Live data only (no permanent record yet)"}
                  </div>
                </div>
                {risk!.reasons.length > 0 && (
                  <ul style={{ margin: 0, padding: "0 0 0 16px", listStyle: "disc", fontSize: "12px", color: "#9ca3af", flexShrink: 0 }}>
                    {risk!.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Not Found */}
            {!result.found && (
              <Card title="Result">
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚫</div>
                  <div style={{ color: "#e6eaf0", fontSize: "15px", fontWeight: 600 }}>No records found</div>
                  <div style={{ color: "#6b7280", fontSize: "13px", marginTop: "6px" }}>
                    Device ID <span style={{ fontFamily: "monospace", color: "#9ca3af" }}>{result.query}</span> has never been seen by the cloud server.
                  </div>
                  <div style={{ color: "#4b5563", fontSize: "12px", marginTop: "16px", maxWidth: "480px", margin: "16px auto 0" }}>
                    If this device was granted a trial manually before the app contacted the cloud (e.g. account created after the trial was given), there may be no server-side record.
                    Device IDs are recorded the first time the Electron app opens while logged in.
                  </div>
                </div>
              </Card>
            )}

            {result.found && (
              <>
                {/* Status Pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                  <StatusPill ok={result.found}                        label="Device Known" />
                  <StatusPill ok={result.hasDeviceHistory}             label={result.hasDeviceHistory ? "Permanent Record" : "Live Data Only"} />
                  <StatusPill ok={primary?.premiumBoundDeviceId != null ? true : null} label="Currently Bound" />
                  <StatusPill ok={result.trialUsed ? false : null}     label={result.trialUsed ? "Trial Used" : "No Trial"} />
                  <StatusPill ok={result.trialActive}                  label={result.trialActive ? "Trial Active" : "Trial Inactive"} />
                  <StatusPill ok={result.premiumStatus ? true : null}  label={result.premiumStatus ? "Premium Seen" : "Never Premium"} />
                  <StatusPill ok={result.manualGrant ? false : null}   label={result.manualGrant ? "Manual Grant" : "Organic"} />
                </div>

                {/* Coverage note for pre-history devices */}
                {!result.hasDeviceHistory && (
                  <div style={{ padding: "10px 14px", background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "8px", fontSize: "12px", color: "#9ca3af", marginBottom: "16px" }}>
                    <span style={{ color: "#fbbf24", fontWeight: 600 }}>Live data only</span> — this device was found in the active users table but has no permanent history record yet.
                    A permanent record will be created the next time this device connects to the server.
                  </div>
                )}

                {/* Device Details */}
                <Card title="Device Details">
                  <InfoRow label="Device ID"        value={result.query}                        mono />
                  <InfoRow label="First Seen"       value={fmtDate(result.firstSeen)} />
                  <InfoRow label="Last Seen"        value={fmtDate(result.lastSeen)} />
                  <InfoRow label="App Version"      value={result.appVersion ?? "—"} />
                  <InfoRow label="Platform"         value={result.platform   ?? "—"} />
                  <InfoRow label="Accounts Linked"  value={String(result.accountsLinked)} />
                  <InfoRow label="Emails Linked"    value={
                    result.emailsLinked?.length
                      ? result.emailsLinked.join(", ")
                      : "—"
                  } />
                  <InfoRow label="History Source"   value={result.hasDeviceHistory ? "device_records table (permanent)" : "users table (live only)"} />
                </Card>

                {/* Primary Account */}
                {primary && (
                  <Card title="Primary Account">
                    <InfoRow label="User ID"        value={primary.id}           mono />
                    <InfoRow label="Email"          value={primary.email ?? "—"} />
                    <InfoRow label="Display Name"   value={primary.displayName} />
                    <InfoRow label="Plan"           value={<PlanBadge plan={primary.plan} effectivePlan={primary.effectivePlan} />} />
                    <InfoRow label="Trial Used"     value={primary.hasUsedTrial ? "Yes" : "No"} />
                    <InfoRow label="Trial Start"    value={fmtDate(primary.trialStartedAt)} />
                    <InfoRow label="Trial Ends"     value={fmtDate(primary.trialEndsAt)} />
                    <InfoRow label="Manual Grant"   value={primary.trialGrantedByAdminId ? `Yes (admin ID: ${primary.trialGrantedByAdminId})` : "No"} />
                    <InfoRow label="Grant Reason"   value={primary.trialReason ?? "—"} />
                    <InfoRow label="Last Login"     value={fmtDate(primary.lastLoginAt)} />
                    <InfoRow label="Bound Device"   value={primary.premiumBoundDeviceId     ?? "—"} mono />
                    <InfoRow label="Last Seen Dev." value={primary.premiumLastSeenDeviceId  ?? "—"} mono />
                    <InfoRow label="Device Last Seen" value={fmtDate(primary.premiumDeviceLastSeenAt)} />
                    <InfoRow label="Account Created"  value={fmtDate(primary.createdAt)} />

                    {/* Actions */}
                    <div style={{ marginTop: "16px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={() => handleGrantTrial(primary.id)}
                        disabled={!!actionLoading}
                        style={{ padding: "8px 16px", background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "6px", color: "#fbbf24", fontSize: "13px", fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer" }}
                      >
                        {actionLoading === "trial-" + primary.id ? "Granting…" : "Grant 72h Trial"}
                      </button>
                      <button
                        onClick={() => handleGrantPremium(primary.id)}
                        disabled={!!actionLoading}
                        style={{ padding: "8px 16px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "6px", color: "#c084fc", fontSize: "13px", fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer" }}
                      >
                        {actionLoading === "premium-" + primary.id ? "Granting…" : "Grant Premium"}
                      </button>
                      <a
                        href={`/admin?search=${encodeURIComponent(primary.email ?? primary.id)}`}
                        style={{ padding: "8px 16px", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "6px", color: "#818cf8", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
                      >
                        View in Admin →
                      </a>
                      {actionMsg && (
                        <span style={{ fontSize: "13px", color: actionMsg.startsWith("✓") ? "#22c55e" : "#f87171" }}>{actionMsg}</span>
                      )}
                    </div>
                  </Card>
                )}

                {/* All Linked Accounts (when >1) */}
                {result.allUsers.length > 1 && (
                  <Card title={`All Linked Accounts (${result.allUsers.length})`}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr>
                            {["Email", "Plan", "Trial Used", "Bound Device", "Last Seen", ""].map((h) => (
                              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#6b7280", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.allUsers.map((u) => (
                            <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              <td style={{ padding: "8px 10px", color: "#e6eaf0" }}>{u.email ?? u.id}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <PlanBadge plan={u.plan} effectivePlan={u.effectivePlan} />
                              </td>
                              <td style={{ padding: "8px 10px", color: u.hasUsedTrial ? "#fbbf24" : "#6b7280" }}>
                                {u.hasUsedTrial ? "Yes" : "No"}
                              </td>
                              <td style={{ padding: "8px 10px", color: "#6b7280", fontFamily: "monospace", fontSize: "12px" }}>
                                {u.premiumBoundDeviceId ?? "—"}
                              </td>
                              <td style={{ padding: "8px 10px", color: "#6b7280" }}>{fmtDate(u.premiumDeviceLastSeenAt)}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <a href={`/admin?search=${encodeURIComponent(u.email ?? u.id)}`} style={{ color: "#818cf8", fontSize: "12px", textDecoration: "none" }}>
                                  View →
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* Coverage note */}
            <div style={{ padding: "10px 14px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: "8px", fontSize: "12px", color: "#6b7280" }}>
              <span style={{ color: "#818cf8", fontWeight: 600 }}>Coverage:</span> Permanent records are written every time the Electron app contacts the cloud server (login, heartbeat, entitlement check).
              Records survive <code style={{ color: "#9ca3af" }}>clearPremiumDevice</code>, plan changes, and backend restarts.
              Device IDs seen before this system was deployed are only available if they are still stored in the current users table.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
