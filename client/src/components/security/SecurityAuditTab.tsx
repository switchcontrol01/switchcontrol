import { useState, useCallback } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Server, Loader2, CheckCircle2, AlertTriangle, ShieldAlert,
  Info, Shield, Lock, Wifi, Database, RefreshCw,
} from "lucide-react";

const eAPI = () => (window as any).electronAPI;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditData {
  secureBoot: boolean | null;
  tpmPresent: boolean | null;
  tpmReady: boolean | null;
  bitlocker: "on" | "off" | null;
  hvciEnabled: boolean | null;
  vbsEnabled: boolean | null;
  uacEnabled: boolean | null;
  uacLevel: number | null;
  rdpEnabled: boolean | null;
  remoteAssistance: boolean | null;
  smbv1Enabled: boolean | null;
  guestAccountEnabled: boolean | null;
  proxyEnabled: boolean | null;
  windowsUpdateRunning: boolean | null;
  hostsModified: boolean | null;
  hostsSuspiciousCount: number;
  hostsSuspiciousEntries?: Array<{ ip: string; domain: string }>;
  lsaProtectionEnabled: boolean | null;
  credentialGuardEnabled: boolean | null;
  listeningPorts?: Array<{ address: string; port: number; pid: number; processName: string | null; protocol: string; notable?: boolean }>;
  notableListeningPorts?: Array<{ address: string; port: number; pid: number; processName: string | null; protocol: string; notable?: boolean }>;
  listeningPortsUnavailable?: boolean;
}

interface TaskData { tasks: any[]; suspicious: any[]; }
interface ServiceData { services: any[]; suspicious: any[]; }

type Severity = "ok" | "warn" | "critical" | "unknown";
type ProbeIssue = { label: string; reason: string; detail?: string };

interface AuditItem {
  label: string;
  value: string;
  severity: Severity;
  explanation: string;
  fix?: string;
  details?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_CONFIG = {
  ok:       { color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", Icon: CheckCircle2,  label: "OK" },
  warn:     { color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     Icon: AlertTriangle, label: "Warning" },
  critical: { color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         Icon: ShieldAlert,   label: "Critical" },
  unknown:  { color: "text-zinc-400",    bg: "bg-zinc-500/15 border-zinc-500/25",       Icon: Info,          label: "Unknown" },
};

function probeReasonLabel(reason: string | undefined): string {
  switch (reason) {
    case "unsupported":
      return "Unsupported on this Windows edition";
    case "permission_denied":
      return "Permission denied";
    case "provider_unavailable":
      return "Driver/provider unavailable";
    case "temporarily_failed":
    case "busy":
      return "Probe temporarily failed";
    default:
      return "Probe unavailable";
  }
}

function boolToAudit(val: boolean | null, okLabel: string, failLabel: string, okSev: Severity, failSev: Severity, explanation: string, fix?: string): AuditItem["severity"] {
  return val === true ? okSev : val === false ? failSev : "unknown";
}

function makeItem(label: string, val: boolean | null, okLabel: string, failLabel: string, okSev: Severity, failSev: Severity, explanation: string, fix?: string): AuditItem {
  const severity = val === true ? okSev : val === false ? failSev : "unknown";
  const value = val === true ? okLabel : val === false ? failLabel : "Unknown";
  return { label, value, severity, explanation, fix };
}

function buildAuditItems(d: AuditData): { platform: AuditItem[]; remote: AuditItem[]; persistence: AuditItem[] } {
  const platform: AuditItem[] = [
    makeItem("Secure Boot",        d.secureBoot,   "Enabled",  "Disabled", "ok", "critical", "Secure Boot verifies the bootloader isn't tampered with. Disabling it allows malicious boot-level rootkits.", "Enable in BIOS/UEFI settings."),
    makeItem("TPM Present",        d.tpmPresent,   "Present",  "Not found", "ok", "warn",    "A TPM chip is required for BitLocker, Windows Hello, and Windows 11 attestation."),
    makeItem("TPM Ready",          d.tpmReady,     "Ready",    "Not ready", "ok", "warn",    "The TPM chip exists but isn't fully initialised. BitLocker and attestation may not work."),
    {
      label: "BitLocker",
      value: d.bitlocker === "on" ? "Enabled" : d.bitlocker === "off" ? "Disabled" : "Unknown",
      severity: d.bitlocker === "on" ? "ok" : d.bitlocker === "off" ? "warn" : "unknown",
      explanation: "BitLocker encrypts your drive so data can't be read if the disk is stolen.",
      fix: d.bitlocker !== "on" ? "Enable BitLocker in Control Panel → BitLocker Drive Encryption." : undefined,
    },
    makeItem("Memory Integrity (HVCI)", d.hvciEnabled, "Enabled", "Disabled", "ok", "warn", "Hypervisor-Protected Code Integrity prevents unsigned kernel-mode drivers from running.", "Enable in Windows Security → Device Security → Core isolation."),
    makeItem("Virtualization-Based Security", d.vbsEnabled, "Active", "Disabled", "ok", "warn", "VBS uses hardware virtualisation to isolate sensitive system processes from the OS."),
    makeItem("LSA Protection", d.lsaProtectionEnabled, "Enabled", "Disabled", "ok", "warn", "Protected Process Light makes credential-dumping from LSASS substantially harder.", "Enable LSA protection with Windows Security or the RunAsPPL policy."),
    makeItem("Credential Guard", d.credentialGuardEnabled, "Running", "Not running", "ok", "warn", "Credential Guard isolates reusable Windows credentials using virtualization-based security.", "Enable Credential Guard through your organization's Windows security policy."),
    makeItem("UAC Enabled",        d.uacEnabled,   "On",       "Disabled",  "ok", "critical", "User Account Control prompts before apps make privileged changes. Disabling it is a significant security risk.", "Turn UAC back on in Control Panel → User Accounts."),
  ];

  if (d.uacLevel !== null && d.uacEnabled) {
    platform.push({
      label: "UAC Level",
      value: d.uacLevel === 0 ? "Off (Insecure)" : d.uacLevel === 1 ? "No-dimming" : d.uacLevel === 2 ? "Notify (Default)" : d.uacLevel === 3 ? "Always notify" : `Level ${d.uacLevel}`,
      severity: d.uacLevel === 0 ? "critical" : d.uacLevel <= 1 ? "warn" : "ok",
      explanation: "Higher UAC levels offer stronger isolation. Level 2 (Notify) is the Windows default.",
    });
  }

  const notablePorts = d.notableListeningPorts ?? [];
  const remote: AuditItem[] = [
    makeItem("RDP (Remote Desktop)",  d.rdpEnabled,        "Enabled", "Disabled", "warn", "ok", "RDP enabled means port 3389 is open. If unused, disable it to reduce your attack surface.", "Disable in Settings → System → Remote Desktop."),
    makeItem("Remote Assistance",     d.remoteAssistance,  "Enabled", "Disabled", "warn", "ok", "Remote Assistance allows other users to view and control your PC when invited."),
    makeItem("SMBv1 Protocol",        d.smbv1Enabled,      "Enabled", "Disabled", "critical", "ok", "SMBv1 is exploited by ransomware like WannaCry. It should be disabled on all modern Windows systems.", "Disable via: Turn Windows features on/off → SMB 1.0/CIFS File Sharing Support."),
    makeItem("Guest Account",         d.guestAccountEnabled, "Enabled", "Disabled", "warn", "ok", "A live guest account provides a vector for unauthenticated local access."),
    makeItem("Proxy Configured",      d.proxyEnabled,      "Active", "None",      "warn", "ok", "An active proxy routes traffic through a third-party server. Verify the proxy is trusted."),
    makeItem("Windows Update Service", d.windowsUpdateRunning, "Running", "Stopped", "ok", "warn", "The Windows Update service must be running to receive security patches."),
    {
      label: "Listening TCP Ports",
      value: d.listeningPortsUnavailable ? "Unavailable" : `${d.listeningPorts?.length ?? 0} listening`,
      severity: d.listeningPortsUnavailable ? "unknown" : notablePorts.length > 0 ? "warn" : "ok",
      explanation: notablePorts.length > 0
        ? "These ports are listening outside the small expected Windows/RDP allowlist. Review the owning process and firewall rule."
        : "Enumerates active TCP listeners and highlights ports outside the expected Windows/RDP allowlist.",
      details: notablePorts.map(p => `${p.port} · ${p.processName || "unknown process"} · ${p.address} · PID ${p.pid}`),
    },
  ];

  const persistence: AuditItem[] = [
    {
      label: "Hosts File",
      value: d.hostsModified ? `${d.hostsSuspiciousCount} custom entries` : "Clean",
      severity: d.hostsModified === null ? "unknown" : d.hostsModified ? "warn" : "ok",
      explanation: "The hosts file can redirect domains to malicious IP addresses. Entries beyond localhost are worth reviewing.",
      details: (d.hostsSuspiciousEntries ?? []).map(e => `${e.domain} → ${e.ip}`),
    },
  ];

  return { platform, remote, persistence };
}

// ── AuditSection ──────────────────────────────────────────────────────────────

function AuditSection({ title, Icon, items }: { title: string; Icon: any; items: AuditItem[] }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
        {items.filter(i => i.severity === "critical").length > 0 && (
          <Badge variant="outline" className="ml-auto text-xs text-red-400 border-red-500/30 bg-red-500/10">
            {items.filter(i => i.severity === "critical").length} critical
          </Badge>
        )}
      </div>
      <div className="space-y-0.5">
        {items.map((item, i) => {
          const cfg = SEV_CONFIG[item.severity];
          return (
            <motion.div key={item.label}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="py-2  last:border-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <Badge variant="outline" className={cn("font-medium text-xs gap-1.5 shrink-0", cfg.bg, cfg.color)}>
                  <cfg.Icon className="size-3" />
                  {item.value}
                </Badge>
              </div>
              {item.severity !== "ok" && item.severity !== "unknown" && (
                <p className="text-[11px] text-muted-foreground/70 mt-1">{item.explanation}</p>
              )}
              {item.fix && item.severity !== "ok" && (
                <p className={cn("text-[11px] mt-0.5", cfg.color)}>→ {item.fix}</p>
              )}
              {item.details && item.details.length > 0 && (
                <div className="mt-2 rounded-lg border border-white/8 bg-black/15 p-2 space-y-1">
                  {item.details.map((detail, detailIndex) => (
                    <p key={`${item.label}-${detailIndex}`} className="text-[10px] font-mono text-muted-foreground/80 break-all">
                      {detail}
                    </p>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ── Tasks / Services sections ─────────────────────────────────────────────────

function SuspiciousTasksSection({ taskData }: { taskData: TaskData }) {
  const suspicious = taskData.suspicious ?? [];
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Database className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Scheduled Tasks</h3>
        <Badge variant="outline" className={cn("ml-auto text-xs", suspicious.length > 0 ? "text-amber-400 border-amber-500/25 bg-amber-500/10" : "text-muted-foreground")}>
          {suspicious.length} suspicious
        </Badge>
      </div>
      {suspicious.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground/60">
          <CheckCircle2 className="size-6 mx-auto opacity-30 mb-2 text-emerald-400" />
          No suspicious tasks detected
        </div>
      ) : (
        <div className="space-y-2">
          {suspicious.map((t: any, i: number) => (
            <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs">
              <p className="font-medium text-amber-400">{t.Name}</p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[10px] break-all">{t.Execute}{t.Arguments ? ` ${t.Arguments}` : ""}</p>
              <p className="text-muted-foreground/60 mt-0.5">{t.Path} · {t.State}</p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function SuspiciousServicesSection({ serviceData }: { serviceData: ServiceData }) {
  const suspicious = serviceData.suspicious ?? [];
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Server className="size-4 text-primary" />
        <h3 className="font-semibold text-sm">Running Services</h3>
        <Badge variant="outline" className={cn("ml-auto text-xs", suspicious.length > 0 ? "text-amber-400 border-amber-500/25 bg-amber-500/10" : "text-muted-foreground")}>
          {suspicious.length} suspicious
        </Badge>
      </div>
      {suspicious.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground/60">
          <CheckCircle2 className="size-6 mx-auto opacity-30 mb-2 text-emerald-400" />
          No suspicious services detected
        </div>
      ) : (
        <div className="space-y-2">
          {suspicious.map((s: any, i: number) => (
            <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs">
              <p className="font-medium text-amber-400">{s.displayName || s.name}</p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[10px] break-all">{s.path}</p>
              <p className="text-muted-foreground/60 mt-0.5">Start: {s.startMode} · Account: {s.startName}</p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SecurityAuditTab({ hasSecurity }: { hasSecurity: boolean }) {
  const [auditStatus, setAuditStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [auditData, setAuditData]     = useState<AuditData | null>(null);
  const [taskData,  setTaskData]      = useState<TaskData | null>(null);
  const [serviceData, setServiceData] = useState<ServiceData | null>(null);
  const [probeIssues, setProbeIssues] = useState<ProbeIssue[]>([]);

  const runAudit = useCallback(async () => {
    if (!hasSecurity || auditStatus === "scanning") return;
    setAuditStatus("scanning");
    try {
      const [auditRes, taskRes, svcRes] = await Promise.allSettled([
        eAPI().security.getAdvancedAudit(),
        eAPI().security.getScheduledTasks(),
        eAPI().security.getServices(),
      ]);

      const issues: ProbeIssue[] = [];
      const collect = (label: string, result: PromiseSettledResult<any>) => {
        if (result.status === "rejected") {
          issues.push({ label, reason: "temporarily_failed", detail: result.reason?.message });
        } else if (!result.value?.available) {
          issues.push({
            label,
            reason: result.value?.reason,
            detail: result.value?.error || result.value?.detail,
          });
        }
      };
      collect("Advanced security", auditRes);
      collect("Scheduled tasks", taskRes);
      collect("Services", svcRes);

      if (auditRes.status === "fulfilled" && auditRes.value?.available) setAuditData(auditRes.value.data);
      if (taskRes.status === "fulfilled"  && taskRes.value?.available)  setTaskData(taskRes.value.data);
      if (svcRes.status === "fulfilled"   && svcRes.value?.available)   setServiceData(svcRes.value.data);
      setProbeIssues(issues);
      setAuditStatus("done");
    } catch {
      setAuditStatus("error");
    }
  }, [hasSecurity, auditStatus]);

  const auditItems = auditData ? buildAuditItems(auditData) : null;

  const totalCritical = auditItems
    ? [...auditItems.platform, ...auditItems.remote, ...auditItems.persistence].filter(i => i.severity === "critical").length
    : 0;

  return (
    <div className="space-y-4">
      {/* Scan card */}
      <GlassCard className="p-5" data-testid="card-audit-scan">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Advanced Security Audit</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
               Firmware, process trust, credential protection, remote access, ports, and persistence risks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {auditStatus === "done" && totalCritical > 0 && (
              <Badge variant="outline" className="text-xs text-red-400 border-red-500/30 bg-red-500/10">{totalCritical} critical</Badge>
            )}
            {auditStatus === "done" && totalCritical === 0 && (
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Clean</Badge>
            )}
            <Button className="gap-2" onClick={runAudit} disabled={!hasSecurity || auditStatus === "scanning"} data-testid="button-run-audit">
              {auditStatus === "scanning" ? <><Loader2 className="size-4 animate-spin" />Auditing…</> : <><RefreshCw className="size-4" />{auditStatus === "done" ? "Re-audit" : "Run Audit"}</>}
            </Button>
          </div>
        </div>

        {!hasSecurity && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/60">
            <Info className="size-3.5 shrink-0" />
            Audit requires the SwitchControl desktop app running on Windows.
          </div>
        )}
        {auditStatus === "error" && (
          <p className="mt-3 text-xs text-red-400">Audit failed. Some checks may require admin privileges.</p>
        )}
        {probeIssues.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5" data-testid="audit-probe-issues">
            <div className="flex items-start gap-2">
              <Info className="size-3.5 mt-0.5 shrink-0 text-amber-400" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-300">Some Windows checks need attention</p>
                {probeIssues.map((issue) => (
                  <p key={issue.label} className="text-[11px] text-muted-foreground">
                    {issue.label}: {probeReasonLabel(issue.reason)}
                    {issue.detail ? ` — ${issue.detail}` : ""}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Idle state */}
      {auditStatus === "idle" && (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="size-12 mx-auto opacity-15 mb-4" />
          <p className="text-sm font-medium">Advanced Security Audit</p>
          <p className="text-xs mt-1 max-w-sm mx-auto opacity-70">
            Run the audit to inspect firmware integrity, remote access exposure, and persistence risks on your system.
          </p>
        </div>
      )}

      {auditStatus === "scanning" && (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="size-10 mx-auto animate-spin mb-4 text-primary" />
          <p className="text-sm">Running deep security audit…</p>
          <p className="text-xs mt-1 opacity-60">Checking firmware, services, registry policies, and network exposure</p>
        </div>
      )}

      {/* Results */}
      {auditStatus === "done" && auditItems && (
        <motion.div
          className="grid grid-cols-1 xl:grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <AuditSection title="Platform & Firmware Trust" Icon={Lock}   items={auditItems.platform} />
          <AuditSection title="Remote & Network Exposure" Icon={Wifi}   items={auditItems.remote} />
          <AuditSection title="Persistence & File Risks"  Icon={Shield} items={auditItems.persistence} />

          {taskData    && <SuspiciousTasksSection    taskData={taskData} />}
          {serviceData && <SuspiciousServicesSection serviceData={serviceData} />}
        </motion.div>
      )}

      {auditStatus === "done" && !auditData && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <AlertTriangle className="size-8 mx-auto opacity-30 mb-2 text-amber-400" />
          Audit data unavailable. Some checks may require admin privileges or are unsupported on this system.
        </div>
      )}
    </div>
  );
}
