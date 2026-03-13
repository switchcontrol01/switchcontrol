import { TourShell, type TourStep } from './TourShell';
import {
  Sparkles,
  Cpu,
  Wifi,
  Zap,
  Shield,
  Settings,
} from 'lucide-react';
import { SOCIAL_LINKS } from '@/config/socialLinks';

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  );
}

const ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    targetSelector: '[data-tour="dashboard"]',
    title: 'Dashboard Overview',
    description: 'Monitor your system performance in real-time. View CPU, GPU, RAM usage and disk health at a glance.',
    icon: <Sparkles className="w-5 h-5" />,
    sidebarHighlight: 'dashboard',
  },
  {
    id: 'bios-advisor',
    targetSelector: '[data-tour="bios-advisor"]',
    title: 'AI BIOS Advisor',
    description: 'Get personalized BIOS optimization recommendations powered by AI to maximize your gaming performance.',
    icon: <Cpu className="w-5 h-5" />,
    sidebarHighlight: 'bios-advisor',
  },
  {
    id: 'tweaks',
    targetSelector: '[data-tour="tweaks"]',
    title: 'System Tweaks',
    description: 'Apply proven Windows optimizations to reduce latency and boost FPS in your favorite games.',
    icon: <Zap className="w-5 h-5" />,
    sidebarHighlight: 'tweaks',
  },
  {
    id: 'network',
    targetSelector: '[data-tour="network"]',
    title: 'Network Optimization',
    description: 'Fine-tune your network settings for lower ping and more stable online gaming.',
    icon: <Wifi className="w-5 h-5" />,
    sidebarHighlight: 'network',
  },
  {
    id: 'security',
    targetSelector: '[data-tour="security"]',
    title: 'Security Center',
    description: 'Keep your system secure without sacrificing gaming performance.',
    icon: <Shield className="w-5 h-5" />,
    sidebarHighlight: 'security',
  },
  {
    id: 'settings',
    targetSelector: '[data-tour="settings"]',
    title: 'Settings',
    description: 'Customize SwitchControl to fit your preferences and manage your account.',
    icon: <Settings className="w-5 h-5" />,
    sidebarHighlight: 'settings',
  },
  {
    id: 'discord',
    targetSelector: '[data-tour="dashboard"]',
    title: 'Join the Community',
    description: 'Join the Discord for updates, announcements, and premium giveaways.',
    icon: <DiscordIcon className="w-5 h-5 text-[#5865F2]" />,
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
        data-testid="tour-join-discord"
      >
        <DiscordIcon className="w-4 h-4" />
        Join Discord
      </button>
    ),
  },
];

interface OnboardingTourProps {
  show?: boolean;
  onComplete: () => void;
  onSkip: () => void;
  isFirstTime?: boolean;
}

export function OnboardingTour({ show = true, onComplete, onSkip, isFirstTime = true }: OnboardingTourProps) {
  return (
    <TourShell
      show={show}
      steps={ONBOARDING_STEPS}
      onComplete={onComplete}
      onSkip={onSkip}
      canSkip={!isFirstTime}
      returnRoute="/dashboard"
      testId="onboarding-tour"
    />
  );
}
