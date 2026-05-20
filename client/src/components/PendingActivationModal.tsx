import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { refreshEntitlements } from '@/lib/auth-store';

interface PendingActivationModalProps {
  show: boolean;
  onUpgradeDetected: () => void;
  onDismiss: () => void;
}

export function PendingActivationModal({ show, onUpgradeDetected, onDismiss }: PendingActivationModalProps) {
  const [status, setStatus] = useState<'syncing' | 'retrying' | 'failed'>('syncing');
  const [countdown, setCountdown] = useState(30);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkPremium = useCallback(async () => {
    console.log('[PendingActivation] Checking premium status...');
    const result = await refreshEntitlements();
    if (!mountedRef.current) return false;

    if (result.user?.isPremium) {
      console.log('[PendingActivation] Premium detected!');
      setStatus('syncing');
      onUpgradeDetected();
      return true;
    }
    return false;
  }, [onUpgradeDetected]);

  useEffect(() => {
    if (!show) {
      setStatus('syncing');
      setCountdown(30);
      setRetryCount(0);
      return;
    }

    let interval: NodeJS.Timeout;
    let checkInterval: NodeJS.Timeout;
    let cancelled = false;

    const startChecking = async () => {
      const found = await checkPremium();
      if (cancelled || !mountedRef.current) return;
      if (found) return;

      interval = setInterval(() => {
        // Pause countdown while tab is hidden so the timer reflects active wait time
        if (typeof document !== 'undefined' && document.hidden) return;
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            clearInterval(checkInterval);
            setStatus('failed');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      checkInterval = setInterval(async () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!mountedRef.current) return;
        setRetryCount(prev => prev + 1);
        const wasFound = await checkPremium();
        if (cancelled || !mountedRef.current) return;
        if (wasFound) {
          clearInterval(interval);
          clearInterval(checkInterval);
        }
      }, 3000);
    };

    startChecking();

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(checkInterval);
    };
  }, [show, checkPremium]);

  const handleRetry = async () => {
    setStatus('retrying');
    setCountdown(30);
    setRetryCount(0);

    const found = await checkPremium();
    if (!mountedRef.current) return;
    if (!found) {
      setStatus('syncing');
    }
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-[#14181D] backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-sm glass-surface-bg backdrop-blur-2xl border border-[#2A313A] rounded-2xl p-6 shadow-2xl shadow-black/40"
        >
          <div className="text-center space-y-4">
            {status === 'syncing' && (
              <>
                <motion.div
                  className="size-16 mx-auto rounded-full bg-#00D4FF/20 flex items-center justify-center"
                  animate={{ 
                    boxShadow: [
                      '0 0 20px rgba(139, 92, 246, 0.3)',
                      '0 0 40px rgba(139, 92, 246, 0.5)',
                      '0 0 20px rgba(139, 92, 246, 0.3)',
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Loader2 className="size-8 text-text-[#00D4FF] animate-spin" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-semibold text-[#E6EAF0]">Activating Premium</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Syncing your purchase... ({countdown}s)
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Attempt {retryCount + 1}
                  </p>
                </div>
                <div className="w-full h-1 bg-[#2A313A] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#00D4FF] to-[#F59E0B]"
                    initial={{ width: '100%' }}
                    animate={{ width: `${(countdown / 30) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </>
            )}

            {status === 'retrying' && (
              <>
                <div className="size-16 mx-auto rounded-full bg-#00D4FF/20 flex items-center justify-center">
                  <RefreshCw className="size-8 text-text-[#00D4FF] animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#E6EAF0]">Retrying...</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Checking for premium status
                  </p>
                </div>
              </>
            )}

            {status === 'failed' && (
              <>
                <div className="size-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <RefreshCw className="size-8 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#E6EAF0]">Still Syncing</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your payment is being processed. This usually takes a moment.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <Button 
                    onClick={handleRetry}
                    className="w-full bg-#00D4FF hover:bg-[#00D4FF]"
                  >
                    <RefreshCw className="size-4 mr-2" />
                    Retry Now
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={onDismiss}
                    className="w-full text-muted-foreground"
                  >
                    Dismiss (Restart App Later)
                  </Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
