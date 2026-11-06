import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { openDatabase, row } from "../server/db/index.js";
import { getIPOs, ipoDetail, refreshIPOs } from "../server/providers/ipo.js";
import { kiteCredentials } from "../server/providers/kite.js";
import { cached } from "../server/providers/http.js";
import { encrypt } from "../server/security.js";

const databases: ReturnType<typeof openDatabase>[] = [];
function database() {
  const db = openDatabase(":memory:");
  databases.push(db);
  return db;
}
afterEach(() => {
  databases.splice(0).forEach((d) => d.close());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("IPO provenance and provider throttling", () => {
  it("preserves category details and their original timestamp across list refreshes", async () => {
    const db = database();
    const issue = {
      slug: "test-issue",
      name: "Test issue",
      board: "MAINBOARD",
      status: "OPEN",
      priceMin: 100,
      priceMax: 110,
      lotSize: 100,
      issueSizeCr: 100,
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            ipos: [issue],
            disclaimer: "Test disclaimer",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            ipo: {
              subs: [{ category: "QIB", timesSub: 2.5 }],
              gmp: [{ observedAt: "2026-01-01", gmp: 12 }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            ipos: [{ ...issue, lastGmp: 14 }],
            disclaimer: "Test disclaimer",
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await refreshIPOs(db);
    await expect(ipoDetail(db, issue.slug)).rejects.toThrow("cooldown");
    expect(fetch).toHaveBeenCalledTimes(1);
    db.prepare("DELETE FROM cache WHERE key='xflot:throttle'").run();
    const detail = await ipoDetail(db, issue.slug);
    db.prepare(
      "DELETE FROM cache WHERE key IN ('xflot:throttle','xflot:ipos?limit=100')",
    ).run();
    await refreshIPOs(db);
    expect(getIPOs(db)[0]).toMatchObject({
      lastGmp: 14,
      subs: [{ category: "QIB", timesSub: 2.5 }],
      detailsAsOf: detail.detailsAsOf,
    });
  });
});

describe("Kite app credential lifecycle", () => {
  it("encrypts UI credentials, clears prior sessions, and does not return secrets in status", async () => {
    const db = database();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const app = createApp(db, { local: true, origin: "http://localhost:4100" });
    db.prepare("INSERT INTO broker_session VALUES(1,?,?)").run(
      encrypt("old-token"),
      Date.now() + 60000,
    );
    const result = await request(app)
      .post("/api/kite/credentials")
      .set("Host", "localhost")
      .set("Origin", "http://localhost:4100")
      .send({ apiKey: "testapikey123", apiSecret: "testsecret123" });
    expect(result.status).toBe(200);
    expect(row(db, "SELECT * FROM broker_session")).toBeUndefined();
    expect(
      row<any>(
        db,
        "SELECT encrypted_value FROM credentials WHERE provider='kite-app'",
      )!.encrypted_value,
    ).not.toContain("testsecret");
    expect(kiteCredentials(db)).toEqual({
      apiKey: "testapikey123",
      apiSecret: "testsecret123",
    });
    const status = await request(app)
      .get("/api/status")
      .set("Host", "localhost");
    expect(status.body.kite).toEqual({ configured: true, connected: false });
    expect(status.text).not.toContain("testsecret");
    const login = await request(app)
      .post("/api/kite/connect")
      .set("Host", "localhost")
      .set("Origin", "http://localhost:4100")
      .send({});
    expect(new URL(login.body.url).searchParams.get("api_key")).toBe(
      "testapikey123",
    );
    await request(app)
      .delete("/api/kite/credentials")
      .set("Host", "localhost")
      .set("Origin", "http://localhost:4100");
    expect(
      row(db, "SELECT * FROM credentials WHERE provider='kite-app'"),
    ).toBeUndefined();
    expect(row(db, "SELECT * FROM oauth_states")).toBeUndefined();
  });
});

describe("request coalescing", () => {
  it("shares in-flight reads within one workspace and isolates separate databases", async () => {
    const a = database(),
      b = database();
    let release!: (value: string) => void;
    const fetchA = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const first = cached(a, "same", 10000, fetchA);
    const duplicate = cached(a, "same", 10000, fetchA);
    const other = await cached(b, "same", 10000, async () => "other-workspace");
    release("first-workspace");
    expect(await first).toBe("first-workspace");
    expect(await duplicate).toBe("first-workspace");
    expect(other).toBe("other-workspace");
    expect(fetchA).toHaveBeenCalledTimes(1);
  });
});

describe("company discovery and broker symbol normalization", () => {
  it("finds known company names without inventing prices when disconnected", async () => {
    const { searchInstruments } =
      await import("../server/providers/instrument-search.js");
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "");
    vi.stubEnv("MARKET_PROVIDER", "upstox");
    const result = await searchInstruments(database(), "infosys", "NSE");
    expect(result.source).toContain("Popular NSE");
    expect(result.items).toContainEqual({
      name: "Infosys",
      symbol: "INFY",
      exchange: "NSE",
    });
    expect(result.items.every((i) => !("price" in i))).toBe(true);
  });
  it("normalizes a BSE scrip code to Kite’s trading symbol while keeping the requested identity", async () => {
    const { kiteQuotes } = await import("../server/providers/kite.js");
    const db = database();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("KITE_API_KEY", "testapikey123");
    db.prepare("INSERT INTO broker_session VALUES(1,?,?)").run(
      encrypt("test-token"),
      Date.now() + 60000,
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "instrument_token,exchange_token,tradingsymbol,name,instrument_type\n128083204,500325,RELIANCE,Reliance Industries,EQ",
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              "BSE:RELIANCE": {
                last_price: 1400,
                ohlc: { close: 1380 },
                timestamp: "2026-11-06 15:30:00",
              },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const quotes = await kiteQuotes(db, ["BSE:500325"]);
    expect(quotes[0]).toMatchObject({
      symbol: "500325",
      exchange: "BSE",
      price: 1400,
    });
    expect(fetch.mock.calls[1][0]).toContain("BSE%3ARELIANCE");
  });
});
