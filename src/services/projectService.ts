import type { Database } from "better-sqlite3";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";

export class ProjectService {
  constructor(private readonly db: Database) {}

  listClients(userId: string) {
    return this.db
      .prepare("SELECT * FROM clients WHERE owner_id = ? AND archived_at IS NULL ORDER BY name ASC")
      .all(userId);
  }

  createClient(userId: string, input: { name: string; teamId?: string | null }) {
    const id = createId("cl");
    this.db
      .prepare("INSERT INTO clients (id, owner_id, team_id, name) VALUES (?, ?, ?, ?)")
      .run(id, userId, input.teamId ?? null, input.name);
    return this.getClient(userId, id);
  }

  getClient(userId: string, clientId: string) {
    const client = this.db.prepare("SELECT * FROM clients WHERE owner_id = ? AND id = ?").get(userId, clientId);
    if (!client) {
      throw new AppError(404, "Client not found");
    }
    return client;
  }

  archiveClient(userId: string, clientId: string) {
    const result = this.db
      .prepare("UPDATE clients SET archived_at = datetime('now'), updated_at = datetime('now') WHERE owner_id = ? AND id = ?")
      .run(userId, clientId);
    if (result.changes === 0) {
      throw new AppError(404, "Client not found");
    }
  }

  listProjects(userId: string) {
    return this.db
      .prepare(
        `SELECT p.*, c.name AS client_name
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         WHERE p.owner_id = ? AND p.archived_at IS NULL
         ORDER BY p.name ASC`
      )
      .all(userId);
  }

  createProject(
    userId: string,
    input: { name: string; color?: string; clientId?: string | null; teamId?: string | null; hourlyRateCents?: number | null }
  ) {
    const id = createId("pr");
    this.db
      .prepare(
        `INSERT INTO projects (id, owner_id, team_id, client_id, name, color, hourly_rate_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        input.teamId ?? null,
        input.clientId ?? null,
        input.name,
        input.color ?? "#6366f1",
        input.hourlyRateCents ?? null
      );
    return this.getProject(userId, id);
  }

  getProject(userId: string, projectId: string) {
    const project = this.db.prepare("SELECT * FROM projects WHERE owner_id = ? AND id = ?").get(userId, projectId);
    if (!project) {
      throw new AppError(404, "Project not found");
    }
    return project;
  }

  updateProject(
    userId: string,
    projectId: string,
    input: { name?: string; color?: string; clientId?: string | null; hourlyRateCents?: number | null }
  ) {
    this.getProject(userId, projectId);
    this.db
      .prepare(
        `UPDATE projects
         SET name = COALESCE(?, name),
             color = COALESCE(?, color),
             client_id = ?,
             hourly_rate_cents = ?,
             updated_at = datetime('now')
         WHERE owner_id = ? AND id = ?`
      )
      .run(
        input.name ?? null,
        input.color ?? null,
        input.clientId ?? null,
        input.hourlyRateCents ?? null,
        userId,
        projectId
      );
    return this.getProject(userId, projectId);
  }

  archiveProject(userId: string, projectId: string) {
    const result = this.db
      .prepare("UPDATE projects SET archived_at = datetime('now'), updated_at = datetime('now') WHERE owner_id = ? AND id = ?")
      .run(userId, projectId);
    if (result.changes === 0) {
      throw new AppError(404, "Project not found");
    }
  }
}
