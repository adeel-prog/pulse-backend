import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database";
import { requireAuth } from "../middleware/auth";
import { TimeService } from "../services/timeService";
import { asyncHandler } from "../utils/asyncHandler";

const entrySchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  description: z.string().max(1000).optional(),
  task: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  productive: z.boolean().optional(),
  billable: z.boolean().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().nullable().optional(),
  idleSeconds: z.number().int().min(0).optional(),
  source: z.enum(["timer", "manual", "pomodoro"]).optional(),
});

const stopSchema = z.object({
  idleSeconds: z.number().int().min(0).optional(),
  endTime: z.string().datetime().optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

const router = Router();
router.use(requireAuth);

router.get(
  "/active",
  asyncHandler(async (req, res) => {
    const service = new TimeService(getDb());
    res.json({ entry: service.getActiveEntry(req.auth!.userId) ?? null });
  })
);

router.post(
  "/timer/start",
  asyncHandler(async (req, res) => {
    const service = new TimeService(getDb());
    const entry = service.startTimer(req.auth!.userId, entrySchema.parse(req.body));
    res.status(201).json({ entry });
  })
);

router.post(
  "/timer/stop",
  asyncHandler(async (req, res) => {
    const body = stopSchema.parse(req.body);
    const service = new TimeService(getDb());
    const entry = service.stopTimer(req.auth!.userId, body.idleSeconds, body.endTime);
    res.json({ entry });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(req.query);
    const service = new TimeService(getDb());
    res.json({ entries: service.listEntries(req.auth!.userId, query.from, query.to) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const service = new TimeService(getDb());
    const entry = service.createManualEntry(req.auth!.userId, entrySchema.parse(req.body));
    res.status(201).json({ entry });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const service = new TimeService(getDb());
    const entry = service.updateEntry(
      req.auth!.userId,
      idParamSchema.parse(req.params).id,
      entrySchema.partial().parse(req.body)
    );
    res.json({ entry });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const service = new TimeService(getDb());
    service.deleteEntry(req.auth!.userId, idParamSchema.parse(req.params).id);
    res.status(204).send();
  })
);

export { router as timeEntriesRouter };
