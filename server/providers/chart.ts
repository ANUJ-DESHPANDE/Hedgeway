import type { DB } from "../db/index.js";
import { marketProvider } from "./market.js";
import { intraday, normalizeIntraday } from "./intraday.js";
import { cached } from "./http.js";
import { resolveUpstox, upstoxRequest } from "./upstox.js";
import { kiteInstrument, kiteRequest } from "./kite.js";
import { yahooDailyBars } from "./yahoo.js";
export async function chartData(
  db: DB,
  symbol: string,
  exchange: string,
  interval: string,
) {
  if (interval !== "1d")
    return intraday(db, symbol, exchange, Number(interval));
  const provider = marketProvider(db);
  if (provider === "yahoo") {
    const data = await yahooDailyBars(db, symbol, exchange);
    return {
      bars: data.bars,
      source: "Yahoo Finance · unofficial research snapshot",
      fetchedAt: data.fetchedAt,
    };
  }
  return cached(
    db,
    `chart:${provider}:${exchange}:${symbol}:daily`,
    300000,
    async () => {
      const to = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const from = new Date(Date.now() - 365 * 86400000)
        .toISOString()
        .slice(0, 10);
      let data;
      if (provider === "upstox") {
        const instrument = await resolveUpstox(db, `${exchange}:${symbol}`);
        data = await upstoxRequest(
          db,
          `/v3/historical-candle/${encodeURIComponent(instrument.instrument_key)}/days/1/${to}/${from}`,
        );
      } else {
        const instrument = await kiteInstrument(db, symbol, exchange);
        data = await kiteRequest(
          db,
          `/instruments/historical/${instrument.token}/day?${new URLSearchParams({ from: from + " 09:15:00", to: to + " 15:30:00" })}`,
        );
      }
      return {
        bars: normalizeIntraday(data.candles),
        source: `${provider === "upstox" ? "Upstox" : "Kite"} daily candles · adjustment not assumed`,
        fetchedAt: new Date().toISOString(),
      };
    },
  );
}
