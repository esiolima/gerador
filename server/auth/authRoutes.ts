import { Express, Request, Response } from "express";
import {
  ensureInitialAdminUser,
  getAuthCookieName,
  getCookieOptions,
  getUserById,
  loginWithEmailPassword,
  verifyAuthToken,
} from "./authService";
import nodemailer from "nodemailer";

function getTokenFromCookie(req: Request) {
  const cookieHeader = req.headers.cookie || "";
  const cookieName = getAuthCookieName();

  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const [key, ...value] = cookie.split("=");
    if (key === cookieName) {
      return decodeURIComponent(value.join("="));
    }
  }

  return "";
}

export async function setupAuthRoutes(app: Express) {
  await ensureInitialAdminUser();

  // LOGIN
  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = await loginWithEmailPassword(
        req.body.email,
        req.body.password
      );

      res.cookie(getAuthCookieName(), result.token, getCookieOptions());

      res.json({ success: true, user: result.user });
    } catch (e: any) {
      res.status(401).json({ success: false, error: e.message });
    }
  });

  // LOGOUT
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(getAuthCookieName(), { path: "/" });
    res.json({ success: true });
  });

  // USUÁRIO LOGADO
  app.get("/api/auth/me", (req, res) => {
    try {
      const token = getTokenFromCookie(req);
      const payload = verifyAuthToken(token);
      const user = getUserById(payload.id);

      res.json({ success: true, user });
    } catch {
      res.status(401).json({ success: false });
    }
  });

  // 🚀 SOLICITAR ACESSO (FUNCIONANDO DE VERDADE)
  app.post("/api/auth/request-access", async (req: Request, res: Response) => {
    try {
      console.log("📩 BODY RECEBIDO:", req.body);

      // aceita PT e EN
      const name = req.body.name || req.body.nome;
      const email = req.body.email || req.body["e-mail"];
      const company = req.body.company || req.body.empresa;
      const role = req.body.role || req.body.cargo;
      const phone = req.body.phone || req.body.telefone;
      const message = req.body.message || req.body.mensagem;

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: "Nome e email obrigatórios",
        });
      }

      // 🔥 fallback sem SMTP (pra você testar)
      if (!process.env.SMTP_HOST) {
        console.log("⚠️ SMTP não configurado. Dados recebidos:");
        console.log({ name, email, company, role, phone, message });

        return res.json({
          success: true,
          debug: true,
        });
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"Ofertas Trade" <${process.env.SMTP_USER}>`,
        to: "esio.filho@martins.com.br",
        subject: "Novo pedido de acesso",
        html: `
          <h2>Novo pedido</h2>
          <p><b>Nome:</b> ${name}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Empresa:</b> ${company}</p>
          <p><b>Cargo:</b> ${role}</p>
          <p><b>Telefone:</b> ${phone}</p>
          <p><b>Mensagem:</b> ${message}</p>
        `,
      });

      console.log("✅ EMAIL ENVIADO");

      res.json({ success: true });
    } catch (err) {
      console.error("❌ ERRO:", err);

      res.status(500).json({
        success: false,
        error: "Erro ao enviar email",
      });
    }
  });
}
