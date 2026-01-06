import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider, AnimatePresence, motion, pageTransition, useMotion } from "@/lib/motion";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Home";
import Tweaks from "@/pages/Tweaks";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import PowerPlan from "@/pages/PowerPlan";
import NetworkTweaks from "@/pages/NetworkTweaks";
import Placeholder from "@/pages/Placeholder";
import Login from "@/pages/Login";
import Pricing from "@/pages/Pricing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Download from "@/pages/Download";

function AnimatedRoute({ children }: { children: React.ReactNode }) {
  const { prefersReducedMotion } = useMotion();
  const [location] = useLocation();
  
  if (prefersReducedMotion) {
    return <>{children}</>;
  }
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function Router() {
  return (
    <AnimatedRoute>
      <Switch>
        {/* Marketing Pages (public) */}
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        
        {/* Protected Download Page */}
        <Route path="/download">
          <ProtectedRoute>
            <Download />
          </ProtectedRoute>
        </Route>
        
        {/* Protected App Routes */}
        <Route path="/app">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/app/tweaks">
          <ProtectedRoute>
            <Tweaks />
          </ProtectedRoute>
        </Route>
        <Route path="/app/history">
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        </Route>
        <Route path="/app/settings">
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        </Route>
        <Route path="/app/power-plan">
          <ProtectedRoute>
            <PowerPlan />
          </ProtectedRoute>
        </Route>
        <Route path="/app/network">
          <ProtectedRoute>
            <NetworkTweaks />
          </ProtectedRoute>
        </Route>
        <Route path="/app/app-booster">
          <ProtectedRoute>
            <Placeholder title="App Booster" />
          </ProtectedRoute>
        </Route>
        <Route path="/app/focus">
          <ProtectedRoute>
            <Placeholder title="Focus Mode" />
          </ProtectedRoute>
        </Route>
        <Route path="/app/cleaner">
          <ProtectedRoute>
            <Placeholder title="System Cleaner" />
          </ProtectedRoute>
        </Route>
        <Route path="/app/debloat">
          <ProtectedRoute>
            <Placeholder title="Debloater" />
          </ProtectedRoute>
        </Route>
        <Route path="/app/startup">
          <ProtectedRoute>
            <Placeholder title="Startup Apps" />
          </ProtectedRoute>
        </Route>
        
        {/* Legacy routes - redirect to new paths */}
        <Route path="/dashboard">
          {() => {
            window.location.href = '/app';
            return null;
          }}
        </Route>
        <Route path="/tweaks">
          {() => {
            window.location.href = '/app/tweaks';
            return null;
          }}
        </Route>
        
        <Route component={NotFound} />
      </Switch>
    </AnimatedRoute>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}

export default App;
