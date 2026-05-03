import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CardGenerator from "./pages/CardGenerator";
import LogoManager from "./pages/LogoManager";

// 🔐 AUTH
import { AuthProvider, useAuth } from "@/auth/useAuth";
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

// 🔥 HEADER USUÁRIO (CORRIGIDO)
function HeaderUser() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/70 backdrop-blur px-4 py-2 rounded-lg text-white text-sm flex items-center gap-3 shadow-lg">
      <span className="text-white/80">{user.email}</span>

      <button
        onClick={logout}
        className="text-red-400 hover:text-red-300 font-semibold"
      >
        Sair
      </button>
    </div>
  );
}

function AppContent() {
  return (
    <>
      <HeaderUser />

      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGuard>
          <AppContent />
        </AuthGuard>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
