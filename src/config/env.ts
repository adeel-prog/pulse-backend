import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default(path.resolve(process.cwd(), "data", "pulse.sqlite")),
  JWT_SECRET: z.string().min(16).default("change-me-in-production-please"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("*"),
});

const parsed = envSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  databasePath: parsed.DATABASE_PATH,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  corsOrigin: parsed.CORS_ORIGIN,
};
