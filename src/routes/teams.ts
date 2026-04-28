import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database";
import { requireAuth } from "../middleware/auth";
import { TeamService } from "../services/teamService";
import { asyncHandler } from "../utils/asyncHandler";

const teamSchema = z.object({
  name: z.string().min(1).max(120),
});

const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

const teamIdSchema = z.object({ teamId: z.string().min(1) });

function getTeamId(params: unknown): string {
  return teamIdSchema.parse(params).teamId;
}

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler((req, res) => {
    const service = new TeamService(getDb());
    res.json({ teams: service.listTeams(req.user!.id) });
  })
);

router.post(
  "/",
  asyncHandler((req, res) => {
    const service = new TeamService(getDb());
    const input = teamSchema.parse(req.body);
    res.status(201).json({ team: service.createTeam(req.user!.id, input.name) });
  })
);

router.get(
  "/:teamId/members",
  asyncHandler((req, res) => {
    const service = new TeamService(getDb());
    res.json({ members: service.getMembers(req.user!.id, getTeamId(req.params)) });
  })
);

router.post(
  "/:teamId/members",
  asyncHandler((req, res) => {
    const service = new TeamService(getDb());
    const input = memberSchema.parse(req.body);
    const members = service.addMember(req.user!.id, getTeamId(req.params), input.email, input.role);
    res.status(201).json({ members });
  })
);

export { router as teamRoutes };
