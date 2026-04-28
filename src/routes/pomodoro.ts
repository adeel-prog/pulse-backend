import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { PomodoroService } from "../services/pomodoroService";
import { asyncHandler } from "../utils/asyncHandler";

const startSchema = z.object({
  projectId: z.string().optional(),
  timeEntryId: z.string().optional(),
  mode: z.enum(["focus", "short_break", "long_break"]).default("focus"),
  plannedSeconds: z.coerce.number().int().positive().default(1500),
});

const completeSchema = z.object({
  completedSeconds: z.coerce.number().int().nonnegative().optional(),
  endedAt: z.string().datetime().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

export function pomodoroRouter(service: PomodoroService): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/start",
    asyncHandler(async (req, res) => {
      const session = service.start(req.user!.id, startSchema.parse(req.body));
      res.status(201).json({ session });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const session = service.start(req.user!.id, startSchema.parse(req.body));
      res.status(201).json({ session });
    })
  );

  router.post(
    "/:id/complete",
    asyncHandler(async (req, res) => {
      const body = completeSchema.parse(req.body);
      const session = service.complete(req.user!.id, idSchema.parse(req.params).id, body);
      res.json({ session });
    })
  );

  router.post(
    "/:id/cancel",
    asyncHandler(async (req, res) => {
      const session = service.cancel(req.user!.id, idSchema.parse(req.params).id);
      res.json({ session });
    })
  );

  return router;
}

export function createPomodoroRouter(): Router {
  const { getDb } = require("../db/database") as typeof import("../db/database");
  return pomodoroRouter(new PomodoroService(getDb()));
}
