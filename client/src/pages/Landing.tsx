import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Zap, 
  Shield, 
  Clock, 
  Gauge, 
  ChevronDown, 
  ChevronUp,
  Star,
  ArrowRight,
  Menu,
  X,
  Download,
  LogOut,
  Cpu,
  Crown,
  MemoryStick,
  Radio
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotion, Reveal } from "@/lib/motion";
import AnimateIn from "@/components/AnimateIn";
import { ComparisonSlider } from "@/components/ComparisonSlider";
import { HeroBackground } from "@/components/HeroBackground";
import { PageBackground } from "@/components/PageBackground";
import { ModuleShowcase } from "@/components/ModuleShowcase";
import { WhatIsSwitchControl } from "@/components/WhatIsSwitchControl";
import { UIExploration } from "@/components/UIExploration";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAuth } from "@/components/ProtectedRoute";
import { BrandLogo } from "@/components/BrandLogo";
import { brand } from "@/config/brand";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "#faq" },
];

const FEATURES = [
  {
    icon: Zap,
    title: "System Tweaks",
    description: "38+ registry and system optimizations to reduce latency and improve responsiveness."
  },
  {
    icon: Clock,
    title: "Network Optimization",
    description: "TCP/IP, UDP, and DNS tweaks to minimize ping and maximize throughput."
  },
  {
    icon: Shield,
    title: "Safe & Reversible",
    description: "Every tweak can be reverted. We never touch critical system files."
  },
  {
    icon: Gauge,
    title: "Performance Monitoring",
    description: "Real-time system telemetry to track your optimization gains."
  }
];

const STATS = [
  { label: "Average Latency Reduction", value: "-12ms", change: "ping" },
  { label: "Input Delay Improvement", value: "-8ms", change: "input" },
  { label: "FPS Stability", value: "+15%", change: "fps" },
  { label: "1% Low FPS Gain", value: "+22%", change: "lows" },
];


const FAQ_ITEMS = [
  {
    question: "What makes SwitchControl different from other optimizers?",
    answer: "Unlike most 'one-click' optimizers that apply blanket changes, SwitchControl gives you granular control over each tweak with clear explanations of what it does and its potential impact. Every change is reversible, and we focus on proven, safe optimizations rather than risky registry hacks."
  },
  {
    question: "Is it safe to use? Will it break my games?",
    answer: "Yes, it's designed with safety first. Each tweak is categorized by risk level (Safe, Moderate, Experimental), and you can see exactly what each one does before applying. Nothing touches critical system files, and everything can be reverted with one click."
  },
  {
    question: "Does it work with Fortnite, Valorant, and other anti-cheat games?",
    answer: "Absolutely. SwitchControl only modifies Windows settings and registry values that are allowed by all major anti-cheat systems including Easy Anti-Cheat, Vanguard, and FACEIT. It doesn't inject into games or modify game files."
  },
  {
    question: "Do I need to be tech-savvy to use it?",
    answer: "Not at all. The app is designed for gamers of all skill levels. Each tweak has a clear description, and we recommend starting with 'Recommended' tweaks which are safe for everyone."
  },
  {
    question: "What's your refund policy?",
    answer: "All sales are final unless required by law."
  },
  {
    question: "Do I need to keep the app running while gaming?",
    answer: "No. Most tweaks are applied to Windows settings and persist after reboot. The app only needs to run when you want to make changes or monitor your system."
  }
];

function AnimatedProgressBar({ 
  targetWidth, 
  color, 
  delay = 0 
}: { 
  targetWidth: string; 
  color: 'red' | 'green'; 
  delay?: number;
}) {
  const { prefersReducedMotion } = useMotion();
  const [width, setWidth] = useState(prefersReducedMotion ? targetWidth : '0%');
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion || hasAnimated.current) return;

    const el = ref.current;
    if (!el) return;

    // Check if already in viewport on mount
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    
    if (inViewport) {
      hasAnimated.current = true;
      setTimeout(() => setWidth(targetWidth), delay);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          setTimeout(() => {
            setWidth(targetWidth);
          }, delay);
        }
      },
      { threshold: 0.1, rootMargin: "50px 0px 0px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [targetWidth, delay, prefersReducedMotion]);

  const bgColor = color === 'red' ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div ref={ref} className="h-2 bg-white/10 rounded-full overflow-hidden">
      <div 
        className={cn(
          "h-full rounded-full transition-all duration-1000 ease-out",
          bgColor
        )}
        style={{ width }}
      />
    </div>
  );
}

function GlowBlobs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div 
        className="absolute -top-32 left-1/4 w-[700px] h-[700px] bg-[hsl(270,60%,55%,0.2)] rounded-full blur-[150px] animate-blob-1"
      />
      <div 
        className="absolute top-1/4 -right-32 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[120px] animate-blob-2"
      />
      <div 
        className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob-3"
      />
    </div>
  );
}

function GrainOverlay() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-50 opacity-[0.02]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    />
  );
}

function CountingNumber({ 
  value, 
  prefix = '', 
  suffix = '',
  startDelay = 0
}: { 
  value: string; 
  prefix?: string; 
  suffix?: string;
  startDelay?: number;
}) {
  const { prefersReducedMotion } = useMotion();
  const numericValue = parseInt(value.replace(/[^\d]/g, ''), 10);
  const [displayValue, setDisplayValue] = useState<string | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplayValue(numericValue.toString());
      return;
    }

    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }

    // Wait for parent's fade-in animation to complete, then start counting
    const timer = setTimeout(() => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      
      // Start from 0 when animation begins (not before)
      setDisplayValue('0');
      
      const duration = prefersReducedMotion ? 600 : 1200;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(numericValue * eased);
        setDisplayValue(current.toString());
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(numericValue.toString());
        }
      };
      
      requestAnimationFrame(animate);
    }, startDelay);

    return () => clearTimeout(timer);
  }, [value, numericValue, prefersReducedMotion, startDelay]);

  // Show empty until animation starts (prevents "0" flash)
  if (displayValue === null) {
    return <span style={{ visibility: 'hidden' }}>{prefix}0{suffix}</span>;
  }

  return (
    <span>
      {prefix}{displayValue}{suffix}
    </span>
  );
}

function StatCard({ 
  stat, 
  index 
}: { 
  stat: typeof STATS[0]; 
  index: number;
}) {
  const { prefersReducedMotion } = useMotion();
  const [hasShimmered, setHasShimmered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasShimmered) return;

    const el = ref.current;
    if (!el) return;

    // Check if already in viewport on mount
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    
    if (inViewport) {
      setTimeout(() => setHasShimmered(true), index * 100);
      return;
    }

    // Use observer for scroll reveal
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasShimmered) {
          setTimeout(() => setHasShimmered(true), index * 100);
        }
      },
      { threshold: 0.1, rootMargin: "50px 0px 0px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [index, hasShimmered]);

  const isNegative = stat.value.startsWith("-");
  const numericPart = stat.value.replace(/[^\d]/g, '');
  const prefix = stat.value.startsWith("-") ? "-" : "+";
  const suffix = stat.value.includes("%") ? "%" : stat.value.includes("ms") ? "ms" : "";

  return (
    <motion.div
      ref={ref}
      className={cn(
        "text-center relative overflow-hidden rounded-2xl p-6 md:p-8",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl",
        "border border-white/[0.12] shadow-xl shadow-black/20",
        "hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/20",
        "transition-all duration-500 group cursor-default"
      )}
      style={{
        boxShadow: '0 0 40px -10px rgba(139, 92, 246, 0.15), inset 0 1px 0 0 rgba(255,255,255,0.05)'
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
      {hasShimmered && (
        <div className="absolute inset-0 animate-shimmer pointer-events-none" />
      )}
      <div className={cn(
        "relative text-4xl md:text-5xl font-bold mb-3 transition-all duration-300",
        isNegative ? "text-emerald-400 group-hover:text-emerald-300" : "text-[hsl(190,90%,50%)] group-hover:text-[hsl(190,90%,60%)]"
      )}>
        <CountingNumber 
          value={numericPart} 
          prefix={prefix} 
          suffix={suffix} 
          startDelay={(index * 100) + 500} 
        />
      </div>
      <div className="relative text-sm md:text-base text-muted-foreground group-hover:text-white/70 transition-colors">{stat.label}</div>
    </motion.div>
  );
}

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <motion.header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b transition-all duration-500",
        scrolled 
          ? "bg-gradient-to-r from-black/95 via-zinc-900/95 to-black/95 backdrop-blur-xl border-primary/20 shadow-lg shadow-primary/10" 
          : "bg-gradient-to-r from-black/70 via-zinc-900/60 to-black/70 backdrop-blur-lg border-white/5"
      )}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <BrandLogo size="lg" linkTo="/" />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(link => (
              <a 
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            {isLoading ? (
              <div className="w-20 h-8 bg-white/5 rounded animate-pulse" />
            ) : user ? (
              <>
                <Link href="/download">
                  <motion.div
                    whileHover={{ scale: prefersReducedMotion ? 1.01 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button className="text-sm bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow">
                      <Download className="size-4 mr-2" />
                      Download
                    </Button>
                  </motion.div>
                </Link>
                <Button 
                  variant="ghost" 
                  className="text-sm text-muted-foreground hover:text-white"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="size-4 mr-2" />
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="text-sm">
                    Log in
                  </Button>
                </Link>
                <Link href="/login">
                  <motion.div
                    whileHover={{ scale: prefersReducedMotion ? 1.01 : 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button className="text-sm bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold shadow-lg shadow-[hsl(190,90%,50%,0.25)] hover:shadow-[hsl(190,90%,50%,0.4)] transition-shadow">
                      Get Started
                    </Button>
                  </motion.div>
                </Link>
              </>
            )}
          </div>

          <button 
            className="md:hidden p-2 text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <motion.div 
          className="md:hidden bg-black/95 border-b border-white/5"
          initial={{ opacity: 0, y: prefersReducedMotion ? -5 : -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="px-4 py-4 space-y-4">
            {NAV_LINKS.map(link => (
              <a 
                key={link.label}
                href={link.href}
                className="block text-sm text-muted-foreground hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-white/10 space-y-2">
              {user ? (
                <>
                  <Link href="/download">
                    <Button className="w-full bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold">
                      <Download className="size-4 mr-2" />
                      Download
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4 mr-2" />
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="outline" className="w-full">Log in</Button>
                  </Link>
                  <Link href="/login">
                    <Button className="w-full bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[hsl(270,60%,55%,0.15)] bg-gradient-to-b from-[hsl(260,20%,6%)] to-[hsl(260,18%,4%)] relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <BrandLogo size="md" className="mb-4" linkTo="/" />
            <p className="text-sm text-muted-foreground">
              Professional gaming optimization for competitive players.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="mailto:switchcontrol67@gmail.com" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href={SOCIAL_LINKS.discord} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-white/5 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {brand.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { prefersReducedMotion } = useMotion();
  
  return (
    <motion.div 
      className="border-b border-white/10"
      initial={{ opacity: 0, y: prefersReducedMotion ? 10 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.2 : 0.4, delay: index * 0.05 }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <button
        className="w-full py-5 flex items-center justify-between text-left group"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`faq-${question.slice(0, 20).toLowerCase().replace(/\s/g, '-')}`}
      >
        <span className="font-medium text-white group-hover:text-[hsl(270,60%,55%)] transition-colors pr-4">
          {question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
        >
          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ 
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{ duration: prefersReducedMotion ? 0.15 : 0.3 }}
        className="overflow-hidden"
      >
        <div className="pb-5 text-muted-foreground text-sm leading-relaxed">
          {answer}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  const { prefersReducedMotion } = useMotion();
  const { user, isLoading } = useAuth();
  useRevealOnScroll();
  
  const handleAuthAwareClick = (e: MouseEvent) => {
    if (user) {
      window.location.href = "/download";
    } else {
      window.location.href = "/login?next=/download";
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(260,20%,6%)] via-[hsl(260,18%,8%)] to-[hsl(260,20%,6%)] relative page-enter">
      <PageBackground />
      <GlowBlobs />
      <GrainOverlay />
      <Header />
      
      <main className="pt-16 relative z-10">
        <section className="relative overflow-hidden">
          <HeroBackground />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40 relative">
            <div className="text-center max-w-4xl mx-auto">
              <AnimateIn delay={0}>
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[hsl(270,60%,55%,0.15)] border border-[hsl(270,60%,55%,0.3)] text-[hsl(270,65%,65%)] text-xs font-medium mb-6 animate-pill-float">
                  <Star className="size-3 fill-[hsl(270,60%,55%)] text-[hsl(270,60%,55%)]" />
                  New release 2026
                </span>
              </AnimateIn>
              
              <AnimateIn delay={150}>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 animate-hero-float">
                  Unlock Your PC's{" "}
                  <span className="bg-gradient-to-r from-[hsl(270,60%,55%)] via-[hsl(280,65%,65%)] to-[hsl(190,90%,50%)] bg-clip-text text-transparent">
                    True Potential
                  </span>
                </h1>
              </AnimateIn>
              
              <AnimateIn delay={300}>
                <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-hero-float-slow">
                  Windows PC tweak app focused on lower delay and stable FPS.
                </p>
              </AnimateIn>
              
              <AnimateIn delay={450}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button 
                    size="lg" 
                    className={cn(
                      "text-base px-8 bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold premium-btn",
                      !prefersReducedMotion && "animate-cta-pulse"
                    )}
                    onClick={handleAuthAwareClick}
                    data-testid="button-try-free"
                  >
                    Try Free
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <Link href="/pricing">
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="text-base px-8 border-white/20 hover:bg-white/5 hover:border-white/40 transition-all duration-300 relative group hover:scale-[1.03] active:scale-[0.97]"
                    >
                      <span className="relative z-10">See Pricing</span>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-white/50 group-hover:w-[calc(100%-2rem)] transition-all duration-300" />
                    </Button>
                  </Link>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>

        <section className="py-16 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {STATS.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-8">
              *Based on internal testing. Results may vary depending on hardware and configuration.
            </p>
          </div>
        </section>

        <section id="features" className="py-24 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything You Need to Dominate
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Comprehensive optimization tools designed for competitive gamers who demand the best performance.
              </p>
            </Reveal>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={i * 0.1}>
                  <Card className="animated-border tilt-card bg-[hsl(270,60%,55%,0.05)] border-[hsl(270,60%,55%,0.15)] hover:border-[hsl(270,60%,55%,0.4)] hover:bg-[hsl(270,60%,55%,0.08)] hover:shadow-lg hover:shadow-[hsl(270,60%,55%,0.15)] transition-all duration-300 h-full group rounded-xl overflow-hidden">
                    <CardContent className="p-6 relative z-10">
                      <div className="size-12 rounded-lg bg-[hsl(270,60%,55%,0.15)] group-hover:bg-[hsl(270,60%,55%,0.25)] group-hover:shadow-lg group-hover:shadow-[hsl(270,60%,55%,0.2)] flex items-center justify-center mb-4 transition-all duration-300">
                        <feature.icon className="size-6 text-primary icon-hover" />
                      </div>
                      <h3 className="font-semibold text-white mb-2 group-hover:text-white transition-colors">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">{feature.description}</p>
                    </CardContent>
                  </Card>
                </Reveal>
              ))}
            </div>
            
            <Reveal className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">Explore All Modules</h3>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Click on any module to see what it does. Each tool is designed for maximum impact.
              </p>
            </Reveal>
            
            <ModuleShowcase />
          </div>
        </section>

        {/* BIOS Advisor Premium Section */}
        <section className="py-24 relative overflow-hidden" data-reveal>
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(270,60%,55%)/0.05] via-[hsl(270,60%,55%)/0.08] to-transparent pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[hsl(270,60%,55%)/0.08] blur-[120px] pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <Reveal className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(270,60%,55%)/0.15] border border-[hsl(270,60%,55%)/0.3] mb-6">
                <Crown className="w-4 h-4 text-[hsl(270,60%,55%)]" />
                <span className="text-sm font-medium text-[hsl(270,60%,55%)]">Premium Feature</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Premium BIOS Advisor
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                Firmware-level intelligence for latency, stability, and competitive performance.
              </p>
            </Reveal>
            
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <Reveal className="space-y-6">
                <p className="text-white/80 text-lg leading-relaxed">
                  Most performance tools stop at the operating system. <span className="text-white font-medium">SwitchControl goes deeper.</span>
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  The BIOS Advisor analyzes firmware behavior that directly impacts latency, scheduling, and frametime consistency — without unsafe presets or blind toggles.
                </p>
                
                <div className="grid grid-cols-2 gap-4 pt-4">
                  {[
                    { icon: Cpu, label: "CPU Scheduling" },
                    { icon: Zap, label: "Power & Voltage" },
                    { icon: MemoryStick, label: "Memory & Fabric" },
                    { icon: Radio, label: "Signal Integrity" }
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="p-2 rounded-lg bg-[hsl(270,60%,55%)/0.2]">
                        <item.icon className="w-4 h-4 text-[hsl(270,60%,55%)]" />
                      </div>
                      <span className="text-sm text-white/80">{item.label}</span>
                    </div>
                  ))}
                </div>
                
                <div className="pt-4">
                  <Link href="/pricing">
                    <Button 
                      size="lg"
                      className="bg-gradient-to-r from-[hsl(270,60%,55%)] to-[hsl(280,70%,65%)] hover:from-[hsl(270,60%,50%)] hover:to-[hsl(280,70%,60%)] text-white"
                    >
                      <Crown className="w-4 h-4 mr-2" />
                      Included with Premium
                    </Button>
                  </Link>
                </div>
              </Reveal>
              
              <Reveal delay={0.2}>
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-br from-[hsl(270,60%,55%)/0.2] to-transparent rounded-2xl blur-xl" />
                  <div className="relative space-y-3">
                    {[
                      { name: "XMP / EXPO", status: "Disabled", impact: "High", desc: "Memory running JEDEC limits bandwidth" },
                      { name: "CPPC Preferred Cores", status: "Enabled", impact: "High", desc: "Better thread placement for Ryzen" },
                      { name: "Spread Spectrum", status: "Enabled", impact: "Medium", desc: "EMI modulation causing timing variance" },
                      { name: "Global C-States", status: "Enabled", impact: "High", desc: "Deep sleep states add wake latency" },
                      { name: "FCLK", status: "Auto", impact: "High", desc: "Infinity Fabric clock affecting latency" }
                    ].map((setting, i) => (
                      <motion.div 
                        key={setting.name}
                        className="p-4 rounded-lg bg-card/80 backdrop-blur border border-white/10"
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white text-sm">{setting.name}</span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            setting.impact === "High" 
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          )}>
                            {setting.impact} Impact
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-[hsl(270,60%,55%)]">{setting.status}</span>
                          <span>•</span>
                          <span>{setting.desc}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="py-24 bg-gradient-to-b from-transparent via-[hsl(270,60%,55%,0.05)] to-transparent relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Real Results, Real Improvements
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Drag the sliders to compare before and after optimization results.
              </p>
            </Reveal>
            
            <div className="grid md:grid-cols-3 gap-8">
              <ComparisonSlider
                title="FPS Performance"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="98"
                afterValue="142"
                unit=" FPS"
                beforeSubtext="1% Low FPS"
                afterSubtext="1% Low FPS"
              />
              <ComparisonSlider
                title="Input Delay"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="24"
                afterValue="16"
                unit="ms"
                beforeSubtext="Average delay"
                afterSubtext="Average delay"
              />
              <ComparisonSlider
                title="Network Latency"
                beforeLabel="Stock Windows"
                afterLabel="SwitchControl"
                beforeValue="±18"
                afterValue="±4"
                unit="ms"
                beforeSubtext="Jitter variance"
                afterSubtext="Jitter variance"
              />
            </div>
          </div>
        </section>

        <section className="py-24 relative" data-reveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center">
              <Card className="bg-[hsl(270,60%,55%,0.08)] border-[hsl(270,60%,55%,0.2)] max-w-2xl mx-auto">
                <CardContent className="p-8 md:p-12">
                  <div className="flex justify-center gap-1 mb-6">
                    <Star className="size-5 text-primary fill-primary" />
                    <Star className="size-5 text-primary fill-primary" />
                    <Star className="size-5 text-primary fill-primary" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    New Release 2026
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    SwitchControl is our latest release with enhanced optimization features. We're actively improving based on real user feedback.
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* What is SwitchControl explanation */}
        <WhatIsSwitchControl />

        {/* UI Exploration - guided product tour */}
        <UIExploration />

        <section id="pricing" className="py-24 bg-gradient-to-b from-transparent via-[hsl(270,60%,55%,0.08)] to-transparent relative" data-reveal>
          <div id="pricing-top"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Simple, One-Time Pricing
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                No subscriptions. Pay once, get premium features forever.
              </p>
            </Reveal>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <Reveal direction="left">
                <Card className="bg-[hsl(270,60%,55%,0.05)] border-[hsl(270,60%,55%,0.15)] hover:border-[hsl(270,60%,55%,0.3)] hover:-translate-y-1 transition-all h-full">
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                    <div className="text-3xl font-bold text-white mb-4">$0 <span className="text-sm font-normal text-muted-foreground">forever</span></div>
                    <p className="text-muted-foreground text-sm mb-6">Essential optimization tools</p>
                    <Button 
                      variant="outline" 
                      className="w-full border-white/20"
                      onClick={handleAuthAwareClick}
                      data-testid="button-get-started-pricing"
                    >
                      Get Started
                    </Button>
                  </CardContent>
                </Card>
              </Reveal>

              <Reveal direction="right">
                <Card className="bg-gradient-to-b from-[hsl(270,60%,55%,0.2)] to-[hsl(270,60%,55%,0.05)] border-[hsl(270,60%,55%,0.4)] hover:border-[hsl(270,60%,55%,0.6)] hover:-translate-y-1 transition-all h-full relative overflow-hidden shadow-[0_0_40px_-10px_hsl(270,60%,55%,0.3)]">
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg flex items-center gap-1">
                    <Crown className="size-3" />
                    Best Value
                  </div>
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                    <div className="text-3xl font-bold text-white mb-4">$50 <span className="text-sm font-normal text-muted-foreground">one-time</span></div>
                    <p className="text-muted-foreground text-sm mb-6">Lifetime access to all features</p>
                    <Link href="/pricing">
                      <Button className="w-full bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold shadow-lg shadow-[hsl(190,90%,50%,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-transform">Get Premium</Button>
                    </Link>
                  </CardContent>
                </Card>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="faq" className="py-24 relative" data-reveal>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Frequently Asked Questions
              </h2>
            </Reveal>
            
            <div className="divide-y divide-white/10">
              {FAQ_ITEMS.map((item, i) => (
                <FAQItem key={item.question} question={item.question} answer={item.answer} index={i} />
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 relative" data-reveal>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <Reveal>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Optimize Your Gaming?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of competitive gamers who trust SwitchControl for their system optimization needs.
              </p>
              <Button 
                size="lg" 
                className="text-base px-10 bg-[hsl(190,90%,50%)] hover:bg-[hsl(190,90%,45%)] text-black font-semibold shadow-lg shadow-[hsl(190,90%,50%,0.3)] hover:shadow-[hsl(190,90%,50%,0.5)] hover:scale-[1.03] active:scale-[0.97] transition-all"
                onClick={handleAuthAwareClick}
                data-testid="button-get-started-free"
              >
                Get Started Free
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Reveal>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
