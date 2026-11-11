import { z } from "zod";
import type { DB } from "../db/index.js";
import { row } from "../db/index.js";
import { cached, json } from "./http.js";
import type { Quote } from "../../src/types.js";
import type { IntradayBar } from "../../src/trading.js";
export const yahooSource = "Yahoo Finance · unofficial research snapshot";
export function yahooSymbol(symbol: string, exchange: string) {
  if (exchange !== "NSE" || !/^[A-Z0-9&_.-]{1,30}$/.test(symbol))
    throw new Error(
      "Yahoo research currently supports NSE trading symbols only. BSE needs an explicit ticker mapping; use a broker for BSE.",
    );
  return `${symbol}.NS`;
}
export function parseYahoo(value: unknown, ticker: string) {
  const data = z
    .object({
      chart: z.object({
        result: z
          .array(
            z.object({
              meta: z.object({
                symbol: z.string(),
                currency: z.literal("INR"),
                regularMarketPrice: z.number().positive().optional(),
                regularMarketTime: z.number().positive().optional(),
                chartPreviousClose: z.number().positive().optional(),
                previousClose: z.number().positive().optional(),
                longName: z.string().optional(),
                shortName: z.string().optional(),
              }),
              timestamp: z.array(z.number()).optional(),
              indicators: z.object({
                quote: z.array(
                  z.object({
                    open: z.array(z.number().nullable()),
                    high: z.array(z.number().nullable()),
                    low: z.array(z.number().nullable()),
                    close: z.array(z.number().nullable()),
                    volume: z.array(z.number().nullable()),
                  }),
                ),
              }),
            }),
          )
          .nullable(),
        error: z.unknown().optional(),
      }),
    })
    .parse(value);
  const result = data.chart.result?.[0];
  if (data.chart.error || !result || result.meta.symbol !== ticker)
    throw new Error("Yahoo returned no matching instrument data.");
  const q = result.indicators.quote[0];
  if (!q) throw new Error("Yahoo returned no price series.");
  const bars: IntradayBar[] = [];
  for (const [i, time] of (result.timestamp || []).entries()) {
    const open = q.open[i],
      high = q.high[i],
      low = q.low[i],
      close = q.close[i],
      volume = q.volume[i];
    if ([open, high, low, close, volume].some((x) => x == null)) continue;
    if (
      open! <= 0 ||
      low! <= 0 ||
      close! <= 0 ||
      high! < Math.max(open!, close!) ||
      low! > Math.min(open!, close!) ||
      volume! < 0
    )
      throw new Error("Yahoo returned inconsistent candle values.");
    bars.push({
      time: new Date(time * 1000).toISOString(),
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume!,
    });
  }
  return { meta: result.meta, bars };
}
async function chart(
  db: DB,
  symbol: string,
  exchange: string,
  interval: string,
  range: string,
) {
  const ticker = yahooSymbol(symbol, exchange);
  return cached(db, `yahoo:${ticker}:${interval}:${range}`, 60000, async () => {
    const cooldown = row<{ expires_at: number }>(
      db,
      "SELECT expires_at FROM cache WHERE key='yahoo:cooldown'",
    );
    if (cooldown && cooldown.expires_at > Date.now())
      throw new Error(
        "Yahoo is rate-limited. Retry after " +
          new Date(cooldown.expires_at).toISOString(),
      );
    try {
      const data = await json(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${new URLSearchParams({ interval, range })}`,
      );
      return {
        ...parseYahoo(data, ticker),
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("HTTP 429"))
        db.prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)").run(
          "yahoo:cooldown",
          "null",
          Date.now() + 5 * 60000,
        );
      throw new Error(
        `Yahoo research data unavailable: ${error instanceof Error ? error.message : "request failed"}. No substitute prices were generated. If rate-limited, wait before retrying.`,
      );
    }
  });
}
export async function yahooQuotes(db: DB, ids: string[]): Promise<Quote[]> {
  if (ids.length > 20)
    throw new Error(
      "Yahoo research supports at most 20 instruments per refresh to limit requests.",
    );
  const quotes: Quote[] = [];
  for (const id of ids) {
    const [exchange, symbol] = id.split(":");
    const { meta, bars } = await chart(db, symbol, exchange, "1d", "5d");
    const session = meta.regularMarketTime
      ? istDate(meta.regularMarketTime * 1000)
      : "";
    const previousClose =
      meta.previousClose ??
      bars.filter((b) => istDate(Date.parse(b.time)) < session).at(-1)?.close;
    if (!meta.regularMarketPrice || !meta.regularMarketTime || !previousClose)
      throw new Error(`Yahoo did not report a complete quote for ${symbol}.`);
    quotes.push({
      symbol,
      exchange,
      name: meta.longName || meta.shortName || symbol,
      sector: "Unknown",
      currency: "INR",
      price: meta.regularMarketPrice,
      previousClose,
      change: (meta.regularMarketPrice / previousClose - 1) * 100,
      asOf: new Date(meta.regularMarketTime * 1000).toISOString(),
      source: yahooSource,
    });
  }
  return quotes;
}
export async function yahooHistory(db: DB, symbol: string, exchange: string) {
  const data = await chart(db, symbol, exchange, "1d", "1y");
  // Exclude the current IST session because its daily candle may be unfinished.
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const candles = data.bars
    .filter(
      (b) =>
        new Date(Date.parse(b.time) + 330 * 60000).toISOString().slice(0, 10) <
        today,
    )
    .map((b) => ({
      date: new Date(Date.parse(b.time) + 330 * 60000)
        .toISOString()
        .slice(0, 10),
      close: b.close,
    }));
  return { candles, source: yahooSource, asOf: data.fetchedAt };
}
export async function yahooIntraday(
  db: DB,
  symbol: string,
  exchange: string,
  minutes: number,
) {
  if (minutes === 3)
    throw new Error(
      "Choose 1-minute or 5-minute candles for Yahoo research. Three-minute candles require a broker.",
    );
  const data = await chart(db, symbol, exchange, `${minutes}m`, "5d");
  return { bars: data.bars, source: yahooSource, fetchedAt: data.fetchedAt };
}

function istDate(time: number) {
  return new Date(time + 330 * 60000).toISOString().slice(0, 10);
}
export async function yahooDailyBars(db: DB, symbol: string, exchange: string) {
  return chart(db, symbol, exchange, "1d", "1y");
}
