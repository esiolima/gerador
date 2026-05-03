import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { AuthRole, AuthUser, PublicAuthUser } from "./authTypes";

const DATA_DIR = path.resolve("data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const DEFAULT_JWT_SECRET =
  "troque-este-segredo-em-producao-usando-a-variavel-AUTH_JWT_SECRET";

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "jornal_auth_token";
const JWT_EXPIRES_IN = process.env.AUTH_JWT_EXPIRES_IN || "7d";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getJwtSecret() {
  return process.env.AUTH_JWT_SECRET || DEFAULT_JWT_SECRET;
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function readUsers(): AuthUser[] {
  ensureDataDir();

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), "utf8");
  }

  const raw = fs.readFileSync(USERS_FILE, "utf8");

  try {
    const users = JSON.parse(raw);
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function writeUsers(users: AuthUser[]) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export function getAuthCookieName() {
  return COOKIE_NAME;
}

export function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export async function ensureInitialAdminUser() {
  const users = readUsers();

  if (users.length > 0) return;

  const email = normalizeEmail(process.env.AUTH_ADMIN_EMAIL || "admin@jornal.local");
  const password = process.env.AUTH_ADMIN_PASSWORD || "admin123";
  const name = process.env.AUTH_ADMIN_NAME || "Administrador";

  const passwordHash = await bcrypt.hash(password, 12);

  const admin: AuthUser = {
    id: randomUUID(),
    name,
    email,
    passwordHash,
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
  };

  writeUsers([admin]);

  console.log("[Auth] Usuário admin inicial criado.");
  console.log(`[Auth] Email: ${email}`);

  if (!process.env.AUTH_ADMIN_PASSWORD) {
    console.log("[Auth] Senha padrão: admin123");
    console.log("[Auth] IMPORTANTE: configure AUTH_ADMIN_PASSWORD no deploy.");
  }
}

export async function loginWithEmailPassword(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const users = readUsers();

  const user = users.find((item) => item.email === email && item.active);

  if (!user) {
    throw new Error("E-mail ou senha inválidos.");
  }

  const passwordOk = await bcrypt.compare(String(password || ""), user.passwordHash);

  if (!passwordOk) {
    throw new Error("E-mail ou senha inválidos.");
  }

  const publicUser = toPublicUser(user);

  const token = jwt.sign(publicUser, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });

  return {
    token,
    user: publicUser,
  };
}

export function verifyAuthToken(token: string): PublicAuthUser {
  const payload = jwt.verify(token, getJwtSecret()) as PublicAuthUser;

  if (!payload?.id || !payload?.email || !payload?.role) {
    throw new Error("Sessão inválida.");
  }

  return payload;
}

export function getUserById(id: string): PublicAuthUser | null {
  const users = readUsers();
  const user = users.find((item) => item.id === id && item.active);

  return user ? toPublicUser(user) : null;
}

export function listUsers(): PublicAuthUser[] {
  return readUsers()
    .filter((user) => user.active)
    .map(toPublicUser);
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role?: AuthRole;
}) {
  const users = readUsers();
  const email = normalizeEmail(input.email);

  if (!email) {
    throw new Error("E-mail obrigatório.");
  }

  if (!input.password || input.password.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const exists = users.some((user) => user.email === email);

  if (exists) {
    throw new Error("Já existe um usuário com este e-mail.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user: AuthUser = {
    id: randomUUID(),
    name: input.name || email,
    email,
    passwordHash,
    role: input.role || "user",
    active: true,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeUsers(users);

  return toPublicUser(user);
}

export function deactivateUser(id: string) {
  const users = readUsers();
  const index = users.findIndex((user) => user.id === id);

  if (index < 0) {
    throw new Error("Usuário não encontrado.");
  }

  users[index].active = false;
  writeUsers(users);
}
