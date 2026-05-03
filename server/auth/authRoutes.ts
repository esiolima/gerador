import { Express, Request, Response } from "express";
import {
  createUser,
  deactivateUser,
  ensureInitialAdminUser,
  getAuthCookieName,
  getCookieOptions,
  getUserById,
  listUsers,
  loginWithEmailPassword,
  verifyAuthToken,
} from "./authService";
import { authMiddleware, requireAdmin } from "./authMiddleware";
import { AuthenticatedRequest } from "./authTypes";
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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = await loginWithEmailPassword(req.body.email, req.body.password);
      res.cookie(getAuthCookieName(), result.token, getCookieOptions());
      res.json({ success: true, user: result.user });
    } catch (e: any) {
      res.status(401).json({ success: false, error: e.message });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(getAuthCookieName(), { path: "/" });
    res.json({ success: true });
  });

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

  // 🔥 NOVO — SOLICITAÇÃO DE ACESSO
  app.post("/api/auth/request-access", async (req: Request, res: Response) => {
    try {
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
          <p><b>Nome:</b> ${req.body.name}</p>
          <p><b>Email:</b> ${req.body.email}</p>
          <p><b>Empresa:</b> ${req.body.company}</p>
          <p><b>Cargo:</b> ${req.body.role}</p>
          <p><b>Telefone:</b> ${req.body.phone}</p>
          <p><b>Mensagem:</b> ${req.body.message}</p>
        `,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: "Erro ao enviar email" });
    }
  });
}
