import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CardGenerator from "./pages/CardGenerator";
import LogoManager from "./pages/LogoManager";

// 🔐 IMPORTANTE (NOVO)
import { AuthProvider } from "@/auth/useAuth";
import AuthGuard from "@/auth/AuthGuard";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/generator"} component={CardGenerator} />
      <Route path={"/logos"} component={LogoManager} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGuard>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeProvider>
        </AuthGuard>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
