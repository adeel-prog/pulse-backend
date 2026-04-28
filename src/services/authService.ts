import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import type { AppDatabase } from "../db/database";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";
import type { AuthUser } from "../types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
};

function publicUser(row: UserRow): AuthUser & { createdAt: string } {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

export class AuthService {
  constructor(private readonly db: AppDatabase) {}

  register(input: { name: string; email: string; password: string }) {
    const email = input.email.toLowerCase().trim();
    const existing = this.db.prepare("SELECT id FROM users WHERE email = ?").get(email);

    if (existing) {
      throw new AppError(409, "conflict", "An account with this email already exists.");
    }

    const id = createId("usr");
    const passwordHash = bcrypt.hashSync(input.password, 12);

    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
        .run(id, input.name.trim(), email, passwordHash);
      this.db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(id);
    })();

    const user = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;

    return { user: publicUser(user), token: this.issueToken(user.id) };
  }

  login(input: { email: string; password: string }) {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(input.email.toLowerCase().trim()) as UserRow | undefined;

    if (!row || !bcrypt.compareSync(input.password, row.password_hash)) {
      throw new AppError(401, "unauthorized", "Invalid email or password.");
    }

    return { user: publicUser(row), token: this.issueToken(row.id) };
  }

  issueToken(userId: string) {
    return jwt.sign({ sub: userId }, env.jwtSecret, {
      expiresIn: "7d",
    });
  }

  getUser(userId: string) {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;

    if (!row) {
      throw new AppError(404, "not_found", "User not found.");
    }

    return publicUser(row);
  }
}

export function createAuthService(db: AppDatabase) {
  return new AuthService(db);
}
