import { motion } from 'framer-motion';
import {
  Download, RefreshCw, ArrowUpCircle, CheckCircle2, AlertTriangle,
  Loader2, RotateCcw, ChevronDown, ChevronUp, Shield, Radio, WifiOff
} from 'lucide-react';
import { useState } from 'react';
import { useUpdater } from '@/hooks/use-updater';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (!bps) return '0 KB/s';
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function humanizeError(msg: string | null): string {
  if (!msg) return 'Something went wrong. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('err_name_not_resolved') || m.includes('enotfound'))
    return 'Update server is unreachable. Check your connection or try again later.';
  if (m.includes('err_internet_disconnected') || m.includes('err_network_changed') || m.includes('err_proxy_connection_failed'))
    return 'No internet connection.';
  if (m.includes('econnrefused') || m.includes('econnreset') || m.includes('err_connection_refused'))
    return 'Connection refused by update server.';
  if (m.includes('etimedout') || m.includes('err_connection_timed_out') || m.includes('err_timed_out'))
    return 'Connection timed out. Please try again.';
  if (m.includes('err_ssl') || m.includes('certificate'))
    return 'Secure connection failed. Please try again.';
  if (m.includes('404') || m.includes('not found'))
    return 'No update package found on server.';
  if (m.includes('403') || m.includes('forbidden') || m.includes('401') || m.includes('unauthorized'))
    return 'Access denied by update server.';
  // Trim long internal messages
  if (msg.length > 120) return msg.slice(0, 120) + '…';
  return msg;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

const URGENCY_CONFIG = {
  critical: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    glow: 'shadow-[0_0_24px_-8px_rgba(239,68,68,0.3)]',
    accent: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30 border',
    icon: <AlertTriangle className="size-4 text-red-400" />,
    label: 'Critical Update',
    desc: 'Required for app compatibility.',
  },
  recommended: {
    border: 'border-amber-500/25',
    bg: 'bg-amber-500/5',
    glow: 'shadow-[0_0_20px_-8px_rgba(245,158,11,0.25)]',
    accent: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30 border',
    icon: <ArrowUpCircle className="size-4 text-amber-400" />,
    label: 'Recommended Update',
    desc: 'Includes significant improvements.',
  },
  normal: {
    border: 'border-violet-500/20',
    bg: 'bg-violet-500/4',
    glow: 'shadow-[0_0_16px_-8px_rgba(139,92,246,0.2)]',
    accent: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25 border',
    icon: <ArrowUpCircle className="size-4 text-violet-400" />,
    label: 'Update Available',
    desc: 'Latest improvements and fixes.',
  },
};

export function UpdateCard() {
  const { state, check, download, install, isElectron } = useUpdater();
  const { isOnline } = useNetworkStatus();
  const [showNotes, setShowNotes] = useState(false);

  if (!isElectron) return null;

  const {
    status,
    currentVersion,
    availableVersion,
    downloadPercent,
    bytesPerSecond,
    transferred,
    total,
    releaseNotes,
    releaseDate,
    errorMessage,
    checkedAt,
    urgency,
    channel,
  } = state;

  const urgCfg = URGENCY_CONFIG[urgency as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.normal;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Software Update</CardTitle>
            <CardDescription>Keep SwitchControl up to date for the best experience.</CardDescription>
          </div>
          {/* Channel badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <Radio className="size-3 text-emerald-400" />
            <span className="text-[11px] font-medium text-white/60 uppercase tracking-wider">
              {channel}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current version row */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Installed version</span>
          <span className="font-mono text-white/70">{currentVersion ?? '—'}</span>
        </div>

        {/* ── offline ── */}
        {!isOnline && (status === 'idle' || status === 'not-available' || status === 'error') && (
          <GlassCard className="p-4 flex items-center gap-3 border-amber-500/20 bg-amber-500/5">
            <div className="size-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <WifiOff className="size-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white/80">No internet connection</p>
              <p className="text-xs text-muted-foreground mt-0.5">Update checks require internet access.</p>
            </div>
          </GlassCard>
        )}

        {/* ── idle / not-available ── */}
        {isOnline && (status === 'idle' || status === 'not-available') && (
          <GlassCard className="p-4 flex items-center gap-3">
            <div className="size-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white/90">
                {status === 'not-available' ? "You're up to date" : 'Check for an update'}
              </p>
              {checkedAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last checked: {formatDate(checkedAt)}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={check}
              data-testid="button-updater-check"
              className="text-xs shrink-0"
            >
              Check now
            </Button>
          </GlassCard>
        )}

        {/* ── checking ── */}
        {status === 'checking' && (
          <GlassCard className="p-4 flex items-center gap-3">
            <Loader2 className="size-5 text-violet-400 animate-spin shrink-0" />
            <p className="text-sm text-white/70">Checking for updates…</p>
          </GlassCard>
        )}

        {/* ── available ── */}
        {status === 'available' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className={`p-4 space-y-3 ${urgCfg.border} ${urgCfg.bg} ${urgCfg.glow}`}>
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  {urgCfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${urgCfg.badge}`}>
                      {urgCfg.label}
                    </span>
                    {releaseDate && (
                      <span className="text-xs text-white/35">{formatDate(releaseDate)}</span>
                    )}
                  </div>
                  <p className="text-sm text-white/80">
                    Version <span className={`font-semibold ${urgCfg.accent}`}>{availableVersion}</span> is available.
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{urgCfg.desc}</p>
                </div>
              </div>

              {/* Release notes toggle */}
              {releaseNotes && (
                <div>
                  <button
                    onClick={() => setShowNotes(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white/70 transition-colors"
                    data-testid="button-updater-toggle-notes"
                  >
                    {showNotes ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {showNotes ? 'Hide' : 'Show'} release notes
                  </button>
                  {showNotes && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 p-3 rounded-lg bg-black/20 border border-white/[0.06]"
                    >
                      <pre className="text-xs text-white/60 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                        {releaseNotes}
                      </pre>
                    </motion.div>
                  )}
                </div>
              )}

              <Button
                size="sm"
                onClick={download}
                data-testid="button-updater-download"
                className={`gap-2 text-xs w-full justify-center bg-white/5 hover:bg-white/10 border ${urgCfg.border} ${urgCfg.accent}`}
                variant="outline"
              >
                <Download className="size-3.5" />
                Download Update
              </Button>
            </GlassCard>
          </motion.div>
        )}

        {/* ── downloading ── */}
        {status === 'downloading' && (
          <GlassCard className="p-4 space-y-3 border-violet-500/20">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 text-violet-400 animate-spin" />
                <span className="text-white/80">Downloading update…</span>
              </div>
              <span className="text-violet-400 font-semibold">{downloadPercent}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 shadow-[0_0_10px_rgba(139,92,246,0.6)]"
                animate={{ width: `${downloadPercent}%` }}
                transition={{ ease: 'linear', duration: 0.35 }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatBytes(transferred)} / {formatBytes(total)}</span>
              <span>{formatSpeed(bytesPerSecond)}</span>
            </div>
          </GlassCard>
        )}

        {/* ── downloaded / ready to install ── */}
        {status === 'downloaded' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard className="p-4 space-y-3 border-emerald-500/25 bg-emerald-500/5 shadow-[0_0_20px_-8px_rgba(16,185,129,0.25)]">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="size-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/90">Ready to install</p>
                  <p className="text-xs text-emerald-400/70 mt-0.5">
                    v{availableVersion} downloaded. Restart to apply.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={install}
                data-testid="button-updater-install"
                className="w-full justify-center gap-2 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                variant="outline"
              >
                <RefreshCw className="size-3.5" />
                Restart &amp; Install Now
              </Button>
              <p className="text-[10px] text-white/30 text-center">
                The app will restart and install the update automatically.
              </p>
            </GlassCard>
          </motion.div>
        )}

        {/* ── error ── */}
        {isOnline && status === 'error' && (
          <GlassCard className="p-4 space-y-3 border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80">Update check failed</p>
                <p className="text-xs text-red-400/70 mt-1 break-words">
                  {humanizeError(errorMessage)}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={check}
              data-testid="button-updater-retry"
              className="gap-2 text-xs text-red-400 border-red-500/20 hover:bg-red-500/10"
            >
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          </GlassCard>
        )}

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pt-1">
          <Shield className="size-3 shrink-0" />
          <span>Updates are cryptographically signed and verified automatically.</span>
        </div>
      </CardContent>
    </Card>
  );
}
