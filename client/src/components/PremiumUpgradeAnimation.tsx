import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Unlock } from 'lucide-react';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [stage, setStage] = useState<'fade' | 'logo' | 'crown' | 'unlock' | 'glow' | 'done'>('fade');

  useEffect(() => {
    if (!show) {
      setStage('fade');
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    
    timers.push(setTimeout(() => setStage('logo'), 300));
    timers.push(setTimeout(() => setStage('crown'), 1000));
    timers.push(setTimeout(() => setStage('unlock'), 1800));
    timers.push(setTimeout(() => setStage('glow'), 2600));
    timers.push(setTimeout(() => {
      setStage('done');
      onComplete();
    }, 3500));

    return () => timers.forEach(clearTimeout);
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="relative flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ 
              opacity: stage === 'logo' || stage === 'crown' || stage === 'unlock' || stage === 'glow' ? 1 : 0,
              scale: stage === 'logo' || stage === 'crown' || stage === 'unlock' || stage === 'glow' ? 1 : 0.8,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative"
          >
            <div className="text-4xl font-bold tracking-tight">
              <span className="text-white">Switch</span>
              <span className="text-purple-400">Control</span>
            </div>
            
            <AnimatePresence>
              {(stage === 'crown' || stage === 'unlock' || stage === 'glow') && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.5 }}
                  animate={{ opacity: 1, y: -40, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'backOut' }}
                  className="absolute left-1/2 -translate-x-1/2 top-0"
                >
                  <Crown className="w-10 h-10 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {(stage === 'unlock' || stage === 'glow') && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="mt-8 flex items-center gap-3"
              >
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <Unlock className="w-6 h-6 text-green-400" />
                </motion.div>
                <span className="text-lg text-white/90">Premium Unlocked</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {stage === 'glow' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: [0, 0.6, 0.3, 0.5],
                  scale: [0.8, 1.2, 1.1, 1.15],
                }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="absolute inset-0 -z-10 bg-gradient-radial from-purple-500/30 via-purple-500/10 to-transparent rounded-full blur-3xl"
                style={{ width: '300px', height: '300px', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
