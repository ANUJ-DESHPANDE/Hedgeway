import { z } from "zod";
import type { IPO } from "../../src/types.js";
import type { DB } from "../db/index.js";
import { row, rows, transaction } from "../db/index.js";
import { cached, json } from "./http.js";
const optionalNumber = z
  .number()
  .finite()
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const shape = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  board: z.string(),
  status: z.string(),
  priceMin: optionalNumber,
  priceMax: optionalNumber,
  lotSize: optionalNumber,
  issueSizeCr: optionalNumber,
  openDate: z.string().nullable().optional(),
  closeDate: z.string().nullable().optional(),
  lastGmp: optionalNumber,
  lastSubX: optionalNumber,
  gmpDisputed: z.boolean().optional(),
});
async function provider(db: DB, path: string): Promise<any> {
  return cached(db, `xflot:${path}`, 5 * 60_000, async () => {
    const last = row<{ expires_at: number }>(
      db,
      "SELECT expires_at FROM cache WHERE key='xflot:throttle'",
    );
    if (last && last.expires_at > Date.now())
      throw new Error(
        "IPO provider cooldown: wait one minute before requesting another resource.",
      );
    db.prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)").run(
      "xflot:throttle",
      "null",
      Date.now() + 60_000,
    );
    return json(`https://www.xflot.com/api/public/market/${path}`);
  });
}
export async function refreshIPOs(db: DB) {
  const response = await provider(db, "ipos?limit=100");
  const result = z
    .object({
      ok: z.literal(true),
      ipos: z.array(shape),
      disclaimer: z.string(),
    })
    .parse(response);
  const now = new Date().toISOString();
  const previous = new Map(getIPOs(db).map((p) => [p.slug, p]));
  transaction(db, () => {
    for (const p of result.ipos) {
      const ipo: IPO = {
        ...p,
        subs: previous.get(p.slug)?.subs,
        gmp: previous.get(p.slug)?.gmp,
        detailsAsOf: previous.get(p.slug)?.detailsAsOf,
        openDate: p.openDate ?? null,
        closeDate: p.closeDate ?? null,
        gmpDisputed: p.gmpDisputed ?? false,
        source: "Xflot",
        asOf: now,
        disclaimer: result.disclaimer,
      };
      db.prepare("INSERT OR REPLACE INTO ipo_snapshots VALUES(?,?,?)").run(
        ipo.slug,
        now,
        JSON.stringify(ipo),
      );
    }
  });
  return result.ipos.length;
}
export function getIPOs(db: DB): IPO[] {
  return rows<{ payload: string }>(
    db,
    "SELECT s.payload FROM ipo_snapshots s JOIN (SELECT slug,MAX(observed_at) latest FROM ipo_snapshots GROUP BY slug) x ON s.slug=x.slug AND s.observed_at=x.latest ORDER BY s.observed_at DESC",
  ).map((x) => JSON.parse(x.payload));
}
export async function ipoDetail(db: DB, slug: string) {
  const existing = getIPOs(db).find((p) => p.slug === slug);
  if (!existing) throw new Error("IPO not found. Refresh the IPO list first.");
  const result = await provider(db, `ipos/${slug}`);
  const detail = z
    .object({
      ok: z.literal(true),
      disclaimer: z.string().optional(),
      ipo: z.object({
        subs: z
          .array(z.object({ category: z.string(), timesSub: optionalNumber }))
          .optional(),
        gmp: z
          .array(z.object({ observedAt: z.string(), gmp: optionalNumber }))
          .optional(),
      }),
    })
    .parse(result);
  const ipo = {
    ...existing,
    ...detail.ipo,
    disclaimer: detail.disclaimer || existing.disclaimer,
    asOf: new Date().toISOString(),
    detailsAsOf: new Date().toISOString(),
  };
  db.prepare("INSERT OR REPLACE INTO ipo_snapshots VALUES(?,?,?)").run(
    slug,
    ipo.asOf,
    JSON.stringify(ipo),
  );
  return ipo;
}
export async function ipoScoreboard(db: DB) {
  const response = await provider(db, "scoreboard");
  return z
    .object({
      ok: z.literal(true),
      disclaimer: z.string().optional(),
      summary: z.object({
        n: z.number(),
        avgAbsErrorPp: z.number().nullable(),
        directionHitPct: z.number().nullable(),
      }),
      rows: z.array(
        z.object({
          slug: z.string(),
          name: z.string(),
          issuePrice: optionalNumber,
          gmpAtClose: optionalNumber,
          impliedPct: optionalNumber,
          listingPrice: optionalNumber,
          actualPct: optionalNumber,
          errorPp: optionalNumber,
          directionHit: z.boolean().nullable().optional(),
          listedOn: z.string().nullable().optional(),
        }),
      ),
    })
    .parse(response);
}
