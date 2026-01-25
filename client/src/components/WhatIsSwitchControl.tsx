import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Monitor, Wifi, ChevronRight, Shield, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimateIn from './AnimateIn';

type TabId = 'latency' | 'frames' | 'network';

interface TabContent {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const tabContents: TabContent[] = [
  {
    id: 'latency',
    label: 'Latency',
    icon: <Zap className="w-4 h-4" />,
    description: 'Optimizes scheduling, timer behavior, and background thread contention to reduce input-to-photon delay.',
  },
  {
    id: 'frames',
    label: 'Frames',
    icon: <Monitor className="w-4 h-4" />,
    description: 'Improves frame pacing consistency by reducing spikes from background load and unstable power behavior.',
  },
  {
    id: 'network',
    label: 'Network',
    icon: <Wifi className="w-4 h-4" />,
    description: 'Targets jitter and bufferbloat risks for smoother real-time packet flow in competitive games.',
  },
];

const pillars = [
  { icon: <Zap className="w-5 h-5" />, text: 'Lower input delay and faster response', color: 'text-yellow-400' },
  { icon: <Monitor className="w-5 h-5" />, text: 'More stable FPS and smoother 1% lows', color: 'text-green-400' },
  { icon: <Wifi className="w-5 h-5" />, text: 'Reduced ping spikes and jitter', color: 'text-blue-400' },
  { icon: <Shield className="w-5 h-5" />, text: 'Cleaner background load while gaming', color: 'text-purple-400' },
];

export function WhatIsSwitchControl() {
  const [activeTab, setActiveTab] = useState<TabId>('latency');

  const activeContent = tabContents.find(t => t.id === activeTab)!;

  return (
    <section className="py-20 md:py-24 relative" data-reveal>
      <div className="container mx-auto px-4 max-w-4xl">
        <AnimateIn delay={100}>
          <motion.div 
            className={cn(
              "relative rounded-2xl overflow-hidden",
              "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
              "backdrop-blur-xl border border-white/10",
              "shadow-2xl shadow-primary/5"
            )}
            animate={{ 
              y: [0, -6, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Subtle glow border effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 via-transparent to-pink-500/10 opacity-50 pointer-events-none" />
            <div className="absolute inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
            
            {/* Content */}
            <div className="relative p-6 md:p-10">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="inline-flex items-center gap-3 md:gap-4">
                    <span 
                      className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent"
                      style={{ 
                        fontFamily: '"Playfair Display", serif',
                        fontWeight: 700,
                        filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.15))',
                        lineHeight: 1,
                        letterSpacing: '0.01em',
                      }}
                    >
                      What is
                    </span>
                    <img 
                      src="/switchcontrol-wordmark.png" 
                      alt="SwitchControl"
                      className="h-8 md:h-10 lg:h-11 object-contain animate-logo-float"
                      style={{ 
                        filter: 'drop-shadow(0 0 10px rgba(139, 92, 246, 0.4))',
                        marginTop: '8px',
                      }}
                    />
                  </div>
                </div>
                <p className="text-zinc-300 text-base md:text-lg leading-relaxed max-w-2xl mx-auto text-center mb-2">
                  SwitchControl is a competitive performance control panel for Windows.
                </p>
                <p className="text-zinc-300 text-base md:text-lg leading-relaxed max-w-2xl mx-auto text-center">
                  It helps reduce input delay, stabilize frame pacing, and improve network consistency by applying safe, reversible system optimizations.
                </p>
              </div>

              {/* Pillars with icons */}
              <div className="mb-8">
                <p className="text-sm text-zinc-400 text-center mb-4">
                  Built for competitive players who care about:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pillars.map((pillar, index) => (
                    <AnimateIn key={index} delay={150 + index * 50}>
                      <div 
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          "bg-white/[0.03] border border-white/5",
                          "hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300"
                        )}
                      >
                        <div className={cn("flex-shrink-0", pillar.color)}>
                          {pillar.icon}
                        </div>
                        <span className="text-sm text-zinc-200">{pillar.text}</span>
                      </div>
                    </AnimateIn>
                  ))}
                </div>
              </div>

              {/* Not placebo statement */}
              <div className="text-center mb-8">
                <p className="text-zinc-300 font-medium">
                  Not a fake "FPS booster". Not placebo.{' '}
                  <span className="text-primary">Real system control.</span>
                </p>
              </div>

              {/* Interactive Tabs */}
              <div className="mb-6">
                <div className="flex justify-center gap-2 mb-4">
                  {tabContents.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                        "transition-all duration-300 ease-out",
                        activeTab === tab.id
                          ? "bg-primary/20 text-primary border border-primary/40 shadow-lg shadow-primary/20"
                          : "bg-white/[0.03] text-zinc-400 border border-white/5 hover:bg-white/[0.06] hover:text-zinc-200"
                      )}
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab Content with Animation */}
                <div className="relative min-h-[80px] flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className={cn(
                        "text-center p-4 rounded-lg",
                        "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
                        "border border-white/5"
                      )}
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-primary">{activeContent.icon}</span>
                        <span className="text-sm font-semibold text-white">{activeContent.label} Optimization</span>
                      </div>
                      <p className="text-sm text-zinc-400 leading-relaxed max-w-lg">
                        {activeContent.description}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Reversible disclaimer */}
              <div className="text-center pt-4 border-t border-white/5">
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                  <RotateCcw className="w-4 h-4" />
                  <span>Every change is explained. Every change is reversible.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimateIn>
      </div>
    </section>
  );
}
