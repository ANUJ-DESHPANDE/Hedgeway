export type Mode = "workspace";
export type Quote = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  price: number;
  previousClose: number;
  change: number;
  currency: string;
  asOf: string;
  source: string;
  history?: number[];
};
export type Holding = {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  sector: string;
  source: string;
};
export type Position = Holding & {
  price: number | null;
  value: number | null;
  invested: number;
  pnl: number | null;
  weight: number;
  asOf: string | null;
};
export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  kind: string;
  publishedAt: string;
  fetchedAt: string;
  summary: string;
  symbols: string[];
  sentiment: number;
  saved?: boolean;
};
export type IPO = {
  detailsAsOf?: string;
  slug: string;
  name: string;
  board: string;
  status: string;
  priceMin: number | null;
  priceMax: number | null;
  lotSize: number | null;
  issueSizeCr: number | null;
  openDate: string | null;
  closeDate: string | null;
  lastGmp: number | null;
  lastSubX: number | null;
  gmpDisputed: boolean;
  source: string;
  asOf: string;
  disclaimer: string;
  subs?: { category: string; timesSub: number | null }[];
  gmp?: { observedAt: string; gmp: number | null }[];
};
export type Candle = { date: string; close: number };
export type Note = {
  id: string;
  symbol: string;
  thesis: string;
  risk: string;
  catalyst: string;
  updated_at: string;
};
export type Alert = {
  id: string;
  symbol: string;
  direction: "above" | "below";
  target: number;
  triggered_at: string | null;
  created_at: string;
};
export type Job = {
  id: string;
  provider: string;
  status: string;
  count: number;
  message: string;
  started_at: string;
  finished_at: string | null;
};
export type Portfolio = {
  positions: Position[];
  invested: number;
  value: number | null;
  pnl: number | null;
  returnPct: number | null;
  coverage: number;
  sectors: { name: string; value: number; weight: number }[];
  concentration: number;
  warnings: string[];
};
export type LabResult = {
  curve: {
    date: string;
    strategy: number;
    benchmark: number;
    drawdown: number;
    exposure: number;
  }[];
  metrics: {
    returnPct: number;
    cagr: number;
    volatility: number;
    sharpe: number | null;
    maxDrawdown: number;
    var95: number;
    expectedShortfall95: number;
    trades: number;
    benchmarkReturn: number;
  };
  assumptions: string[];
};
