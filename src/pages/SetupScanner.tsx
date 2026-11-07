import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, ScanLine, Sparkles, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, money, number, post, timestamp } from "../api";
import {
  defaultSetup,
  type SetupAnalysis,
  type SetupParameters,
} from "../trading";
import type { Page } from "../navigation";
import { Empty, Panel, Stat, tooltipStyle } from "../ui";
type Result = SetupAnalysis & {
  id: string;
  symbol: string;
  exchange: string;
  source: string;
  fetchedAt: string;
  createdAt: string;
  error?: string;
};
export default function SetupScanner({
  watch,
  connected,
  go,
  discuss,
}: {
  watch: string[];
  connected: boolean;
  go: (page: Page) => void;
  discuss: (symbol: string) => void;
}) {
  const [symbol, setSymbol] = useState(watch[0]?.split(":")[1] || "INFY"),
    [exchange, setExchange] = useState(watch[0]?.split(":")[0] || "NSE"),
    [parameters, setParameters] = useState<SetupParameters>(defaultSetup),
    [scanWatch, setScanWatch] = useState(false),
    [results, setResults] = useState<Result[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [auto, setAuto] = useState(false),
    [history, setHistory] = useState<Result[]>([]);
  const pending = useRef(false),
    runRef = useRef<() => void>(() => {});
  const update = (key: keyof SetupParameters, value: number) =>
    setParameters((p) => ({ ...p, [key]: value }));
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const symbols = scanWatch
        ? watch.slice(0, 8).map((id) => {
            const [exchange, symbol] = id.split(":");
            return { exchange, symbol };
          })
        : [{ symbol, exchange }];
      setResults(await post("/scanner", { symbols, parameters }));
      setHistory(await api("/scanner/history"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  runRef.current = () => void refresh();
  useEffect(() => {
    api<Result[]>("/scanner/history")
      .then(setHistory)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!auto || !connected) return;
    const timer = setInterval(() => {
      if (!document.hidden) runRef.current();
    }, 60000);
    return () => clearInterval(timer);
  }, [auto, connected]);
  return (
    <>
      <Panel
        title="Your dip-and-rebound checklist"
        sub="Look for a price below its recent average, then check whether the rebound has supporting evidence."
      >
        <form
          className="scanner-form"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <div className="inline-form">
            <label className="grow">
              Trading symbol
              <input
                value={symbol}
                disabled={scanWatch}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                required
                pattern="[A-Z0-9&_.-]{1,30}"
              />
            </label>
            <label>
              Exchange
              <select
                value={exchange}
                disabled={scanWatch}
                onChange={(e) => setExchange(e.target.value)}
              >
                <option>NSE</option>
                <option>BSE</option>
              </select>
            </label>
            <label>
              Average window
              <input
                type="number"
                min={5}
                max={120}
                value={parameters.lookback}
                onChange={(e) => update("lookback", Number(e.target.value))}
                required
              />
            </label>
            <label>
              Candle size
              <select
                value={parameters.barMinutes}
                onChange={(e) => update("barMinutes", Number(e.target.value))}
              >
                <option value={1}>1 minute</option>
                <option value={3}>3 minutes</option>
                <option value={5}>5 minutes</option>
              </select>
            </label>
          </div>
          <p className="subtle">
            Your average covers {parameters.lookback * parameters.barMinutes}{" "}
            minutes of completed candles from one session. The latest candle is
            not used in its own comparison average.
          </p>
          <div className="button-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={scanWatch}
                disabled={!watch.length}
                onChange={(e) => setScanWatch(e.target.checked)}
              />
              Scan my watchlist · first 8 instruments
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={auto}
                disabled={!connected}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Refresh every minute while this tab is visible
            </label>
          </div>
          <details className="disclosure compact">
            <summary>Confirmation rules & position-size assumptions</summary>
            <div className="settings-grid">
              {(
                [
                  ["minDipPct", "Minimum dip below average · %", 0, 10, 0.05],
                  [
                    "minReboundPct",
                    "Minimum rebound from low · %",
                    0,
                    10,
                    0.05,
                  ],
                  ["confirmationBars", "Consecutive rising closes", 2, 5, 1],
                  [
                    "minVolumeRatio",
                    "Volume vs recent average · ×",
                    0,
                    10,
                    0.1,
                  ],
                  [
                    "costBps",
                    "Fees + slippage per side · basis points",
                    0,
                    200,
                    1,
                  ],
                  ["capital", "Illustrative capital limit · ₹", 1, 1e9, 1],
                  ["riskBudget", "Illustrative loss budget · ₹", 1, 1e7, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    required
                    value={parameters[key]}
                    onChange={(e) => update(key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <p className="subtle">
              10 basis points = 0.10% per side. Position sizing includes both
              sides’ estimated costs. Actual fills, gaps and slippage can exceed
              these assumptions.
            </p>
          </details>
          {!connected && (
            <p className="notice">
              Connect a live-data provider to load real intraday candles.{" "}
              <button type="button" onClick={() => go("Integrations")}>
                Connect prices
              </button>
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !connected || (scanWatch && !watch.length)}
          >
            {busy ? (
              <RefreshCw size={16} className="spin" />
            ) : (
              <ScanLine size={16} />
            )}{" "}
            {busy ? "Checking completed candles…" : "Check my setup"}
          </button>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
        </form>
      </Panel>
      {results.map((result) =>
        result.error ? (
          <Panel
            key={`${result.exchange}:${result.symbol}`}
            title={`${result.exchange}:${result.symbol}`}
          >
            <p className="error-box">{result.error}</p>
          </Panel>
        ) : (
          <SetupResult key={result.id} result={result} discuss={discuss} />
        ),
      )}
      {!results.length && (
        <Empty
          title="A checklist, before a decision"
          detail="The scanner checks the dip, rebound, higher closes, volume and room after costs. Passing the checklist is not evidence of a profitable strategy."
        />
      )}
      {history.length > 0 && (
        <details className="disclosure">
          <summary>Recent scans · review what the data showed</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Instrument</th>
                  <th>Outcome</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{timestamp(r.createdAt)}</td>
                    <td>
                      {r.exchange}:{r.symbol}
                    </td>
                    <td>{r.state.replaceAll("_", " ")}</td>
                    <td>
                      <button
                        onClick={() =>
                          setResults([
                            r.metrics
                              ? {
                                  ...r,
                                  state: "stale",
                                  summary:
                                    "Saved historical scan — rerun to check the current conditions.",
                                }
                              : r,
                          ])
                        }
                      >
                        Open saved scan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
function SetupResult({
  result: original,
  discuss,
}: {
  result: Result;
  discuss: (symbol: string) => void;
}) {
  const historical =
    original.asOf &&
    Date.now() - Date.parse(original.asOf) >
      Math.max(90000, original.parameters.barMinutes * 120000);
  const r = historical
    ? {
        ...original,
        state: "stale" as const,
        summary: "Historical view — these candles are no longer current.",
      }
    : original;
  const series = r.bars.map((b, i, a) => ({
    time: b.time,
    price: b.close,
    mean:
      i >= r.parameters.lookback
        ? a
            .slice(i - r.parameters.lookback, i)
            .reduce((s, x) => s + x.close, 0) / r.parameters.lookback
        : null,
  }));
  return (
    <Panel
      title={`${r.exchange}:${r.symbol}`}
      sub={`${r.source} · last completed candle ${timestamp(r.asOf)}`}
      action={
        <span
          className={`tag ${r.state === "conditions_met" ? "green" : r.state === "stale" ? "amber" : ""}`}
        >
          {r.state === "conditions_met"
            ? "CONDITIONS MET"
            : r.state === "stale"
              ? "HISTORICAL"
              : r.state === "wait"
                ? "WAIT"
                : "MORE DATA NEEDED"}
        </span>
      }
    >
      <div className="scanner-result">
        <p className="setup-summary">{r.summary}</p>
        {r.metrics && (
          <>
            <div className="stats-grid">
              <Stat
                label="LAST COMPLETED CLOSE"
                value={money(r.metrics.price, 2)}
              />
              <Stat label="RECENT AVERAGE" value={money(r.metrics.mean, 2)} />
              <Stat
                label="BELOW AVERAGE"
                value={`${number(r.metrics.belowMeanPct)}%`}
              />
              <Stat
                label="VOLUME PARTICIPATION"
                value={
                  r.metrics.volumeRatio === null
                    ? "Unavailable"
                    : `${number(r.metrics.volumeRatio)}×`
                }
              />
            </div>
            <div className="chart small-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Kolkata",
                      })
                    }
                    minTickGap={50}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    tickFormatter={(v) => number(v, 1)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => timestamp(String(v))}
                  />
                  <Line
                    dataKey="price"
                    name="Completed close"
                    stroke="var(--accent)"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    dataKey="mean"
                    name="Prior-bar average"
                    stroke="#89b5ec"
                    dot={false}
                    strokeDasharray="4 4"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        <ul className="setup-checks">
          {r.checks.map((c) => (
            <li key={c.label}>
              <span className={c.passed ? "positive" : "muted"}>
                {c.passed ? <Check size={18} /> : <X size={18} />}
              </span>
              <div>
                <strong>{c.label}</strong>
                <p>{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {r.plan && (
          <details className="disclosure">
            <summary>Illustrative trade plan · not an order</summary>
            <p className="subtle">
              Uses the last completed close as a hypothetical entry, the recent
              low minus 0.25× ATR as a stop, and the prior-bar average as a
              target. These are assumptions to inspect, not predicted execution
              prices.
            </p>
            <div className="stats-grid">
              <Stat label="HYPOTHETICAL ENTRY" value={money(r.plan.entry, 2)} />
              <Stat
                label="RETURN-TO-MEAN TARGET"
                value={money(r.plan.target, 2)}
              />
              <Stat label="ILLUSTRATIVE STOP" value={money(r.plan.stop, 2)} />
              <Stat
                label="SIZE WITHIN YOUR LIMITS"
                value={`${r.plan.quantity} shares`}
              />
            </div>
            <p className="panel-note">
              Estimated downside ₹{number(r.plan.risk)} · Upside after costs ₹
              {number(r.plan.reward)} · Reward/risk{" "}
              {number(r.plan.rewardToRisk)}× · Estimated round-trip costs ₹
              {number(r.plan.estimatedCosts)}
            </p>
          </details>
        )}
        <div className="button-row">
          <button onClick={() => discuss(r.symbol)}>
            <Sparkles size={15} />
            Discuss this setup with AI
          </button>
          <span className="subtle">
            No orders are sent. Old scans remain historical, even when reviewed
            later.
          </span>
        </div>
      </div>
    </Panel>
  );
}
