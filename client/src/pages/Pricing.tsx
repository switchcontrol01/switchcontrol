import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Check, 
  ArrowLeft, 
  Zap, 
  Crown, 
  Loader2, 
  Shield, 
  CreditCard, 
  Rocket, 
  Monitor,
  X,
  ChevronDown,
  ChevronUp,
  MessageCircle
} from "lucide-react";
import { motion, useMotion } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAuth } from "@/components/ProtectedRoute";
import { useRevealOnScroll } from "@/hooks/useRevealOnScroll";

const FREE_FEATURES = [
  "Basic system tweaks",
  "Network optimization",
  "Performance monitoring",
  "Community support"
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "Advanced tweaks & scripts",
  "AI-powered recommendations",
  "Priority support",
  "Early access to new features",
  "Custom power plans",
  "Game-specific profiles"
];

const TRUST_ITEMS = [
  { icon: Shield, label: "Secure checkout" },
  { icon: CreditCard, label: "One-time payment" },
  { icon: Rocket, label: "Instant access" },
  { icon: Monitor, label: "Windows 10/11" },
];

const COMPARISON_ITEMS = [
  { feature: "Basic system optimizations", free: true, premium: true },
  { feature: "Network latency tweaks", free: true, premium: true },
  { feature: "Performance monitoring", free: true, premium: true },
  { feature: "Advanced registry tweaks", free: false, premium: true },
  { feature: "AI-powered recommendations", free: false, premium: true },
  { feature: "Game-specific profiles", free: false, premium: true },
  { feature: "Custom power plans", free: false, premium: true },
  { feature: "Priority support", free: false, premium: true },
];

const FAQ_ITEMS = [
  {
    question: "Will this give me a competitive advantage?",
    answer: "Yes. SwitchControl reduces input lag, improves frame consistency, and optimizes network settings. Many users report smoother gameplay and faster response times in competitive games."
  },
  {
    question: "Is it safe? Can it break my PC?",
    answer: "Completely safe. All tweaks are reversible and we only modify safe Windows settings. No hardware changes, no overclocking, no risk to your system."
  },
  {
    question: "Does it work with Fortnite, Valorant, and other games?",
    answer: "Yes! SwitchControl works with all games including Fortnite, Valorant, Apex Legends, Warzone, and more. The optimizations are system-level, so every game benefits."
  },
  {
    question: "What's the refund policy?",
    answer: "Due to the digital nature of the product, all sales are final. We recommend trying the free version first to ensure it works for your setup."
  },
  {
    question: "Do I need to keep it running?",
    answer: "No. Once you apply the tweaks, they persist even after closing the app. Run it again anytime to adjust settings or apply new optimizations."
  },
  {
    question: "How do I get support?",
    answer: "Join our Discord community for fast support from our team and other users. Premium members get priority responses."
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
        data-testid={`faq-${question.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}
      >
        <span className="font-medium text-white pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="size-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-sm text-muted-foreground">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function Pricing() {
  const { prefersReducedMotion } = useMotion();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  useRevealOnScroll();

  const { data: premiumStatus } = useQuery({
    queryKey: ['/api/user/premium-status'],
    queryFn: async () => {
      const res = await fetch('/api/user/premium-status');
      return res.json();
    }
  });

  const handleGetStarted = () => {
    if (user) {
      window.location.href = "/download";
    } else {
      window.location.href = "/login?next=/download";
    }
  };

  const handlePurchase = async () => {
    if (!premiumStatus?.authenticated) {
      navigate('/login?next=/download');
      return;
    }

    if (premiumStatus?.isPremium) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden page-enter">
      {/* Animated gradient background */}
      <div 
        className="fixed inset-0 opacity-40"
        style={{
          background: 'linear-gradient(-45deg, #0f0a1e, #1a0a2e, #0a1628, #0f1a2e, #1a0f2e)',
          backgroundSize: '400% 400%',
          animation: prefersReducedMotion ? 'none' : 'gradientShift 24s ease infinite',
        }}
      />
      
      {/* Glow blobs */}
      <div 
        className="fixed top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{ 
          background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat 20s ease-in-out infinite',
        }}
      />
      <div 
        className="fixed top-1/2 -right-32 w-80 h-80 rounded-full opacity-15 blur-[100px] pointer-events-none"
        style={{ 
          background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat 25s ease-in-out infinite reverse',
        }}
      />
      <div 
        className="fixed bottom-1/4 left-1/3 w-72 h-72 rounded-full opacity-10 blur-[80px] pointer-events-none"
        style={{ 
          background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
          animation: prefersReducedMotion ? 'none' : 'blobFloat 18s ease-in-out infinite',
        }}
      />
      
      {/* Noise overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      
      <style>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes blobFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
      `}</style>
      
      <header className="relative z-10 p-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <Button 
            variant="outline" 
            size="sm" 
            className="border-white/20"
            onClick={handleGetStarted}
          >
            {user ? 'Download' : 'Log in'}
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div 
          className="text-center mb-16"
          initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap className="size-3" />
            Simple pricing, no subscriptions
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Start free forever. Upgrade once for lifetime premium access.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto" data-reveal>
          <motion.div
            initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
            animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="bg-white/5 border-white/10 h-full backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/5">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-white">$0</span>
                  <span className="text-muted-foreground">forever</span>
                </div>
                <p className="text-muted-foreground mb-6">Get started with essential optimizations</p>
                
                <ul className="space-y-3 mb-8">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full bg-white/10 hover:bg-white/20"
                  data-testid="button-select-free"
                  onClick={handleGetStarted}
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
            animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="relative overflow-hidden bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30 h-full backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/20"
              style={{ boxShadow: '0 0 60px -15px rgba(139, 92, 246, 0.3)' }}
            >
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-4 py-1.5 rounded-bl-lg flex items-center gap-1.5">
                <Crown className="size-3" />
                Best Value
              </div>
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-white mb-2">Premium</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-white">$50</span>
                  <span className="text-muted-foreground">one-time</span>
                </div>
                <p className="text-muted-foreground mb-6">Lifetime access to all premium features</p>
                
                <ul className="space-y-3 mb-8">
                  {PREMIUM_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Button 
                  className="w-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
                  onClick={handlePurchase}
                  disabled={isLoading || premiumStatus?.isPremium}
                  data-testid="button-select-premium"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : premiumStatus?.isPremium ? (
                    'Already Premium'
                  ) : (
                    'Get Premium - $50'
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Trust Row */}
        <motion.div 
          className="mt-12 flex flex-wrap justify-center gap-6 md:gap-12"
          initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {TRUST_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="size-4 text-primary" />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Free vs Premium Comparison */}
        <motion.div 
          className="mt-20 max-w-4xl mx-auto"
          initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <h2 className="text-2xl font-semibold text-white text-center mb-8">Free vs Premium</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free Column */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-white mb-4">Free</h3>
              <ul className="space-y-3">
                {COMPARISON_ITEMS.map((item) => (
                  <li key={`free-${item.feature}`} className="flex items-center gap-3 text-sm">
                    {item.free ? (
                      <Check className="size-4 text-emerald-400 shrink-0" />
                    ) : (
                      <X className="size-4 text-zinc-600 shrink-0" />
                    )}
                    <span className={item.free ? 'text-muted-foreground' : 'text-zinc-600'}>{item.feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Premium Column */}
            <div className="bg-gradient-to-b from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-white">Premium</h3>
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Recommended</span>
              </div>
              <ul className="space-y-3">
                {COMPARISON_ITEMS.map((item) => (
                  <li key={`premium-${item.feature}`} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    {item.feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div 
          className="mt-20 max-w-3xl mx-auto"
          initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <h2 className="text-2xl font-semibold text-white text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </motion.div>

        {/* Support CTA */}
        <motion.div 
          className="mt-16 text-center"
          initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
          animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <p className="text-muted-foreground mb-4">Still have questions?</p>
          <a 
            href={SOCIAL_LINKS.discord}
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            <MessageCircle className="size-4" />
            Join our Discord community
          </a>
        </motion.div>
      </main>
    </div>
  );
}
