import { describe, expect, it } from "vitest";
import { analyzeSetup, defaultSetup, type IntradayBar } from "../src/trading";
import { normalizeIntraday } from "../server/providers/intraday";
const start = Date.parse("2026-11-06T04:00:00Z");
function candles(): IntradayBar[] {
  return Array.from({ length: 30 }, (_, i) => ({
    time: new Date(start + i * 60000).toISOString(),
    open: i < 27 ? 100 : i === 27 ? 99.1 : i === 28 ? 99.2 : 99.3,
    high: i < 27 ? 100.2 : i === 27 ? 99.2 : i === 28 ? 99.25 : 99.35,
    low: i < 27 ? 99.8 : i === 27 ? 98.9 : i === 28 ? 99.05 : 99.15,
    close: i < 27 ? 100 : i === 27 ? 99.1 : i === 28 ? 99.2 : 99.3,
    volume: i === 29 ? 250 : 100,
  }));
}
const now = start + 30 * 60000 + 10000;
describe("intraday decision checklist", () => {
  it("recognizes a configured dip, confirmed rebound and volume without a predictive score", () => {
    const r = analyzeSetup(candles(), defaultSetup, now);
    expect(r.state).toBe("conditions_met");
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.metrics!.mean).toBeCloseTo(99.915);
    expect(r.plan!.risk).toBeLessThanOrEqual(defaultSetup.riskBudget);
    expect(r.plan!.quantity * r.plan!.entry).toBeLessThanOrEqual(
      defaultSetup.capital,
    );
    expect(r).not.toHaveProperty("probability");
  });
  it("excludes an unfinished candle and future bars from every signal", () => {
    const before = analyzeSetup(candles(), defaultSetup, now);
    const extra = [
      ...candles(),
      {
        ...candles()[0],
        time: new Date(start + 30 * 60000).toISOString(),
        close: 10000,
        high: 11000,
      },
    ];
    const after = analyzeSetup(extra, defaultSetup, now);
    expect(after).toEqual(before);
  });
  it("refuses to treat yesterday’s bars as a current setup", () =>
    expect(analyzeSetup(candles(), defaultSetup, now + 86400000).state).toBe(
      "stale",
    ));
  it("does not bridge missing bars as a continuous recent window", () => {
    const rows = candles();
    rows.splice(12, 1);
    const r = analyzeSetup(rows, defaultSetup, now);
    expect(r.state).toBe("wait");
    expect(
      r.checks.find((c) => c.label === "Complete, recent bars")!.passed,
    ).toBe(false);
  });
  it("does not use a previous session to fill a short current-session window", () => {
    const next = candles()
      .slice(0, 3)
      .map((b) => ({
        ...b,
        time: new Date(Date.parse(b.time) + 86400000).toISOString(),
      }));
    expect(
      analyzeSetup([...candles(), ...next], defaultSetup, now + 86400000).state,
    ).toBe("insufficient_data");
  });
  it("reports missing volume measures instead of inventing a zero VWAP", () => {
    const r = analyzeSetup(
      candles().map((b) => ({ ...b, volume: 0 })),
      defaultSetup,
      now,
    );
    expect(r.metrics!.volumeRatio).toBeNull();
    expect(r.metrics!.vwap).toBeNull();
    expect(r.state).toBe("wait");
  });
  it("rejects a setup whose estimated costs consume the mean-reversion upside", () => {
    const r = analyzeSetup(candles(), { ...defaultSetup, costBps: 100 }, now);
    expect(r.state).toBe("wait");
    expect(r.plan).toBeNull();
  });
  it("normalizes time zones and rejects inconsistent provider OHLC values", () => {
    expect(
      normalizeIntraday([
        ["2026-11-06T09:30:00+05:30", 100, 101, 99, 100, 20, 0],
      ])[0].time,
    ).toBe("2026-11-06T04:00:00.000Z");
    expect(() =>
      normalizeIntraday([["2026-11-06T09:30:00+05:30", 100, 99, 99, 100, 20]]),
    ).toThrow("inconsistent");
  });
});
