import { XMLParser } from "fast-xml-parser";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Article } from "../../src/types.js";
import { sentiment } from "../analytics.js";
import type { DB } from "../db/index.js";
import { rows, transaction } from "../db/index.js";
import { instruments } from "../instruments.js";
import { safeUrl } from "../security.js";
import { cached, fetchText, json } from "./http.js";
export const feeds = [
  {
    id: "et",
    name: "Economic Times Markets",
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    kind: "article",
  },
  {
    id: "moneycontrol",
    name: "Moneycontrol Business",
    url: "https://www.moneycontrol.com/rss/business.xml",
    kind: "article",
  },
  {
    id: "valuepickr",
    name: "ValuePickr",
    url: "https://forum.valuepickr.com/latest.rss",
    kind: "forum",
  },
];
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function parseFeed(
  xml: string,
  source: string,
  kind: string,
): Article[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unsupported XML declaration");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(xml);
  let items = parsed.rss?.channel?.item || parsed.feed?.entry || [];
  if (!Array.isArray(items)) items = [items];
  return items.slice(0, 60).flatMap((item: any) => {
    const link =
      typeof item.link === "string"
        ? item.link
        : Array.isArray(item.link)
          ? item.link.find((l: any) => l["@_rel"] === "alternate")?.["@_href"]
          : item.link?.["@_href"];
    const url = safeUrl(link || "");
    const title = clean(item.title?.["#text"] ?? item.title);
    if (!url || !title) return [];
    const rawDate = item.pubDate || item.published || item.updated;
    const date = new Date(rawDate);
    if (!rawDate || Number.isNaN(date.getTime())) return [];
    const summary = clean(item.description || item.summary || "").slice(0, 280);
    const haystack = `${title} ${summary}`.toUpperCase();
    return [
      {
        id: createHash("sha256").update(url).digest("hex").slice(0, 24),
        url,
        title: title.slice(0, 400),
        source,
        kind,
        publishedAt: date.toISOString(),
        fetchedAt: new Date().toISOString(),
        summary,
        symbols: instruments
          .filter(
            ([symbol, name]) =>
              new RegExp(`\\b${symbol}\\b`).test(haystack) ||
              haystack.includes(name.toUpperCase()),
          )
          .map((x) => x[0]),
        sentiment: sentiment(title),
      },
    ];
  });
}
export function storeArticles(db: DB, articles: Article[]) {
  let count = 0;
  transaction(db, () => {
    for (const a of articles)
      count += Number(
        db
          .prepare("INSERT OR IGNORE INTO articles VALUES(?,?,?,?,?,?,?,?,?,?)")
          .run(
            a.id,
            a.url,
            a.title,
            a.source,
            a.kind,
            a.publishedAt,
            a.fetchedAt,
            a.summary,
            JSON.stringify(a.symbols),
            a.sentiment,
          ).changes,
      );
  });
  return count;
}
export async function runJob(
  db: DB,
  provider: string,
  fn: () => Promise<number>,
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO jobs(id,provider,status,started_at) VALUES(?,?,?,?)",
  ).run(id, provider, "running", new Date().toISOString());
  try {
    const count = await fn();
    db.prepare("UPDATE jobs SET status=?,count=?,finished_at=? WHERE id=?").run(
      "success",
      count,
      new Date().toISOString(),
      id,
    );
    return { provider, status: "success", count };
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "Provider response did not match the expected schema"
        : e instanceof Error
          ? e.message
          : "Provider unavailable";
    db.prepare(
      "UPDATE jobs SET status=?,message=?,finished_at=? WHERE id=?",
    ).run("error", message.slice(0, 240), new Date().toISOString(), id);
    return { provider, status: "error", count: 0, message };
  }
}
export async function ingestNews(db: DB) {
  const results = [];
  for (const feed of feeds)
    results.push(
      await runJob(db, feed.name, async () =>
        storeArticles(
          db,
          await cached(db, `rss:${feed.id}`, 5 * 60_000, async () =>
            parseFeed(await fetchText(feed.url), feed.name, feed.kind),
          ),
        ),
      ),
    );
  return results;
}
export async function ingestReddit(db: DB) {
  return runJob(db, "Reddit", async () => {
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET)
      throw new Error(
        "Reddit requires an approved OAuth application. Set server credentials first.",
      );
    const userAgent =
      process.env.REDDIT_USER_AGENT || "hedgeway-personal-research/2.0";
    const auth = await json("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: "grant_type=client_credentials",
    });
    if (typeof auth.access_token !== "string")
      throw new Error("Reddit did not grant an access token");
    const posts = await cached<any>(db, "reddit:posts", 15 * 60_000, () =>
      json(
        "https://oauth.reddit.com/r/IndiaInvestments+IndianStockMarket/new?limit=50",
        {
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            "User-Agent": userAgent,
          },
        },
      ),
    );
    const children = z
      .array(
        z.object({
          data: z.object({
            id: z.string(),
            title: z.string(),
            permalink: z.string().startsWith("/r/"),
            created_utc: z.number(),
            subreddit: z.string(),
          }),
        }),
      )
      .parse(posts.data?.children);
    return storeArticles(
      db,
      children.map(({ data: p }) => ({
        id: `reddit-${p.id}`,
        title: p.title,
        url: `https://www.reddit.com${p.permalink}`,
        source: `r/${p.subreddit}`,
        kind: "forum",
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        summary:
          "Community discussion. Open the original thread for context; community opinion is not verified reporting.",
        symbols: instruments
          .filter((x) => new RegExp(`\\b${x[0]}\\b`, "i").test(p.title))
          .map((x) => x[0]),
        sentiment: sentiment(p.title),
      })),
    );
  });
}
export function getArticles(
  db: DB,
  query = "",
  kind = "",
  saved = false,
): Article[] {
  const terms = query
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 8)
    .map((x) => `"${x}"`)
    .join(" AND ");
  const clauses = [],
    args: string[] = [];
  if (terms) {
    clauses.push(
      "a.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)",
    );
    args.push(terms);
  }
  if (kind) {
    clauses.push("a.kind=?");
    args.push(kind);
  }
  if (saved) clauses.push("b.article_id IS NOT NULL");
  return rows<any>(
    db,
    `SELECT a.*,b.article_id AS saved FROM articles a LEFT JOIN bookmarks b ON b.article_id=a.id ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY a.published_at DESC LIMIT 150`,
    ...args,
  ).map((a) => ({
    id: a.id,
    title: a.title,
    url: a.canonical_url,
    source: a.source,
    kind: a.kind,
    publishedAt: a.published_at,
    fetchedAt: a.fetched_at,
    summary: a.summary,
    symbols: JSON.parse(a.symbols),
    sentiment: a.sentiment,
    saved: !!a.saved,
  }));
}
