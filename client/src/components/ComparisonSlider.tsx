import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion, useMotion } from "@/lib/motion";

interface ComparisonSliderProps {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  beforeValue: string;
  afterValue: string;
  beforeSubtext?: string;
  afterSubtext?: string;
  unit?: string;
}

export function ComparisonSlider({
  title,
  beforeLabel,
  afterLabel,
  beforeValue,
  afterValue,
  beforeSubtext,
  afterSubtext,
  unit = ""
}: ComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { prefersReducedMotion } = useMotion();

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  }, [isDragging, handleMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  }, [isDragging, handleMove]);

  const handleStart = useCallback(() => setIsDragging(true), []);
  const handleEnd = useCallback(() => setIsDragging(false), []);

  return (
    <motion.div
      initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
      whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
      className="relative"
    >
      <h3 className="font-semibold text-white text-center mb-4">{title}</h3>
      
      <div
        ref={containerRef}
        className={cn(
          "relative h-32 rounded-xl overflow-hidden cursor-ew-resize select-none",
          "border border-white/10 bg-gradient-to-r from-red-500/10 to-emerald-500/10",
          isDragging && "ring-2 ring-primary/50"
        )}
        role="slider"
        aria-label={`${title} comparison slider`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(sliderPosition)}
        tabIndex={0}
        onMouseDown={handleStart}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onMouseMove={handleMouseMove}
        onTouchStart={handleStart}
        onTouchEnd={handleEnd}
        onTouchMove={handleTouchMove}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setSliderPosition(prev => Math.max(5, prev - 5));
          } else if (e.key === 'ArrowRight') {
            setSliderPosition(prev => Math.min(95, prev + 5));
          }
        }}
        data-testid={`slider-${title.toLowerCase().replace(/\s/g, '-')}`}
      >
        <div 
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-r from-red-500/20 to-red-500/10"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <div className="text-center p-4">
            <p className="text-xs text-red-300 mb-1">{beforeLabel}</p>
            <p className="text-3xl font-bold text-red-400">{beforeValue}{unit}</p>
            {beforeSubtext && <p className="text-xs text-red-300/70 mt-1">{beforeSubtext}</p>}
          </div>
        </div>

        <div 
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-r from-emerald-500/10 to-emerald-500/20"
          style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
        >
          <div className="text-center p-4">
            <p className="text-xs text-emerald-300 mb-1">{afterLabel}</p>
            <p className="text-3xl font-bold text-emerald-400">{afterValue}{unit}</p>
            {afterSubtext && <p className="text-xs text-emerald-300/70 mt-1">{afterSubtext}</p>}
          </div>
        </div>

        <div 
          className="absolute top-0 bottom-0 w-1 bg-white/80 shadow-lg shadow-white/30 z-10"
          style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
        >
          <div className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center",
            "transition-transform",
            isDragging && "scale-110"
          )}>
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
              <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      
      <p className="text-xs text-center text-muted-foreground mt-2">
        Drag to compare · Based on testing, results will vary
      </p>
    </motion.div>
  );
}

export function ScrollIndicator() {
  const { prefersReducedMotion } = useMotion();
  
  const handleScroll = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleScroll();
    }
  };
  
  return (
    <motion.button
      className="flex flex-col items-center gap-2 cursor-pointer bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 rounded-full p-2"
      initial={!prefersReducedMotion ? { opacity: 0, y: -10 } : undefined}
      animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{ delay: 1, duration: 0.5 }}
      onClick={handleScroll}
      onKeyDown={handleKeyDown}
      aria-label="Scroll down to explore features"
      data-testid="button-scroll-indicator"
    >
      <span className="text-xs text-muted-foreground">Scroll to explore</span>
      <motion.div
        animate={!prefersReducedMotion ? { y: [0, 8, 0] } : undefined}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2"
      >
        <motion.div
          animate={!prefersReducedMotion ? { opacity: [1, 0.3, 1] } : undefined}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-1 h-2 rounded-full bg-white/50"
        />
      </motion.div>
    </motion.button>
  );
}
