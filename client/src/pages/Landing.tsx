import { useState, useEffect, useRef, useCallback } from "react";
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
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotion } from "@/lib/motion";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAuth } from "@/components/ProtectedRoute";

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

const TESTIMONIALS = [
  {
    name: "Alex M.",
    role: "Competitive Valorant Player",
    content: "Finally something that actually works. My input delay dropped noticeably and my 1% lows are way more stable.",
    rating: 5
  },
  {
    name: "Jordan K.",
    role: "Fortnite Creator",
    content: "I've tried every optimizer out there. SwitchControl is the only one I trust to not break my system.",
    rating: 5
  },
  {
    name: "Mike R.",
    role: "Warzone Streamer",
    content: "The network tweaks alone were worth it. My ping is more consistent and I'm not getting those random spikes anymore.",
    rating: 5
  }
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          setTimeout(() => {
            setWidth(targetWidth);
          }, delay);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

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
  const { prefersReducedMotion } = useMotion();
  
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div 
        className={cn(
          "absolute -top-32 left-1/4 w-[700px] h-[700px] bg-primary/20 rounded-full blur-[150px]",
          !prefersReducedMotion && "animate-blob-1"
        )}
      />
      <div 
        className={cn(
          "absolute top-1/4 -right-32 w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[120px]",
          !prefersReducedMotion && "animate-blob-2"
        )}
      />
      <div 
        className={cn(
          "absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px]",
          !prefersReducedMotion && "animate-blob-3"
        )}
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
  suffix = '' 
}: { 
  value: string; 
  prefix?: string; 
  suffix?: string;
}) {
  const { prefersReducedMotion } = useMotion();
  const numericValue = parseInt(value.replace(/[^\d]/g, ''), 10);
  const [displayValue, setDisplayValue] = useState(prefersReducedMotion ? numericValue.toString() : '0');
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion || hasAnimated.current) {
      setDisplayValue(numericValue.toString());
      return;
    }

    if (isNaN(numericValue)) {
      setDisplayValue(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1500;
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
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value, numericValue, prefersReducedMotion]);

  return (
    <span ref={ref}>
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
    if (prefersReducedMotion) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasShimmered) {
          setTimeout(() => setHasShimmered(true), index * 100);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [index, hasShimmered, prefersReducedMotion]);

  const isNegative = stat.value.startsWith("-");
  const numericPart = stat.value.replace(/[^\d]/g, '');
  const prefix = stat.value.startsWith("-") ? "-" : "+";
  const suffix = stat.value.includes("%") ? "%" : stat.value.includes("ms") ? "ms" : "";

  return (
    <motion.div
      ref={ref}
      className={cn(
        "text-center relative overflow-hidden rounded-xl p-4 border border-white/5 bg-white/[0.02]",
        "hover:border-white/10 hover:bg-white/[0.04] transition-all duration-300",
        "group cursor-default"
      )}
      initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
      whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      viewport={{ once: true }}
      whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
    >
      {hasShimmered && !prefersReducedMotion && (
        <div className="absolute inset-0 animate-shimmer pointer-events-none" />
      )}
      <div className={cn(
        "text-3xl md:text-4xl font-bold mb-2 transition-all duration-300",
        isNegative ? "text-emerald-400 group-hover:text-emerald-300" : "text-primary group-hover:text-purple-400"
      )}>
        <CountingNumber value={numericPart} prefix={prefix} suffix={suffix} />
      </div>
      <div className="text-sm text-muted-foreground">{stat.label}</div>
    </motion.div>
  );
}

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { prefersReducedMotion } = useMotion();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    window.location.href = '/api/logout';
  };

  return (
    <motion.header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300",
        scrolled 
          ? "bg-black/90 backdrop-blur-xl border-white/10 shadow-lg shadow-black/20" 
          : "bg-black/60 backdrop-blur-md border-white/5"
      )}
      initial={!prefersReducedMotion ? { y: -100, opacity: 0 } : undefined}
      animate={!prefersReducedMotion ? { y: 0, opacity: 1 } : undefined}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <motion.div 
              className="size-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/30"
              whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}
              whileTap={!prefersReducedMotion ? { scale: 0.95 } : undefined}
            >
              S
            </motion.div>
            <span className="font-bold text-lg text-white">SwitchControl</span>
          </Link>

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
                    whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
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
                    whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
                  >
                    <Button className="text-sm bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow">
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
          initial={!prefersReducedMotion ? { opacity: 0, y: -10 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
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
                    <Button className="w-full bg-primary">
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
                    <Button className="w-full bg-primary">Get Started</Button>
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
    <footer className="border-t border-white/5 bg-black/50 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                S
              </div>
              <span className="font-bold text-white">SwitchControl</span>
            </div>
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
              <li><a href="mailto:support@switchcontrol.org" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href={SOCIAL_LINKS.discord} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-white/5 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} SwitchControl. All rights reserved.
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
      initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
      whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      viewport={{ once: true }}
    >
      <button
        className="w-full py-5 flex items-center justify-between text-left group"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`faq-${question.slice(0, 20).toLowerCase().replace(/\s/g, '-')}`}
      >
        <span className="font-medium text-white group-hover:text-primary transition-colors pr-4">
          {question}
        </span>
        <motion.div
          animate={!prefersReducedMotion ? { rotate: isOpen ? 180 : 0 } : undefined}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={!prefersReducedMotion ? { 
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0
        } : undefined}
        transition={{ duration: 0.3 }}
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
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black relative">
      <GlowBlobs />
      <GrainOverlay />
      <Header />
      
      <main className="pt-16 relative z-10">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/30 via-purple-600/10 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyek0zNiAyMHYtNGgtMnY0aDJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-20 pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40 relative">
            <div className="text-center max-w-4xl mx-auto">
              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5 }}
              >
                <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
                  Trusted by 10,000+ competitive gamers
                </span>
              </motion.div>
              
              <motion.h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6"
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                Unlock Your PC's{" "}
                <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-500 bg-clip-text text-transparent">
                  True Potential
                </span>
              </motion.h1>
              
              <motion.p
                className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                Professional-grade Windows optimization for competitive gaming. 
                Lower latency, smoother frames, better consistency.
              </motion.p>
              
              <motion.div
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Link href="/login">
                  <motion.div
                    whileHover={!prefersReducedMotion ? { scale: 1.03, y: -2 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.97 } : undefined}
                  >
                    <Button 
                      size="lg" 
                      className={cn(
                        "text-base px-8 bg-primary hover:bg-primary/90 transition-all duration-300",
                        "hover:shadow-[0_0_40px_hsl(270_70%_60%/0.5)]",
                        !prefersReducedMotion && "animate-cta-pulse"
                      )}
                    >
                      Try Free
                      <ArrowRight className="ml-2 size-4" />
                    </Button>
                  </motion.div>
                </Link>
                <Link href="/pricing">
                  <motion.div
                    whileHover={!prefersReducedMotion ? { scale: 1.03 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.97 } : undefined}
                  >
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="text-base px-8 border-white/20 hover:bg-white/5 hover:border-white/40 transition-all duration-300 relative group"
                    >
                      <span className="relative z-10">See Pricing</span>
                      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-white/50 group-hover:w-[calc(100%-2rem)] transition-all duration-300" />
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="py-16 border-y border-white/5 bg-black/30 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {STATS.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} index={i} />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-8">
              *Based on internal testing. Results may vary depending on hardware and configuration.
            </p>
          </div>
        </section>

        <section id="features" className="py-24 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              className="text-center mb-16"
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything You Need to Dominate
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Comprehensive optimization tools designed for competitive gamers who demand the best performance.
              </p>
            </motion.div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                  whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={!prefersReducedMotion ? { y: -6, scale: 1.02 } : undefined}
                >
                  <Card className="animated-border bg-white/5 border-white/10 hover:border-primary/30 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 h-full group rounded-xl overflow-hidden">
                    <CardContent className="p-6 relative z-10">
                      <div className="size-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 group-hover:shadow-lg group-hover:shadow-primary/20 flex items-center justify-center mb-4 transition-all duration-300">
                        <feature.icon className="size-6 text-primary group-hover:scale-110 transition-transform duration-300" />
                      </div>
                      <h3 className="font-semibold text-white mb-2 group-hover:text-white transition-colors">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/80 transition-colors">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-gradient-to-b from-transparent via-primary/5 to-transparent relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              className="text-center mb-16"
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Real Results, Real Improvements
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                See the difference SwitchControl makes with before and after optimization comparisons.
              </p>
            </motion.div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.4 }}
                viewport={{ once: true }}
                whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
              >
                <Card className="bg-white/5 border-white/10 hover:border-primary/30 transition-all h-full">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-white mb-4">Ping Stability</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Before</span>
                          <span className="text-red-400">±18ms jitter</span>
                        </div>
                        <AnimatedProgressBar targetWidth="70%" color="red" delay={0} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">After</span>
                          <span className="text-emerald-400">±4ms jitter</span>
                        </div>
                        <AnimatedProgressBar targetWidth="25%" color="green" delay={200} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.4, delay: 0.1 }}
                viewport={{ once: true }}
                whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
              >
                <Card className="bg-white/5 border-white/10 hover:border-primary/30 transition-all h-full">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-white mb-4">Input Delay</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Before</span>
                          <span className="text-red-400">~24ms</span>
                        </div>
                        <AnimatedProgressBar targetWidth="80%" color="red" delay={100} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">After</span>
                          <span className="text-emerald-400">~16ms</span>
                        </div>
                        <AnimatedProgressBar targetWidth="55%" color="green" delay={300} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.4, delay: 0.2 }}
                viewport={{ once: true }}
                whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
              >
                <Card className="bg-white/5 border-white/10 hover:border-primary/30 transition-all h-full">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-white mb-4">1% Low FPS</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Before</span>
                          <span className="text-red-400">98 FPS</span>
                        </div>
                        <AnimatedProgressBar targetWidth="50%" color="red" delay={200} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">After</span>
                          <span className="text-emerald-400">142 FPS</span>
                        </div>
                        <AnimatedProgressBar targetWidth="75%" color="green" delay={400} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="py-24 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              className="text-center mb-16"
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Loved by Competitive Gamers
              </h2>
              <p className="text-muted-foreground">
                Join thousands of players who've optimized their gameplay.
              </p>
            </motion.div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((testimonial, i) => (
                <motion.div
                  key={testimonial.name}
                  initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                  whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
                >
                  <Card className="bg-white/5 border-white/10 hover:border-primary/30 transition-all h-full">
                    <CardContent className="p-6">
                      <div className="flex gap-1 mb-4">
                        {Array.from({ length: testimonial.rating }).map((_, i) => (
                          <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
                        "{testimonial.content}"
                      </p>
                      <div>
                        <div className="font-medium text-white">{testimonial.name}</div>
                        <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24 bg-gradient-to-b from-transparent via-primary/5 to-transparent relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              className="text-center mb-16"
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Simple, One-Time Pricing
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                No subscriptions. Pay once, get premium features forever.
              </p>
            </motion.div>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, x: -20 } : undefined}
                whileInView={!prefersReducedMotion ? { opacity: 1, x: 0 } : undefined}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
              >
                <Card className="bg-white/5 border-white/10 hover:border-white/20 transition-all h-full">
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                    <div className="text-3xl font-bold text-white mb-4">$0 <span className="text-sm font-normal text-muted-foreground">forever</span></div>
                    <p className="text-muted-foreground text-sm mb-6">Essential optimization tools</p>
                    <Link href="/login">
                      <Button variant="outline" className="w-full border-white/20">Get Started</Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={!prefersReducedMotion ? { opacity: 0, x: 20 } : undefined}
                whileInView={!prefersReducedMotion ? { opacity: 1, x: 0 } : undefined}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                whileHover={!prefersReducedMotion ? { y: -4 } : undefined}
              >
                <Card className="bg-gradient-to-b from-primary/20 to-primary/5 border-primary/40 hover:border-primary/60 transition-all h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary text-xs font-medium px-3 py-1 rounded-bl-lg">Best Value</div>
                  <CardContent className="p-8">
                    <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                    <div className="text-3xl font-bold text-white mb-4">$50 <span className="text-sm font-normal text-muted-foreground">one-time</span></div>
                    <p className="text-muted-foreground text-sm mb-6">Lifetime access to all features</p>
                    <Link href="/pricing">
                      <motion.div
                        whileHover={!prefersReducedMotion ? { scale: 1.02 } : undefined}
                        whileTap={!prefersReducedMotion ? { scale: 0.98 } : undefined}
                      >
                        <Button className="w-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30">Get Premium</Button>
                      </motion.div>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        <section id="faq" className="py-24 relative">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              className="text-center mb-12"
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Frequently Asked Questions
              </h2>
            </motion.div>
            
            <div className="divide-y divide-white/10">
              {FAQ_ITEMS.map((item, i) => (
                <FAQItem key={item.question} question={item.question} answer={item.answer} index={i} />
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 relative">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
              whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Optimize Your Gaming?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of competitive gamers who trust SwitchControl for their system optimization needs.
              </p>
              <Link href="/login">
                <motion.div
                  whileHover={!prefersReducedMotion ? { scale: 1.03 } : undefined}
                  whileTap={!prefersReducedMotion ? { scale: 0.97 } : undefined}
                  className="inline-block"
                >
                  <Button size="lg" className="text-base px-10 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/40 hover:shadow-primary/60 transition-shadow">
                    Get Started Free
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
