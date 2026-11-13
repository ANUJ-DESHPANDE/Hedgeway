import { createHash } from "node:crypto";
import type { DB } from "./db/index.js";
import { row } from "./db/index.js";
import type { IntradayBar } from "../src/trading.js";
export type ChartContext = {
  symbol: string;
  exchange: string;
  interval: string;
  source: string;
  fetchedAt: string;
  bars: IntradayBar[];
};
export function saveChartContext(db: DB, value: ChartContext) {
  const context = { ...value, bars: value.bars.slice(-60) };
  const payload = JSON.stringify(context),
    id = createHash("sha256").update(payload).digest("hex");
  db.prepare("INSERT OR IGNORE INTO cache VALUES(?,?,?)").run(
    `chart-evidence:${id}`,
    payload,
    Date.now() + 7 * 86400000,
  );
  db.prepare(
    "DELETE FROM cache WHERE key LIKE 'chart-evidence:%' AND expires_at<?",
  ).run(Date.now());
  return id;
}
export function readChartContext(db: DB, id: string, symbol: string) {
  const value = row<{ payload: string }>(
    db,
    "SELECT payload FROM cache WHERE key=?",
    `chart-evidence:${id}`,
  );
  if (!value)
    throw new Error(
      "That chart snapshot is no longer available. Reopen the chart to attach fresh evidence.",
    );
  const context = JSON.parse(value.payload) as ChartContext;
  if (context.symbol !== symbol)
    throw new Error(
      "The attached chart does not match the conversation company.",
    );
  return context;
}
