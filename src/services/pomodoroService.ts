import type { Database } from "better-sqlite3";
import { AppError } from "../utils/errors";
import { createId } from "../utils/ids";
import { TimeService } from "./timeService";

type PomodoroInput = {
  projectId?: string | null;
  mode: "focus" | "short_break" | "long_break";
  plannedSeconds: number;
  startedAt?: string;
};

type CompleteInput = {
  completedSeconds?: number;
  endedAt?: string;
  createTimeEntry?: boolean;
};

export class PomodoroService {
  constructor(
    private readonly db: Database,
    private readonly timeService = new TimeService(db)
  ) {}

  start(userId: string, input: PomodoroInput) {
    const running = this.db
      .prepare("SELECT * FROM pomodoro_sessions WHERE user_id = ? AND status = 'running'")
      .get(userId);
    if (running) {
      throw new AppError(409, "A Pomodoro session is already running");
    }

    const id = createId("pom");
    this.db
      .prepare(
        `INSERT INTO pomodoro_sessions (id, user_id, project_id, mode, planned_seconds, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?)`
      )
      .run(id, userId, input.projectId ?? null, input.mode, input.plannedSeconds, input.startedAt ?? new Date().toISOString());

    return this.get(userId, id);
  }

  complete(userId: string, sessionId: string, input: CompleteInput) {
    const session = this.get(userId, sessionId) as {
      id: string;
      project_id: string | null;
      mode: "focus" | "short_break" | "long_break";
      planned_seconds: number;
      started_at: string;
      status: string;
    };
    if (session.status !== "running") {
      throw new AppError(409, "Pomodoro session is not running");
    }

    const endedAt = input.endedAt ?? new Date().toISOString();
    const completedSeconds =
      input.completedSeconds ??
      Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(session.started_at)) / 1000));
    let timeEntryId: string | null = null;

    if (input.createTimeEntry !== false && session.mode === "focus") {
      const entry = this.timeService.createManualEntry(userId, {
        projectId: session.project_id,
        description: "Pomodoro focus session",
        productive: true,
        startTime: session.started_at,
        endTime: endedAt,
        source: "pomodoro",
      }) as { id: string };
      timeEntryId = entry.id;
    }

    this.db
      .prepare(
        `UPDATE pomodoro_sessions
         SET completed_seconds = ?, ended_at = ?, status = 'completed', time_entry_id = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      )
      .run(completedSeconds, endedAt, timeEntryId, sessionId, userId);

    return this.get(userId, sessionId);
  }

  cancel(userId: string, sessionId: string, endedAt = new Date().toISOString()) {
    this.get(userId, sessionId);
    this.db
      .prepare(
        `UPDATE pomodoro_sessions
         SET status = 'cancelled', ended_at = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      )
      .run(endedAt, sessionId, userId);
    return this.get(userId, sessionId);
  }

  list(userId: string) {
    return this.db
      .prepare("SELECT * FROM pomodoro_sessions WHERE user_id = ? ORDER BY started_at DESC")
      .all(userId);
  }

  get(userId: string, sessionId: string) {
    const session = this.db
      .prepare("SELECT * FROM pomodoro_sessions WHERE user_id = ? AND id = ?")
      .get(userId, sessionId);
    if (!session) {
      throw new AppError(404, "Pomodoro session not found");
    }
    return session;
  }
}
