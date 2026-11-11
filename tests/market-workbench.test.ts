import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { openDatabase } from "../server/db/index";
import { createApp } from "../server/app";
import { upstoxQuotes } from "../server/providers/upstox";
import { yahooQuotes, yahooIntraday } from "../server/providers/yahoo";
import { chartIndicators } from "../src/components/PriceChart";
const databases: ReturnType<typeof openDatabase>[] = [];
function db() {
  const d = openDatabase(":memory:");
  databases.push(d);
  return d;
}
afterEach(() => {
  databases.splice(0).forEach((d) => d.close());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const reply = (data: unknown) => new Response(JSON.stringify(data));
describe("actual provider contracts", () => {
  it("uses supported search limits, daily net change and last-trade time after close", async () => {
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "test-only");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        reply({
          status: "success",
          data: [
            {
              name: "Reliance",
              instrument_key: "NSE_EQ|TEST",
              trading_symbol: "RELIANCE",
              exchange: "NSE",
              exchange_token: "100",
              segment: "NSE_EQ",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply({
          status: "success",
          data: {
            quote: {
              instrument_token: "NSE_EQ|TEST",
              last_price: 110,
              ohlc: { close: 110 },
              net_change: 10,
              timestamp: "2026-11-11T16:00:00+05:30",
              last_trade_time: String(Date.parse("2026-11-11T09:59:00Z")),
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const q = (await upstoxQuotes(db(), ["NSE:RELIANCE"]))[0];
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("records")).toBe(
      "20",
    );
    expect(q.previousClose).toBe(100);
    expect(q.change).toBeCloseTo(10);
    expect(q.asOf).toBe("2026-11-11T09:59:00.000Z");
  });
  it("does not mistake Yahoo's range-start close for yesterday's close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reply({
          chart: {
            error: null,
            result: [
              {
                meta: {
                  symbol: "INFY.NS",
                  currency: "INR",
                  regularMarketPrice: 110,
                  regularMarketTime: Date.parse("2026-11-11T09:30:00Z") / 1000,
                  chartPreviousClose: 80,
                },
                timestamp: [
                  Date.parse("2026-11-10T03:45:00Z") / 1000,
                  Date.parse("2026-11-11T03:45:00Z") / 1000,
                ],
                indicators: {
                  quote: [
                    {
                      open: [99, 105],
                      high: [101, 111],
                      low: [98, 104],
                      close: [100, 110],
                      volume: [1000, 1200],
                    },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );
    const q = (await yahooQuotes(db(), ["NSE:INFY"]))[0];
    expect(q.previousClose).toBe(100);
    expect(q.change).toBeCloseTo(10);
  });
  it("backs off after Yahoo rate limiting without alternate-host retries", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const database = db();
    await expect(yahooQuotes(database, ["NSE:INFY"])).rejects.toThrow("429");
    await expect(yahooQuotes(database, ["NSE:RELIANCE"])).rejects.toThrow(
      "rate-limited",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects unsupported Yahoo intervals and invalid chart input before a provider call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const database = db();
    await expect(yahooIntraday(database, "INFY", "NSE", 3)).rejects.toThrow(
      "Three-minute",
    );
    const result = await request(createApp(database, { local: true })).get(
      "/api/market/chart?symbol=INFY&interval=99",
    );
    expect(result.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("chart indicators", () => {
  it("excludes the current candle from the average and resets VWAP per IST session", () => {
    const bars = [10, 20, 30, 80].map((v, i) => ({
      time: i === 3 ? "2026-11-12T03:45:00Z" : `2026-11-11T03:${45 + i}:00Z`,
      open: v,
      high: v,
      low: v,
      close: v,
      volume: 100,
    }));
    const values = chartIndicators(bars, 2);
    expect(values[2].mean).toBe(15);
    expect(values[2].vwap).toBe(20);
    expect(values[3].vwap).toBe(80);
    expect(values[3].mean).toBe(25);
  });
});

it("exports valid calendar dates, exclusive end dates and escaped source text", async () => {
  const { ipoCalendar } = await import("../src/calendar");
  const text = ipoCalendar(
    [
      {
        slug: "fixture",
        name: "Fixture, Inc;\nNew",
        openDate: "2028-02-29",
        closeDate: "2028-02-30",
        source: "Test",
        asOf: "2028-01-01",
      } as any,
    ],
    new Date("2028-01-01T00:00:00Z"),
  );
  expect(text).toContain("DTSTART;VALUE=DATE:20280229");
  expect(text).toContain("DTEND;VALUE=DATE:20280301");
  expect(text).not.toContain("20280230");
  expect(text).toContain("Fixture\\, Inc\\;\\nNew");
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
});

it("normalizes official Indian feed timestamps and identifies primary sources", async () => {
  const { parseFeed, sourceCategory } =
    await import("../server/providers/research");
  const items = parseFeed(
    "<rss><channel><item><title>Company &amp; disclosure</title><link>https://nsearchives.nseindia.com/corporate/test.pdf</link><pubDate>11-Nov-2026 16:28:58</pubDate><description>Official filing headline</description></item></channel></rss>",
    "NSE corporate disclosures",
    "article",
    "+0530",
  );
  expect(items[0].publishedAt).toBe("2026-11-11T10:58:58.000Z");
  expect(items[0].title).toBe("Company & disclosure");
  expect(sourceCategory(items[0].source, items[0].kind)).toBe("official");
  expect(sourceCategory("TradingQnA", "forum")).toBe("community");
});
