import { z } from "zod";
import type { DB } from "../db/index.js";
import { row } from "../db/index.js";
import { decrypt, encrypt } from "../security.js";
import { cached, json } from "./http.js";
import { instruments } from "../instruments.js";
import type { Quote } from "../../src/types.js";
export function upstoxToken(db: DB) {
  const saved = row<{ encrypted_value: string }>(
    db,
    "SELECT encrypted_value FROM credentials WHERE provider='upstox'",
  );
  return saved
    ? decrypt(saved.encrypted_value)
    : process.env.UPSTOX_ACCESS_TOKEN || "";
}
export function upstoxConfigured(db: DB) {
  return Boolean(
    process.env.UPSTOX_ACCESS_TOKEN ||
    row(db, "SELECT 1 FROM credentials WHERE provider='upstox'"),
  );
}
export async function upstoxRequest(
  db: DB,
  path: string,
  token = upstoxToken(db),
) {
  if (!token)
    throw new Error("Add your Upstox Analytics Token in Integrations.");
  const result = await json(`https://api.upstox.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (result.status !== "success")
    throw new Error(
      "Upstox rejected this request. Check token expiry and API permissions.",
    );
  return result.data;
}
export async function saveUpstoxToken(db: DB, token: string) {
  const encrypted = encrypt(token); // Fail before network work if encryption is not configured.
  await upstoxRequest(
    db,
    "/v2/market-quote/quotes?instrument_key=NSE_INDEX%7CNifty%2050",
    token,
  );
  db.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)").run(
    "upstox",
    encrypted,
    new Date().toISOString(),
  );
}
export type UpstoxInstrument = {
  name: string;
  instrument_key: string;
  trading_symbol: string;
  exchange: string;
  exchange_token: string;
  segment: string;
};
export async function resolveUpstox(
  db: DB,
  id: string,
): Promise<UpstoxInstrument> {
  return cached(db, `upstox-instrument:${id}`, 24 * 3600_000, async () => {
    const [exchange, symbol] = id.split(":");
    const query = new URLSearchParams({
      query: symbol,
      exchanges: exchange,
      segments: "EQ",
      records: "100",
    });
    const items = z
      .array(
        z.object({
          name: z.string(),
          instrument_key: z.string(),
          trading_symbol: z.string(),
          exchange: z.string(),
          exchange_token: z.coerce.string(),
          segment: z.string(),
        }),
      )
      .parse(await upstoxRequest(db, `/v2/instruments/search?${query}`));
    const item = items.find(
      (i) =>
        i.exchange === exchange &&
        i.segment === `${exchange}_EQ` &&
        (i.trading_symbol.toUpperCase() === symbol ||
          i.exchange_token === symbol),
    );
    if (!item) throw new Error(`No exact Upstox equity match for ${id}.`);
    return item;
  });
}
export async function upstoxQuotes(db: DB, ids: string[]): Promise<Quote[]> {
  const instrumentsByKey = new Map<
    string,
    { id: string; instrument: UpstoxInstrument }
  >();
  for (const id of ids) {
    const instrument = await resolveUpstox(db, id);
    instrumentsByKey.set(instrument.instrument_key, { id, instrument });
  }
  const query = new URLSearchParams({
    instrument_key: [...instrumentsByKey.keys()].join(","),
  });
  const data = await upstoxRequest(db, `/v2/market-quote/quotes?${query}`);
  return Object.values(data).flatMap((v) => {
    const q = z
      .object({
        instrument_token: z.string(),
        last_price: z.number().positive(),
        ohlc: z.object({ close: z.number().positive() }),
        timestamp: z.string().datetime({ offset: true }),
      })
      .parse(v);
    const item = instrumentsByKey.get(q.instrument_token);
    if (!item) return [];
    const [exchange, symbol] = item.id.split(":");
    return [
      {
        symbol,
        exchange,
        name: item.instrument.name,
        sector: instruments.find((x) => x[0] === symbol)?.[2] || "Unclassified",
        price: q.last_price,
        previousClose: q.ohlc.close,
        change: (q.last_price / q.ohlc.close - 1) * 100,
        currency: "INR",
        asOf: new Date(q.timestamp).toISOString(),
        source: "Upstox exchange quote",
      },
    ];
  });
}
export async function upstoxHistory(db: DB, symbol: string, exchange = "NSE") {
  const item = await resolveUpstox(db, `${exchange}:${symbol}`);
  return cached(
    db,
    `upstox-history:${item.instrument_key}`,
    3600_000,
    async () => {
      const to = new Date().toISOString().slice(0, 10),
        from = new Date(Date.now() - 730 * 86400_000)
          .toISOString()
          .slice(0, 10);
      const result = z
        .object({
          candles: z.array(
            z.tuple([
              z.string(),
              z.number(),
              z.number(),
              z.number(),
              z.number().positive(),
              z.number(),
              z.number(),
            ]),
          ),
        })
        .parse(
          await upstoxRequest(
            db,
            `/v3/historical-candle/${encodeURIComponent(item.instrument_key)}/days/1/${to}/${from}`,
          ),
        );
      return {
        candles: result.candles
          .map((c) => ({ date: c[0].slice(0, 10), close: c[4] }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        source:
          "Upstox historical daily candles (corporate-action adjustment not assumed)",
        asOf: new Date().toISOString(),
      };
    },
  );
}
