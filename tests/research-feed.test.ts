import { afterEach, expect, it } from "vitest";
import { openDatabase } from "../server/db/index";
import { getResearchFeed, storeArticles } from "../server/providers/research";
const db = openDatabase(":memory:");
afterEach(() => db.prepare("DELETE FROM articles").run());
function article(id: string, source: string, time: string, kind = "article") {
  return {
    id,
    title: `Market update ${id}`,
    url: `https://example.com/${id}`,
    source,
    kind,
    publishedAt: time,
    fetchedAt: time,
    summary: "Source excerpt",
    symbols: ["INFY"],
    sentiment: 0,
  };
}
it("keeps reporting and community visible when corporate disclosures flood the feed", () => {
  storeArticles(
    db,
    Array.from({ length: 160 }, (_, i) =>
      article(
        `filing-${i}`,
        "NSE corporate disclosures",
        "2026-11-13T10:00:00Z",
      ),
    ),
  );
  storeArticles(db, [
    article("story", "Mint Markets", "2026-11-13T09:00:00Z"),
    article("discussion", "TradingQnA", "2026-11-13T08:00:00Z", "forum"),
  ]);
  const items = getResearchFeed(db);
  expect(items.slice(0, 4).map((a) => a.id)).toContain("story");
  expect(items.slice(0, 4).map((a) => a.id)).toContain("discussion");
  expect(new Set(items.map((a) => a.id)).size).toBe(items.length);
});
it("preserves explicit filters and does not insert unrelated stories into search", () => {
  storeArticles(db, [
    article("story", "Mint Markets", "2026-11-13T09:00:00Z"),
    article("filing", "NSE corporate disclosures", "2026-11-13T10:00:00Z"),
  ]);
  expect(getResearchFeed(db, "", "official").map((a) => a.id)).toEqual([
    "filing",
  ]);
  expect(getResearchFeed(db, "unmatched")).toEqual([]);
});
