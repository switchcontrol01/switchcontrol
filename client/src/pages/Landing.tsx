import { useState } from "react";
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
  Check,
  ArrowRight,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useMotion } from "@/lib/motion";

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
    answer: "We offer a 7-day money-back guarantee, no questions asked. If SwitchControl doesn't work for you, just contact support and we'll process your refund immediately."
  },
  {
    question: "Do I need to keep the app running while gaming?",
    answer: "No. Most tweaks are applied to Windows settings and persist after reboot. The app only needs to run when you want to make changes or monitor your system."
  }
];

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20">
              S
            </div>
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
            <Link href="/login">
              <Button variant="ghost" className="text-sm">
                Log in
              </Button>
            </Link>
            <Link href="/login">
              <Button className="text-sm bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
                Get Started
              </Button>
            </Link>
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
        <div className="md:hidden bg-black/95 border-b border-white/5">
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
              <Link href="/login">
                <Button variant="outline" className="w-full">Log in</Button>
              </Link>
              <Link href="/login">
                <Button className="w-full bg-primary">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/50">
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
              <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="/contact" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href="https://discord.gg/switchcontrol" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a></li>
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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-white/10">
      <button
        className="w-full py-5 flex items-center justify-between text-left group"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`faq-${question.slice(0, 20).toLowerCase().replace(/\s/g, '-')}`}
      >
        <span className="font-medium text-white group-hover:text-primary transition-colors pr-4">
          {question}
        </span>
        {isOpen ? (
          <ChevronUp className="size-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-5 text-muted-foreground text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const { prefersReducedMotion } = useMotion();
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <Header />
      
      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent pointer-events-none" />
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
                  <Button size="lg" className="text-base px-8 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30">
                    Try Free
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
                <a href="#pricing">
                  <Button size="lg" variant="outline" className="text-base px-8 border-white/20 hover:bg-white/5">
                    See Pricing
                  </Button>
                </a>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 border-y border-white/5 bg-black/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {STATS.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="text-center"
                  initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                  whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className={cn(
                    "text-3xl md:text-4xl font-bold mb-2",
                    stat.value.startsWith("-") ? "text-emerald-400" : "text-primary"
                  )}>
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-8">
              *Based on internal testing. Results may vary depending on hardware and configuration.
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Everything You Need to Dominate
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Comprehensive optimization tools designed for competitive gamers who demand the best performance.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {FEATURES.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                  whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="bg-white/5 border-white/10 hover:border-primary/30 transition-colors h-full">
                    <CardContent className="p-6">
                      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <feature.icon className="size-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Before/After Section */}
        <section className="py-24 bg-gradient-to-b from-transparent via-primary/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Real Results, Real Improvements
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                See the difference SwitchControl makes with before and after optimization comparisons.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-white/5 border-white/10 overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-4">Ping Stability</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Before</span>
                        <span className="text-red-400">±18ms jitter</span>
                      </div>
                      <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[70%] bg-red-500 rounded-full" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">After</span>
                        <span className="text-emerald-400">±4ms jitter</span>
                      </div>
                      <div className="h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[25%] bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-4">Input Delay</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Before</span>
                        <span className="text-red-400">~24ms</span>
                      </div>
                      <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[80%] bg-red-500 rounded-full" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">After</span>
                        <span className="text-emerald-400">~16ms</span>
                      </div>
                      <div className="h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[55%] bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-white mb-4">1% Low FPS</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Before</span>
                        <span className="text-red-400">98 FPS</span>
                      </div>
                      <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[50%] bg-red-500 rounded-full" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">After</span>
                        <span className="text-emerald-400">142 FPS</span>
                      </div>
                      <div className="h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-[75%] bg-emerald-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Loved by Competitive Gamers
              </h2>
              <p className="text-muted-foreground">
                Join thousands of players who've optimized their gameplay.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((testimonial, i) => (
                <motion.div
                  key={testimonial.name}
                  initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
                  whileInView={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="bg-white/5 border-white/10 h-full">
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

        {/* Pricing Section */}
        <section id="pricing" className="py-24 bg-gradient-to-b from-transparent via-primary/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-muted-foreground">
                Start free, upgrade when you're ready.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                  <div className="text-3xl font-bold text-white mb-1">$0</div>
                  <p className="text-muted-foreground text-sm mb-6">Forever free</p>
                  
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Basic system tweaks
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Network optimization
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Community support
                    </li>
                  </ul>
                  
                  <Link href="/login">
                    <Button variant="outline" className="w-full border-white/20">
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg">
                  Popular
                </div>
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                  <div className="text-3xl font-bold text-white mb-1">
                    $9.99<span className="text-lg font-normal text-muted-foreground">/mo</span>
                  </div>
                  <p className="text-muted-foreground text-sm mb-6">Billed monthly</p>
                  
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Everything in Free
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Advanced tweaks & scripts
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      AI-powered recommendations
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Priority support
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400" />
                      Early access to new features
                    </li>
                  </ul>
                  
                  <Link href="/login">
                    <Button className="w-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30">
                      Start Free Trial
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-muted-foreground">
                Got questions? We've got answers.
              </p>
            </div>
            
            <div className="divide-y divide-white/10">
              {FAQ_ITEMS.map((item) => (
                <FAQItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-b from-primary/10 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Level Up Your Game?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of competitive gamers who've already optimized their systems with SwitchControl.
            </p>
            <Link href="/login">
              <Button size="lg" className="text-base px-8 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30">
                Get Started Free
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
