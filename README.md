# Pulse Backend

Backend API for the Alyson time tracking workflow. It provides auth, clients/projects, active timers, manual time entries, Pomodoro sessions, reports, CSV export, teams, and user settings.

## Stack

- Node.js + TypeScript
- Express REST API
- SQLite via `better-sqlite3`
- JWT bearer authentication
- Zod request validation

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

The API defaults to `http://localhost:4000`.

## Environment

See `.env.example` for all available settings.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `DATABASE_PATH` | `./data/pulse.sqlite` | SQLite database file |
| `JWT_SECRET` | dev-only fallback | Secret used to sign access tokens |
| `JWT_EXPIRES_IN` | `7d` | Access token lifetime |
| `CORS_ORIGIN` | `*` | Allowed frontend origin |

## Main endpoints

All endpoints except `/health` and `/api/auth/*` require `Authorization: Bearer <token>`.

### Auth

- `POST /api/auth/register` - create account
- `POST /api/auth/login` - sign in
- `GET /api/auth/me` - current user profile

### Clients and projects

- `POST /api/clients`
- `GET /api/clients`
- `POST /api/projects`
- `GET /api/projects`
- `PATCH /api/projects/:id`

### Time tracking

- `GET /api/time-entries/active`
- `POST /api/time-entries/start`
- `POST /api/time-entries/stop`
- `POST /api/time-entries/manual`
- `GET /api/time-entries?from=<iso>&to=<iso>`
- `PATCH /api/time-entries/:id`
- `DELETE /api/time-entries/:id`

### Pomodoro

- `POST /api/pomodoro/start`
- `POST /api/pomodoro/:id/complete`
- `POST /api/pomodoro/:id/cancel`

### Reports

- `GET /api/reports/dashboard?date=YYYY-MM-DD`
- `GET /api/reports/summary?from=<iso>&to=<iso>`
- `GET /api/reports/export.csv?from=<iso>&to=<iso>`

### Teams and settings

- `POST /api/teams`
- `GET /api/teams`
- `GET /api/settings`
- `PATCH /api/settings`

## Lovable frontend integration

Deploy this backend first, then point the Lovable frontend API base URL at the deployed backend URL. The existing Lovable URL will not automatically run this backend code until the frontend is configured to call it.

Use these browser-facing settings when deploying:

- `JWT_SECRET`: set to a long random value.
- `CORS_ORIGIN`: set to `https://alyson-time-tracker.lovable.app` for production, or `*` during early testing.
- `DATABASE_PATH`: set to a persistent disk path if the host supports one.

The API accepts both the documented route names and common Lovable-style aliases:

- Auth: `/api/auth/register` and `/api/auth/signup`
- Clients: `/api/clients` and `/api/projects/clients`
- Projects: `/api/projects` and `/api/projects/projects`
- Timers: `/api/time-entries/start`, `/api/time-entries/stop`, `/api/time-entries/timer/start`, and `/api/time-entries/timer/stop`
- Manual entries: `/api/time-entries/manual` and `POST /api/time-entries`
- Pomodoro: `/api/pomodoro/start` and `POST /api/pomodoro`

Call `/api/auth/register` or `/api/auth/login` to receive an access token. Store that token client-side and send it in the `Authorization` header for workflow calls.

## Supabase/Lovable `has_role` permission error

If the live Lovable app shows `permission denied for function has_role`, the app is still using a Supabase database/RLS helper. Apply this migration in that Supabase project:

```text
supabase/migrations/20260428130500_fix_has_role_permissions.sql
```

In Supabase, open **SQL Editor**, paste the migration SQL, and run it. The fix recreates `public.has_role(uuid, public.app_role)` as a `SECURITY DEFINER` helper and grants `EXECUTE` to `anon`, `authenticated`, and `service_role`, which browser requests need when RLS policies call `has_role(...)`.

The deployed Lovable page advertises a privacy-first browser tracker: no screenshots or keystroke logging are implemented here. The backend stores only explicit timer/manual entries, idle seconds supplied by the client, Pomodoro sessions, project/client tags, and aggregate team/report data.