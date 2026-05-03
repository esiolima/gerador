import { FormEvent, useState } from "react";
import { Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./useAuth";

export default function Login() {
  const { login } = useAuth();

  const [email, setEmail] = useState("admin@jornal.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06111f] px-6 py-10 text-white">
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 8% 95%, rgba(37,99,235,0.34), transparent 65%), radial-gradient(ellipse 50% 60% at 95% 0%, rgba(14,165,233,0.30), transparent 62%), linear-gradient(180deg,#06111f 0%,#071827 100%)",
        }}
      />

      <main className="relative z-10 flex min-h-[calc(100vh-80px)] items-center justify-center">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-900/30">
              <Lock className="h-8 w-8" />
            </div>

            <h1 className="text-3xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm text-white/45">
              Entre para acessar o Jornal Diagramado.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-white/70">
                E-mail
              </span>
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-4">
                <Mail className="h-5 w-5 text-white/35" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 flex-1 bg-transparent px-3 text-white outline-none placeholder:text-white/25"
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-white/70">
                Senha
              </span>
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 px-4">
                <Lock className="h-5 w-5 text-white/35" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 flex-1 bg-transparent px-3 text-white outline-none placeholder:text-white/25"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 h-12 w-full rounded-xl bg-blue-600 text-base font-black hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>

          <p className="mt-6 text-center text-xs font-medium tracking-wide text-white/30">
            Esio Lima • Versão 4.0
          </p>
        </form>
      </main>
    </div>
  );
}
