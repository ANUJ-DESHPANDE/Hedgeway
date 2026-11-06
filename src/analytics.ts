import type { Candle, Holding, LabResult, Portfolio, Quote } from "./types.js";
export function portfolio(holdings: Holding[], quotes: Quote[]): Portfolio {
  const lookup = new Map(quotes.map((q) => [`${q.exchange}:${q.symbol}`, q]));
  const positions = holdings.map((h) => {
    const q = lookup.get(`${h.exchange}:${h.symbol}`);
    const invested = h.quantity * h.averagePrice;
    return {
      ...h,
      price: q?.price ?? null,
      value: q ? h.quantity * q.price : null,
      invested,
      pnl: q ? h.quantity * q.price - invested : null,
      weight: 0,
      asOf: q?.asOf ?? null,
    };
  });
  const priced = positions.filter((p) => p.value !== null),
    total = priced.reduce((s, p) => s + p.value!, 0),
    invested = positions.reduce((s, p) => s + p.invested, 0);
  for (const p of positions)
    p.weight = total && p.value !== null ? (p.value / total) * 100 : 0;
  const groups = new Map<string, number>();
  for (const p of priced)
    groups.set(p.sector, (groups.get(p.sector) || 0) + p.value!);
  const sectors = [...groups]
    .map(([name, value]) => ({
      name,
      value,
      weight: total ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const complete = positions.length > 0 && priced.length === positions.length;
  const warnings = [];
  if (!complete && positions.length)
    warnings.push(
      "Some holdings have no quote. Totals are unavailable until every position is priced.",
    );
  if (sectors[0]?.weight > 40)
    warnings.push(
      `${sectors[0].name} represents ${sectors[0].weight.toFixed(1)}% of priced holdings.`,
    );
  if (positions.some((p) => p.weight > 25))
    warnings.push(
      "At least one holding exceeds 25% of priced portfolio value.",
    );
  if (quotes.some((q) => Date.now() - Date.parse(q.asOf) > 36 * 3600_000))
    warnings.push("One or more quotes are over 36 hours old.");
  return {
    positions,
    invested,
    value: complete ? total : null,
    pnl: complete ? total - invested : null,
    returnPct: complete && invested ? (total / invested - 1) * 100 : null,
    coverage: positions.length ? (priced.length / positions.length) * 100 : 0,
    sectors,
    concentration: positions.reduce((s, p) => s + (p.weight / 100) ** 2, 0),
    warnings,
  };
}
export const mean = (a: number[]) =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
export const deviation = (a: number[]) =>
  a.length > 1
    ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1))
    : 0;
export function backtest(
  candles: Candle[],
  lookback = 30,
  costBps = 10,
  riskFree = 0.06,
): LabResult {
  if (candles.length < lookback + 3)
    throw new Error(`Need at least ${lookback + 3} daily prices.`);
  if (
    candles.some(
      (c, i) =>
        !Number.isFinite(c.close) ||
        c.close <= 0 ||
        (i > 0 && c.date <= candles[i - 1].date),
    )
  )
    throw new Error(
      "Prices must be positive, finite and strictly chronological.",
    );
  let strategy = 100,
    benchmark = 100,
    peak = 100,
    held = 0,
    trades = 0;
  const returns: number[] = [];
  const curve = [
    {
      date: candles[lookback].date,
      strategy,
      benchmark,
      drawdown: 0,
      exposure: 0,
    },
  ];
  // Decide using data through t-2, execute at t-1 close, earn t-1 -> t return.
  // This full-bar delay avoids claiming execution at the same close used for the signal.
  for (let i = lookback + 1; i < candles.length; i++) {
    const signalIndex = i - 2;
    const average = mean(
      candles
        .slice(signalIndex - lookback + 1, signalIndex + 1)
        .map((c) => c.close),
    );
    const desired = candles[signalIndex].close > average ? 1 : 0;
    const turnover = Math.abs(desired - held);
    trades += turnover;
    const r = candles[i].close / candles[i - 1].close - 1;
    const net = (1 - (turnover * costBps) / 10000) * (1 + desired * r) - 1;
    strategy *= 1 + net;
    benchmark *= 1 + r;
    peak = Math.max(peak, strategy);
    held = desired;
    returns.push(net);
    curve.push({
      date: candles[i].date,
      strategy,
      benchmark,
      drawdown: (strategy / peak - 1) * 100,
      exposure: held,
    });
  }
  const sorted = [...returns].sort((a, b) => a - b),
    tail = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.05))),
    sd = deviation(returns);
  return {
    curve,
    metrics: {
      returnPct: strategy - 100,
      cagr: ((strategy / 100) ** (252 / returns.length) - 1) * 100,
      volatility: sd * Math.sqrt(252) * 100,
      sharpe: sd
        ? ((mean(returns) - riskFree / 252) / sd) * Math.sqrt(252)
        : null,
      maxDrawdown: Math.min(...curve.map((c) => c.drawdown)),
      var95: Math.max(0, -sorted[Math.floor((sorted.length - 1) * 0.05)] * 100),
      expectedShortfall95: Math.max(0, -mean(tail) * 100),
      trades,
      benchmarkReturn: benchmark - 100,
    },
    assumptions: [
      "Long/cash moving-average strategy; signal delayed one full bar before returns accrue.",
      "252 trading days; cash earns 0%; annual risk-free rate 6% for Sharpe.",
      `${costBps} bps per entry/exit; no leverage. Slippage, taxes and liquidity constraints are not modeled.`,
      "Buy-and-hold benchmark is gross of costs. Last position is marked to market, not liquidated.",
      "Single selected security; not a portfolio performance record. Unadjusted inputs can be distorted by corporate actions.",
    ],
  };
}
export function stress(portfolio: Portfolio, shocks: Record<string, number>) {
  return portfolio.positions.map((p) => ({
    ...p,
    shock: shocks[p.sector] ?? shocks.All ?? 0,
    impact:
      p.value === null
        ? null
        : (p.value * (shocks[p.sector] ?? shocks.All ?? 0)) / 100,
  }));
}
const positive = new Set([
  "growth",
  "grows",
  "profit",
  "profits",
  "gain",
  "gains",
  "surge",
  "surges",
  "beat",
  "beats",
  "upgrade",
  "record",
  "rally",
  "wins",
  "strong",
]);
const negative = new Set([
  "loss",
  "losses",
  "fall",
  "falls",
  "fraud",
  "cut",
  "cuts",
  "downgrade",
  "weak",
  "decline",
  "slump",
  "crash",
  "risk",
  "risks",
  "debt",
]);
export function sentiment(text: string) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  let score = 0,
    hits = 0;
  for (let i = 0; i < words.length; i++) {
    let v = positive.has(words[i]) ? 1 : negative.has(words[i]) ? -1 : 0;
    if (v) {
      if (
        words
          .slice(Math.max(0, i - 3), i)
          .some((w) => ["not", "no", "never"].includes(w))
      )
        v *= -1;
      score += v;
      hits++;
    }
  }
  return hits ? score / hits : 0;
}
