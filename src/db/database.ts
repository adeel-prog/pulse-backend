import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { migrate } from "./migrate";

export type AppDatabase = Database.Database;

let connection: AppDatabase | undefined;

function openDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  if (databasePath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  migrate(db);
  return db;
}

export function createDatabase(databasePath = env.databasePath): AppDatabase {
  closeDb();
  connection = openDatabase(databasePath);
  return connection;
}

export function getDb(): AppDatabase {
  if (connection) {
    return connection;
  }

  connection = openDatabase(env.databasePath);
  return connection;
}

export const getDatabase = getDb;

export function closeDb(): void {
  connection?.close();
  connection = undefined;
}

export function resetDbForTests(databasePath = ":memory:"): AppDatabase {
  return createDatabase(databasePath);
}
