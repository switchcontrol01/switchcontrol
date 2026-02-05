import { useState, useEffect, useCallback } from 'react';
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
  const [lockState, setLockState] = useState<'locked' | 'shaking' | 'unlocking' | 'unlocked'>('locked');
  const [showCrownLogo, setShowCrownLogo] = useState(false);

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
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(1760, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.12, audioContext.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.6);
    } catch (e) {
      // Sound disabled or API unavailable
    }
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setLockState('locked');
      setShowCrownLogo(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    
    // Phase 1: Suspension (350ms)
    setPhase('suspension');
    setLockState('locked');
    
    // Phase 2: Unlock (500ms) - starts at 350ms
    timers.push(setTimeout(() => {
      setPhase('unlock');
      setLockState('shaking');
    }, 350));
    
    // Lock shake complete, start unlock rotation at 500ms
    timers.push(setTimeout(() => {
      setLockState('unlocking');
      playUnlockSound();
    }, 500));
    
    // Lock fully unlocked at 700ms
    timers.push(setTimeout(() => {
      setLockState('unlocked');
    }, 700));
    
    // Phase 3: Logo upgrade (600ms) - starts at 850ms
    timers.push(setTimeout(() => {
      setPhase('logo-upgrade');
      setShowCrownLogo(true);
    }, 850));
    
    // Phase 4: Return (300ms) - starts at 1450ms
    timers.push(setTimeout(() => {
      setPhase('return');
    }, 1450));
    
    // Done at 1750ms
    timers.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 1750));

    return () => timers.forEach(clearTimeout);
  }, [show, onComplete, playUnlockSound]);

  if (!show && phase === 'idle') return null;

  const isActive = phase !== 'idle' && phase !== 'done';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Dark overlay with vignette */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: phase === 'suspension' ? 0.93 : 
                       phase === 'unlock' ? 0.90 :
                       phase === 'logo-upgrade' ? 0.88 :
                       0.85
            }}
            transition={{ duration: 0.3 }}
          />
          
          {/* Vignette overlay */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.4) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />

          <div className="relative flex flex-col items-center">
            {/* Lock icon - visible in suspension and unlock phases */}
            <AnimatePresence>
              {(phase === 'suspension' || phase === 'unlock') && !showCrownLogo && (
                <motion.div
                  className="absolute -top-16"
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <LockIconSVG state={lockState} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Logo container */}
            <motion.div
              className="relative w-40 h-40 flex items-center justify-center"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ 
                scale: phase === 'logo-upgrade' ? 0.97 : 1,
                opacity: phase === 'suspension' ? 0.9 : 1,
              }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Logo without crown */}
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-32 h-32 object-contain"
                initial={{ opacity: 1 }}
                animate={{ 
                  opacity: showCrownLogo ? 0 : 1,
                  scale: showCrownLogo ? 0.97 : 1,
                }}
                transition={{ duration: 0.35 }}
              />
              
              {/* Logo with crown - fades in during logo-upgrade phase */}
              <motion.img
                src={logoWithCrown}
                alt=""
                className="absolute w-32 h-32 object-contain"
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ 
                  opacity: showCrownLogo ? 1 : 0,
                  scale: showCrownLogo ? 1 : 0.95,
                  y: showCrownLogo ? 0 : -6,
                }}
                transition={{ 
                  duration: 0.5, 
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
              
              {/* Shimmer effect on logo upgrade */}
              {showCrownLogo && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.5, 0] }}
                  transition={{ duration: 0.7, delay: 0.15 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                      transform: 'skewX(-15deg)',
                    }}
                    initial={{ x: '-150%' }}
                    animate={{ x: '150%' }}
                    transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            {/* Background glow during logo upgrade */}
            <motion.div
              className="absolute -z-10 w-72 h-72 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.08) 50%, transparent 70%)',
              }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ 
                opacity: showCrownLogo ? 1 : 0,
                scale: showCrownLogo ? 1.05 : 0.7,
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />

            {/* "Premium Unlocked" text in return phase */}
            <AnimatePresence>
              {phase === 'return' && (
                <motion.div
                  className="mt-5"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
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

// Inline lock icon with animated states
function LockIconSVG({ state }: { state: 'locked' | 'shaking' | 'unlocking' | 'unlocked' }) {
  const isShaking = state === 'shaking';
  const isUnlocking = state === 'unlocking' || state === 'unlocked';
  const isUnlocked = state === 'unlocked';
  
  return (
    <motion.svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/85"
      animate={isShaking ? { x: [0, -2.5, 2.5, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.g
        style={{ originX: '75%', originY: '42%' }}
        animate={{ rotate: isUnlocking ? -28 : 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
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
        animate={{ 
          fill: isUnlocked ? "hsl(142, 76%, 55%)" : "rgba(255,255,255,0.85)",
          scale: isUnlocked ? 1.2 : 1,
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        d="M12 16.5V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ opacity: isUnlocked ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      />
    </motion.svg>
  );
}
