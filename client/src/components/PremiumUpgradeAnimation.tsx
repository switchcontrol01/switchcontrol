import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoNoCrown from '@/assets/premium/logo-no-crown.png';
import logoWithCrown from '@/assets/premium/logo-with-crown.png';

interface PremiumUpgradeAnimationProps {
  show: boolean;
  onComplete: () => void;
}

type AnimationPhase = 'idle' | 'freeze' | 'suspense' | 'unlock' | 'logo-upgrade' | 'celebration' | 'transition' | 'done';

const ANIMATION_SHOWN_KEY = 'sc_premium_animation_shown';

export function PremiumUpgradeAnimation({ show, onComplete }: PremiumUpgradeAnimationProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [lockState, setLockState] = useState<'locked' | 'pulse' | 'shaking' | 'unlocking' | 'unlocked'>('locked');
  const [showCrownLogo, setShowCrownLogo] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const humOscillatorRef = useRef<OscillatorNode | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const particles = useMemo(() => 
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      angle: (i / 24) * Math.PI * 2,
      distance: 80 + Math.random() * 60,
      delay: Math.random() * 0.3,
      duration: 0.9 + Math.random() * 0.4,
      size: 3 + Math.random() * 5,
      hue: 250 + Math.random() * 50,
    })),
  []);

  const skipAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    stopAmbientHum();
    setPhase('done');
    localStorage.setItem(ANIMATION_SHOWN_KEY, 'true');
    console.log('[PremiumFlow] animation skipped -> start tour');
    onComplete();
  }, [onComplete]);

  const startAmbientHum = useCallback(() => {
    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.5);
      osc.start();
      humOscillatorRef.current = osc;
    } catch {
      // Audio unavailable
    }
  }, []);

  const stopAmbientHum = useCallback(() => {
    try {
      if (humOscillatorRef.current && audioContextRef.current) {
        const gain = audioContextRef.current.createGain();
        humOscillatorRef.current.disconnect();
        humOscillatorRef.current.connect(gain);
        gain.connect(audioContextRef.current.destination);
        gain.gain.setValueAtTime(0.04, audioContextRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.3);
        setTimeout(() => {
          humOscillatorRef.current?.stop();
          humOscillatorRef.current = null;
        }, 350);
      }
    } catch {
      // Ignore
    }
  }, []);

  const playUnlockSound = useCallback(() => {
    try {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playChime = (freq: number, delay: number, duration: number, vol: number = 0.08) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      playChime(523, 0, 0.2, 0.06);
      playChime(659, 0.06, 0.2, 0.07);
      playChime(784, 0.12, 0.25, 0.08);
      playChime(1047, 0.2, 0.4, 0.1);
    } catch {
      // Sound disabled
    }
  }, []);

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      setLockState('locked');
      setShowCrownLogo(false);
      setShowParticles(false);
      setIsExiting(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    timersRef.current = timers;

    // PHASE 1: Freeze (300ms) - UI dims, lock appears
    setPhase('freeze');
    setLockState('locked');
    startAmbientHum();

    // Start lock pulse at 200ms
    timers.push(setTimeout(() => {
      setLockState('pulse');
    }, 200));

    // PHASE 2: Suspense (700ms) - No motion, builds anticipation
    timers.push(setTimeout(() => {
      setPhase('suspense');
    }, 300));

    // PHASE 3: Unlock event - starts at 1000ms
    timers.push(setTimeout(() => {
      setPhase('unlock');
      setLockState('shaking');
    }, 1000));

    // Lock rotates open at 1150ms
    timers.push(setTimeout(() => {
      setLockState('unlocking');
      stopAmbientHum();
      playUnlockSound();
    }, 1150));

    // Lock fully unlocked at 1350ms
    timers.push(setTimeout(() => {
      setLockState('unlocked');
    }, 1350));

    // PHASE 4: Logo upgrade (800ms) - starts at 1500ms
    timers.push(setTimeout(() => {
      setPhase('logo-upgrade');
      setShowCrownLogo(true);
    }, 1500));

    // PHASE 5: Celebration - particles burst at 1800ms
    timers.push(setTimeout(() => {
      setPhase('celebration');
      setShowParticles(true);
    }, 1800));

    // PHASE 6: Transition - starts at 2800ms
    timers.push(setTimeout(() => {
      setPhase('transition');
      setIsExiting(true);
    }, 2800));

    // Done at 3400ms
    timers.push(setTimeout(() => {
      setPhase('done');
      localStorage.setItem(ANIMATION_SHOWN_KEY, 'true');
      console.log('[PremiumFlow] animation complete -> start tour');
      onComplete();
    }, 3400));

    return () => {
      timers.forEach(clearTimeout);
      stopAmbientHum();
    };
  }, [show, onComplete, playUnlockSound, startAmbientHum, stopAmbientHum]);

  if (!show && phase === 'idle') return null;

  const isActive = phase !== 'idle' && phase !== 'done';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: isExiting ? 0.5 : 0.3 }}
          onClick={skipAnimation}
        >
          {/* Skip hint */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'suspense' || phase === 'celebration' ? 0.6 : 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            Click anywhere to skip
          </motion.div>

          {/* Dark overlay */}
          <motion.div
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: isExiting ? 0 :
                       phase === 'freeze' ? 0.95 : 
                       phase === 'suspense' ? 0.94 :
                       phase === 'unlock' ? 0.92 :
                       phase === 'logo-upgrade' ? 0.88 :
                       0.85
            }}
            transition={{ duration: isExiting ? 0.6 : 0.35 }}
          />
          
          {/* Radial vignette */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.6) 100%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: isExiting ? 0 : 1 }}
            transition={{ duration: 0.4 }}
          />

          {/* Light burst on unlock */}
          <AnimatePresence>
            {lockState === 'unlocked' && !showCrownLogo && (
              <motion.div
                className="absolute w-64 h-64 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)',
                }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 1, 0], scale: [0.3, 1.5, 2] }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>

          {/* Outer glow ring during celebration */}
          <AnimatePresence>
            {(phase === 'celebration' || phase === 'transition') && !isExiting && (
              <motion.div
                className="absolute w-[450px] h-[450px] rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.08) 40%, transparent 65%)',
                }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ 
                  opacity: [0, 0.9, 0.6],
                  scale: [0.5, 1.15, 1.1],
                }}
                exit={{ opacity: 0, scale: 1.3 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </AnimatePresence>

          <motion.div 
            className="relative flex flex-col items-center"
            animate={{
              scale: isExiting ? 0.15 : 1,
              y: isExiting ? -280 : 0,
              x: isExiting ? -420 : 0,
            }}
            transition={{ 
              duration: isExiting ? 0.6 : 0.4, 
              ease: [0.22, 1, 0.36, 1] 
            }}
          >
            {/* Lock icon */}
            <AnimatePresence>
              {(phase === 'freeze' || phase === 'suspense' || phase === 'unlock') && !showCrownLogo && (
                <motion.div
                  className="absolute -top-24"
                  initial={{ opacity: 0, scale: 0.7, y: 16 }}
                  animate={{ 
                    opacity: lockState === 'unlocked' ? 0 : 1, 
                    scale: lockState === 'unlocked' ? 0.6 : 1, 
                    y: lockState === 'unlocked' ? -20 : 0 
                  }}
                  exit={{ opacity: 0, scale: 0.6, y: -24 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <LockIconSVG state={lockState} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Particle burst */}
            <AnimatePresence>
              {showParticles && !isExiting && (
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {particles.map((particle) => (
                    <motion.div
                      key={particle.id}
                      className="absolute left-1/2 top-1/2 rounded-full"
                      style={{
                        width: particle.size,
                        height: particle.size,
                        background: `radial-gradient(circle, hsl(${particle.hue}, 85%, 75%) 0%, hsl(${particle.hue}, 80%, 55%) 100%)`,
                        boxShadow: `0 0 ${particle.size * 2.5}px hsl(${particle.hue}, 85%, 65%)`,
                      }}
                      initial={{ 
                        x: 0, 
                        y: 0, 
                        opacity: 0,
                        scale: 0,
                      }}
                      animate={{ 
                        x: Math.cos(particle.angle) * particle.distance,
                        y: Math.sin(particle.angle) * particle.distance,
                        opacity: [0, 1, 0.9, 0],
                        scale: [0, 1.3, 1.1, 0.4],
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
              className="relative w-48 h-48 flex items-center justify-center"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ 
                scale: phase === 'freeze' ? 0.92 :
                       phase === 'suspense' ? 0.95 :
                       phase === 'logo-upgrade' ? 0.98 : 
                       phase === 'celebration' ? 1.08 :
                       phase === 'transition' ? 1.04 : 1,
                opacity: phase === 'freeze' ? 0.8 : 
                         phase === 'suspense' ? 0.9 : 1,
              }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Logo without crown */}
              <motion.img
                src={logoNoCrown}
                alt=""
                className="absolute w-40 h-40 object-contain"
                initial={{ opacity: 1 }}
                animate={{ 
                  opacity: showCrownLogo ? 0 : 1,
                  scale: showCrownLogo ? 0.92 : 1,
                  filter: showCrownLogo ? 'blur(3px)' : 'blur(0px)',
                }}
                transition={{ duration: 0.45 }}
              />
              
              {/* Logo with crown - crown animates down into place */}
              <motion.img
                src={logoWithCrown}
                alt=""
                className="absolute w-40 h-40 object-contain"
                initial={{ opacity: 0, scale: 0.88, y: -24 }}
                animate={{ 
                  opacity: showCrownLogo ? 1 : 0,
                  scale: showCrownLogo ? 1 : 0.88,
                  y: showCrownLogo ? 0 : -24,
                }}
                transition={{ 
                  duration: 0.65, 
                  ease: [0.22, 1, 0.36, 1],
                  y: { duration: 0.55, ease: [0.34, 1.56, 0.64, 1] },
                }}
              />
              
              {/* Shimmer sweep */}
              {showCrownLogo && !isExiting && (
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.8, 0] }}
                  transition={{ duration: 0.9, delay: 0.25 }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                      transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-200%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
                  />
                </motion.div>
              )}
            </motion.div>

            {/* Soft glow around logo */}
            <motion.div
              className="absolute -z-10 w-96 h-96 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(168,85,247,0.15) 40%, transparent 65%)',
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ 
                opacity: showCrownLogo && !isExiting ? [0, 1, 0.75] : 0,
                scale: showCrownLogo && !isExiting ? [0.5, 1.2, 1.1] : 0.5,
              }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />

            {/* "Premium Unlocked" text */}
            <AnimatePresence>
              {(phase === 'celebration' || phase === 'transition') && !isExiting && (
                <motion.div
                  className="mt-8"
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.span 
                    className="text-2xl font-semibold bg-gradient-to-r from-purple-300 via-white to-purple-300 bg-clip-text text-transparent drop-shadow-lg"
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{
                      duration: 2.5,
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LockIconSVG({ state }: { state: 'locked' | 'pulse' | 'shaking' | 'unlocking' | 'unlocked' }) {
  const isPulsing = state === 'pulse';
  const isShaking = state === 'shaking';
  const isUnlocking = state === 'unlocking' || state === 'unlocked';
  const isUnlocked = state === 'unlocked';
  
  return (
    <motion.svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/90 drop-shadow-xl"
      animate={
        isPulsing ? { scale: [1, 1.08, 1], opacity: [0.9, 1, 0.9] } :
        isShaking ? { 
          x: [0, -4, 4, -3, 3, -2, 2, 0],
          rotate: [0, -3, 3, -2, 2, -1, 1, 0],
        } : { x: 0, rotate: 0, scale: 1 }
      }
      transition={{ 
        duration: isPulsing ? 1.2 : 0.4,
        repeat: isPulsing ? Infinity : 0,
        ease: isPulsing ? 'easeInOut' : undefined,
      }}
    >
      <motion.g
        style={{ originX: '75%', originY: '42%' }}
        animate={{ 
          rotate: isUnlocking ? -35 : 0,
          y: isUnlocked ? -4 : 0,
        }}
        transition={{ duration: 0.28, ease: "easeOut" }}
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
          scale: isUnlocked ? [1, 1.5, 1.2] : 1,
        }}
        transition={{ duration: 0.28 }}
      />
      <motion.path
        d="M12 16.5V18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{ opacity: isUnlocked ? 0 : 1 }}
        transition={{ duration: 0.15 }}
      />
      
      {/* Green glow burst when unlocked */}
      {isUnlocked && (
        <motion.circle
          cx="12"
          cy="15"
          r="4"
          fill="none"
          stroke="hsl(142, 76%, 55%)"
          strokeWidth="0.6"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.4, 2, 2.5] }}
          transition={{ duration: 0.55 }}
        />
      )}
    </motion.svg>
  );
}

export function shouldShowPremiumAnimation(): boolean {
  return localStorage.getItem(ANIMATION_SHOWN_KEY) !== 'true';
}

export function resetPremiumAnimationFlag(): void {
  localStorage.removeItem(ANIMATION_SHOWN_KEY);
}
