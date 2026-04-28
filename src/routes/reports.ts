import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database";
import { requireAuth } from "../middleware/auth";
import { ReportService } from "../services/reportService";
import { asyncHandler } from "../utils/asyncHandler";

const rangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const router = Router();
router.use(requireAuth);

function service() {
  return new ReportService(getDb());
}

router.get(
  "/dashboard",
  asyncHandler((req, res) => {
    const query = z.object({ date: z.string().optional() }).parse(req.query);
    res.json(service().dashboard(req.user!.id, query.date));
  })
);

router.get(
  "/summary",
  asyncHandler((req, res) => {
    const query = rangeSchema.parse(req.query);
    res.json(service().summary(req.user!.id, query.from, query.to));
  })
);

router.get(
  "/export.csv",
  asyncHandler((req, res) => {
    const query = rangeSchema.parse(req.query);
    res.header("Content-Type", "text/csv");
    res.attachment("alyson-time-entries.csv");
    res.send(service().csv(req.user!.id, query.from, query.to));
  })
);

export { router as reportRouter };
