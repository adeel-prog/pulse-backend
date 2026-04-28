export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type TeamRole = "owner" | "admin" | "member";

export type TimeEntryRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  project_id: string | null;
  client_id: string | null;
  description: string;
  task: string | null;
  tags_json: string;
  productive: 0 | 1;
  billable: 0 | 1;
  source: "timer" | "manual" | "pomodoro";
  start_time: string;
  end_time: string | null;
  idle_seconds: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  client_id: string | null;
  name: string;
  color: string;
  hourly_rate_cents: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientRow = {
  id: string;
  owner_id: string;
  team_id: string | null;
  name: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
