import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Loader2, CloudOff } from 'lucide-react';
import { useNetworkStatus, type NetworkState } from '@/hooks/use-network-status';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

const CONFIG: Record<NetworkState, {
  icon: React.ReactNode;
  label: string;
  dot: string;
  ring: string;
  glow: string;
  bg: string;
  text: string;
  border: string;
  pulse: boolean;
}> = {
  online: {
    icon: <Wifi className="size-2.5" />,
    label: 'Online',
    dot: 'bg-emerald-400',
    ring: 'ring-emerald-400/20',
    glow: '',
    bg: 'bg-emerald-500/[0.04]',
    text: 'text-emerald-400/60',
    border: 'border-emerald-500/[0.10]',
    pulse: false,
  },
  offline: {
    icon: <WifiOff className="size-2.5" />,
    label: 'Offline mode — local tools available',
    dot: 'bg-red-400',
    ring: 'ring-red-400/20',
    glow: 'shadow-[0_0_12px_-4px_rgba(248,113,113,0.5)]',
    bg: 'bg-red-500/[0.07]',
    text: 'text-red-400/90',
    border: 'border-red-500/20',
    pulse: true,
  },
  reconnecting: {
    icon: <Loader2 className="size-2.5 animate-spin" />,
    label: 'Reconnecting…',
    dot: 'bg-amber-400',
    ring: 'ring-amber-400/20',
    glow: '',
    bg: 'bg-amber-500/[0.06]',
    text: 'text-amber-400/80',
    border: 'border-amber-500/15',
    pulse: true,
  },
  degraded: {
    icon: <CloudOff className="size-2.5" />,
    label: 'Cloud unavailable — local tools still work',
    dot: 'bg-amber-400',
    ring: 'ring-amber-400/20',
    glow: 'shadow-[0_0_10px_-4px_rgba(251,191,36,0.4)]',
    bg: 'bg-amber-500/[0.06]',
    text: 'text-amber-400/80',
    border: 'border-amber-500/15',
    pulse: false,
  },
};

interface NetworkStatusChipProps {
  className?: string;
}

export function NetworkStatusChip({ className }: NetworkStatusChipProps) {
  const { networkState } = useNetworkStatus();
  const { t } = useTranslation();

  const cfg = CONFIG[networkState];
  const showChip = networkState !== 'online';

  return (
    <AnimatePresence>
      {showChip && (
        <motion.div
          key={networkState}
          initial={{ opacity: 0, x: 8, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 8, scale: 0.95 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm',
            cfg.bg, cfg.border, cfg.glow, cfg.text,
            className
          )}
          data-testid="network-status-chip"
        >
          <span className={cn(
            'size-1.5 rounded-full shrink-0',
            cfg.dot,
            cfg.pulse && 'animate-pulse',
          )} />
          <span className="shrink-0">{cfg.icon}</span>
          <span className="text-[10px] font-medium tracking-wide whitespace-nowrap">
            {t(cfg.label)}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
