import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { openDatabase, rows } from "../server/db/index.js";
import { parseHoldings } from "../server/imports.js";
import {
  getArticles,
  parseFeed,
  storeArticles,
} from "../server/providers/research.js";
const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
  const db = openDatabase(":memory:");
  databases.push(db);
  const app = createApp(db, {
    local: true,
    password: "",
    origin: "http://localhost:4100",
  });
  const get = (p: string) =>
    request(app)
      .get("/api" + p)
      .set("Host", "localhost");
  const post = (p: string, body: any) =>
    request(app)
      .post("/api" + p)
      .set("Host", "localhost")
      .set("Origin", "http://localhost:4100")
      .send(body);
  return { db, app, get, post };
}
afterEach(() => databases.splice(0).forEach((d) => d.close()));
describe("workspace lifecycle", () => {
  it("never serves fabricated data even if a legacy demo query is supplied", async () => {
    const { get, db } = setup();
    const demo = await get("/dashboard?mode=demo"),
      real = await get("/dashboard?mode=workspace");
    expect(demo.body.portfolio.positions).toHaveLength(0);
    expect(real.body.portfolio.positions).toHaveLength(0);
    expect(rows(db, "SELECT * FROM holdings")).toHaveLength(0);
  });
  it("imports, reads and exports holdings through the API", async () => {
    const { post, get } = setup();
    const r = await post("/holdings/import", {
      csv: "symbol,quantity,averagePrice\nINFY,12,1400",
    });
    expect(r.body.count).toBe(1);
    expect((await get("/dashboard")).body.portfolio.positions[0].symbol).toBe(
      "INFY",
    );
    expect(parseHoldings((await get("/export")).text)[0]).toMatchObject({
      symbol: "INFY",
      quantity: 12,
      averagePrice: 1400,
    });
  });
  it("rejects malformed requests without writing anything", async () => {
    const { post, db } = setup();
    expect(
      (
        await post("/holdings/import", {
          csv: "symbol,quantity,averagePrice\nINFY,12,1400\nBAD,-1,900",
        })
      ).status,
    ).toBe(400);
    expect(rows(db, "SELECT * FROM holdings")).toHaveLength(0);
  });
  it("persists notes and price conditions", async () => {
    const { post, get } = setup();
    expect(
      (
        await post("/notes", {
          symbol: "INFY",
          thesis: "Observe margins",
          risk: "Demand slows",
          catalyst: "Earnings",
        })
      ).status,
    ).toBe(200);
    expect((await get("/notes")).body[0].thesis).toBe("Observe margins");
    await post("/alerts", { symbol: "INFY", direction: "below", target: 1500 });
    expect((await get("/alerts")).body[0].target).toBe(1500);
  });
  it("validates numeric alert thresholds", async () => {
    const { post } = setup();
    expect(
      (
        await post("/alerts", {
          symbol: "INFY",
          direction: "below",
          target: -1,
        })
      ).status,
    ).toBe(400);
  });
  it("does not interpolate SQL from symbol input", async () => {
    const { post, db } = setup();
    expect(
      (await post("/watchlist", { symbol: "';DROP TABLE holdings;--" })).status,
    ).toBe(400);
    expect(rows(db, "SELECT * FROM holdings")).toEqual([]);
  });
  it("generates a backtest from supplied historical CSV", async () => {
    const { post } = setup();
    const csv =
      "date,close\n" +
      Array.from(
        { length: 60 },
        (_, i) =>
          `${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)},${100 + i}`,
      ).join("\n");
    const r = await post("/lab", {
      symbol: "INFY",
      lookback: 10,
      costBps: 10,
      csv,
    });
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("User-imported daily prices");
    expect(r.body.curve.length).toBe(50);
    expect(r.body.metrics.returnPct).toBeGreaterThan(0);
  });
});
describe("research ingestion and FTS", () => {
  const xml =
    "<rss><channel><item><title>Infosys profit growth</title><link>https://example.com/story?utm_source=test</link><pubDate>Fri, 06 Nov 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>Short summary</p>]]></description></item></channel></rss>";
  it("parses text, source, timestamps, canonical URLs and symbol tags", () => {
    const a = parseFeed(xml, "Fixture", "article")[0];
    expect(a.url).toBe("https://example.com/story");
    expect(a.symbols).toContain("INFY");
    expect(a.summary).toBe("Short summary");
    expect(a.sentiment).toBe(1);
  });
  it("rejects XML entities and drops invalid links", () => {
    expect(() => parseFeed("<!DOCTYPE x>" + xml, "X", "article")).toThrow();
    expect(
      parseFeed(
        xml.replace(
          "https://example.com/story?utm_source=test",
          "javascript:alert(1)",
        ),
        "X",
        "article",
      ),
    ).toHaveLength(0);
  });
  it("deduplicates canonical URLs and maintains the full-text index", () => {
    const { db } = setup();
    const a = parseFeed(xml, "Fixture", "article");
    expect(storeArticles(db, a)).toBe(1);
    expect(storeArticles(db, a)).toBe(0);
    expect(getArticles(db, "Infosys profit")).toHaveLength(1);
    expect(getArticles(db, "Tata")).toHaveLength(0);
    expect(() => getArticles(db, '" OR * (')).not.toThrow();
  });
  it("rejects bookmarks for nonexistent or demo articles", async () => {
    const { post } = setup();
    expect((await post("/bookmarks/demo-0", {})).status).toBe(404);
  });
});

describe("review-before-import workflow", () => {
  it("previews additions and updates without changing saved holdings", async () => {
    const { post, get } = setup();
    await post("/holdings/import", {
      csv: "symbol,quantity,averagePrice\nINFY,12,1400",
    });
    const preview = await post("/holdings/preview", {
      csv: "symbol,quantity,averagePrice\nINFY,99,1500\nTCS,2,3000",
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ added: 1, updated: 1 });
    expect(preview.body.holdings).toHaveLength(2);
    const stored = (await get("/dashboard")).body.portfolio.positions;
    expect(stored).toHaveLength(1);
    expect(stored[0].quantity).toBe(12);
  });
  it("rejects invalid preview rows without partial saving", async () => {
    const { post, db } = setup();
    expect(
      (
        await post("/holdings/preview", {
          csv: "symbol,quantity,averagePrice\nINFY,-2,1400",
        })
      ).status,
    ).toBe(400);
    expect(rows(db, "SELECT * FROM holdings")).toHaveLength(0);
  });
});

it("lists small scan summaries and retrieves only the selected saved evidence", async () => {
  const { db, get } = setup();
  const id = "11111111-1111-4111-8111-111111111111";
  const scan = {
    id,
    symbol: "INFY",
    exchange: "NSE",
    state: "wait",
    createdAt: new Date().toISOString(),
    bars: Array.from({ length: 375 }, (_, i) => ({ close: i + 1 })),
  };
  db.prepare("INSERT INTO scanner_runs VALUES(?,?,?,?,?)").run(
    id,
    scan.symbol,
    scan.exchange,
    JSON.stringify(scan),
    scan.createdAt,
  );
  const history = await get("/scanner/history");
  expect(history.status).toBe(200);
  expect(history.body).toHaveLength(1);
  expect(history.body[0]).not.toHaveProperty("bars");
  expect(history.body[0]).not.toHaveProperty("payload");
  expect((await get(`/scanner/history/${id}`)).body).toEqual(scan);
  expect(
    (await get("/scanner/history/22222222-2222-4222-8222-222222222222")).status,
  ).toBe(404);
  expect((await get("/scanner/history/not-an-id")).status).toBe(400);
});

it("restores the saved assistant draft through a new app instance", async () => {
  const { db, app } = setup();
  const draft = {
    question: "Why did my thesis change?",
    symbol: "INFY",
    threadId: "existing-thread",
    approach: "challenge",
    scan: null,
  };
  await request(app)
    .put("/api/ai/draft")
    .set("Host", "localhost")
    .set("Origin", "http://localhost:4100")
    .send(draft)
    .expect(200);
  const restarted = createApp(db, {
    local: true,
    password: "",
    origin: "http://localhost:4100",
  });
  expect(
    (await request(restarted).get("/api/ai/draft").set("Host", "localhost"))
      .body,
  ).toEqual(draft);
});
it("rejects an unsolicited subscription callback and keeps generation disabled", async () => {
  const { get } = setup();
  expect((await get("/chatgpt/callback?state=forged&code=forged")).status).toBe(
    400,
  );
  const status = await get("/chatgpt/status");
  expect(status.body).toMatchObject({
    accounts: [],
    connected: false,
    inferenceEnabled: false,
  });
  expect(JSON.stringify(status.body)).not.toContain("accessToken");
});
