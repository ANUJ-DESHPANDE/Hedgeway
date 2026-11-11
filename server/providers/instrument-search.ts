import { z } from "zod";
import type { DB } from "../db/index.js";
import { instruments } from "../instruments.js";
import { cached } from "./http.js";
import { kiteConnected, kiteEquities } from "./kite.js";
import { marketProvider } from "./market.js";
import { upstoxConfigured, upstoxRequest } from "./upstox.js";
export async function searchInstruments(
  db: DB,
  query: string,
  exchange: string,
) {
  const provider = marketProvider(db);
  const connected =
    provider === "upstox" ? upstoxConfigured(db) : kiteConnected(db);
  if (provider === "yahoo" || !connected)
    return {
      source:
        "Popular NSE companies. Connect a price provider to search its full catalogue.",
      items:
        exchange === "NSE"
          ? instruments
              .filter(([symbol, name]) =>
                `${symbol} ${name}`.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 8)
              .map(([symbol, name]) => ({ symbol, name, exchange }))
          : [],
    };
  return cached(
    db,
    `instrument-search:${provider}:${exchange}:${query.toLowerCase()}`,
    60_000,
    async () => {
      if (provider === "kite") {
        const master = await kiteEquities(db, exchange);
        return {
          source: "Kite instrument catalogue",
          items: master
            .filter((i) =>
              `${i.symbol} ${i.name} ${i.code}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .slice(0, 8)
            .map((i) => ({ symbol: i.symbol, name: i.name, exchange })),
        };
      }
      const params = new URLSearchParams({
        query,
        exchanges: exchange,
        segments: "EQ",
        records: "20",
      });
      const data = z
        .array(
          z.object({
            trading_symbol: z.string(),
            name: z.string(),
            exchange: z.string(),
            segment: z.string(),
          }),
        )
        .parse(await upstoxRequest(db, `/v2/instruments/search?${params}`));
      return {
        source: "Upstox instrument catalogue",
        items: data
          .filter(
            (i) => i.exchange === exchange && i.segment === `${exchange}_EQ`,
          )
          .slice(0, 8)
          .map((i) => ({ symbol: i.trading_symbol, name: i.name, exchange })),
      };
    },
  );
}
