import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./authTypes";
import { getAuthCookieName, verifyAuthToken } from "./authService";

const PUBLIC_API_PREFIXES = [
  "/api/auth",
];

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function extractToken(req: AuthenticatedRequest) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

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

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (isPublicApiPath(req.path)) {
    next();
    return;
  }

  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Sessão expirada ou usuário não autenticado.",
    });
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: "Sessão inválida. Faça login novamente.",
    });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Acesso restrito a administradores.",
    });
  }

  next();
}
