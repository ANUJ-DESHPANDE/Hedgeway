import { yahooIntraday } from "./yahoo.js";
import { z } from "zod";
import type { DB } from "../db/index.js";
import type { IntradayBar } from "../../src/trading.js";
import { cached } from "./http.js";
import { marketProvider } from "./market.js";
import { resolveUpstox, upstoxRequest } from "./upstox.js";
import { kiteInstrument, kiteRequest } from "./kite.js";
const candle = z
  .tuple([
    z.string().datetime({ offset: true }),
    z.number().positive(),
    z.number().positive(),
    z.number().positive(),
    z.number().positive(),
    z.number().nonnegative(),
  ])
  .rest(z.number());
export function normalizeIntraday(raw: unknown): IntradayBar[] {
  const values = z.array(candle).parse(raw);
  const result = new Map<string, IntradayBar>();
  for (const [time, open, high, low, close, volume] of values) {
    if (
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high
    )
      throw new Error("Provider sent inconsistent OHLC prices.");
    const normalized = new Date(time).toISOString();
    result.set(normalized, {
      time: normalized,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return [...result.values()].sort((a, b) => a.time.localeCompare(b.time));
}
export async function intraday(
  db: DB,
  symbol: string,
  exchange: string,
  minutes: number,
) {
  const provider = marketProvider(db);
  if (provider === "yahoo") return yahooIntraday(db, symbol, exchange, minutes);
  return cached(
    db,
    `intraday:${provider}:${exchange}:${symbol}:${minutes}`,
    15000,
    async () => {
      let result: any;
      const to = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
        from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      if (provider === "upstox") {
        const instrument = await resolveUpstox(db, `${exchange}:${symbol}`);
        const key = encodeURIComponent(instrument.instrument_key);
        result = await upstoxRequest(
          db,
          `/v3/historical-candle/intraday/${key}/minutes/${minutes}`,
        );
        if (!Array.isArray(result.candles) || !result.candles.length)
          result = await upstoxRequest(
            db,
            `/v3/historical-candle/${key}/minutes/${minutes}/${to}/${from}`,
          );
      } else {
        const instrument = await kiteInstrument(db, symbol, exchange);
        result = await kiteRequest(
          db,
          `/instruments/historical/${instrument.token}/${minutes === 1 ? "minute" : minutes + "minute"}?${new URLSearchParams({ from: from + " 09:15:00", to: to + " 15:30:00" })}`,
        );
      }
      return {
        bars: normalizeIntraday(result.candles),
        source:
          provider === "upstox"
            ? "Upstox intraday candles"
            : "Kite intraday candles",
        fetchedAt: new Date().toISOString(),
      };
    },
  );
}
