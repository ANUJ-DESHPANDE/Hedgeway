import "dotenv/config";
import { openDatabase } from "./db/index.js";
import { refreshIPOs } from "./providers/ipo.js";
import { ingestNews, runJob } from "./providers/research.js";
const db = openDatabase();
try {
  const results = [
    ...(await ingestNews(db)),
    await runJob(db, "Xflot IPOs", () => refreshIPOs(db)),
  ];
  console.log(JSON.stringify(results, null, 2));
  if (results.some((x) => x.status === "error")) process.exitCode = 1;
} finally {
  db.close();
}
