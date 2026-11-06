import type { Article, Candle, Holding, IPO, Quote } from "../src/types.js";
export const demoDate = "2026-10-30T10:00:00.000Z";
export const instruments = [
  ["RELIANCE", "Reliance Industries", "Energy", 1486.4, 1465.8],
  ["HDFCBANK", "HDFC Bank", "Financials", 987.5, 998.2],
  ["TCS", "Tata Consultancy Services", "Technology", 3248.8, 3205.4],
  ["INFY", "Infosys", "Technology", 1628.3, 1602.1],
  ["ICICIBANK", "ICICI Bank", "Financials", 1392.6, 1379.8],
  ["BHARTIARTL", "Bharti Airtel", "Telecom", 2018.7, 1992.4],
  ["LT", "Larsen & Toubro", "Industrials", 3721.5, 3744.2],
  ["ITC", "ITC", "Consumer staples", 423.6, 420.3],
  ["SUNPHARMA", "Sun Pharma", "Healthcare", 1764.2, 1752.6],
  ["TATAMOTORS", "Tata Motors", "Automobiles", 731.8, 743.4],
  ["NIFTYBEES", "Nippon India Nifty 50 ETF", "ETF", 278.4, 276.1],
  ["GOLDBEES", "Nippon India Gold ETF", "Gold", 91.2, 90.5],
] as const;
export function demoCandles(symbol = "NIFTYBEES"): Candle[] {
  let seed = [...symbol].reduce((s, c) => s + c.charCodeAt(0), 0);
  let price = 100;
  const rows: Candle[] = [];
  for (let i = 0; i < 420; i++) {
    const d = new Date(Date.UTC(2025, 2, 3 + i));
    if ([0, 6].includes(d.getUTCDay())) continue;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    price *= 1.0005 + (seed / 4294967296 - 0.49) * 0.035;
    rows.push({ date: d.toISOString().slice(0, 10), close: price });
  }
  return rows;
}
export const demoQuotes: Quote[] = instruments.map(
  ([symbol, name, sector, price, previousClose]) => ({
    symbol,
    name,
    sector,
    price,
    previousClose,
    change: (price / previousClose - 1) * 100,
    exchange: "NSE",
    currency: "INR",
    source: "Synthetic demo",
    asOf: demoDate,
    history: demoCandles(symbol)
      .slice(-24)
      .map((c) => c.close),
  }),
);
export const demoHoldings: Holding[] = [
  ["RELIANCE", 120, 1332],
  ["HDFCBANK", 180, 912],
  ["TCS", 35, 3120],
  ["INFY", 75, 1495],
  ["ICICIBANK", 90, 1280],
  ["BHARTIARTL", 45, 1850],
  ["NIFTYBEES", 250, 253],
  ["GOLDBEES", 450, 79],
].map(([symbol, quantity, averagePrice]) => ({
  symbol: String(symbol),
  quantity: Number(quantity),
  averagePrice: Number(averagePrice),
  exchange: "NSE",
  sector: demoQuotes.find((q) => q.symbol === symbol)!.sector,
  source: "demo",
}));
export const demoArticles: Article[] = [
  [
    "What institutional demand can—and cannot—tell you about an IPO",
    "Hedgeway field notes",
    "guide",
    "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
    ["IPO"],
    "QIB subscriptions measure bidding interest, not guaranteed listing performance. Compare demand across days and verify the reporting timestamp.",
  ],
  [
    "Reading bank earnings beyond the headline profit number",
    "Research example",
    "article",
    "https://www.rbi.org.in/",
    ["HDFCBANK", "ICICIBANK"],
    "Illustrative research prompt: compare deposit growth, net interest margins and credit costs before forming a thesis.",
  ],
  [
    "The IT earnings checklist: demand, deal wins and margins",
    "Research example",
    "article",
    "https://www.nseindia.com/companies-listing/corporate-filings-financial-results",
    ["TCS", "INFY"],
    "Illustrative research prompt. This is not a current news report or a forecast.",
  ],
  [
    "How investors discuss portfolio concentration",
    "Forum discovery",
    "forum",
    "https://www.reddit.com/r/IndiaInvestments/",
    [],
    "Open the community or connect Reddit to ingest actual recent posts. This sample is not a scraped discussion.",
  ],
  [
    "Separate the commodity cycle from the company thesis",
    "Research example",
    "article",
    "https://forum.valuepickr.com/",
    ["RELIANCE"],
    "Illustrative research prompt: identify the assumptions that would invalidate your investment thesis.",
  ],
].map(([title, source, kind, url, symbols, summary], i) => ({
  id: `demo-${i}`,
  title: String(title),
  source: String(source),
  kind: String(kind),
  url: String(url),
  symbols: symbols as string[],
  summary: String(summary),
  publishedAt: demoDate,
  fetchedAt: demoDate,
  sentiment: 0,
}));
export const demoIPOs: IPO[] = [
  [
    "demo-a",
    "Aster Precision Components",
    "MAINBOARD",
    "OPEN",
    284,
    300,
    50,
    1240,
    42,
    18.7,
  ],
  [
    "demo-b",
    "Northstar Renewable Systems",
    "MAINBOARD",
    "UPCOMING",
    410,
    432,
    34,
    2160,
    null,
    null,
  ],
  [
    "demo-c",
    "Meridian Logistics",
    "SME",
    "CLOSED",
    112,
    118,
    1200,
    96,
    8,
    43.2,
  ],
].map(
  (
    [
      slug,
      name,
      board,
      status,
      priceMin,
      priceMax,
      lotSize,
      issueSizeCr,
      lastGmp,
      lastSubX,
    ],
    i,
  ) => ({
    slug: String(slug),
    name: String(name),
    board: String(board),
    status: String(status),
    priceMin: Number(priceMin),
    priceMax: Number(priceMax),
    lotSize: Number(lotSize),
    issueSizeCr: Number(issueSizeCr),
    lastGmp: lastGmp === null ? null : Number(lastGmp),
    lastSubX: lastSubX === null ? null : Number(lastSubX),
    gmpDisputed: i === 2,
    source: "Fictional demo companies",
    asOf: demoDate,
    disclaimer:
      "Fictional examples, not real offerings. GMP is unofficial and does not predict listing returns.",
    openDate: "2026-10-28",
    closeDate: "2026-10-30",
    subs:
      i === 1
        ? []
        : [
            { category: "QIB", timesSub: 26.4 },
            { category: "NII", timesSub: 19.8 },
            { category: "RETAIL", timesSub: 8.2 },
          ],
    gmp:
      i === 1
        ? []
        : [
            { observedAt: "2026-10-27", gmp: 28 },
            { observedAt: "2026-10-28", gmp: 35 },
            { observedAt: "2026-10-29", gmp: 38 },
            { observedAt: "2026-10-30", gmp: 42 },
          ],
  }),
);
