import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
export function openDatabase(
  path = process.env.DATABASE_PATH || "./data/hedgeway.sqlite",
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  if (!db.prepare("SELECT 1 FROM migrations WHERE version=1").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          fileURLToPath(new URL("./001_initial.sql", import.meta.url)),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO migrations VALUES(1,?)").run(
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM migrations WHERE version=2").get()) {
    transaction(db, () => {
      db.exec(
        readFileSync(
          fileURLToPath(new URL("./002_credentials.sql", import.meta.url)),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO migrations VALUES(2,?)").run(
        new Date().toISOString(),
      );
    });
  }
  if (!db.prepare("SELECT 1 FROM migrations WHERE version=3").get())
    transaction(db, () => {
      db.exec(
        readFileSync(
          fileURLToPath(new URL("./003_intelligence.sql", import.meta.url)),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO migrations VALUES(3,?)").run(
        new Date().toISOString(),
      );
    });
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
export const rows = <T>(db: DB, sql: string, ...args: SQLInputValue[]) =>
  db.prepare(sql).all(...args) as unknown as T[];
export const row = <T>(db: DB, sql: string, ...args: SQLInputValue[]) =>
  db.prepare(sql).get(...args) as unknown as T | undefined;
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function audit(db: DB, action: string, detail: string) {
  db.prepare(
    "INSERT INTO audit_log(action,detail,created_at) VALUES(?,?,?)",
  ).run(action, detail, new Date().toISOString());
}
