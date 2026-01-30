import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Loader2, XCircle, ArrowRight, Home } from "lucide-react";
import { motion, useMotion } from "@/lib/motion";
import { useAuth } from "@/hooks/use-auth";

type ConfirmState = "loading" | "success" | "error";

export default function Success() {
  const { prefersReducedMotion } = useMotion();
  const { refetch } = useAuth();
  const [state, setState] = useState<ConfirmState>("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setState("error");
      setError("No session ID provided");
      return;
    }

    const confirmPayment = async () => {
      try {
        const response = await fetch("/api/stripe/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });
        
        const data = await response.json();
        
        if (data.ok) {
          await refetch();
          
          if (!data.authenticated) {
            console.log("[SUCCESS] User session not found after payment, will redirect to login");
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
          await refetch();
          
          setState("success");
        } else if (data.error === "user_mismatch") {
          setState("error");
          setError("Session mismatch. Please log in with the account you used for checkout.");
        } else {
          setState("error");
          setError(data.error || "Failed to confirm payment");
        }
      } catch (err: any) {
        setState("error");
        setError(err.message || "Network error");
      }
    };

    confirmPayment();
  }, [refetch]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 opacity-40"
        style={{
          background: 'linear-gradient(-45deg, #0f0a1e, #1a0a2e, #0a1628, #0f1a2e, #1a0f2e)',
          backgroundSize: '400% 400%',
          animation: prefersReducedMotion ? 'none' : 'gradientShift 24s ease infinite',
        }}
      />
      
      <style>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: prefersReducedMotion ? 0.98 : 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: prefersReducedMotion ? 0.2 : 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            {state === "loading" && (
              <>
                <Loader2 className="size-16 text-primary mx-auto mb-6 animate-spin" />
                <h1 className="text-2xl font-bold text-white mb-2">Confirming payment...</h1>
                <p className="text-muted-foreground">Please wait while we verify your purchase.</p>
              </>
            )}

            {state === "success" && (
              <>
                <div className="size-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="size-10 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Payment confirmed!</h1>
                <p className="text-muted-foreground mb-8">Premium has been unlocked on your account.</p>
                
                <div className="space-y-3">
                  <Link href="/app">
                    <Button className="w-full bg-primary hover:bg-primary/90" data-testid="button-go-to-app">
                      Go to app
                      <ArrowRight className="ml-2 size-4" />
                    </Button>
                  </Link>
                  <Link href="/pricing">
                    <Button variant="outline" className="w-full border-white/20" data-testid="button-go-to-pricing">
                      <Home className="mr-2 size-4" />
                      Go to pricing
                    </Button>
                  </Link>
                </div>
              </>
            )}

            {state === "error" && (
              <>
                <div className="size-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
                  <XCircle className="size-10 text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
                <p className="text-muted-foreground mb-2">{error}</p>
                <p className="text-sm text-muted-foreground mb-8">
                  If you completed payment, your premium will be activated shortly. If the issue persists, please contact support.
                </p>
                
                <Link href="/pricing">
                  <Button variant="outline" className="w-full border-white/20" data-testid="button-back-to-pricing">
                    Back to pricing
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
