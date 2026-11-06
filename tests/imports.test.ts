import { describe, expect, it } from "vitest";
import { openDatabase, rows } from "../server/db/index.js";
import {
  parseCandles,
  parseHoldings,
  saveHoldings,
} from "../server/imports.js";
const csv =
  "symbol,exchange,quantity,averagePrice,sector\nINFY,NSE,10,1500,Technology";
describe("holdings CSV", () => {
  it("parses documented format", () =>
    expect(parseHoldings(csv)[0]).toMatchObject({
      symbol: "INFY",
      quantity: 10,
      averagePrice: 1500,
    }));
  it("parses common Kite headers and quoted thousands separators", () =>
    expect(
      parseHoldings('Instrument,Qty.,Avg. cost\nINFY,10,"1,500.50"')[0]
        .averagePrice,
    ).toBe(1500.5));
  it("rejects duplicate keys", () =>
    expect(() => parseHoldings(csv + "\nINFY,NSE,2,1600,Technology")).toThrow(
      "Duplicate",
    ));
  it.each(["-1", "0", "NaN", "Infinity", "abc"])(
    "rejects invalid quantity %s",
    (qty) =>
      expect(() => parseHoldings(csv.replace(",10,", `,${qty},`))).toThrow(),
  );
  it("rejects unsupported exchanges", () =>
    expect(() => parseHoldings(csv.replace("NSE", "NASDAQ"))).toThrow());
  it("rejects formula-like symbols", () =>
    expect(() => parseHoldings(csv.replace("INFY", "=WEBSERVICE"))).toThrow());
  it("does not pollute prototypes through CSV headers", () => {
    expect(() =>
      parseHoldings("__proto__,constructor,quantity,averagePrice\nfoo,bar,1,2"),
    ).toThrow();
    expect(({} as any).polluted).toBeUndefined();
  });
  it("upserts the exact exchange/symbol and preserves other holdings", () => {
    const db = openDatabase(":memory:");
    try {
      saveHoldings(db, parseHoldings(csv));
      saveHoldings(db, parseHoldings(csv.replace("INFY", "TCS")));
      saveHoldings(db, parseHoldings(csv.replace(",10,", ",20,")));
      const h = rows<any>(db, "SELECT * FROM holdings ORDER BY symbol");
      expect(h.length).toBe(2);
      expect(h[0].quantity).toBe(20);
    } finally {
      db.close();
    }
  });
  it("rolls back an entire import on constraint failure", () => {
    const db = openDatabase(":memory:");
    try {
      expect(() =>
        saveHoldings(db, [
          ...parseHoldings(csv),
          { ...parseHoldings(csv)[0], symbol: "BAD", quantity: -1 },
        ]),
      ).toThrow();
      expect(rows(db, "SELECT * FROM holdings")).toHaveLength(0);
    } finally {
      db.close();
    }
  });
});
describe("daily candles", () => {
  it("sorts valid daily dates", () =>
    expect(
      parseCandles("date,close\n2025-01-02,120\n2025-01-01,100")[0].close,
    ).toBe(100));
  it("rejects duplicate dates", () =>
    expect(() =>
      parseCandles("date,close\n2025-01-01,100\n2025-01-01,120"),
    ).toThrow("Duplicate"));
  it("rejects impossible calendar dates", () =>
    expect(() => parseCandles("date,close\n2025-02-30,100")).toThrow());
});
