import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoNoCrown from '@/assets/premium/logo-no-crown.png';
import logoWithCrown from '@/assets/premium/logo-with-crown.png';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type AnimationPhase = 'idle' | 'suspension' | 'unlock' | 'logo-upgrade' | 'return' | 'done';

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [showCrownLogo, setShowCrownLogo] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playUnlockSound = useCallback(() => {
    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.08);
      oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.15);
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.log('[PremiumAnimation] Sound disabled or failed');
    }
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setShowCrownLogo(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    
    setPhase('suspension');
    
    timers.push(setTimeout(() => {
      setPhase('unlock');
      playUnlockSound();
    }, 350));
    
    timers.push(setTimeout(() => {
      setPhase('logo-upgrade');
      setShowCrownLogo(true);
    }, 900));
    
    timers.push(setTimeout(() => {
      setPhase('return');
    }, 1500));
    
    timers.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 1800));

    return () => timers.forEach(clearTimeout);
  }, [show, onComplete, playUnlockSound]);

  if (!show && phase === 'idle') return null;

  const isActive = phase !== 'idle' && phase !== 'done';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: phase === 'suspension' ? 0.92 : 
                       phase === 'unlock' ? 0.88 :
                       phase === 'logo-upgrade' ? 0.85 :
                       0.8
            }}
            transition={{ duration: 0.3 }}
          />
          
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase !== 'idle' ? 1 : 0 }}
          />

          <div className="relative flex flex-col items-center">
            <motion.div
              className="relative w-40 h-40 flex items-center justify-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ 
                scale: phase === 'logo-upgrade' ? 0.97 : 1,
                opacity: 1,
              }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-32 h-32 object-contain"
                initial={{ opacity: 1 }}
                animate={{ 
                  opacity: showCrownLogo ? 0 : 1,
                  scale: showCrownLogo ? 0.95 : 1,
                }}
                transition={{ duration: 0.4 }}
              />
              
              <motion.img
                src={logoWithCrown}
                alt=""
                className="absolute w-32 h-32 object-contain"
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ 
                  opacity: showCrownLogo ? 1 : 0,
                  scale: showCrownLogo ? 1 : 0.9,
                  y: showCrownLogo ? 0 : -8,
                }}
                transition={{ 
                  duration: 0.5, 
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
              
              {showCrownLogo && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                      transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-150%' }}
                    animate={{ x: '150%' }}
                    transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            <AnimatePresence>
              {(phase === 'unlock' || phase === 'logo-upgrade') && !showCrownLogo && (
                <motion.div
                  className="absolute -top-12"
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    animate={{ x: [0, -2, 2, -1.5, 1.5, 0] }}
                    transition={{ duration: 0.35, delay: 0.05 }}
                  >
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-white/80"
                    >
                      <motion.g
                        initial={{ rotate: 0 }}
                        animate={{ rotate: -25 }}
                        transition={{ duration: 0.25, delay: 0.35, ease: "easeOut" }}
                        style={{ originX: '75%', originY: '42%' }}
                      >
                        <path
                          d="M6 10V7C6 4.79086 7.79086 3 10 3H14C16.2091 3 18 4.79086 18 7V10"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </motion.g>
                      <rect
                        x="4"
                        y="10"
                        width="16"
                        height="12"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <motion.circle
                        cx="12"
                        cy="15"
                        r="1.5"
                        initial={{ fill: "rgba(255,255,255,0.8)" }}
                        animate={{ fill: "hsl(142, 76%, 55%)" }}
                        transition={{ duration: 0.2, delay: 0.4 }}
                      />
                    </svg>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              className="absolute -z-10 w-80 h-80 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(139,92,246,0.05) 50%, transparent 70%)',
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: showCrownLogo ? 1 : 0,
                scale: showCrownLogo ? 1.1 : 0.8,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />

            <AnimatePresence>
              {phase === 'return' && (
                <motion.div
                  className="mt-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="text-lg font-medium text-white/90">Premium Unlocked</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
