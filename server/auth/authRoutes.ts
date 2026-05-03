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

function getTokenFromCookie(req: Request) {
  const cookieHeader = req.headers.cookie || "";
  const cookieName = getAuthCookieName();

  const cookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");

    if (key === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return "";
}

export async function setupAuthRoutes(app: Express) {
  await ensureInitialAdminUser();

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "");
      const password = String(req.body?.password || "");

      const result = await loginWithEmailPassword(email, password);

      res.cookie(getAuthCookieName(), result.token, getCookieOptions());

      return res.json({
        success: true,
        user: result.user,
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível fazer login.",
      });
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie(getAuthCookieName(), {
      path: "/",
    });

    return res.json({
      success: true,
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    try {
      const token = getTokenFromCookie(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Usuário não autenticado.",
        });
      }

      const payload = verifyAuthToken(token);
      const user = getUserById(payload.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: "Usuário não encontrado.",
        });
      }

      return res.json({
        success: true,
        user,
      });
    } catch {
      return res.status(401).json({
        success: false,
        error: "Sessão inválida.",
      });
    }
  });

  app.get(
    "/api/auth/users",
    authMiddleware,
    requireAdmin,
    (_req: AuthenticatedRequest, res: Response) => {
      return res.json({
        success: true,
        users: listUsers(),
      });
    }
  );

  app.post(
    "/api/auth/users",
    authMiddleware,
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = await createUser({
          name: String(req.body?.name || ""),
          email: String(req.body?.email || ""),
          password: String(req.body?.password || ""),
          role: req.body?.role === "admin" ? "admin" : "user",
        });

        return res.json({
          success: true,
          user,
        });
      } catch (error) {
        return res.status(400).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao criar usuário.",
        });
      }
    }
  );

  app.delete(
    "/api/auth/users/:id",
    authMiddleware,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        deactivateUser(req.params.id);

        return res.json({
          success: true,
        });
      } catch (error) {
        return res.status(400).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao remover usuário.",
        });
      }
    }
  );
}
