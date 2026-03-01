import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Wifi,
  Cpu,
  Sparkles,
  Crown,
  Lock,
  Unlock,
} from 'lucide-react';
import { TourShell, type TourStep } from './TourShell';
import { useAuthStore, postTourSeen } from '@/lib/auth-store';
import { SOCIAL_LINKS } from '@/config/socialLinks';

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  );
}

function StagedUnlockAnimation() {
  return (
    <div className="flex justify-center py-2">
      <motion.div className="relative flex items-center justify-center w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ boxShadow: '0 0 0 0 rgba(139,92,246,0)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(139,92,246,0)',
              '0 0 20px 8px rgba(139,92,246,0.3)',
              '0 0 40px 16px rgba(139,92,246,0.5)',
              '0 0 60px 24px rgba(139,92,246,0)',
            ],
          }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            animate={{
              rotate: [0, -6, 6, -4, 4, 0],
              scale: [1, 1.05, 1.05, 1.05, 1.05, 1.1],
            }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.6, duration: 0.15 }}
            >
              <Lock className="w-8 h-8 text-purple-400" />
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute"
          initial={{ opacity: 0, scale: 0.6, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            delay: 0.7,
            type: 'spring',
            stiffness: 500,
            damping: 15,
          }}
        >
          <Unlock className="w-8 h-8 text-purple-300" />
        </motion.div>

        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-purple-400/80"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
              x: Math.cos((i * Math.PI * 2) / 6) * 28,
              y: Math.sin((i * Math.PI * 2) / 6) * 28,
            }}
            transition={{
              delay: 0.75 + i * 0.03,
              duration: 0.5,
              ease: 'easeOut',
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

const PREMIUM_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome-premium',
    title: 'Welcome to Premium',
    description: 'You now have access to the full SwitchControl suite. Let us show you what is unlocked.',
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: '/dashboard',
  },
  {
    id: 'power-plan',
    title: 'Power Plan Control',
    description: 'Fine-tune your Windows power settings for maximum gaming performance. Choose from optimized profiles or create custom overrides tailored to your hardware.',
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="power-plan"]',
    route: '/dashboard',
  },
  {
    id: 'network-tweaks',
    title: 'Network Tweaks',
    description: 'Reduce latency and packet loss with advanced TCP/IP, UDP, DNS, and SMB optimizations. Premium-only network stack tuning for competitive gaming.',
    icon: <Wifi className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="network-content"]',
    route: '/network',
  },
  {
    id: 'bios-advisor',
    title: 'BIOS Intelligence',
    description: 'Expert BIOS configuration guidance tailored to your specific motherboard and CPU. Get safe, performance-tested recommendations for your exact setup.',
    icon: <Cpu className="w-5 h-5 text-cyan-400" />,
    targetSelector: '[data-tour="bios-content"]',
    route: '/bios-advisor',
  },
  {
    id: 'ai-advisor',
    title: 'Full System Visibility',
    description: 'Your personal AI-powered optimization assistant. It scans your system and recommends the best tweaks for your hardware — available exclusively for Premium users.',
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    targetSelector: '[data-tour="ai-advisor"]',
    route: '/dashboard',
  },
  {
    id: 'premium-unlocked',
    title: 'Premium Activated',
    description: 'Everything is unlocked. Priority support, advanced telemetry, and full optimization control are now yours. Enjoy your Premium experience.',
    icon: <Crown className="w-5 h-5 text-amber-400" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: '/dashboard',
    action: <StagedUnlockAnimation />,
  },
  {
    id: 'discord',
    title: 'Join the Community',
    description: 'Join the Discord for updates, announcements, and premium giveaways.',
    icon: <DiscordIcon className="w-5 h-5 text-[#5865F2]" />,
    targetSelector: '[data-tour="dashboard-hero"]',
    route: '/dashboard',
    action: (
      <button
        onClick={() => {
          const url = SOCIAL_LINKS.discord;
          const api = (window as any).electronAPI;
          if (api?.openExternal) {
            api.openExternal(url);
          } else {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium text-sm transition-colors w-full justify-center"
        data-testid="premium-tour-join-discord"
      >
        <DiscordIcon className="w-4 h-4" />
        Join Discord
      </button>
    ),
  },
];

interface GuidedTourProps {
  show: boolean;
  onComplete: () => void;
}

export function GuidedTour({ show, onComplete }: GuidedTourProps) {
  return (
    <TourShell
      show={show}
      steps={PREMIUM_TOUR_STEPS}
      onComplete={onComplete}
      returnRoute="/dashboard"
      testId="premium-guided-tour"
    />
  );
}

export function usePremiumTourState() {
  const [showTour, setShowTour] = useState(false);

  const triggerTour = useCallback(() => {
    const user = useAuthStore.getState().user;
    if (user?.isPremium === true && user?.hasSeenPremiumTour === false) {
      console.log('[PremiumTour] Triggering premium guided tour (server-driven)');
      setShowTour(true);
    } else {
      console.log(`[PremiumTour] Tour skipped — isPremium=${user?.isPremium} hasSeenPremiumTour=${user?.hasSeenPremiumTour}`);
    }
  }, []);

  const completeTour = useCallback(async () => {
    console.log('[PremiumTour] Tour completed — posting tour-seen to server');
    await postTourSeen();
    setShowTour(false);
  }, []);

  return { showTour, triggerTour, completeTour };
}
