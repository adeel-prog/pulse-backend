import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database";
import { requireAuth } from "../middleware/auth";
import { createAuthService } from "../services/authService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().min(1).max(120),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const auth = createAuthService(getDb());
    const input = registerSchema.parse(req.body);
    res.status(201).json(auth.register(input));
  })
);

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const auth = createAuthService(getDb());
    const input = registerSchema.parse(req.body);
    res.status(201).json(auth.register(input));
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const auth = createAuthService(getDb());
    const input = credentialsSchema.parse(req.body);
    res.json(auth.login(input));
  })
);

router.get("/me", requireAuth, (req, res) => {
  const auth = createAuthService(getDb());
  res.json({ user: auth.getUser(req.user!.id) });
});

export { router as authRouter };
