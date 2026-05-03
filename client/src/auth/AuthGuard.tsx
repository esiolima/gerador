import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import Login from "./Login";
import { useAuth } from "./useAuth";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06111f] text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-4 backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
          <span className="text-sm text-white/60">Validando acesso...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <>{children}</>;
}
