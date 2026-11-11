import { yahooHistory, yahooQuotes } from "./yahoo.js";
import type { Candle, Quote } from "../../src/types.js";
import type { DB } from "../db/index.js";
import { row } from "../db/index.js";
import { upstoxHistory, upstoxQuotes } from "./upstox.js";
export function marketProvider(db: DB): "kite" | "upstox" | "yahoo" {
  const setting = row<{ payload: string }>(
    db,
    "SELECT payload FROM cache WHERE key='config:market-provider'",
  );
  const provider = setting
    ? JSON.parse(setting.payload)
    : process.env.MARKET_PROVIDER;
  return provider === "yahoo"
    ? "yahoo"
    : provider === "kite"
      ? "kite"
      : "upstox";
}

import { kiteConnected, kiteHistory, kiteQuotes } from "./kite.js";
export async function history(
  db: DB,
  symbol: string,
  exchange = "NSE",
): Promise<{ candles: Candle[]; source: string; asOf: string }> {
  if (marketProvider(db) === "yahoo") return yahooHistory(db, symbol, exchange);
  if (marketProvider(db) === "upstox")
    return upstoxHistory(db, symbol, exchange);
  if (!kiteConnected(db))
    throw new Error(
      "Connect Kite with historical-data access, or import a real daily-price CSV.",
    );
  return kiteHistory(db, symbol, exchange);
}
export async function refreshQuotes(
  db: DB,
  symbols: string[],
): Promise<Quote[]> {
  if (marketProvider(db) === "kite" && !kiteConnected(db))
    throw new Error(
      "Connect Kite with live-market-data access first. No delayed substitute is used.",
    );
  const selectedProvider = marketProvider(db);
  const quotes =
    marketProvider(db) === "yahoo"
      ? await yahooQuotes(db, symbols)
      : marketProvider(db) === "upstox"
        ? await upstoxQuotes(db, symbols)
        : await kiteQuotes(db, symbols);
  if (marketProvider(db) !== selectedProvider)
    throw new Error("Market provider changed during refresh. Refresh again.");
  for (const q of quotes)
    db.prepare("INSERT OR REPLACE INTO quotes VALUES(?,?,?,?)").run(
      q.symbol,
      q.exchange,
      JSON.stringify(q),
      new Date().toISOString(),
    );
  return quotes;
}
