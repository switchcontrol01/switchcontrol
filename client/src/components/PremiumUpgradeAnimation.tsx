import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoNoCrown from '@/assets/premium/logo-no-crown.png';
import logoWithCrown from '@/assets/premium/logo-with-crown.png';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type AnimationPhase = 'idle' | 'suspension' | 'unlock' | 'logo-upgrade' | 'particles' | 'return' | 'done';

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [lockState, setLockState] = useState<'locked' | 'shaking' | 'unlocking' | 'unlocked'>('locked');
  const [showCrownLogo, setShowCrownLogo] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 200 - 100,
      y: Math.random() * 200 - 100,
      delay: Math.random() * 0.4,
      duration: 0.8 + Math.random() * 0.5,
      size: 3 + Math.random() * 4,
      hue: 260 + Math.random() * 40,
    })),
  []);

  const playUnlockSound = useCallback(() => {
    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playChime = (freq: number, delay: number, duration: number) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioContext.currentTime + delay);
        gain.gain.setValueAtTime(0, audioContext.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + delay + duration);
        osc.start(audioContext.currentTime + delay);
        osc.stop(audioContext.currentTime + delay + duration);
      };

      playChime(659, 0, 0.25);
      playChime(784, 0.08, 0.25);
      playChime(988, 0.16, 0.35);
      playChime(1319, 0.28, 0.5);
    } catch {
      // Sound disabled or API unavailable
    }
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setLockState('locked');
      setShowCrownLogo(false);
      setShowParticles(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    
    // Phase 1: Suspension (400ms) - Build tension
    setPhase('suspension');
    setLockState('locked');
    
    // Phase 2: Unlock (400ms) - starts at 400ms
    timers.push(setTimeout(() => {
      setPhase('unlock');
      setLockState('shaking');
    }, 400));
    
    // Lock shake complete, start unlock rotation at 550ms
    timers.push(setTimeout(() => {
      setLockState('unlocking');
      playUnlockSound();
    }, 550));
    
    // Lock fully unlocked at 750ms
    timers.push(setTimeout(() => {
      setLockState('unlocked');
    }, 750));
    
    // Phase 3: Logo upgrade (700ms) - starts at 950ms
    timers.push(setTimeout(() => {
      setPhase('logo-upgrade');
      setShowCrownLogo(true);
    }, 950));

    // Phase 4: Particles burst - starts at 1200ms
    timers.push(setTimeout(() => {
      setPhase('particles');
      setShowParticles(true);
    }, 1200));
    
    // Phase 5: Return (400ms) - starts at 2000ms
    timers.push(setTimeout(() => {
      setPhase('return');
    }, 2000));
    
    // Done at 2500ms
    timers.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2500));

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
          transition={{ duration: 0.3 }}
        >
          {/* Dark overlay with animated opacity */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: phase === 'suspension' ? 0.94 : 
                       phase === 'unlock' ? 0.92 :
                       phase === 'logo-upgrade' ? 0.88 :
                       phase === 'particles' ? 0.85 :
                       0.82
            }}
            transition={{ duration: 0.35 }}
          />
          
          {/* Radial vignette */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.5) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />

          {/* Outer glow ring during particles phase */}
          <AnimatePresence>
            {(phase === 'particles' || phase === 'return') && (
              <motion.div
                className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 40%, transparent 70%)',
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: [0, 0.8, 0.6],
                  scale: [0.5, 1.2, 1.1],
                }}
                exit={{ opacity: 0, scale: 1.3 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </AnimatePresence>

          <div className="relative flex flex-col items-center">
            {/* Lock icon - visible in suspension and unlock phases */}
            <AnimatePresence>
              {(phase === 'suspension' || phase === 'unlock') && !showCrownLogo && (
                <motion.div
                  className="absolute -top-20"
                  initial={{ opacity: 0, scale: 0.75, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.7, y: -16 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <LockIconSVG state={lockState} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Particle burst */}
            <AnimatePresence>
              {showParticles && (
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {particles.map((particle) => (
                    <motion.div
                      key={particle.id}
                      className="absolute left-1/2 top-1/2 rounded-full"
                      style={{
                        width: particle.size,
                        height: particle.size,
                        background: `radial-gradient(circle, hsl(${particle.hue}, 80%, 70%) 0%, hsl(${particle.hue}, 80%, 50%) 100%)`,
                        boxShadow: `0 0 ${particle.size * 2}px hsl(${particle.hue}, 80%, 60%)`,
                      }}
                      initial={{ 
                        x: 0, 
                        y: 0, 
                        opacity: 0,
                        scale: 0,
                      }}
                      animate={{ 
                        x: particle.x,
                        y: particle.y,
                        opacity: [0, 1, 0.8, 0],
                        scale: [0, 1.2, 1, 0.5],
                      }}
                      transition={{ 
                        duration: particle.duration,
                        delay: particle.delay,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>

            {/* Logo container */}
            <motion.div
              className="relative w-44 h-44 flex items-center justify-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ 
                scale: phase === 'logo-upgrade' ? 0.96 : 
                       phase === 'particles' ? 1.05 :
                       phase === 'return' ? 1.02 : 1,
                opacity: phase === 'suspension' ? 0.85 : 1,
              }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Logo without crown */}
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-36 h-36 object-contain"
                initial={{ opacity: 1 }}
                animate={{ 
                  opacity: showCrownLogo ? 0 : 1,
                  scale: showCrownLogo ? 0.95 : 1,
                  filter: showCrownLogo ? 'blur(2px)' : 'blur(0px)',
                }}
                transition={{ duration: 0.4 }}
              />
              
              {/* Logo with crown - fades in during logo-upgrade phase */}
              <motion.img
                src={logoWithCrown}
                alt=""
                className="absolute w-36 h-36 object-contain"
                initial={{ opacity: 0, scale: 0.92, y: -8 }}
                animate={{ 
                  opacity: showCrownLogo ? 1 : 0,
                  scale: showCrownLogo ? 1 : 0.92,
                  y: showCrownLogo ? 0 : -8,
                }}
                transition={{ 
                  duration: 0.55, 
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
              
              {/* Shimmer sweep effect */}
              {showCrownLogo && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.7, 0] }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                      transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-200%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 0.65, delay: 0.15, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            {/* Background glow pulse */}
            <motion.div
              className="absolute -z-10 w-80 h-80 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(168,85,247,0.12) 45%, transparent 70%)',
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ 
                opacity: showCrownLogo ? [0, 0.9, 0.7] : 0,
                scale: showCrownLogo ? [0.6, 1.15, 1.08] : 0.6,
              }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />

            {/* "Premium Unlocked" text in return phase */}
            <AnimatePresence>
              {phase === 'return' && (
                <motion.div
                  className="mt-6"
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.span 
                    className="text-xl font-semibold bg-gradient-to-r from-purple-300 via-white to-purple-300 bg-clip-text text-transparent"
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{
                      duration: 2,
                      ease: 'linear',
                      repeat: Infinity,
                    }}
                    style={{
                      backgroundSize: '200% 100%',
                    }}
                  >
                    Premium Unlocked
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LockIconSVG({ state }: { state: 'locked' | 'shaking' | 'unlocking' | 'unlocked' }) {
  const isShaking = state === 'shaking';
  const isUnlocking = state === 'unlocking' || state === 'unlocked';
  const isUnlocked = state === 'unlocked';
  
  return (
    <motion.svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/90 drop-shadow-lg"
      animate={isShaking ? { 
        x: [0, -3, 3, -2.5, 2.5, -1.5, 1.5, 0],
        rotate: [0, -2, 2, -1.5, 1.5, -0.5, 0.5, 0],
      } : { x: 0, rotate: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.g
        style={{ originX: '75%', originY: '42%' }}
        animate={{ 
          rotate: isUnlocking ? -32 : 0,
          y: isUnlocked ? -3 : 0,
        }}
        transition={{ duration: 0.25, ease: "easeOut" }}
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
          fill: isUnlocked ? "hsl(142, 76%, 55%)" : "rgba(255,255,255,0.9)",
          scale: isUnlocked ? [1, 1.4, 1.1] : 1,
        }}
        transition={{ duration: 0.25 }}
      />
      <motion.path
        d="M12 16.5V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ opacity: isUnlocked ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      />
      
      {/* Green glow when unlocked */}
      {isUnlocked && (
        <motion.circle
          cx="12"
          cy="15"
          r="3"
          fill="none"
          stroke="hsl(142, 76%, 55%)"
          strokeWidth="0.5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.8, 2.2] }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.svg>
  );
}
