import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      hourly_rate_cents INTEGER,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      task TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      productive INTEGER NOT NULL DEFAULT 1,
      billable INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('timer', 'manual', 'pomodoro')),
      start_time TEXT NOT NULL,
      end_time TEXT,
      idle_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (end_time IS NULL OR end_time >= start_time),
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
      CHECK (idle_seconds >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_time_entries_user_start ON time_entries(user_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_time_entries_team_start ON time_entries(team_id, start_time);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_running
      ON time_entries(user_id)
      WHERE end_time IS NULL;

    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      time_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL,
      mode TEXT NOT NULL CHECK (mode IN ('focus', 'short_break', 'long_break')),
      planned_seconds INTEGER NOT NULL,
      completed_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (planned_seconds > 0),
      CHECK (completed_seconds >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_pomodoro_user_started ON pomodoro_sessions(user_id, started_at);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      idle_timeout_seconds INTEGER NOT NULL DEFAULT 300,
      focus_minutes INTEGER NOT NULL DEFAULT 25,
      short_break_minutes INTEGER NOT NULL DEFAULT 5,
      long_break_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (idle_timeout_seconds >= 60)
    );
  `);
}
