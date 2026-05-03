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

// 🔥 ÍCONE
import { LogOut } from "lucide-react";

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

// 🔥 HEADER USUÁRIO (COM NOME COMPLETO + TRUNCATE)
function HeaderUser() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const userName =
    user?.name || user?.email?.split("@")[0];

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg text-white text-sm shadow-lg border border-white/10">
      
      <span className="text-white/80 font-medium max-w-[160px] truncate">
        {userName}
      </span>

      <button
        onClick={logout}
        className="text-gray-400 hover:text-red-400 transition"
        title="Sair"
      >
        <LogOut size={16} />
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
