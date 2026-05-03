import { Request } from "express";

export type AuthRole = "admin" | "user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
};

export type PublicAuthUser = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
};

export type AuthenticatedRequest = Request & {
  user?: PublicAuthUser;
};
