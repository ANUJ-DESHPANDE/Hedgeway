import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { Candle, Holding } from "../src/types.js";
import type { DB } from "./db/index.js";
import { audit, transaction } from "./db/index.js";
const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9&_.-]{1,30}$/);
const numeric = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/,/g, "") : v),
  z.coerce.number().finite().positive(),
);
export const holdingSchema = z.object({
  symbol,
  exchange: z.enum(["NSE", "BSE"]).default("NSE"),
  quantity: numeric,
  averagePrice: numeric,
  sector: z.string().max(60).default("Unclassified"),
});
export function parseHoldings(csv: string): Holding[] {
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  if (records.length > 1000 || !records.length)
    throw new Error("Import between 1 and 1,000 holdings.");
  const seen = new Set<string>();
  return records.map((r: any, index: number) => {
    const parsed = holdingSchema.safeParse({
      symbol: r.symbol ?? r.Instrument ?? r.Tradingsymbol,
      exchange: r.exchange || "NSE",
      quantity: r.quantity ?? r["Qty."] ?? r.Quantity,
      averagePrice:
        r.averagePrice ??
        r.average_price ??
        r["Avg. cost"] ??
        r["Average price"],
      sector: r.sector || "Unclassified",
    });
    if (!parsed.success)
      throw new Error(
        `CSV row ${index + 2}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    const h = parsed.data;
    const id = `${h.exchange}:${h.symbol}`;
    if (seen.has(id))
      throw new Error(
        `Duplicate holding ${id}. Consolidate duplicate rows before importing.`,
      );
    seen.add(id);
    return { ...h, source: "csv" };
  });
}
export function saveHoldings(db: DB, holdings: Holding[]) {
  transaction(db, () => {
    for (const h of holdings)
      db.prepare("INSERT OR REPLACE INTO holdings VALUES(?,?,?,?,?,?,?)").run(
        h.symbol,
        h.exchange,
        h.quantity,
        h.averagePrice,
        h.sector,
        h.source,
        new Date().toISOString(),
      );
    audit(db, "holdings.import", `${holdings.length} holdings upserted`);
  });
}
export function parseCandles(csv: string): Candle[] {
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  if (records.length > 10000)
    throw new Error("Maximum 10,000 daily observations.");
  const schema = z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
      ),
    close: numeric,
  });
  const candles = records
    .map((r: any) =>
      schema.parse({ date: r.date ?? r.Date, close: r.close ?? r.Close }),
    )
    .sort((a: Candle, b: Candle) => a.date.localeCompare(b.date));
  if (
    candles.some(
      (c: Candle, i: number) => i > 0 && c.date === candles[i - 1].date,
    )
  )
    throw new Error("Duplicate daily dates.");
  return candles;
}
