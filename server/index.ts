import "dotenv/config";
import { createApp } from "./app.js";
import { openDatabase } from "./db/index.js";
import { refreshIPOs } from "./providers/ipo.js";
import { ingestNews, runJob } from "./providers/research.js";
import { MarketStream } from "./providers/stream.js";
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4100);
const local =
  ["127.0.0.1", "localhost", "::1"].includes(host) && !process.env.APP_PASSWORD;
if (
  !local &&
  (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 20)
)
  throw new Error(
    "Remote access requires APP_PASSWORD of at least 20 characters.",
  );
if (
  !local &&
  process.env.NODE_ENV === "production" &&
  (process.env.COOKIE_SECURE !== "true" ||
    !process.env.APP_ORIGIN?.startsWith("https://"))
)
  throw new Error(
    "Production remote access requires HTTPS APP_ORIGIN and COOKIE_SECURE=true.",
  );
const db = openDatabase();
const stream = new MarketStream(db);
const app = createApp(db, { local, stream });
stream.start();
const server = app.listen(port, host, () =>
  console.log(
    JSON.stringify({
      event: "ready",
      host,
      port,
      mode: local ? "local" : "authenticated",
    }),
  ),
);
let running = false;
let stopping = false;
async function refreshPublicData() {
  if (running || stopping) return;
  running = true;
  try {
    await ingestNews(db);
    if (!stopping) await runJob(db, "Xflot IPOs", () => refreshIPOs(db));
  } catch {
    console.error(
      JSON.stringify({
        event: "scheduler_error",
        message: "Public data refresh failed; inspect provider activity.",
      }),
    );
  } finally {
    running = false;
  }
}
const timer =
  process.env.ENABLE_SCHEDULER === "true"
    ? setInterval(() => {
        void refreshPublicData();
      }, 5 * 60_000)
    : undefined;
if (timer) void refreshPublicData();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    if (timer) clearInterval(timer);
    stream.stop();
    server.close(() => {
      const finish = () => {
        if (running) {
          setTimeout(finish, 50);
          return;
        }
        db.close();
        process.exit(0);
      };
      finish();
    });
    setTimeout(() => process.exit(1), 15000).unref();
  });
