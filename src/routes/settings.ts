import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../db/database";

const updateSchema = z.object({
  idleTimeoutSeconds: z.number().int().min(60).optional(),
  focusMinutes: z.number().int().min(1).max(180).optional(),
  shortBreakMinutes: z.number().int().min(1).max(60).optional(),
  longBreakMinutes: z.number().int().min(1).max(120).optional(),
});

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler((req, res) => {
    const settings = getDb().prepare("SELECT * FROM user_settings WHERE user_id = ?").get(req.user!.id);
    res.json({ settings });
  })
);

router.patch(
  "/",
  asyncHandler((req, res) => {
    const input = updateSchema.parse(req.body);
    const db = getDb();
    db.prepare(
      `UPDATE user_settings
         SET idle_timeout_seconds = COALESCE(?, idle_timeout_seconds),
             focus_minutes = COALESCE(?, focus_minutes),
             short_break_minutes = COALESCE(?, short_break_minutes),
             long_break_minutes = COALESCE(?, long_break_minutes),
             updated_at = datetime('now')
         WHERE user_id = ?`
    ).run(
      input.idleTimeoutSeconds ?? null,
      input.focusMinutes ?? null,
      input.shortBreakMinutes ?? null,
      input.longBreakMinutes ?? null,
      req.user!.id
    );

    const settings = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(req.user!.id);
    res.json({ settings });
  })
);

export { router as settingsRouter };
