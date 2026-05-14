import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useUpdater } from '@/hooks/use-updater';
import { Button } from '@/components/ui/button';
import { RenderMarkdown } from '@/lib/render-markdown';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

const URGENCY_STYLES = {
  critical: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/8',
    glow: 'shadow-[0_0_24px_-6px_rgba(239,68,68,0.35)]',
    accent: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    badgeLabel: 'Critical Update',
    icon: <AlertTriangle className="size-4 text-red-400" />,
  },
  recommended: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/6',
    glow: 'shadow-[0_0_20px_-6px_rgba(245,158,11,0.3)]',
    accent: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    badgeLabel: 'Recommended',
    icon: <ArrowUpCircle className="size-4 text-amber-400" />,
  },
  normal: {
    border: 'border-violet-500/25',
    bg: 'bg-violet-500/5',
    glow: 'shadow-[0_0_18px_-6px_rgba(0,212,255,0.25)]',
    accent: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    badgeLabel: 'Update Available',
    icon: <ArrowUpCircle className="size-4 text-violet-400" />,
  },
};

export function UpdateBanner() {
  const { state, download, install } = useUpdater();

  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const { status, availableVersion, downloadPercent, bytesPerSecond, transferred, total, urgency, releaseNotes } = state;

  useEffect(() => {
    if (availableVersion && dismissedVersion && availableVersion !== dismissedVersion) {
      setDismissedVersion(null);
    }
  }, [availableVersion, dismissedVersion]);

  const isDismissed = dismissedVersion === availableVersion;

  const visible =
    !isDismissed &&
    (status === 'available' || status === 'downloading' || status === 'downloaded');

  const style = URGENCY_STYLES[urgency as keyof typeof URGENCY_STYLES] ?? URGENCY_STYLES.normal;

  const hasNotes = !!(releaseNotes && releaseNotes.trim());

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scaleY: 0.9 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={{ opacity: 0, y: -10, scaleY: 0.9 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`relative flex items-start gap-3 px-4 py-2.5 border rounded-xl mx-4 mb-2
            backdrop-blur-md ${style.border} ${style.bg} ${style.glow}`}
          data-testid="update-banner"
        >
          {/* Icon */}
          <div className="shrink-0 mt-0.5">{style.icon}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {status === 'available' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${style.badge}`}>
                    {style.badgeLabel}
                  </span>
                  <span className="text-sm text-white/80">
                    SwitchControl <span className={`font-semibold ${style.accent}`}>{availableVersion}</span> is ready.
                  </span>
                </div>
                {hasNotes && (
                  <div>
                    <button
                      onClick={() => setShowNotes(v => !v)}
                      data-testid="button-banner-toggle-notes"
                      className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      {showNotes ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      {showNotes ? 'Hide' : 'See what\'s new'}
                    </button>
                    <AnimatePresence initial={false}>
                      {showNotes && (
                        <motion.div
                          key="banner-notes"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1.5 p-3 rounded-lg backdrop-blur-md bg-[#21262D] border border-[#2A313A]0 max-h-40 overflow-y-auto">
                            <RenderMarkdown markdown={releaseNotes!} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}

            {status === 'downloading' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/80">
                    Downloading update… <span className={`font-semibold ${style.accent}`}>{downloadPercent}%</span>
                  </span>
                  <span className="text-xs text-white/40">
                    {formatBytes(transferred)} / {formatBytes(total)} · {formatSpeed(bytesPerSecond)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full rounded-full bg-[#2A313A] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                    animate={{ width: `${downloadPercent}%` }}
                    transition={{ ease: 'linear', duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {status === 'downloaded' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  <span className="text-sm text-white/80">
                    <span className="font-semibold text-emerald-400">{availableVersion}</span> downloaded — restart to apply.
                  </span>
                </div>
                {hasNotes && (
                  <div>
                    <button
                      onClick={() => setShowNotes(v => !v)}
                      data-testid="button-banner-toggle-notes"
                      className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      {showNotes ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      {showNotes ? 'Hide' : 'See what\'s new'}
                    </button>
                    <AnimatePresence initial={false}>
                      {showNotes && (
                        <motion.div
                          key="banner-notes-downloaded"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1.5 p-3 rounded-lg backdrop-blur-md bg-[#21262D] border border-[#2A313A]0 max-h-40 overflow-y-auto">
                            <RenderMarkdown markdown={releaseNotes!} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions — always top-aligned so they don't shift when notes expand */}
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {status === 'available' && (
              <Button
                size="sm"
                variant="outline"
                onClick={download}
                data-testid="button-updater-download"
                className={`h-7 text-xs border-current gap-1.5 ${style.accent} hover:bg-[#21262D]`}
              >
                <Download className="size-3" />
                Download
              </Button>
            )}
            {status === 'downloaded' && (
              <Button
                size="sm"
                onClick={install}
                data-testid="button-updater-install"
                className="h-7 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 gap-1.5"
              >
                <RefreshCw className="size-3" />
                Restart & Install
              </Button>
            )}
            {status !== 'downloading' && (
              <button
                onClick={() => setDismissedVersion(availableVersion)}
                data-testid="button-updater-dismiss"
                className="size-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-[#21262D] transition-colors"
                aria-label="Dismiss update banner"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
