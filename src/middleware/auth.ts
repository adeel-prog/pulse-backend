import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../utils/errors";

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      auth?: {
        userId: string;
      };
    }
  }
}

export function signToken(user: AuthUser): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign(user, env.jwtSecret, options);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new UnauthorizedError("Missing bearer token");
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser & { sub?: string };
    if (typeof payload === "string") {
      throw new UnauthorizedError("Invalid token payload");
    }
    req.user = payload.sub ? { id: payload.sub, email: payload.email ?? "", name: payload.name } : payload;
    req.auth = { userId: req.user.id };
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
