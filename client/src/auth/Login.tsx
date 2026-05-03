import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./useAuth";
import { motion, AnimatePresence } from "framer-motion";

export default function Login() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const fields = [
    { key: "name", label: "nome" },
    { key: "email", label: "e-mail" },
    { key: "company", label: "empresa" },
    { key: "role", label: "cargo" },
    { key: "phone", label: "telefone" },
  ];

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#06111f] text-white">
      {/* LOGIN */}
      <div className="p-6 bg-black/40 rounded-xl w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">Conecte-se</h1>

        <input
          placeholder="Email"
          className="w-full p-2 mb-2 bg-black/30 rounded"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Senha"
          className="w-full p-2 mb-4 bg-black/30 rounded"
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button onClick={() => login(email, password)}>Entrar</Button>

        <div className="mt-4 text-center">
          <button
            onClick={() => setShowRequest(true)}
            className="text-blue-400 hover:underline"
          >
            Solicitar acesso
          </button>
        </div>
      </div>

      {/* MODAL COM ANIMAÇÃO */}
      <AnimatePresence>
        {showRequest && (
          <motion.div
            className="fixed inset-0 bg-black/80 flex items-center justify-center"
            onClick={() => setShowRequest(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-[#06111f] p-6 rounded-xl w-full max-w-md space-y-3"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* VOLTAR */}
              <button
                onClick={() => setShowRequest(false)}
                className="text-sm text-gray-400 hover:text-white"
              >
                ← Voltar
              </button>

              <h2 className="text-lg font-semibold">Solicitar acesso</h2>

              {fields.map((f) => (
                <input
                  key={f.key}
                  placeholder={f.label}
                  className="w-full p-2 bg-black/30 rounded"
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value })
                  }
                />
              ))}

              <textarea
                placeholder="mensagem"
                className="w-full p-2 bg-black/30 rounded"
                onChange={(e) =>
                  setForm({ ...form, message: e.target.value })
                }
              />

              {/* BOTÕES */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowRequest(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>

                <Button
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);

                    try {
                      await fetch("/api/auth/request-access", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(form),
                      });

                      alert("Enviado!");
                      setShowRequest(false);
                    } catch (e) {
                      alert("Erro ao enviar");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
