import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { motion, useMotion } from "@/lib/motion";
import { useQueryClient } from "@tanstack/react-query";

export default function PremiumSuccess() {
  const { prefersReducedMotion } = useMotion();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");

    if (!sessionId) {
      setStatus("error");
      setError("No session ID found");
      return;
    }

    fetch(`/api/stripe/session?session_id=${sessionId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("Session verification:", data);
        if (data.payment_status === "paid") {
          setStatus("success");
          queryClient.invalidateQueries({ queryKey: ["/api/user/premium-status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/me"] });
          setTimeout(() => {
            navigate("/download");
          }, 3000);
        } else {
          setStatus("error");
          setError("Payment not completed");
        }
      })
      .catch((err) => {
        console.error("Session verification error:", err);
        setStatus("error");
        setError("Failed to verify payment");
      });
  }, [navigate, queryClient]);

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
        transition={{ duration: prefersReducedMotion ? 0.15 : 0.3 }}
        className="relative z-10"
      >
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm max-w-md w-full">
          <CardContent className="p-8 text-center">
            {status === "loading" && (
              <>
                <Loader2 className="size-16 text-primary mx-auto mb-4 animate-spin" />
                <h1 className="text-2xl font-bold text-white mb-2">Verifying Payment...</h1>
                <p className="text-muted-foreground">Please wait while we confirm your purchase.</p>
              </>
            )}
            
            {status === "success" && (
              <>
                <CheckCircle className="size-16 text-emerald-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Welcome to Premium!</h1>
                <p className="text-muted-foreground mb-6">
                  Your payment was successful. You now have lifetime access to all premium features.
                </p>
                <p className="text-sm text-muted-foreground mb-4">Redirecting to download page...</p>
                <Button 
                  onClick={() => navigate("/download")}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-goto-download"
                >
                  Go to Download Now
                </Button>
              </>
            )}
            
            {status === "error" && (
              <>
                <XCircle className="size-16 text-red-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Something Went Wrong</h1>
                <p className="text-muted-foreground mb-6">
                  {error || "We couldn't verify your payment. Please contact support if you were charged."}
                </p>
                <div className="flex gap-3 justify-center">
                  <Button 
                    variant="outline"
                    onClick={() => navigate("/pricing")}
                    className="border-white/20"
                    data-testid="button-back-pricing"
                  >
                    Back to Pricing
                  </Button>
                  <Button 
                    onClick={() => window.location.reload()}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="button-retry"
                  >
                    Try Again
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
