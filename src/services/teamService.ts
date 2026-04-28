import type { Database } from "better-sqlite3";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";

export class TeamService {
  constructor(private readonly db: Database) {}

  listTeams(userId: string) {
    return this.db
      .prepare(
        `SELECT teams.*, team_members.role
         FROM teams
         JOIN team_members ON team_members.team_id = teams.id
         WHERE team_members.user_id = ?
         ORDER BY teams.created_at DESC`
      )
      .all(userId);
  }

  createTeam(userId: string, name: string) {
    const id = createId("tm");
    const create = this.db.transaction(() => {
      this.db.prepare("INSERT INTO teams (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, userId);
      this.db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')").run(id, userId);
    });
    create();
    return this.getTeam(userId, id);
  }

  getTeam(userId: string, teamId: string) {
    const team = this.db
      .prepare(
        `SELECT teams.*, team_members.role
         FROM teams
         JOIN team_members ON team_members.team_id = teams.id
         WHERE team_members.user_id = ? AND teams.id = ?`
      )
      .get(userId, teamId);
    if (!team) {
      throw new AppError(404, "Team not found");
    }
    return team;
  }

  getMembers(userId: string, teamId: string) {
    this.getTeam(userId, teamId);
    return this.db
      .prepare(
        `SELECT users.id, users.name, users.email, team_members.role, team_members.created_at
         FROM team_members
         JOIN users ON users.id = team_members.user_id
         WHERE team_members.team_id = ?
         ORDER BY team_members.created_at ASC`
      )
      .all(teamId);
  }

  addMember(actorId: string, teamId: string, email: string, role: "admin" | "member") {
    const actor = this.getTeam(actorId, teamId) as { role: string };
    if (!["owner", "admin"].includes(actor.role)) {
      throw new AppError(403, "Only team owners or admins can add members");
    }

    const user = this.db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()) as { id: string } | undefined;
    if (!user) {
      throw new AppError(404, "User with that email was not found");
    }

    this.db
      .prepare("INSERT OR REPLACE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)")
      .run(teamId, user.id, role);
    return this.getMembers(actorId, teamId);
  }
}
