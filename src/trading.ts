export type IntradayBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type SetupParameters = {
  barMinutes: 1 | 3 | 5;
  lookback: number;
  confirmationBars: number;
  minDipPct: number;
  minReboundPct: number;
  minVolumeRatio: number;
  costBps: number;
  capital: number;
  riskBudget: number;
};
export const defaultSetup: SetupParameters = {
  barMinutes: 1,
  lookback: 20,
  confirmationBars: 2,
  minDipPct: 0.15,
  minReboundPct: 0.1,
  minVolumeRatio: 1.1,
  costBps: 10,
  capital: 10000,
  riskBudget: 100,
};
export type SetupCheck = { label: string; passed: boolean; detail: string };
const average = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const session = (time: string) =>
  new Date(Date.parse(time) + 330 * 60000).toISOString().slice(0, 10);
export function analyzeSetup(
  input: IntradayBar[],
  p: SetupParameters,
  now = Date.now(),
) {
  const duration = p.barMinutes * 60000;
  const closed = input
    .filter((b) => Date.parse(b.time) + duration <= now)
    .sort((a, b) => a.time.localeCompare(b.time));
  const last = closed.at(-1);
  const bars = last
    ? closed.filter((b) => session(b.time) === session(last.time))
    : [];
  const required = Math.max(p.lookback + 6, 16, p.confirmationBars + 2);
  const base = {
    parameters: p,
    bars: bars.slice(-Math.max(p.lookback * 2, 80)),
    asOf: last
      ? new Date(Date.parse(last.time) + duration).toISOString()
      : null,
    session: last ? session(last.time) : null,
  };
  if (bars.length < required)
    return {
      ...base,
      state: "insufficient_data" as const,
      summary: `Need ${required} completed bars from one trading session; ${bars.length} available.`,
      checks: [] as SetupCheck[],
      metrics: null,
      plan: null,
    };
  const end = bars.length - 1,
    current = bars[end];
  const history = bars.slice(end - p.lookback, end);
  const mean = average(history.map((b) => b.close));
  const earlierMean = average(
    bars.slice(end - p.lookback - 5, end - 5).map((b) => b.close),
  );
  const meanSlopePct = (mean / earlierMean - 1) * 100;
  const recent = bars.slice(-Math.max(5, p.confirmationBars + 1));
  const recentLow = Math.min(...recent.map((b) => b.low));
  const belowMeanPct = ((mean - current.close) / mean) * 100;
  const reboundPct = (current.close / recentLow - 1) * 100;
  const avgVolume = average(history.map((b) => b.volume));
  const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : null;
  const atr = average(
    bars.slice(-14).map((b, i) => {
      const previous = bars[bars.length - 15 + i].close;
      return Math.max(
        b.high - b.low,
        Math.abs(b.high - previous),
        Math.abs(b.low - previous),
      );
    }),
  );
  const confirming = bars.slice(-(p.confirmationBars + 1));
  const higherCloses = confirming
    .slice(1)
    .every((b, i) => b.close > confirming[i].close);
  const higherLow = current.low > bars[end - 1].low;
  const fresh =
    now - (Date.parse(current.time) + duration) <=
    Math.max(90000, duration * 2);
  const continuous = bars
    .slice(-required)
    .every(
      (b, i, a) =>
        i === 0 || Date.parse(b.time) - Date.parse(a[i - 1].time) === duration,
    );
  const costsPerShare = ((current.close * p.costBps) / 10000) * 2;
  const stop = recentLow - atr * 0.25;
  const riskPerShare = current.close - stop + costsPerShare;
  const rewardPerShare = mean - current.close - costsPerShare;
  const quantity =
    riskPerShare > 0
      ? Math.max(
          0,
          Math.min(
            Math.floor(p.capital / current.close),
            Math.floor(p.riskBudget / riskPerShare),
          ),
        )
      : 0;
  const checks: SetupCheck[] = [
    {
      label: "Below recent average",
      passed: belowMeanPct >= p.minDipPct,
      detail: `${belowMeanPct.toFixed(2)}% below the previous ${p.lookback} bars; minimum ${p.minDipPct}%.`,
    },
    {
      label: "Rebound from recent low",
      passed: reboundPct >= p.minReboundPct,
      detail: `${reboundPct.toFixed(2)}% above the recent low; minimum ${p.minReboundPct}%.`,
    },
    {
      label: "Upward confirmation",
      passed: higherCloses && higherLow,
      detail: `Requires ${p.confirmationBars} consecutive rising closes and a higher last-bar low.`,
    },
    {
      label: "Volume participation",
      passed: volumeRatio !== null && volumeRatio >= p.minVolumeRatio,
      detail:
        volumeRatio === null
          ? "Volume comparison is unavailable."
          : `${volumeRatio.toFixed(2)}× recent average; minimum ${p.minVolumeRatio}×.`,
    },
    {
      label: "Avoid a fast-falling average",
      passed: meanSlopePct >= -0.5,
      detail: `Average changed ${meanSlopePct.toFixed(2)}% over five bars; floor −0.50%.`,
    },
    {
      label: "Room after estimated costs",
      passed: rewardPerShare > 0 && riskPerShare > 0 && quantity > 0,
      detail:
        "A return to the average must exceed the estimated round-trip costs and fit the entered risk budget.",
    },
    {
      label: "Complete, recent bars",
      passed: fresh && continuous,
      detail: !fresh
        ? "These bars are historical or stale; not a current setup."
        : !continuous
          ? "There are gaps in the recent bars; wait for complete data."
          : "Completed bars are recent and continuous.",
    },
  ];
  const met = checks.every((c) => c.passed);
  return {
    ...base,
    state: !fresh
      ? ("stale" as const)
      : met
        ? ("conditions_met" as const)
        : ("wait" as const),
    summary: !fresh
      ? "Historical view — refresh during market hours."
      : met
        ? "Your conditions are met. Review costs, news and execution risk before deciding."
        : "Wait — some of your conditions are not met.",
    checks,
    metrics: {
      price: current.close,
      mean,
      belowMeanPct,
      reboundPct,
      volumeRatio,
      atr,
      meanSlopePct,
      vwap: bars.some((b) => b.volume > 0)
        ? bars.reduce(
            (s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume,
            0,
          ) / bars.reduce((s, b) => s + b.volume, 0)
        : null,
    },
    plan:
      rewardPerShare > 0 && riskPerShare > 0
        ? {
            entry: current.close,
            target: mean,
            stop,
            quantity,
            estimatedCosts: costsPerShare * quantity,
            risk: quantity * riskPerShare,
            reward: quantity * rewardPerShare,
            rewardToRisk: rewardPerShare / riskPerShare,
          }
        : null,
  };
}
export type SetupAnalysis = ReturnType<typeof analyzeSetup>;
