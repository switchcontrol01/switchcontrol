import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet";
import { 
  Check, 
  Zap, 
  Crown, 
  Loader2, 
  Shield, 
  CreditCard, 
  Rocket, 
  Monitor,
  X,
  ChevronDown,
  MessageCircle
} from "lucide-react";
import { motion, useMotion, Reveal } from "@/lib/motion";
import { SOCIAL_LINKS } from "@/config/socialLinks";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { WebsiteShell } from "@/components/website/WebsiteShell";
import { GlassPanel } from "@/components/website/GlassPanel";
import { SectionHeader } from "@/components/website/SectionHeader";
import { SectionDivider } from "@/components/website/SectionDivider";
import { GlowButton } from "@/components/website/GlowButton";

const FREE_FEATURES = [
  "System monitoring",
  "7 beginner-safe tweaks",
  "Basic RAM cleanup tools",
  "Community support"
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "Advanced system tweaks",
  "Power Plan control",
  "Network optimization",
  "AI Advisor",
  "BIOS Advisor (guidance)",
  "Competitive performance tuning",
  "Priority support"
];

const TRUST_ITEMS = [
  { icon: Shield, label: "Secure checkout" },
  { icon: CreditCard, label: "One-time payment" },
  { icon: Rocket, label: "Instant access" },
  { icon: Monitor, label: "Windows 10/11" },
];

const COMPARISON_ITEMS = [
  { feature: "System monitoring", free: true, premium: true },
  { feature: "7 beginner-safe tweaks", free: true, premium: true },
  { feature: "RAM cleanup tools", free: true, premium: true },
  { feature: "Advanced system tweaks", free: false, premium: true },
  { feature: "Network optimization", free: false, premium: true },
  { feature: "Power Plan control", free: false, premium: true },
  { feature: "AI Advisor", free: false, premium: true },
  { feature: "BIOS Advisor (guidance)", free: false, premium: true },
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
  const { prefersReducedMotion } = useMotion();
  
  return (
    <GlassPanel
      variant={isOpen ? "elevated" : "default"}
      className="overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.03] transition-colors"
        data-testid={`faq-${question.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}
      >
        <span className="font-medium text-white pr-4">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
        >
          <ChevronDown className="size-5 text-white/40 shrink-0" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ 
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0
        }}
        transition={{ duration: prefersReducedMotion ? 0.15 : 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 text-sm text-white/50 leading-relaxed">
          {answer}
        </div>
      </motion.div>
    </GlassPanel>
  );
}

export default function Pricing() {
  const { prefersReducedMotion } = useMotion();
  const [, navigate] = useLocation();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const { user, isAuthenticated, isPremium } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      window.location.href = "/download";
    } else {
      window.location.href = "/login?next=/download";
    }
  };

  const handlePurchase = async () => {
    if (!isAuthenticated) {
      window.location.href = '/login?next=/pricing';
      return;
    }

    if (isPremium) {
      return;
    }

    setIsCheckoutLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <WebsiteShell variant="inner">
      <Helmet>
        <link rel="canonical" href="https://switchcontrol.org/pricing" />
      </Helmet>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div id="pricing-top"></div>

        <SectionHeader
          pill="One-time purchase, lifetime access"
          pillIcon={<Zap className="size-3" />}
          title="Choose Your Plan"
          subtitle="Start free forever. Upgrade once for lifetime premium access."
        />

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Reveal delay={0.1}>
            <GlassPanel variant="default" hover className="h-full p-8">
              <h3 className="text-2xl font-bold text-white mb-2" data-testid="text-plan-free">Free</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-white/40">forever</span>
              </div>
              <p className="text-white/50 mb-6">Get started with essential optimizations</p>
              
              <ul className="space-y-3 mb-8">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-white/60">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <button 
                className="w-full h-11 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/80 font-medium transition-all duration-300 hover:bg-white/[0.1] hover:border-white/[0.15] active:scale-[0.98]"
                data-testid="button-select-free"
                onClick={handleGetStarted}
              >
                Get Started
              </button>
            </GlassPanel>
          </Reveal>

          <Reveal delay={0.2}>
            <GlassPanel 
              variant="elevated" 
              glow="purple" 
              hover 
              className="relative h-full p-8 overflow-visible"
              style={{
                borderColor: 'hsl(270 60% 55% / 0.35)',
              }}
            >
              <div className="absolute -top-3 right-6 bg-gradient-to-r from-[hsl(270,60%,52%)] to-[hsl(280,55%,48%)] text-white text-xs font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-[hsl(270,60%,55%,0.3)]">
                <Crown className="size-3" />
                Best Value
              </div>
              <h3 className="text-2xl font-bold text-white mb-2" data-testid="text-plan-premium">Premium</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-white">$50</span>
                <span className="text-white/40">one-time</span>
              </div>
              <p className="text-white/50 mb-6">Lifetime access to all premium features</p>
              
              <ul className="space-y-3 mb-8">
                {PREMIUM_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-white/60">
                    <Check className="size-4 text-emerald-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <GlowButton
                variant={isPremium ? "primary" : "cyan"}
                className={`w-full ${isPremium ? 'bg-emerald-600 hover:bg-emerald-600 cursor-default shadow-none hover:shadow-none hover:scale-100' : ''}`}
                onClick={isPremium ? undefined : handlePurchase}
                disabled={isCheckoutLoading || isPremium}
                data-testid="button-select-premium"
              >
                {isCheckoutLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Processing...
                  </>
                ) : isPremium ? (
                  <>
                    <Check className="size-4" />
                    Purchased
                  </>
                ) : !isAuthenticated ? (
                  'Log in to purchase'
                ) : (
                  'Get Premium - $50'
                )}
              </GlowButton>
            </GlassPanel>
          </Reveal>
        </div>

        <Reveal delay={0.3}>
          <div className="mt-12 flex flex-wrap justify-center gap-6 md:gap-12">
            {TRUST_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-white/40">
                <item.icon className="size-4 text-primary" />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <SectionDivider className="my-20" />

        <section className="max-w-4xl mx-auto">
          <SectionHeader
            title="Free vs Premium"
            subtitle="See exactly what you get with each plan."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Reveal delay={0.1}>
              <GlassPanel variant="default" className="p-6 h-full">
                <h3 className="text-lg font-semibold text-white mb-4" data-testid="text-comparison-free">Free</h3>
                <ul className="space-y-3">
                  {COMPARISON_ITEMS.map((item) => (
                    <li key={`free-${item.feature}`} className="flex items-center gap-3 text-sm">
                      {item.free ? (
                        <Check className="size-4 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="size-4 text-white/15 shrink-0" />
                      )}
                      <span className={item.free ? 'text-white/60' : 'text-white/20'}>{item.feature}</span>
                    </li>
                  ))}
                </ul>
              </GlassPanel>
            </Reveal>

            <Reveal delay={0.2}>
              <GlassPanel 
                variant="elevated" 
                glow="purple" 
                className="p-6 h-full"
                style={{ borderColor: 'hsl(270 60% 55% / 0.2)' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold text-white" data-testid="text-comparison-premium">Premium</h3>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <ul className="space-y-3">
                  {COMPARISON_ITEMS.map((item) => (
                    <li key={`premium-${item.feature}`} className="flex items-center gap-3 text-sm text-white/60">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      {item.feature}
                    </li>
                  ))}
                </ul>
              </GlassPanel>
            </Reveal>
          </div>
        </section>

        <SectionDivider className="my-20" />

        <section className="max-w-3xl mx-auto">
          <SectionHeader
            title="Frequently Asked Questions"
          />

          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </section>

        <SectionDivider className="my-16" />

        <Reveal>
          <div className="text-center pb-8">
            <p className="text-white/40 mb-4">Still have questions?</p>
            <a 
              href={SOCIAL_LINKS.discord}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
              data-testid="link-discord-support"
            >
              <MessageCircle className="size-4" />
              Join our Discord community
            </a>
          </div>
        </Reveal>
      </main>
    </WebsiteShell>
  );
}
