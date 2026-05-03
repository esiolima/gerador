import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import CardGenerator from "./pages/CardGenerator";
import LogoManager from "./pages/LogoManager";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/auth/useAuth";
import AuthGuard from "@/auth/AuthGuard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/generator" component={CardGenerator} />
      <Route path="/logos" component={LogoManager} />
      <Route component={NotFound} />
    </Switch>
  );
}

function HeaderUser() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="fixed top-4 right-4 bg-black/60 px-3 py-2 rounded text-white text-sm">
      {user.email} |{" "}
      <button onClick={logout} className="text-red-400">Sair</button>
    </div>
  );
}

function AppContent() {
  return (
    <>
      <HeaderUser />
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppContent />
      </AuthGuard>
    </AuthProvider>
  );
}
