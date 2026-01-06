import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ArrowLeft, Zap, Crown, Loader2 } from "lucide-react";
import { motion, useMotion } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";

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

export default function Pricing() {
  const { prefersReducedMotion } = useMotion();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const { data: premiumStatus } = useQuery({
    queryKey: ['/api/user/premium-status'],
    queryFn: async () => {
      const res = await fetch('/api/user/premium-status');
      return res.json();
    }
  });

  const handlePurchase = async () => {
    if (!premiumStatus?.authenticated) {
      navigate('/login');
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
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      <header className="relative z-10 p-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm" className="border-white/20">
              {premiumStatus?.authenticated ? 'Dashboard' : 'Log in'}
            </Button>
          </Link>
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

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <motion.div
            initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
            animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="bg-white/5 border-white/10 h-full">
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
                
                <Link href="/login">
                  <Button 
                    className="w-full bg-white/10 hover:bg-white/20"
                    data-testid="button-select-free"
                  >
                    Get Started
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={!prefersReducedMotion ? { opacity: 0, y: 20 } : undefined}
            animate={!prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="relative overflow-hidden bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30 h-full">
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

        <div className="mt-16 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Frequently Asked</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
            <div>
              <h3 className="font-medium text-white mb-2">Is this a subscription?</h3>
              <p className="text-sm text-muted-foreground">
                No! Premium is a one-time $50 payment. You get lifetime access with no recurring charges.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-white mb-2">What if I want a refund?</h3>
              <p className="text-sm text-muted-foreground">
                All sales are final unless required by law.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-white mb-2">What payment methods?</h3>
              <p className="text-sm text-muted-foreground">
                We accept all major credit cards via Stripe. Your payment info is never stored on our servers.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
