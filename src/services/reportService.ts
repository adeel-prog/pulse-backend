import type { Database } from "better-sqlite3";

type EntryRow = {
  id: string;
  source: string;
  project_id: string | null;
  client_id: string | null;
  description: string;
  task: string | null;
  tags_json: string;
  productive: number;
  billable: number;
  start_time: string;
  end_time: string | null;
  idle_seconds: number;
  duration_seconds: number | null;
};

function entryDuration(entry: EntryRow): number {
  if (entry.duration_seconds !== null) {
    return entry.duration_seconds;
  }
  const end = entry.end_time ? Date.parse(entry.end_time) : Date.now();
  const raw = Math.floor((end - Date.parse(entry.start_time)) / 1000);
  return Math.max(0, raw - entry.idle_seconds);
}

function asDay(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export class ReportService {
  constructor(private readonly db: Database) {}

  dashboard(userId: string, date = new Date().toISOString().slice(0, 10)) {
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    const entries = this.db
      .prepare(
        `SELECT * FROM time_entries
         WHERE user_id = ? AND start_time BETWEEN ? AND ?
         ORDER BY start_time ASC`
      )
      .all(userId, from, to) as EntryRow[];

    const trackedSeconds = entries.reduce((total, entry) => total + entryDuration(entry), 0);
    const productiveSeconds = entries
      .filter((entry) => entry.productive === 1)
      .reduce((total, entry) => total + entryDuration(entry), 0);
    const idleSeconds = entries.reduce((total, entry) => total + entry.idle_seconds, 0);
    const focusSessions = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM pomodoro_sessions
         WHERE user_id = ? AND mode = 'focus' AND status = 'completed' AND started_at BETWEEN ? AND ?`
      )
      .get(userId, from, to) as { count: number };

    return {
      date,
      trackedSeconds,
      idleSeconds,
      focusSessions: focusSessions.count,
      productivityScore: trackedSeconds === 0 ? 0 : Math.round((productiveSeconds / trackedSeconds) * 100),
      activeEntry: this.db
        .prepare("SELECT * FROM time_entries WHERE user_id = ? AND end_time IS NULL")
        .get(userId),
      timeline: entries,
    };
  }

  summary(userId: string, from: string, to: string) {
    const entries = this.db
      .prepare(
        `SELECT * FROM time_entries
         WHERE user_id = ? AND start_time BETWEEN ? AND ?
         ORDER BY start_time ASC`
      )
      .all(userId, from, to) as EntryRow[];

    const totalsByDay = new Map<string, number>();
    const totalsByProject = new Map<string, number>();

    for (const entry of entries) {
      const duration = entryDuration(entry);
      totalsByDay.set(asDay(entry.start_time), (totalsByDay.get(asDay(entry.start_time)) ?? 0) + duration);
      const projectKey = entry.project_id ?? "unassigned";
      totalsByProject.set(projectKey, (totalsByProject.get(projectKey) ?? 0) + duration);
    }

    return {
      from,
      to,
      totalSeconds: entries.reduce((total, entry) => total + entryDuration(entry), 0),
      billableSeconds: entries
        .filter((entry) => entry.billable === 1)
        .reduce((total, entry) => total + entryDuration(entry), 0),
      byDay: [...totalsByDay.entries()].map(([day, seconds]) => ({ day, seconds })),
      byProject: [...totalsByProject.entries()].map(([projectId, seconds]) => ({ projectId, seconds })),
      entries,
    };
  }

  csv(userId: string, from: string, to: string): string {
    const report = this.summary(userId, from, to);
    const lines = [
      "id,source,start_time,end_time,duration_seconds,idle_seconds,project_id,client_id,description,task,billable,productive,tags",
    ];

    for (const entry of report.entries) {
      const cells = [
        entry.id,
        entry.source,
        entry.start_time,
        entry.end_time ?? "",
        String(entryDuration(entry)),
        String(entry.idle_seconds),
        entry.project_id ?? "",
        entry.client_id ?? "",
        entry.description,
        entry.task ?? "",
        entry.billable ? "true" : "false",
        entry.productive ? "true" : "false",
        JSON.parse(entry.tags_json).join("|"),
      ].map((cell) => `"${String(cell).replaceAll('"', '""')}"`);
      lines.push(cells.join(","));
    }

    return `${lines.join("\n")}\n`;
  }
}
