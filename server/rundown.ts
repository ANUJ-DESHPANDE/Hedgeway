import { rows, type DB } from "./db/index.js";
import { instruments } from "./instruments.js";
import {
  getArticles,
  researchSources,
  sourceCategory,
} from "./providers/research.js";
import type { Quote } from "../src/types.js";

const istDate = (value: number | string) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const equity = (q: Quote) =>
  !/ETF|Unclassified|Unknown|^Gold$/i.test(q.sector) &&
  !/\bETF\b/i.test(q.name);
export function buildRundown(db: DB, now = Date.now()) {
  const date = istDate(now);
  const weekend = [0, 6].includes(new Date(now + 19800000).getUTCDay());
  const quotes = rows<{ payload: string }>(
    db,
    "SELECT payload FROM quotes",
  ).flatMap(({ payload }) => {
    try {
      const q = JSON.parse(payload) as Quote;
      return q &&
        typeof q.symbol === "string" &&
        typeof q.name === "string" &&
        typeof q.sector === "string" &&
        typeof q.source === "string" &&
        Number.isFinite(q.price) &&
        q.price > 0 &&
        Number.isFinite(q.previousClose) &&
        q.previousClose > 0 &&
        Number.isFinite(q.change) &&
        Number.isFinite(Date.parse(q.asOf)) &&
        Date.parse(q.asOf) <= now &&
        ["NSE", "BSE"].includes(q.exchange) &&
        !/synthetic|demo|sample/i.test(q.source)
        ? [q]
        : [];
    } catch {
      return [];
    }
  });
  const current = quotes.filter((q) => istDate(q.asOf) === date);
  const ranked = current.filter(equity).sort((a, b) => b.change - a.change);
  const latestDate =
    quotes
      .map((q) => istDate(q.asOf))
      .sort()
      .at(-1) || null;
  const snapshot =
    latestDate && latestDate !== date
      ? quotes
          .filter((q) => istDate(q.asOf) === latestDate)
          .filter(equity)
          .sort((a, b) => b.change - a.change)
          .slice(0, 4)
      : [];
  const groups = new Map<string, Quote[]>();
  for (const q of ranked)
    groups.set(q.sector, [...(groups.get(q.sector) || []), q]);
  const since = new Date(now - 7 * 86400000).toISOString();
  const reporting = getArticles(db, "", "", false, {
    symbol: "",
    since,
    until: new Date(now).toISOString(),
    category: "reporting",
  });
  const official = getArticles(db, "", "", false, {
    symbol: "",
    since,
    until: new Date(now).toISOString(),
    category: "official",
  });
  const articles = [...reporting, ...official]
    .filter(
      (a) =>
        ["reporting", "official"].includes(sourceCategory(a.source, a.kind)) &&
        a.kind !== "guide" &&
        !/example|demo|field notes|discovery/i.test(a.source),
    )
    .map((a) => ({
      ...a,
      category: sourceCategory(a.source, a.kind),
      current: istDate(a.publishedAt) === date,
    }));
  const matching = (pattern: RegExp) =>
    articles.filter((a) => pattern.test(`${a.title} ${a.summary}`)).slice(0, 4);
  const movers = ranked
    .filter((q) => q.change > 0)
    .slice(0, 4)
    .map((q) => ({
      ...q,
      coverage: articles
        .filter(
          (a) =>
            a.symbols.includes(q.symbol) ||
            a.title.toUpperCase().includes(q.symbol),
        )
        .slice(0, 2),
    }));
  return {
    headlines: articles
      .filter((a) => a.category === "reporting")
      .slice(0, 6)
      .concat(articles.filter((a) => a.category === "official").slice(0, 2)),
    date,
    generatedAt: new Date(now).toISOString(),
    weekend,
    marketStatus: current.length
      ? "Current IST-day quotes available"
      : weekend
        ? "Weekend · no current-day quotes"
        : "Awaiting current IST-day quotes",
    universe: {
      available: quotes.filter(equity).length,
      current: ranked.length,
      excluded: current.length - ranked.length,
      description:
        "Available tracked NSE/BSE equities only; not exchange-wide rankings",
    },
    movers,
    laggards: ranked
      .filter((q) => q.change < 0)
      .slice(-3)
      .reverse(),
    breadth: {
      advancing: ranked.filter((q) => q.change > 0).length,
      declining: ranked.filter((q) => q.change < 0).length,
      unchanged: ranked.filter((q) => q.change === 0).length,
    },
    sectors: [...groups]
      .map(([name, items]) => ({
        name,
        count: items.length,
        change: items.reduce((n, q) => n + q.change, 0) / items.length,
      }))
      .sort((a, b) => b.change - a.change),
    lastSnapshot: {
      date: latestDate !== date ? latestDate : null,
      quotes: snapshot,
    },
    themes: {
      policy: matching(
        /\bRBI\b|reserve bank|monetary|repo rate|\bSEBI\b|policy|tariff|budget/i,
      ),
      macro: matching(
        /inflation|\bCPI\b|\bGDP\b|crude|oil price|rupee|currency|bond yield|\bFII\b|\bFPI\b|global|federal reserve/i,
      ),
      earnings: matching(
        /earnings|quarterly|results|profit|revenue|guidance|margin/i,
      ),
    },
    coverage: {
      items: articles.length,
      currentItems: articles.filter((a) => a.current).length,
      since,
      until: new Date(now).toISOString(),
      excerptOnly: true,
      sources: researchSources(db),
    },
    starters: instruments
      .filter(([, name, sector]) => sector !== "ETF" && !/ETF/.test(name))
      .slice(0, 8)
      .map(([symbol, name, sector]) => ({
        symbol,
        name,
        sector,
        exchange: "NSE",
      })),
  };
}
export type Rundown = ReturnType<typeof buildRundown>;
