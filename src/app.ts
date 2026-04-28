import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config/env";
import { createDatabase } from "./db/database";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { pomodoroRouter } from "./routes/pomodoro";
import { projectRoutes } from "./routes/projects";
import { reportRouter } from "./routes/reports";
import { settingsRouter } from "./routes/settings";
import { teamRoutes } from "./routes/teams";
import { timeEntriesRouter } from "./routes/timeEntries";
import { AppError } from "./utils/errors";

export function createApp(databasePath?: string) {
  const db = createDatabase(databasePath);
  const app = express();

  app.locals.db = db;

  app.use(cors({ origin: env.corsOrigin === "*" ? true : env.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", projectRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/time-entries", timeEntriesRouter);
  app.use("/api/reports", reportRouter);
  app.use("/api/teams", teamRoutes);
  app.use("/api/pomodoro", pomodoroRouter);
  app.use("/api/settings", settingsRouter);

  app.use((req, _res, next) => {
    next(new AppError(404, `Route not found: ${req.method} ${req.path}`));
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
      }

      if (err instanceof SyntaxError) {
        return res.status(400).json({ error: "Invalid JSON body" });
      }

      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request", details: err.issues });
      }

      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
