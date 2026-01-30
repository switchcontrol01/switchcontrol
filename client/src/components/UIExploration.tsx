import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import AnimateIn from './AnimateIn';

interface TourScreen {
  id: string;
  label: string;
  title: string;
  description: string;
  image: string;
}

const TOUR_SCREENS: TourScreen[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    description: 'Real-time system monitoring with CPU, GPU, memory usage, and live performance telemetry.',
    image: '/tour/dashboard.webp',
  },
  {
    id: 'network',
    label: 'Network',
    title: 'Network Tweaks',
    description: 'Advanced TCP/IP, UDP, and DNS optimizations to minimize latency and reduce jitter.',
    image: '/tour/network-tweaks.webp',
  },
  {
    id: 'powerplan',
    label: 'Power Plan',
    title: 'Power Plan',
    description: 'Precision power profiles with CPU boost, core parking, and frequency scaling controls.',
    image: '/tour/power-plan.webp',
  },
  {
    id: 'tweaks',
    label: 'Tweaks',
    title: 'System Tweaks',
    description: '38+ registry and system optimizations categorized by safety level and impact.',
    image: '/tour/tweaks.webp',
  },
  {
    id: 'bios',
    label: 'BIOS',
    title: 'BIOS Advisor',
    description: 'Firmware-level recommendations for competitive performance optimization.',
    image: '/tour/bios-advisor.webp',
  },
];

const IMAGE_ASPECT_RATIO = 16 / 9;

export function UIExploration() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const loadedImages = useRef<Set<string>>(new Set());

  const prefetchImage = useCallback((src: string) => {
    if (loadedImages.current.has(src)) return;
    const img = new Image();
    img.src = src;
    img.onload = () => {
      loadedImages.current.add(src);
    };
  }, []);

  useEffect(() => {
    loadedImages.current.add(TOUR_SCREENS[0].image);
  }, []);

  useEffect(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < TOUR_SCREENS.length) {
      prefetchImage(TOUR_SCREENS[nextIndex].image);
    }
  }, [currentIndex, prefetchImage]);

  const goToNext = useCallback(() => {
    if (currentIndex < TOUR_SCREENS.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const currentScreen = TOUR_SCREENS[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === TOUR_SCREENS.length - 1;

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 80 : -80,
      opacity: 0,
    }),
  };

  const progressPercent = ((currentIndex + 1) / TOUR_SCREENS.length) * 100;

  return (
    <section className="py-16 md:py-20 relative" data-reveal>
      <div className="container mx-auto px-4 max-w-5xl">
        <AnimateIn delay={100}>
          <div className="text-center mb-10">
            <h2 
              className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent mb-3"
              style={{ 
                fontFamily: '"Playfair Display", serif',
                fontWeight: 700,
              }}
            >
              Explore the Interface
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              A guided walkthrough of the SwitchControl experience
            </p>
          </div>
        </AnimateIn>

        <AnimateIn delay={200}>
          <div className="relative">
            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {TOUR_SCREENS.map((screen, index) => (
                  <span key={screen.id} className="flex items-center">
                    <span 
                      className={cn(
                        "transition-colors duration-300 px-2 py-1 rounded",
                        index === currentIndex 
                          ? "text-white font-medium bg-white/10" 
                          : "text-muted-foreground/60"
                      )}
                    >
                      {screen.label}
                    </span>
                    {index < TOUR_SCREENS.length - 1 && (
                      <ChevronRight className="size-3 text-muted-foreground/30 mx-0.5" />
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto max-w-xs mb-4">
              <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-primary to-pink-500/80"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            <div className="relative flex items-center justify-center gap-4 md:gap-8">
              <button
                onClick={goToPrev}
                disabled={isFirst}
                className={cn(
                  "shrink-0 p-2 md:p-3 rounded-full transition-all duration-300",
                  "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20",
                  isFirst && "opacity-30 cursor-not-allowed hover:bg-white/5 hover:border-white/10"
                )}
                aria-label="Previous screen"
              >
                <ChevronLeft className="size-5 md:size-6 text-white" />
              </button>

              <div 
                className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-black/20"
                style={{ aspectRatio: IMAGE_ASPECT_RATIO }}
              >
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentScreen.id}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ 
                      duration: 0.35, 
                      ease: [0.25, 0.1, 0.25, 1],
                    }}
                    className="absolute inset-0"
                    style={{ willChange: 'transform, opacity' }}
                  >
                    <img
                      src={currentScreen.image}
                      alt={currentScreen.title}
                      className="w-full h-full object-cover rounded-xl"
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              <button
                onClick={goToNext}
                disabled={isLast}
                className={cn(
                  "shrink-0 p-2 md:p-3 rounded-full transition-all duration-300",
                  "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20",
                  isLast && "opacity-30 cursor-not-allowed hover:bg-white/5 hover:border-white/10"
                )}
                aria-label="Next screen"
              >
                <ChevronRight className="size-5 md:size-6 text-white" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentScreen.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-center mt-8"
              >
                <h3 className="text-lg md:text-xl font-semibold text-white mb-2">
                  {currentScreen.title}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {currentScreen.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
