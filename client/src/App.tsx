import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionProvider, AnimatePresence, motion, pageTransition, useMotion } from "@/lib/motion";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Tweaks from "@/pages/Tweaks";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import PowerPlan from "@/pages/PowerPlan";
import NetworkTweaks from "@/pages/NetworkTweaks";
import Placeholder from "@/pages/Placeholder";

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
        <Route path="/" component={Home} />
        <Route path="/tweaks" component={Tweaks} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        
        {/* Placeholders */}
        <Route path="/power-plan" component={PowerPlan} />
        <Route path="/app-booster">
          <Placeholder title="App Booster" />
        </Route>
        <Route path="/focus">
          <Placeholder title="Focus Mode" />
        </Route>
        <Route path="/network" component={NetworkTweaks} />
        <Route path="/cleaner">
          <Placeholder title="System Cleaner" />
        </Route>
        <Route path="/debloat">
          <Placeholder title="Debloater" />
        </Route>
        <Route path="/startup">
          <Placeholder title="Startup Apps" />
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
