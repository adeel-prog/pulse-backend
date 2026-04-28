import type { Database } from "better-sqlite3";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";

type EntryInput = {
  projectId?: string | null;
  clientId?: string | null;
  teamId?: string | null;
  description?: string;
  task?: string | null;
  tags?: string[];
  productive?: boolean;
  billable?: boolean;
  startTime?: string;
  endTime?: string | null;
  idleSeconds?: number;
  source?: "timer" | "manual" | "pomodoro";
};

export type PomodoroInput = {
  projectId?: string | null;
  mode: "focus" | "short_break" | "long_break";
  plannedSeconds: number;
  completedSeconds?: number;
  status?: "running" | "completed" | "cancelled";
  startedAt?: string;
  endedAt?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function secondsBetween(start: string, end: string): number {
  const seconds = Math.floor((Date.parse(end) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new AppError(400, "end_time must be after start_time");
  }
  return seconds;
}

export class TimeService {
  constructor(private readonly db: Database) {}

  getActiveEntry(userId: string) {
    return this.db
      .prepare("SELECT * FROM time_entries WHERE user_id = ? AND end_time IS NULL")
      .get(userId);
  }

  startTimer(userId: string, input: EntryInput) {
    if (this.getActiveEntry(userId)) {
      throw new AppError(409, "A timer is already running");
    }

    const id = createId("te");
    const startedAt = input.startTime ?? nowIso();
    this.db
      .prepare(
        `INSERT INTO time_entries (
          id, user_id, team_id, project_id, client_id, description, task, tags_json,
          productive, billable, source, start_time, idle_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'timer', ?, ?)`
      )
      .run(
        id,
        userId,
        input.teamId ?? null,
        input.projectId ?? null,
        input.clientId ?? null,
        input.description ?? "",
        input.task ?? null,
        JSON.stringify(input.tags ?? []),
        input.productive === false ? 0 : 1,
        input.billable ? 1 : 0,
        startedAt,
        input.idleSeconds ?? 0
      );

    return this.getEntry(userId, id);
  }

  stopTimer(userId: string, idleSeconds = 0, endTime = nowIso()) {
    const active = this.getActiveEntry(userId) as { id: string; start_time: string; idle_seconds: number } | undefined;
    if (!active) {
      throw new AppError(404, "No active timer found");
    }

    const totalIdle = Math.max(0, active.idle_seconds + idleSeconds);
    const duration = Math.max(0, secondsBetween(active.start_time, endTime) - totalIdle);
    this.db
      .prepare(
        `UPDATE time_entries
         SET end_time = ?, idle_seconds = ?, duration_seconds = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      )
      .run(endTime, totalIdle, duration, active.id, userId);

    return this.getEntry(userId, active.id);
  }

  createManualEntry(userId: string, input: EntryInput) {
    const startTime = input.startTime;
    const endTime = input.endTime;
    if (!startTime || !endTime) {
      throw new AppError(400, "startTime and endTime are required for manual entries");
    }

    const idleSeconds = input.idleSeconds ?? 0;
    const duration = Math.max(0, secondsBetween(startTime, endTime) - idleSeconds);
    const id = createId("te");
    this.db
      .prepare(
        `INSERT INTO time_entries (
          id, user_id, team_id, project_id, client_id, description, task, tags_json,
          productive, billable, source, start_time, end_time, idle_seconds, duration_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        input.teamId ?? null,
        input.projectId ?? null,
        input.clientId ?? null,
        input.description ?? "",
        input.task ?? null,
        JSON.stringify(input.tags ?? []),
        input.productive === false ? 0 : 1,
        input.billable ? 1 : 0,
        input.source ?? "manual",
        startTime,
        endTime,
        idleSeconds,
        duration
      );

    return this.getEntry(userId, id);
  }

  listEntries(userId: string, from?: string, to?: string) {
    const filters = ["user_id = ?"];
    const params: unknown[] = [userId];
    if (from) {
      filters.push("start_time >= ?");
      params.push(from);
    }
    if (to) {
      filters.push("start_time <= ?");
      params.push(to);
    }

    return this.db
      .prepare(
        `SELECT * FROM time_entries
         WHERE ${filters.join(" AND ")}
         ORDER BY start_time DESC`
      )
      .all(...params);
  }

  getEntry(userId: string, entryId: string) {
    const entry = this.db.prepare("SELECT * FROM time_entries WHERE user_id = ? AND id = ?").get(userId, entryId);
    if (!entry) {
      throw new AppError(404, "Time entry not found");
    }
    return entry;
  }

  updateEntry(userId: string, entryId: string, input: EntryInput) {
    const current = this.getEntry(userId, entryId) as {
      start_time: string;
      end_time: string | null;
      idle_seconds: number;
    };

    const startTime = input.startTime ?? current.start_time;
    const endTime = input.endTime === undefined ? current.end_time : input.endTime;
    const idleSeconds = input.idleSeconds ?? current.idle_seconds;
    const duration = endTime ? Math.max(0, secondsBetween(startTime, endTime) - idleSeconds) : null;

    this.db
      .prepare(
        `UPDATE time_entries
         SET project_id = COALESCE(?, project_id),
             client_id = COALESCE(?, client_id),
             team_id = COALESCE(?, team_id),
             description = COALESCE(?, description),
             task = ?,
             tags_json = COALESCE(?, tags_json),
             productive = COALESCE(?, productive),
             billable = COALESCE(?, billable),
             start_time = ?,
             end_time = ?,
             idle_seconds = ?,
             duration_seconds = ?,
             updated_at = datetime('now')
         WHERE user_id = ? AND id = ?`
      )
      .run(
        input.projectId ?? null,
        input.clientId ?? null,
        input.teamId ?? null,
        input.description ?? null,
        input.task ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.productive === undefined ? null : input.productive ? 1 : 0,
        input.billable === undefined ? null : input.billable ? 1 : 0,
        startTime,
        endTime,
        idleSeconds,
        duration,
        userId,
        entryId
      );

    return this.getEntry(userId, entryId);
  }

  deleteEntry(userId: string, entryId: string) {
    const result = this.db.prepare("DELETE FROM time_entries WHERE user_id = ? AND id = ?").run(userId, entryId);
    if (result.changes === 0) {
      throw new AppError(404, "Time entry not found");
    }
  }

  createPomodoroSession(userId: string, input: PomodoroInput) {
    const id = createId("pom");
    this.db
      .prepare(
        `INSERT INTO pomodoro_sessions (
          id, user_id, project_id, mode, planned_seconds, completed_seconds, status, started_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        input.projectId ?? null,
        input.mode,
        input.plannedSeconds,
        input.completedSeconds ?? 0,
        input.status ?? "running",
        input.startedAt ?? nowIso(),
        input.endedAt ?? null
      );

    return this.getPomodoroSession(userId, id);
  }

  completePomodoroSession(userId: string, sessionId: string, completedSeconds?: number, endedAt = nowIso()) {
    const session = this.getPomodoroSession(userId, sessionId) as {
      planned_seconds: number;
      started_at: string;
      project_id: string | null;
    };

    const finalSeconds = completedSeconds ?? session.planned_seconds;
    this.db
      .prepare(
        `UPDATE pomodoro_sessions
         SET completed_seconds = ?, status = 'completed', ended_at = ?, updated_at = datetime('now')
         WHERE user_id = ? AND id = ?`
      )
      .run(finalSeconds, endedAt, userId, sessionId);

    if (finalSeconds > 0) {
      const entry = this.createManualEntry(userId, {
        projectId: session.project_id,
        description: "Pomodoro focus session",
        startTime: session.started_at,
        endTime: endedAt,
        source: "pomodoro",
        productive: true,
      }) as { id: string };
      this.db
        .prepare("UPDATE pomodoro_sessions SET time_entry_id = ? WHERE user_id = ? AND id = ?")
        .run(entry.id, userId, sessionId);
    }

    return this.getPomodoroSession(userId, sessionId);
  }

  getPomodoroSession(userId: string, sessionId: string) {
    const session = this.db
      .prepare("SELECT * FROM pomodoro_sessions WHERE user_id = ? AND id = ?")
      .get(userId, sessionId);
    if (!session) {
      throw new AppError(404, "Pomodoro session not found");
    }
    return session;
  }
}
