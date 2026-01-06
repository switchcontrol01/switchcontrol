import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Tweaks from "@/pages/Tweaks";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Placeholder from "@/pages/Placeholder";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tweaks" component={Tweaks} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      
      {/* Placeholders */}
      <Route path="/power-plan">
        <Placeholder title="Power Plan" />
      </Route>
      <Route path="/app-booster">
        <Placeholder title="App Booster" />
      </Route>
      <Route path="/focus">
        <Placeholder title="Focus Mode" />
      </Route>
      <Route path="/network">
        <Placeholder title="Network Tweaks" />
      </Route>
      <Route path="/scripts">
        <Placeholder title="Network Scripts" />
      </Route>
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
