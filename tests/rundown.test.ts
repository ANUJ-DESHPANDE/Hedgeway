import { afterEach, expect, it } from "vitest";
import { openDatabase } from "../server/db/index";
import { buildRundown } from "../server/rundown";
const databases: ReturnType<typeof openDatabase>[] = [];
const now = Date.parse("2026-11-13T10:00:00Z");
function db() {
  const d = openDatabase(":memory:");
  databases.push(d);
  return d;
}
function put(
  d: ReturnType<typeof db>,
  symbol: string,
  change: number,
  asOf = "2026-11-13T09:59:00Z",
  sector = "Technology",
) {
  d.prepare("INSERT INTO quotes VALUES(?,?,?,?)").run(
    symbol,
    "NSE",
    JSON.stringify({
      symbol,
      exchange: "NSE",
      name: symbol,
      sector,
      price: 100,
      previousClose: 99,
      change,
      asOf,
      source: "Upstox",
      currency: "INR",
    }),
    asOf,
  );
}
afterEach(() => databases.splice(0).forEach((d) => d.close()));
it("keeps prior-session prices out of current rankings and preserves historical context", () => {
  const d = db();
  put(d, "INFY", 2, "2026-11-12T10:00:00Z");
  const r = buildRundown(d, now);
  expect(r.movers).toHaveLength(0);
  expect(r.lastSnapshot.quotes[0].symbol).toBe("INFY");
});
it("counts only eligible current equities in equal-weight sector samples", () => {
  const d = db();
  put(d, "INFY", 2);
  put(d, "TCS", -1);
  put(d, "ETF", 8, undefined, "ETF");
  put(d, "FUTURE", 9, "2026-11-14T10:00:00Z");
  const r = buildRundown(d, now);
  expect(r.universe.current).toBe(2);
  expect(r.sectors[0]).toEqual({ name: "Technology", count: 2, change: 0.5 });
  expect(r.movers[0].coverage).toEqual([]);
});
it("ignores malformed stored quote records without taking down the briefing", () => {
  const d = db();
  d.prepare("INSERT INTO quotes VALUES(?,?,?,?)").run(
    "BAD",
    "NSE",
    '{"price":100,"previousClose":99,"change":2,"asOf":"2026-11-13T09:59:00Z","exchange":"NSE"}',
    new Date(now).toISOString(),
  );
  expect(buildRundown(d, now).universe.current).toBe(0);
});
