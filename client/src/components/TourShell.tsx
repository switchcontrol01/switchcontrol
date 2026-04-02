import { useState, useEffect, useCallback, useRef, useReducer, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector: string;
  route?: string;
  action?: React.ReactNode;
  sidebarHighlight?: string;
}

interface TourShellProps {
  show: boolean;
  steps: TourStep[];
  onComplete: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  returnRoute?: string;
  testId?: string;
}

type Phase =
  | 'idle'
  | 'dimming'
  | 'navigating'
  | 'scrolling'
  | 'spotlighting'
  | 'presenting'
  | 'fading_out'
  | 'completing'
  | 'done';

interface TourState {
  phase: Phase;
  stepIndex: number;
  targetRect: DOMRect | null;
  direction: 'next' | 'back';
}

type TourAction =
  | { type: 'START'; stepCount: number }
  | { type: 'PHASE'; phase: Phase }
  | { type: 'GOTO'; index: number; direction: 'next' | 'back' }
  | { type: 'SET_RECT'; rect: DOMRect | null }
  | { type: 'FINISH' };

function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'START':
      return { phase: 'dimming', stepIndex: 0, targetRect: null, direction: 'next' };
    case 'PHASE':
      return { ...state, phase: action.phase };
    case 'GOTO':
      return { ...state, stepIndex: action.index, direction: action.direction, phase: 'fading_out', targetRect: null };
    case 'SET_RECT':
      return { ...state, targetRect: action.rect };
    case 'FINISH':
      return { ...state, phase: 'done' };
    default:
      return state;
  }
}

const TIMING = {
  dimIn: 800,
  fadeOut: 550,
  navigate: 800,
  scrollDuration: 900,
  spotlightSettle: 550,
};

function smoothScrollTo(container: Element | null, targetY: number, duration = TIMING.scrollDuration): Promise<void> {
  return new Promise(resolve => {
    const el = container || document.documentElement;
    const startY = container ? container.scrollTop : window.scrollY;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) { resolve(); return; }
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      if (container) {
        container.scrollTop = startY + diff * ease;
      } else {
        window.scrollTo(0, startY + diff * ease);
      }
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function getScrollContainer(): Element | null {
  return document.querySelector('.app-content main') || document.querySelector('main.overflow-y-auto') || document.querySelector('.app-content') || null;
}

function setSidebarHighlight(id: string | undefined) {
  document.querySelectorAll('[data-tour-highlight]').forEach(el => {
    el.removeAttribute('data-tour-highlight');
  });
  if (id) {
    const sidebarEl = document.querySelector(`[data-tour="${id}"]`);
    if (sidebarEl) {
      sidebarEl.setAttribute('data-tour-highlight', 'true');
    }
  }
}

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
  const dist = 110 + Math.random() * 100;
  return {
    id: i,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    delay: 0.3 + i * 0.03,
    size: 2.5 + Math.random() * 5,
    hue: 255 + Math.random() * 60,
    duration: 1.8 + Math.random() * 0.8,
  };
});

const EMBER_PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: (Math.random() - 0.5) * 320,
  yEnd: -180 - Math.random() * 160,
  delay: 0.6 + Math.random() * 2.5,
  size: 1.5 + Math.random() * 2.5,
  hue: 260 + Math.random() * 50,
  duration: 2.5 + Math.random() * 2,
  drift: (Math.random() - 0.5) * 60,
}));

const WAVE_RINGS = [
  { delay: 0.2, size: 140, duration: 2.0 },
  { delay: 0.7, size: 260, duration: 2.2 },
  { delay: 1.2, size: 400, duration: 2.4 },
];

function CompletionOverlay({ onDone, reduced }: { onDone: () => void; reduced: boolean | null }) {
  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 600 : 5800);
    return () => clearTimeout(t);
  }, [onDone, reduced]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.2 : 1.0, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Deep backdrop */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(15,8,30,0.97) 0%, rgba(5,3,15,0.99) 100%)' }}
      />

      {/* Outer nebula bloom — very slow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 1100, height: 1100, background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(168,85,247,0.06) 40%, transparent 68%)', filter: 'blur(80px)' }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.1, 1.0, 1.05, 1.0], opacity: [0, 0.8, 0.55, 0.65, 0.55] }}
        transition={{ duration: 5.0, ease: [0.22, 1, 0.36, 1], times: [0, 0.35, 0.6, 0.8, 1] }}
      />

      {/* Mid corona */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 560, height: 560, background: 'radial-gradient(circle, rgba(192,132,252,0.30) 0%, rgba(139,92,246,0.12) 50%, transparent 78%)', filter: 'blur(35px)' }}
        initial={{ scale: 0.1, opacity: 0 }}
        animate={{ scale: [0.1, 1.25, 1.0, 1.08, 1.0], opacity: [0, 1, 0.7, 0.8, 0.7] }}
        transition={{ duration: 4.0, ease: [0.22, 1, 0.36, 1], times: [0, 0.4, 0.65, 0.82, 1], delay: 0.15 }}
      />

      {/* Inner bright core */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 220, height: 220, background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(216,180,254,0.42) 30%, transparent 68%)', filter: 'blur(14px)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.4, 1.0, 1.1, 1.0], opacity: [0, 1, 0.75, 0.85, 0.75] }}
        transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1], times: [0, 0.3, 0.55, 0.75, 1], delay: 0.25 }}
      />

      {/* Slow breathing ambient pulse — loops */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: 700, height: 700, background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 62%)', filter: 'blur(50px)' }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [0.8, 1.15, 0.95, 1.1, 0.9, 1.05], opacity: [0, 0.8, 0.5, 0.7, 0.45, 0.6] }}
        transition={{ duration: 5.0, ease: 'easeInOut', delay: 0.8 }}
      />

      {/* Expanding wave rings */}
      {WAVE_RINGS.map((ring, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none border"
          style={{ width: ring.size, height: ring.size, borderColor: 'rgba(168,85,247,0.45)' }}
          initial={{ scale: 0.1, opacity: 0.9 }}
          animate={{ scale: [0.1, 2.8], opacity: [0.7, 0] }}
          transition={{ duration: ring.duration, delay: ring.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* Rotating halo ring */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: 104, height: 104 }}
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: [0, 0.7, 0.5, 0.6], rotate: 360 }}
        transition={{ opacity: { duration: 1.2, delay: 0.5, times: [0, 0.4, 0.7, 1] }, rotate: { duration: 8, repeat: Infinity, ease: 'linear', delay: 0.5 } }}
      >
        <svg width="104" height="104" viewBox="0 0 104 104" fill="none">
          <circle cx="52" cy="52" r="50" stroke="url(#halo-grad)" strokeWidth="1.5" strokeDasharray="6 5" strokeLinecap="round" />
          <defs>
            <linearGradient id="halo-grad" x1="0" y1="0" x2="104" y2="104" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a855f7" stopOpacity="0.9" />
              <stop offset="0.4" stopColor="#ec4899" stopOpacity="0.5" />
              <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>

      {/* Counter-rotating outer halo */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ width: 136, height: 136 }}
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: [0, 0.4, 0.3, 0.35], rotate: -360 }}
        transition={{ opacity: { duration: 1.5, delay: 0.8, times: [0, 0.4, 0.7, 1] }, rotate: { duration: 14, repeat: Infinity, ease: 'linear', delay: 0.8 } }}
      >
        <svg width="136" height="136" viewBox="0 0 136 136" fill="none">
          <circle cx="68" cy="68" r="66" stroke="rgba(192,132,252,0.35)" strokeWidth="1" strokeDasharray="3 9" strokeLinecap="round" />
        </svg>
      </motion.div>

      {/* Burst particles */}
      {BURST_PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{ width: p.size, height: p.size, background: `hsla(${p.hue}, 90%, 78%, 1)`, boxShadow: `0 0 ${p.size * 4}px hsla(${p.hue}, 90%, 78%, 0.7)` }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 1, 0], scale: [0, 1.6, 1.2, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* Drifting ember particles */}
      {EMBER_PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{ width: p.size, height: p.size, background: `hsla(${p.hue}, 80%, 72%, 0.85)`, boxShadow: `0 0 ${p.size * 3}px hsla(${p.hue}, 80%, 72%, 0.5)` }}
          initial={{ x: p.x, y: 60, opacity: 0, scale: 0 }}
          animate={{ x: p.x + p.drift, y: p.yEnd, opacity: [0, 0.9, 0.7, 0], scale: [0, 1, 0.8, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        />
      ))}

      {/* Center icon + text */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Icon */}
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.0, delay: 0.3, type: 'spring', stiffness: 220, damping: 16 }}
        >
          {/* Pulsing glow behind icon */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 110, height: 110, background: 'radial-gradient(circle, rgba(192,132,252,0.55) 0%, transparent 72%)' }}
            animate={{ scale: [1, 1.35, 1, 1.2, 1], opacity: [0.5, 1, 0.6, 0.85, 0.5] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />
          {/* Icon box */}
          <motion.div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center backdrop-blur-sm"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.35) 0%, rgba(168,85,247,0.25) 50%, rgba(236,72,153,0.18) 100%)', border: '1px solid rgba(192,132,252,0.3)', boxShadow: '0 0 40px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}
            animate={{ boxShadow: ['0 0 40px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.1)', '0 0 70px rgba(139,92,246,0.65), inset 0 1px 0 rgba(255,255,255,0.15)', '0 0 40px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          >
            <motion.div
              animate={{ rotate: [0, 15, -8, 12, 0], scale: [1, 1.15, 1.05, 1.1, 1] }}
              transition={{ duration: 2.0, delay: 0.6, ease: 'easeInOut' }}
            >
              <Sparkles className="w-9 h-9 text-purple-200" />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Text — staggered reveal */}
        <motion.div
          className="text-center flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <motion.p
            className="text-2xl font-semibold text-white tracking-wide"
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            You&apos;re all set
          </motion.p>
          <motion.p
            className="text-sm text-purple-300/70 font-light"
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 1.25, ease: [0.22, 1, 0.36, 1] }}
          >
            SwitchControl is ready to optimize
          </motion.p>
          {/* Subtle divider line */}
          <motion.div
            className="mt-1 h-px rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 120, opacity: 1 }}
            transition={{ duration: 1.2, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

export function TourShell({ show, steps, onComplete, onSkip, canSkip = false, returnRoute, testId = "tour" }: TourShellProps) {
  const [state, dispatch] = useReducer(tourReducer, {
    phase: 'idle',
    stepIndex: 0,
    targetRect: null,
    direction: 'next',
  });
  const [tooltipHeight, setTooltipHeight] = useState(260);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const prevShowRef = useRef(false);
  const choreographyRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const step = steps[state.stepIndex];
  const total = steps.length;
  const isLastStep = state.stepIndex === total - 1;
  const progressPercent = ((state.stepIndex + 1) / total) * 100;

  useEffect(() => {
    if (show && !prevShowRef.current) {
      document.body.classList.add('tour-active');
      dispatch({ type: 'START', stepCount: total });
    }
    if (!show && prevShowRef.current) {
      document.body.classList.remove('tour-active');
      document.body.classList.remove('tour-navigating');
      dispatch({ type: 'FINISH' });
      setSidebarHighlight(undefined);
    }
    prevShowRef.current = show;
  }, [show, total]);

  const waitForElement = useCallback(async (selector: string, maxWait = 2000): Promise<Element | null> => {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise(r => setTimeout(r, 50));
    }
    return document.querySelector(selector);
  }, []);

  const navigateToRoute = useCallback((route: string) => {
    const currentHash = window.location.hash.replace('#', '') || '/';
    if (currentHash !== route) {
      window.location.hash = route;
    }
  }, []);

  const measureTarget = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(step.targetSelector);
    if (target) {
      dispatch({ type: 'SET_RECT', rect: target.getBoundingClientRect() });
    } else {
      dispatch({ type: 'SET_RECT', rect: null });
    }
  }, [step]);

  const choreographStep = useCallback(async () => {
    if (choreographyRef.current) return;
    choreographyRef.current = true;

    try {
      const currentStep = steps[state.stepIndex];
      if (!currentStep) return;

      setSidebarHighlight(currentStep.sidebarHighlight || currentStep.id);

      if (currentStep.route) {
        const currentHash = window.location.hash.replace('#', '') || '/';
        const needsNavigation = currentHash !== currentStep.route;
        if (needsNavigation) {
          document.body.classList.add('tour-navigating');
          dispatch({ type: 'PHASE', phase: 'navigating' });
          navigateToRoute(currentStep.route);
          await new Promise(r => setTimeout(r, TIMING.navigate));
          document.body.classList.remove('tour-navigating');
        }
      }

      dispatch({ type: 'PHASE', phase: 'scrolling' });
      const target = await waitForElement(currentStep.targetSelector, currentStep.route ? 2000 : 800);
      if (target) {
        const container = getScrollContainer();
        const rect = target.getBoundingClientRect();
        const viewH = container ? container.clientHeight : window.innerHeight;
        const isFullyVisible = rect.top >= 0 && rect.bottom <= viewH;
        if (!isFullyVisible) {
          const scrollTop = container ? container.scrollTop : window.scrollY;
          const offsetTop = rect.top + scrollTop - viewH / 2 + rect.height / 2;
          await smoothScrollTo(container, Math.max(0, offsetTop));
        }
      }

      dispatch({ type: 'PHASE', phase: 'spotlighting' });
      measureTarget();
      await new Promise(r => setTimeout(r, TIMING.spotlightSettle));

      dispatch({ type: 'PHASE', phase: 'presenting' });
    } finally {
      document.body.classList.remove('tour-navigating');
      choreographyRef.current = false;
    }
  }, [steps, state.stepIndex, navigateToRoute, waitForElement, measureTarget]);

  useEffect(() => {
    if (state.phase === 'dimming') {
      const timer = setTimeout(() => {
        choreographStep();
      }, prefersReducedMotion ? 100 : TIMING.dimIn);
      return () => clearTimeout(timer);
    }
    if (state.phase === 'fading_out') {
      const timer = setTimeout(() => {
        choreographStep();
      }, prefersReducedMotion ? 80 : TIMING.fadeOut);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.stepIndex, choreographStep, prefersReducedMotion]);

  useEffect(() => {
    if (state.phase !== 'presenting' && state.phase !== 'spotlighting') return;
    measureTarget();
    const onResize = () => measureTarget();
    const onScroll = () => measureTarget();
    window.addEventListener('resize', onResize);
    const container = getScrollContainer();
    if (container) {
      container.addEventListener('scroll', onScroll, { passive: true });
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    const interval = setInterval(measureTarget, 300);
    return () => {
      window.removeEventListener('resize', onResize);
      if (container) container.removeEventListener('scroll', onScroll);
      else window.removeEventListener('scroll', onScroll);
      clearInterval(interval);
    };
  }, [state.phase, measureTarget]);

  useEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - tooltipHeight) > 4) {
        setTooltipHeight(h);
      }
    }
  }, [state.stepIndex, tooltipHeight]);

  const handleNext = () => {
    if (state.phase !== 'presenting') return;
    if (state.stepIndex < total - 1) {
      dispatch({ type: 'GOTO', index: state.stepIndex + 1, direction: 'next' });
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (state.phase !== 'presenting' || state.stepIndex <= 0) return;
    dispatch({ type: 'GOTO', index: state.stepIndex - 1, direction: 'back' });
  };

  const handleComplete = () => {
    document.body.classList.remove('tour-active');
    document.body.classList.remove('tour-navigating');
    setSidebarHighlight(undefined);
    if (returnRoute) navigateToRoute(returnRoute);
    dispatch({ type: 'PHASE', phase: 'completing' });
  };

  const handleCompletionDone = useCallback(async () => {
    dispatch({ type: 'FINISH' });
    if (returnRoute) {
      const container = getScrollContainer();
      await smoothScrollTo(container, 0, 400);
    }
    setTimeout(onComplete, 200);
  }, [returnRoute, onComplete]);

  const handleSkip = () => {
    document.body.classList.remove('tour-active');
    document.body.classList.remove('tour-navigating');
    dispatch({ type: 'FINISH' });
    setSidebarHighlight(undefined);
    if (returnRoute) navigateToRoute(returnRoute);
    setTimeout(() => onSkip?.() ?? onComplete(), 300);
  };

  const canReveal = state.phase === 'presenting' || state.phase === 'spotlighting';

  const blurClipPath = useMemo(() => {
    const W = typeof window !== 'undefined' ? window.innerWidth : 1300;
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    if (!canReveal || !state.targetRect) {
      return `polygon(evenodd, 0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, -100px -100px, -99px -100px, -99px -99px, -100px -99px)`;
    }
    const p = 32;
    const x1 = Math.max(0, state.targetRect.left - p);
    const y1 = Math.max(0, state.targetRect.top - p);
    const x2 = Math.min(W, state.targetRect.right + p);
    const y2 = Math.min(H, state.targetRect.bottom + p);
    return `polygon(evenodd, 0px 0px, ${W}px 0px, ${W}px ${H}px, 0px ${H}px, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px)`;
  }, [state.targetRect, canReveal]);

  if (!show || state.phase === 'idle' || state.phase === 'done') return null;

  if (state.phase === 'completing') {
    return (
      <AnimatePresence>
        <motion.div
          key="completing"
          className="fixed inset-0 z-[100] select-none"
          data-testid={`${testId}-completion`}
        >
          <CompletionOverlay onDone={handleCompletionDone} reduced={prefersReducedMotion} />
        </motion.div>
      </AnimatePresence>
    );
  }

  const isTooltipVisible = state.phase === 'presenting';
  const isTransitioning = state.phase === 'fading_out' || state.phase === 'navigating' || state.phase === 'scrolling';

  const springTransition = prefersReducedMotion
    ? { type: 'tween' as const, duration: 0.2 }
    : { type: 'spring' as const, stiffness: 110, damping: 18, mass: 1.1 };

  const tooltipSpring = prefersReducedMotion
    ? { type: 'tween' as const, duration: 0.2 }
    : { type: 'tween' as const, duration: 0.65, ease: [0.22, 1, 0.36, 1] };

  const getPlacement = (): 'top' | 'bottom' => {
    if (!state.targetRect) return 'bottom';
    const spaceBelow = window.innerHeight - state.targetRect.bottom;
    const spaceAbove = state.targetRect.top;
    const effectiveHeight = tooltipHeight || 260;
    if (spaceBelow >= effectiveHeight + 20) return 'bottom';
    if (spaceAbove >= effectiveHeight + 20) return 'top';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  };

  const getTooltipPosition = () => {
    if (!state.targetRect) return { top: '50%', left: '50%', placement: 'bottom' as const };
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const placement = getPlacement();
    const effectiveHeight = tooltipHeight || 260;
    let left = state.targetRect.left + state.targetRect.width / 2;
    const halfTooltipW = 210;
    left = Math.max(padding + halfTooltipW, Math.min(left, viewportWidth - halfTooltipW - padding));
    let top: number;
    if (placement === 'top') {
      top = state.targetRect.top - padding - effectiveHeight;
    } else {
      top = state.targetRect.bottom + padding;
    }
    top = Math.max(padding, Math.min(top, viewportHeight - effectiveHeight - padding));
    return { top, left, placement };
  };

  const tooltipPos = getTooltipPosition();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.2 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[100] select-none"
        data-testid={testId}
      >
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'repeat',
            }}
          />

          {/* Background blur with spotlight cutout */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              clipPath: blurClipPath,
              transition: canReveal ? 'clip-path 0.45s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          />

          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.12 }}
              transition={{ duration: prefersReducedMotion ? 0.3 : 1.5, ease: 'easeOut' }}
              style={{
                background: 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.25) 0%, transparent 60%)',
              }}
            />
            {!prefersReducedMotion && (
              <>
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{ width: 180, height: 180, background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
                  animate={{ x: ['-10%', '60%', '30%', '-10%'], y: ['20%', '50%', '70%', '20%'] }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{ width: 140, height: 140, background: 'radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }}
                  animate={{ x: ['70%', '20%', '50%', '70%'], y: ['60%', '30%', '10%', '60%'] }}
                  transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{ width: 100, height: 100, background: 'radial-gradient(circle, rgba(56,189,248,0.05) 0%, transparent 70%)', filter: 'blur(35px)' }}
                  animate={{ x: ['40%', '80%', '10%', '40%'], y: ['80%', '20%', '50%', '80%'] }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
              </>
            )}
          </div>

          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <mask id={`${testId}-spotlight-mask`}>
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {state.targetRect && (
                  <motion.rect
                    animate={{
                      x: state.targetRect.left - 8,
                      y: state.targetRect.top - 8,
                      width: state.targetRect.width + 16,
                      height: state.targetRect.height + 16,
                    }}
                    transition={springTransition}
                    rx="12"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <motion.rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(0, 0, 0, 0.60)"
              mask={`url(#${testId}-spotlight-mask)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0.2 : 1.0, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(0, 0, 0, 0.97)"
              animate={{ opacity: isTransitioning ? 1 : 0 }}
              transition={{ duration: prefersReducedMotion ? 0.1 : 0.35, ease: 'easeOut' }}
            />
          </svg>

          {state.targetRect && (
            <motion.div
              className="absolute pointer-events-none"
              animate={{
                left: state.targetRect.left - 12,
                top: state.targetRect.top - 12,
                width: state.targetRect.width + 24,
                height: state.targetRect.height + 24,
              }}
              transition={springTransition}
            >
              <motion.div
                className="absolute inset-0 rounded-xl border-2 border-primary/40"
                animate={prefersReducedMotion ? {} : {
                  boxShadow: [
                    '0 0 0 2px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.15)',
                    '0 0 0 3px rgba(139,92,246,0.4), 0 0 32px rgba(139,92,246,0.25)',
                    '0 0 0 2px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.15)',
                  ]
                }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          )}

          <motion.div
            ref={tooltipRef}
            className="absolute pointer-events-auto"
            animate={{
              top: typeof tooltipPos.top === 'number' ? tooltipPos.top : undefined,
              left: typeof tooltipPos.left === 'number' ? tooltipPos.left : undefined,
              opacity: isTooltipVisible ? 1 : 0,
              y: isTooltipVisible ? 0 : (state.direction === 'next' ? 16 : -16),
              scale: isTooltipVisible ? 1 : 0.93,
              visibility: isTransitioning ? 'hidden' as any : 'visible' as any,
            }}
            style={{
              transform: 'translateX(-50%)',
              width: 'clamp(280px, 85vw, 420px)',
              maxHeight: '70vh',
            }}
            transition={tooltipSpring}
          >
            <div className="relative bg-gradient-to-br from-zinc-900/95 via-zinc-900/90 to-zinc-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-pink-500/4 pointer-events-none" />

              <motion.div
                className="h-[2px] bg-gradient-to-r from-primary via-pink-500 to-primary origin-left"
                animate={{ scaleX: progressPercent / 100 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />

              <div className="relative p-5 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 4px)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-pink-500/20 text-primary flex items-center justify-center"
                      animate={prefersReducedMotion ? {} : { rotate: [0, 3, -3, 0], scale: [1, 1.05, 1] }}
                      transition={{ duration: 4.0, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {step.icon}
                    </motion.div>
                    <div>
                      <h3 className="font-semibold text-white text-lg">{step.title}</h3>
                      <p className="text-xs text-muted-foreground">Step {state.stepIndex + 1} of {total}</p>
                    </div>
                  </div>
                  {canSkip && (
                    <button
                      onClick={handleSkip}
                      className="text-xs text-muted-foreground hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                      data-testid={`${testId}-skip`}
                    >
                      Skip
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={state.stepIndex}
                    initial={{ opacity: 0, y: state.direction === 'next' ? 14 : -14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: state.direction === 'next' ? -14 : 14 }}
                    transition={{ duration: prefersReducedMotion ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                      {step.description}
                    </p>
                    {step.action && (
                      <div className="mb-4">
                        {step.action}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {steps.map((_, idx) => (
                      <motion.div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === state.stepIndex
                            ? 'w-6 bg-gradient-to-r from-primary to-pink-500'
                            : idx < state.stepIndex
                            ? 'w-1.5 bg-primary/50'
                            : 'w-1.5 bg-white/20'
                        }`}
                        animate={idx === state.stepIndex && !prefersReducedMotion ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 0.5 }}
                      />
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {state.stepIndex > 0 && (
                      <motion.button
                        onClick={handleBack}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-white/50 hover:text-white text-sm transition-colors hover:bg-white/5"
                        whileTap={{ scale: 0.98 }}
                        data-testid={`${testId}-back`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </motion.button>
                    )}
                    <motion.button
                      onClick={handleNext}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-pink-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`${testId}-next`}
                    >
                      {isLastStep ? 'Done' : 'Next'}
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
