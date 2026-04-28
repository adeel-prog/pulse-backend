import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database";
import { requireAuth } from "../middleware/auth";
import { ProjectService } from "../services/projectService";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

function service(): ProjectService {
  return new ProjectService(getDb());
}

const clientSchema = z.object({
  name: z.string().min(1),
  teamId: z.string().nullable().optional(),
});

const projectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  color: z.string().min(3).optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

router.use(requireAuth);

router.get(
  "/clients",
  asyncHandler((req, res) => {
    res.json({ clients: service().listClients(req.user!.id) });
  })
);

router.post(
  "/clients",
  asyncHandler((req, res) => {
    const input = clientSchema.parse(req.body);
    res.status(201).json({ client: service().createClient(req.user!.id, input) });
  })
);

router.get(
  "/projects",
  asyncHandler((req, res) => {
    res.json({ projects: service().listProjects(req.user!.id) });
  })
);

router.post(
  "/projects",
  asyncHandler((req, res) => {
    const input = projectSchema.parse(req.body);
    res.status(201).json({ project: service().createProject(req.user!.id, input) });
  })
);

router.patch(
  "/projects/:id",
  asyncHandler((req, res) => {
    const input = projectSchema.partial().parse(req.body);
    res.json({ project: service().updateProject(req.user!.id, idParamSchema.parse(req.params).id, input) });
  })
);

router.delete(
  "/projects/:id",
  asyncHandler((req, res) => {
    service().archiveProject(req.user!.id, idParamSchema.parse(req.params).id);
    res.status(204).end();
  })
);

export { router as projectRoutes };
