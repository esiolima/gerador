import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./useAuth";

export default function Login() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [form, setForm] = useState<any>({});

  return (
    <div className="relative flex items-center justify-center min-h-screen text-white overflow-hidden">
      
      {/* 🔥 FUNDO */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#06111f]" />

        <div className="absolute w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] top-[-100px] left-[-100px]" />

        <div className="absolute w-[500px] h-[500px] bg-cyan-400/20 rounded-full blur-[120px] bottom-[-100px] right-[-100px]" />

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black/70" />
      </div>

      {/* CONTEÚDO */}
      <div className="flex flex-col items-center gap-6 px-4">

        {/* 🧠 TÍTULO */}
        <h1 className="text-center text-3xl md:text-4xl font-black tracking-tight leading-tight">
          <span className="bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">
            Gerador de Ações de <br />
            Trade Marketing
          </span>
        </h1>

        {/* 📦 BOX LOGIN */}
        <div className="p-6 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
          
          <h2 className="text-xl font-bold mb-4 text-white/90 text-right">
            Login
          </h2>

          <input
            placeholder="Email"
            className="w-full p-2 mb-2 bg-black/30 rounded outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Senha"
            className="w-full p-2 mb-4 bg-black/30 rounded outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button
            onClick={() => login(email, password)}
            className="w-full"
          >
            Entrar
          </Button>

          {/* 🔗 SOLICITAR ACESSO */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowRequest(true)}
              className="text-blue-400 hover:underline text-sm"
            >
              Solicitar acesso
            </button>
          </div>
        </div>
      </div>

      {/* 🧾 MODAL SOLICITAR ACESSO */}
      {showRequest && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center"
          onClick={() => setShowRequest(false)}
        >
          <div
            className="bg-[#06111f] p-6 rounded-xl w-full max-w-md space-y-3 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowRequest(false)}
              className="text-sm text-gray-400 hover:text-white"
            >
              ← Voltar
            </button>

            <h2 className="text-lg font-semibold">Solicitar acesso</h2>

            {["nome", "e-mail", "empresa", "cargo", "telefone"].map((f) => (
              <input
                key={f}
                placeholder={f}
                className="w-full p-2 bg-black/30 rounded"
                onChange={(e) =>
                  setForm({ ...form, [f]: e.target.value })
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

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowRequest(false)}
              >
                Cancelar
              </Button>

              <Button
                onClick={async () => {
                  await fetch("/api/auth/request-access", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                  });
                  alert("Enviado!");
                  setShowRequest(false);
                }}
              >
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
