import { Switch, Route, useLocation, Redirect } from "wouter";
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
import SystemCleaner from "@/pages/SystemCleaner";
import Debloater from "@/pages/Debloater";
import StartupApps from "@/pages/StartupApps";
import FocusMode from "@/pages/FocusMode";
import AppBooster from "@/pages/AppBooster";
import Login from "@/pages/Login";
import Pricing from "@/pages/Pricing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Download from "@/pages/Download";
import PremiumSuccess from "@/pages/PremiumSuccess";
import Success from "@/pages/Success";
import BiosAdvisor from "@/pages/BiosAdvisor";
import Security from "@/pages/Security";
import { PremiumUnlockAnimation } from "@/components/PremiumUnlockAnimation";

import ElectronLogin from "@/screens/Login";

const isElectron = typeof window !== "undefined" && 
  !!(window as any).process?.versions?.electron;

const AUTH_TOKEN_KEY = "sc_auth_token_v1";

function isAuthenticated(): boolean {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return !!token && token.startsWith("mock_token_");
}

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

function ElectronRouter() {
  const [location, setLocation] = useLocation();
  const authenticated = isAuthenticated();

  if (!authenticated && location !== "/login") {
    return <Redirect to="/login" />;
  }

  if (authenticated && location === "/login") {
    return <Redirect to="/app" />;
  }

  return (
    <AnimatedRoute>
      <Switch>
        <Route path="/login">
          <ElectronLogin onLoginSuccess={() => setLocation("/app")} />
        </Route>
        
        <Route path="/">
          <Redirect to={authenticated ? "/app" : "/login"} />
        </Route>
        
        <Route path="/app">
          <Dashboard />
        </Route>
        <Route path="/app/tweaks">
          <Tweaks />
        </Route>
        <Route path="/app/history">
          <History />
        </Route>
        <Route path="/app/settings">
          <Settings />
        </Route>
        <Route path="/app/power-plan">
          <PowerPlan />
        </Route>
        <Route path="/app/network">
          <NetworkTweaks />
        </Route>
        <Route path="/app/app-booster">
          <AppBooster />
        </Route>
        <Route path="/app/focus">
          <FocusMode />
        </Route>
        <Route path="/app/cleaner">
          <SystemCleaner />
        </Route>
        <Route path="/app/debloat">
          <Debloater />
        </Route>
        <Route path="/app/startup">
          <StartupApps />
        </Route>
        <Route path="/app/bios-advisor">
          <BiosAdvisor />
        </Route>
        <Route path="/app/security">
          <Security />
        </Route>
        
        <Route>
          <Redirect to={authenticated ? "/app" : "/login"} />
        </Route>
      </Switch>
    </AnimatedRoute>
  );
}

function WebRouter() {
  return (
    <AnimatedRoute>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/success" component={Success} />
        
        <Route path="/premium/success">
          <ProtectedRoute>
            <PremiumSuccess />
          </ProtectedRoute>
        </Route>
        
        <Route path="/download">
          <ProtectedRoute>
            <Download />
          </ProtectedRoute>
        </Route>
        
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
            <AppBooster />
          </ProtectedRoute>
        </Route>
        <Route path="/app/focus">
          <ProtectedRoute>
            <FocusMode />
          </ProtectedRoute>
        </Route>
        <Route path="/app/cleaner">
          <ProtectedRoute>
            <SystemCleaner />
          </ProtectedRoute>
        </Route>
        <Route path="/app/debloat">
          <ProtectedRoute>
            <Debloater />
          </ProtectedRoute>
        </Route>
        <Route path="/app/startup">
          <ProtectedRoute>
            <StartupApps />
          </ProtectedRoute>
        </Route>
        <Route path="/app/bios-advisor">
          <ProtectedRoute>
            <BiosAdvisor />
          </ProtectedRoute>
        </Route>
        <Route path="/app/security">
          <ProtectedRoute>
            <Security />
          </ProtectedRoute>
        </Route>
        
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
          {isElectron ? <ElectronRouter /> : <WebRouter />}
          <Toaster />
          <PremiumUnlockAnimation />
        </TooltipProvider>
      </MotionProvider>
    </QueryClientProvider>
  );
}

export default App;
