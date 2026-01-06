import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ArrowLeft, Zap } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with essential optimizations",
    features: [
      "Basic system tweaks",
      "Network optimization",
      "Performance monitoring",
      "Community support"
    ],
    cta: "Get Started",
    highlighted: false
  },
  {
    name: "Premium",
    price: "$9.99",
    period: "/month",
    description: "Everything you need for competitive gaming",
    features: [
      "Everything in Free",
      "Advanced tweaks & scripts",
      "AI-powered recommendations",
      "Priority support",
      "Early access to new features",
      "Custom power plans",
      "Game-specific profiles"
    ],
    cta: "Start Free Trial",
    highlighted: true
  }
];

export default function Pricing() {
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
              Log in
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
            <Zap className="size-3" />
            Simple pricing, no surprises
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Start free and upgrade when you're ready for advanced optimizations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {PLANS.map((plan) => (
            <Card 
              key={plan.name}
              className={`relative overflow-hidden ${
                plan.highlighted 
                  ? "bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30" 
                  : "bg-white/5 border-white/10"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-4 py-1.5 rounded-bl-lg">
                  Most Popular
                </div>
              )}
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <p className="text-muted-foreground mb-6">{plan.description}</p>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <Link href="/login">
                  <Button 
                    className={`w-full ${
                      plan.highlighted 
                        ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30" 
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                    data-testid={`button-select-${plan.name.toLowerCase()}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Frequently Asked</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
            <div>
              <h3 className="font-medium text-white mb-2">Can I cancel anytime?</h3>
              <p className="text-sm text-muted-foreground">
                Yes, you can cancel your subscription at any time. No questions asked.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-white mb-2">Is there a free trial?</h3>
              <p className="text-sm text-muted-foreground">
                Premium includes a 7-day free trial. Cancel before it ends and you won't be charged.
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
