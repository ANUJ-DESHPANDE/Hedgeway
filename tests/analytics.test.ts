import { describe, expect, it } from "vitest";
import { backtest, portfolio, sentiment, stress } from "../server/analytics.js";
import { demoCandles, demoHoldings, demoQuotes } from "./fixtures.js";
import type { Holding, Quote } from "../src/types.js";
const h: Holding = {
  symbol: "TEST",
  exchange: "NSE",
  quantity: 10,
  averagePrice: 100,
  sector: "Technology",
  source: "csv",
};
const q: Quote = {
  symbol: "TEST",
  exchange: "NSE",
  name: "Test",
  sector: "Technology",
  price: 120,
  previousClose: 110,
  change: 9.09,
  currency: "INR",
  source: "fixture",
  asOf: new Date().toISOString(),
};
describe("portfolio valuation", () => {
  it("values quantity and cost without inventing historical returns", () => {
    const p = portfolio([h], [q]);
    expect(p.value).toBe(1200);
    expect(p.invested).toBe(1000);
    expect(p.pnl).toBe(200);
    expect(p.returnPct).toBeCloseTo(20);
    expect(p.positions[0].weight).toBe(100);
  });
  it("does not match a quote from a different exchange", () =>
    expect(portfolio([h], [{ ...q, exchange: "BSE" }]).value).toBeNull());
  it("does not claim a total when a position is unpriced", () => {
    const p = portfolio([h, { ...h, symbol: "OTHER" }], [q]);
    expect(p.value).toBeNull();
    expect(p.pnl).toBeNull();
    expect(p.returnPct).toBeNull();
    expect(p.coverage).toBe(50);
  });
  it("returns an empty state for a new workspace", () => {
    const p = portfolio([], []);
    expect(p.value).toBeNull();
    expect(p.returnPct).toBeNull();
    expect(p.coverage).toBe(0);
  });
  it("sector weights sum to 100 and HHI stays within bounds", () => {
    const p = portfolio(demoHoldings, demoQuotes);
    expect(p.sectors.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100);
    expect(p.concentration).toBeGreaterThan(0);
    expect(p.concentration).toBeLessThanOrEqual(1);
  });
  it("flags stale quotes and concentrated holdings", () => {
    const p = portfolio([h], [{ ...q, asOf: "2000-01-01" }]);
    expect(p.warnings.some((w) => w.includes("36 hours"))).toBe(true);
    expect(p.warnings.some((w) => w.includes("25%"))).toBe(true);
  });
  it("applies sector overrides before a global stress", () => {
    const result = stress(portfolio([h], [q]), { All: -10, Technology: -20 });
    expect(result[0].impact).toBe(-240);
  });
});
describe("strategy backtest", () => {
  it("rejects insufficient data", () =>
    expect(() => backtest(demoCandles().slice(0, 10), 30)).toThrow("at least"));
  it("rejects duplicate dates and invalid prices", () => {
    const c = demoCandles();
    expect(() => backtest([{ ...c[0], close: 0 }, ...c.slice(1)], 30)).toThrow(
      "positive",
    );
    expect(() => backtest([c[0], c[0], ...c.slice(2)], 30)).toThrow(
      "chronological",
    );
  });
  it("has zero returns and undefined Sharpe on flat prices", () => {
    const r = backtest(
      demoCandles().map((x) => ({ ...x, close: 100 })),
      30,
      10,
    );
    expect(r.metrics.returnPct).toBe(0);
    expect(r.metrics.maxDrawdown).toBe(0);
    expect(r.metrics.sharpe).toBeNull();
    expect(r.metrics.trades).toBe(0);
  });
  it("charges transaction costs", () => {
    const c = demoCandles();
    const free = backtest(c, 20, 0),
      costly = backtest(c, 20, 100);
    expect(costly.metrics.trades).toBeGreaterThan(0);
    expect(costly.metrics.returnPct).toBeLessThan(free.metrics.returnPct);
  });
  it("never changes past results when future prices change", () => {
    const c = demoCandles();
    const split = 100;
    const perturbed = c.map((p, i) =>
      i >= split ? { ...p, close: p.close * 3 } : p,
    );
    const a = backtest(c, 20),
      b = backtest(perturbed, 20);
    expect(a.curve.filter((x) => x.date < c[split].date)).toEqual(
      b.curve.filter((x) => x.date < c[split].date),
    );
  });
  it("uses a full-bar signal delay", () => {
    const c = demoCandles()
      .slice(0, 14)
      .map((p, i) => ({ ...p, close: i === 8 ? 1000 : 100 }));
    const r = backtest(c, 5, 0);
    const at = r.curve.find((x) => x.date === c[8].date)!;
    const next = r.curve.find((x) => x.date === c[9].date)!;
    expect(at.exposure).toBe(0);
    expect(next.exposure).toBe(0);
    expect(r.curve.find((x) => x.date === c[10].date)!.exposure).toBe(1);
  });
  it("reports non-positive drawdown and nonnegative tail-loss estimates", () => {
    const r = backtest(demoCandles());
    expect(r.metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(r.metrics.expectedShortfall95).toBeGreaterThanOrEqual(
      r.metrics.var95,
    );
  });
});
describe("headline lexicon", () => {
  it("recognises negation without treating it as ML confidence", () => {
    expect(sentiment("profit growth")).toBe(1);
    expect(sentiment("not strong growth")).toBe(-1);
    expect(sentiment("Company announces meeting")).toBe(0);
  });
});
