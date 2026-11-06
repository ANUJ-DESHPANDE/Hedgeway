import "dotenv/config";
import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase } from "../server/db/index.js";
const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Provide a backup path: npm run backup -- ./backups/hedgeway.sqlite",
  );
if (
  resolve(destination) ===
  resolve(process.env.DATABASE_PATH || "./data/hedgeway.sqlite")
)
  throw new Error("Backup destination must differ from the active database.");
mkdirSync(dirname(destination), { recursive: true });
const db = openDatabase();
try {
  await backup(db, destination);
  console.log(
    "Consistent SQLite backup completed. Keep backups and the encryption key private.",
  );
} finally {
  db.close();
}
