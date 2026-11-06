import { Download, FlaskConical, RefreshCw, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { number, pct, post } from "../api";
import type { Page } from "../navigation";
import type { LabResult, Mode } from "../types";
import { Empty, Panel, Stat, tooltipStyle } from "../ui";
export default function Lab({
  mode,
  show,
  connected,
  go,
}: {
  mode: Mode;
  connected: boolean;
  go: (page: Page) => void;
  show: (s: string, e?: boolean) => void;
}) {
  const [symbol, setSymbol] = useState("NIFTYBEES"),
    [lookback, setLookback] = useState(30),
    [cost, setCost] = useState(10),
    [csv, setCSV] = useState(""),
    [filename, setFilename] = useState(""),
    [result, setResult] = useState<
      | (LabResult & {
          source: string;
          observations: number;
        })
      | null
    >(null),
    [busy, setBusy] = useState(false),
    [runLabel, setRunLabel] = useState(""),
    [runInput, setRunInput] = useState("");
  const currentInput = JSON.stringify({ symbol, lookback, cost, csv });
  useEffect(() => setResult(null), [mode]);
  const run = async () => {
    setBusy(true);
    try {
      const payload = await post(`/lab?mode=${mode}`, {
        symbol,
        lookback,
        costBps: cost,
        ...(csv ? { csv } : {}),
      });
      setResult(payload);
      setRunLabel(
        `${symbol} · ${lookback}-day average · ${(cost / 100).toFixed(2)}% per trade`,
      );
      setRunInput(currentInput);
    } catch (e) {
      show((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="notice">
        <span>
          This tests a simple rule: hold the stock when its price is above its
          moving average, otherwise hold cash. Compare it with buying and
          holding the same stock.
        </span>
      </div>
      {!connected && !csv && (
        <div className="notice">
          <span>
            Connect a price provider or upload daily prices to run a test.
          </span>
          <button onClick={() => go("Integrations")}>Connect prices</button>
        </div>
      )}
      <div className="lab-layout">
        <Panel
          title="Experiment setup"
          sub="Long / cash moving-average strategy"
        >
          <form
            className="lab-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label>
              NSE symbol
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                required
                pattern="[A-Z0-9&_.-]{1,30}"
              />
            </label>
            <details className="disclosure compact">
              <summary>
                Strategy settings · {lookback} days, {(cost / 100).toFixed(2)}%
                cost
              </summary>
              <label>
                Moving-average window{" "}
                <span className="label-hint">Trading days</span>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={lookback}
                  onChange={(e) => setLookback(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                Cost per entry / exit{" "}
                <span className="label-hint">
                  Basis points · 10 bps = 0.10%
                </span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                  required
                />
              </label>
            </details>
            <div className="file-input">
              <Upload size={16} />
              <label>
                Use your own daily prices
                <input
                  type="file"
                  accept=".csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 900000) {
                        show("Price CSV must be smaller than 900 KB.", true);
                        return;
                      }
                      setCSV(await f.text());
                      setFilename(f.name);
                    }
                  }}
                />
              </label>
            </div>
            {filename ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setCSV("");
                  setFilename("");
                }}
              >
                {filename} <X size={14} />
              </button>
            ) : (
              <p className="subtle">
                Optional CSV columns: date,close. Use adjusted daily closes
                where available.
              </p>
            )}
            <button className="primary" disabled={busy || (!connected && !csv)}>
              {busy ? (
                <RefreshCw className="spin" size={16} />
              ) : (
                <FlaskConical size={16} />
              )}{" "}
              {busy ? "Running experiment…" : "Run experiment"}
            </button>
          </form>
        </Panel>
        <Panel
          title="Strategy vs. buy & hold"
          sub={
            result
              ? `${runLabel} · ${result.observations} daily prices`
              : "Rebased to 100 over the same evaluation window"
          }
          action={result && <span className="tag">RESEARCH ONLY</span>}
        >
          {result ? (
            <>
              {runInput !== currentInput && (
                <p className="notice">
                  Settings changed. Run the experiment again to update these
                  results.
                </p>
              )}
              <div className="chart-legend">
                <span>
                  <i style={{ background: "var(--accent)" }} />
                  Strategy · net of costs
                </span>
                <span>
                  <i style={{ background: "#89b5ec" }} />
                  Buy & hold · gross
                </span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.curve}>
                    <defs>
                      <linearGradient
                        id="curve-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#b8ec87"
                          stopOpacity={0.22}
                        />
                        <stop
                          offset="100%"
                          stopColor="#b8ec87"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      minTickGap={60}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString("en-IN", {
                          month: "short",
                          year: "2-digit",
                        })
                      }
                      tick={{ fill: "var(--muted)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fill: "var(--muted)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => number(v, 0)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => number(Number(v))}
                    />
                    <Area
                      type="monotone"
                      dataKey="strategy"
                      name="Strategy"
                      stroke="#b8ec87"
                      strokeWidth={2}
                      fill="url(#curve-fill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="benchmark"
                      name="Buy & hold"
                      stroke="#89b5ec"
                      strokeWidth={1.5}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty
              title="A hypothesis needs a test."
              detail="Connect Upstox or Kite, or upload daily prices. The default settings are ready for your first test."
            />
          )}
        </Panel>
      </div>
      {result && (
        <>
          <div className="stats-grid">
            <Stat
              label="NET STRATEGY RETURN"
              value={pct(result.metrics.returnPct)}
              detail={`Benchmark ${pct(result.metrics.benchmarkReturn)}`}
            />
            <Stat
              label="MAXIMUM DRAWDOWN"
              value={pct(result.metrics.maxDrawdown)}
              detail="Largest peak-to-trough loss"
            />
            <Stat
              label="ANNUALISED VOLATILITY"
              value={`${number(result.metrics.volatility)}%`}
              detail="Daily sample standard deviation × √252"
            />
            <Stat
              label="SHARPE RATIO"
              value={number(result.metrics.sharpe)}
              detail="6% annual risk-free assumption"
            />
          </div>
          <details className="disclosure">
            <summary>Explore drawdown and risk metrics</summary>
            <div className="two-columns">
              <Panel
                title="Drawdown profile"
                sub="Distance below the strategy’s running peak"
              >
                <div className="chart small-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.curve}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis
                        tick={{ fill: "var(--muted)", fontSize: 10 }}
                        tickFormatter={(v) => `${number(v)}%`}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area
                        dataKey="drawdown"
                        stroke="#eb8d90"
                        fill="#eb8d90"
                        fillOpacity={0.12}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Tail risk & activity">
                <div className="metric-list">
                  <div>
                    <span>Historical daily VaR · 95%</span>
                    <strong>{number(result.metrics.var95)}%</strong>
                  </div>
                  <div>
                    <span>Expected shortfall · worst 5%</span>
                    <strong>
                      {number(result.metrics.expectedShortfall95)}%
                    </strong>
                  </div>
                  <div>
                    <span>Annualised return</span>
                    <strong>{pct(result.metrics.cagr)}</strong>
                  </div>
                  <div>
                    <span>Entries + exits</span>
                    <strong>{result.metrics.trades}</strong>
                  </div>
                </div>
                <p className="panel-note">
                  Historical loss estimates are sample statistics, not
                  guaranteed loss limits.
                </p>
              </Panel>
            </div>
          </details>
          <details className="disclosure">
            <summary>Assumptions, data source & export</summary>
            <Panel title="Experiment assumptions">
              <p className="panel-note">Data: {result.source}</p>
              <ul className="assumptions">
                {result.assumptions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
                <li>
                  Parameter selection on this same sample can overfit. Validate
                  on a separate period before drawing conclusions.
                </li>
              </ul>
              <div className="panel-note">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(result, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "hedgeway-experiment.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={15} />
                  Download experiment
                </button>
              </div>
            </Panel>
          </details>
        </>
      )}
    </>
  );
}
