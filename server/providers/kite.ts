import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Quote } from "../../src/types.js";
import type { DB } from "../db/index.js";
import { audit, row, transaction } from "../db/index.js";
import { instruments } from "../instruments.js";
import { decrypt, encrypt } from "../security.js";
import { cached, fetchText, json } from "./http.js";
export function kiteCredentials(db: DB): { apiKey: string; apiSecret: string } {
  const saved = row<{ encrypted_value: string }>(
    db,
    "SELECT encrypted_value FROM credentials WHERE provider='kite-app'",
  );
  return saved
    ? JSON.parse(decrypt(saved.encrypted_value))
    : {
        apiKey: process.env.KITE_API_KEY || "",
        apiSecret: process.env.KITE_API_SECRET || "",
      };
}
export function kiteConfigured(db: DB) {
  return Boolean(
    process.env.TOKEN_ENCRYPTION_KEY &&
    (row(db, "SELECT 1 FROM credentials WHERE provider='kite-app'") ||
      (process.env.KITE_API_KEY && process.env.KITE_API_SECRET)),
  );
}
export function saveKiteCredentials(db: DB, apiKey: string, apiSecret: string) {
  const value = encrypt(JSON.stringify({ apiKey, apiSecret }));
  transaction(db, () => {
    db.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)").run(
      "kite-app",
      value,
      new Date().toISOString(),
    );
    db.prepare("DELETE FROM broker_session").run();
    db.prepare("DELETE FROM oauth_states").run();
    audit(
      db,
      "kite.configure",
      "Encrypted application credentials saved; reconnect required",
    );
  });
}
export function kiteConnected(db: DB) {
  return Boolean(
    row(db, "SELECT id FROM broker_session WHERE expires_at>?", Date.now()),
  );
}
export async function kiteRequest(db: DB, path: string) {
  const session = row<{ encrypted_token: string; expires_at: number }>(
    db,
    "SELECT * FROM broker_session WHERE id=1",
  );
  if (!session || session.expires_at < Date.now())
    throw new Error(
      "Kite session expired or disconnected. Reconnect in Integrations.",
    );
  const result = await json(`https://api.kite.trade${path}`, {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${kiteCredentials(db).apiKey}:${decrypt(session.encrypted_token)}`,
    },
  });
  if (result.status !== "success")
    throw new Error(
      "Kite could not complete the request. Reconnect or check API entitlements.",
    );
  return result.data;
}
export async function exchangeToken(db: DB, token: string) {
  const { apiKey, apiSecret } = kiteCredentials(db);
  const checksum = createHash("sha256")
    .update(`${apiKey}${token}${apiSecret}`)
    .digest("hex");
  const result = await json("https://api.kite.trade/session/token", {
    method: "POST",
    headers: {
      "X-Kite-Version": "3",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      api_key: apiKey,
      request_token: token,
      checksum,
    }),
  });
  const parsed = z
    .object({
      status: z.literal("success"),
      data: z.object({ access_token: z.string().min(1) }),
    })
    .parse(result);
  // Kite expires at the next 06:00 IST (00:30 UTC).
  const expiry = new Date();
  expiry.setUTCHours(0, 30, 0, 0);
  if (expiry.getTime() <= Date.now())
    expiry.setUTCDate(expiry.getUTCDate() + 1);
  db.prepare("INSERT OR REPLACE INTO broker_session VALUES(1,?,?)").run(
    encrypt(parsed.data.access_token),
    expiry.getTime(),
  );
  audit(db, "kite.connect", "Encrypted session stored");
}
export async function syncHoldings(db: DB) {
  const data = z
    .array(
      z.object({
        tradingsymbol: z.string(),
        exchange: z.enum(["NSE", "BSE"]),
        quantity: z.number().nonnegative(),
        t1_quantity: z.number().nonnegative().optional(),
        average_price: z.number().nonnegative(),
        last_price: z.number().nonnegative(),
        close_price: z.number().nonnegative().optional(),
      }),
    )
    .parse(await kiteRequest(db, "/portfolio/holdings"));
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare("DELETE FROM holdings WHERE source='kite'").run();
    for (const h of data) {
      const qty = h.quantity + (h.t1_quantity || 0);
      if (qty <= 0 || h.average_price <= 0) continue;
      const info = instruments.find((x) => x[0] === h.tradingsymbol);
      db.prepare("INSERT OR REPLACE INTO holdings VALUES(?,?,?,?,?,?,?)").run(
        h.tradingsymbol,
        h.exchange,
        qty,
        h.average_price,
        info?.[2] || "Unclassified",
        "kite",
        now,
      );
      if (h.last_price > 0) {
        const prev = h.close_price || h.last_price;
        const q: Quote = {
          symbol: h.tradingsymbol,
          exchange: h.exchange,
          name: info?.[1] || h.tradingsymbol,
          sector: info?.[2] || "Unclassified",
          price: h.last_price,
          previousClose: prev,
          change: (h.last_price / prev - 1) * 100,
          currency: "INR",
          source: "Kite holdings snapshot",
          asOf: now,
        };
        db.prepare("INSERT OR REPLACE INTO quotes VALUES(?,?,?,?)").run(
          q.symbol,
          q.exchange,
          JSON.stringify(q),
          now,
        );
      }
    }
    audit(db, "holdings.sync", `${data.length} Kite records received`);
  });
  return data.length;
}
export async function kiteQuotes(db: DB, symbols: string[]): Promise<Quote[]> {
  return cached(db, `kite:${symbols.join(",")}`, 30_000, async () => {
    const query = new URLSearchParams();
    const aliases = new Map<string, string[]>();
    for (const id of symbols) {
      const [exchange, symbol] = id.split(":");
      const key =
        exchange === "BSE" && /^\d+$/.test(symbol)
          ? `BSE:${(await kiteInstrument(db, symbol, exchange)).symbol}`
          : id;
      aliases.set(key, [...(aliases.get(key) || []), id]);
    }
    for (const key of aliases.keys()) query.append("i", key);
    const data = await kiteRequest(db, `/quote?${query}`);
    const result: Quote[] = [];
    for (const [id, v] of Object.entries(data)) {
      const q = z
        .object({
          last_price: z.number().positive(),
          ohlc: z.object({ close: z.number().positive() }),
          timestamp: z.string().optional(),
        })
        .parse(v);
      for (const requested of aliases.get(id) || [id]) {
        const [exchange, symbol] = requested.split(":");
        const info = instruments.find((x) => x[0] === symbol);
        result.push({
          symbol,
          exchange,
          name: info?.[1] || symbol,
          sector: info?.[2] || "Unclassified",
          price: q.last_price,
          previousClose: q.ohlc.close,
          change: (q.last_price / q.ohlc.close - 1) * 100,
          currency: "INR",
          source: "Kite quote API",
          asOf: q.timestamp
            ? new Date(
                q.timestamp.includes("+") || q.timestamp.endsWith("Z")
                  ? q.timestamp
                  : q.timestamp.replace(" ", "T") + "+05:30",
              ).toISOString()
            : new Date().toISOString(),
        });
      }
    }
    return result;
  });
}
export async function kiteHistory(db: DB, symbol: string, exchange = "NSE") {
  return cached(
    db,
    `kite-history:${exchange}:${symbol}`,
    3600_000,
    async () => {
      const instrument = await kiteInstrument(db, symbol, exchange);
      const to = new Date(),
        from = new Date(Date.now() - 700 * 24 * 3600_000);
      const params = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      });
      const response = z
        .object({
          candles: z.array(
            z.tuple([
              z.string(),
              z.number(),
              z.number(),
              z.number(),
              z.number().positive(),
              z.number(),
            ]),
          ),
        })
        .parse(
          await kiteRequest(
            db,
            `/instruments/historical/${instrument.token}/day?${params}`,
          ),
        );
      return {
        candles: response.candles.map((c) => ({
          date: c[0].slice(0, 10),
          close: c[4],
        })),
        source:
          "Kite historical daily candles (corporate-action adjustment not assumed)",
        asOf: new Date().toISOString(),
      };
    },
  );
}

export async function kiteEquities(db: DB, exchange = "NSE") {
  const session = row<{ encrypted_token: string; expires_at: number }>(
    db,
    "SELECT * FROM broker_session WHERE id=1",
  );
  if (!session || session.expires_at < Date.now())
    throw new Error("Kite session expired. Reconnect first.");
  return cached<
    { symbol: string; code: string; token: string; name: string }[]
  >(db, `kite-equities-v2:${exchange}`, 24 * 3600_000, async () => {
    const text = await fetchText(
      `https://api.kite.trade/instruments/${exchange}`,
      {
        headers: {
          "X-Kite-Version": "3",
          Authorization: `token ${kiteCredentials(db).apiKey}:${decrypt(session.encrypted_token)}`,
        },
      },
    );
    return (parse(text, { columns: true, skip_empty_lines: true }) as any[])
      .filter((i) => i.instrument_type === "EQ")
      .map((i) => ({
        symbol: i.tradingsymbol,
        token: i.instrument_token,
        code: String(i.exchange_token),
        name: i.name || i.tradingsymbol,
      }));
  });
}
export async function kiteInstrument(db: DB, symbol: string, exchange = "NSE") {
  const master = await kiteEquities(db, exchange);
  const item = master.find((i) => i.symbol === symbol || i.code === symbol);
  if (!item) throw new Error(`No Kite equity match for ${exchange}:${symbol}.`);
  return item;
}
