import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { api, money, timestamp } from "../api";
import type { IntradayBar } from "../trading";
import type { Quote } from "../types";
import PriceChart from "./PriceChart";
import { Change } from "../ui";
type Data = {
  bars: IntradayBar[];
  source: string;
  fetchedAt: string;
  symbol: string;
  exchange: string;
  interval: string;
};
export default function MarketChart({
  watch,
  quotes,
  explore,
  researchOnly = false,
}: {
  watch: string[];
  quotes: Quote[];
  explore?: (action: "learn" | "scan" | "news", instrument: string) => void;
  researchOnly?: boolean;
}) {
  const instruments = [
    ...new Set([...watch, ...quotes.map((q) => `${q.exchange}:${q.symbol}`)]),
  ];
  const [instrument, setInstrument] = useState(instruments[0] || ""),
    [interval, setIntervalValue] = useState("5"),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [auto, setAuto] = useState(true),
    [lookback, setLookback] = useState(20);
  const generation = useRef(0);
  const chosen = instruments.includes(instrument)
    ? instrument
    : instruments[0] || "";
  useEffect(() => {
    if (!auto || !chosen) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setRefresh((v) => v + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, [auto, chosen]);
  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    const id = ++generation.current;
    let cancelled = false;
    const [exchange, symbol] = chosen.split(":");
    setLoading(true);
    setError("");
    api<Data>(
      `/market/chart?${new URLSearchParams({ symbol, exchange, interval })}`,
      { signal: controller.signal },
    )
      .then((d) => {
        if (!cancelled && generation.current === id) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chosen, interval, refresh]);
  const quote = quotes.find((q) => `${q.exchange}:${q.symbol}` === chosen);
  const matching =
    data &&
    `${data.exchange}:${data.symbol}` === chosen &&
    data.interval === interval
      ? data
      : null;
  const download = () => {
    if (!matching) return;
    const text =
      "time_utc,open,high,low,close,volume\n" +
      matching.bars
        .map((b) =>
          [b.time, b.open, b.high, b.low, b.close, b.volume].join(","),
        )
        .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chosen.replace(":", "-")}-${interval}-candles.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!chosen) return null;
  return (
    <section
      className="panel market-chart-workspace"
      aria-label="Market chart workspace"
    >
      <div className="chart-heading">
        <div>
          <span className="eyebrow">THE MARKET, IN DETAIL</span>
          <h2>{quote?.name || chosen.split(":")[1]}</h2>
          <div className="chart-quote">
            {quote ? (
              <>
                <strong>{money(quote.price, 2)}</strong>
                <Change value={quote.change} />
                <small>Last trade {timestamp(quote.asOf)}</small>
              </>
            ) : (
              <span>Waiting for a quote</span>
            )}
          </div>
        </div>
        <label>
          Company
          <select
            aria-label="Chart company"
            value={chosen}
            onChange={(e) => setInstrument(e.target.value)}
          >
            {instruments.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart-workflow button-row">
        <button onClick={() => explore?.("learn", chosen)}>
          Explain what I’m seeing
        </button>
        <button onClick={() => explore?.("scan", chosen)}>
          Check a rebound setup
        </button>
        <button onClick={() => explore?.("news", chosen)}>
          Read company news
        </button>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(chosen)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in TradingView ↗
        </a>
      </div>
      <div className="chart-time-controls">
        <div className="tabs" aria-label="Candle interval">
          {[
            ["1", "1 min"],
            ["3", "3 min"],
            ["5", "5 min"],
            ["1d", "Daily"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={interval === v ? "active" : ""}
              aria-pressed={interval === v}
              disabled={researchOnly && v === "3"}
              onClick={() => setIntervalValue(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="button-row">
          <label className="chart-window">
            Average window
            <select
              aria-label="Average window"
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option value={n} key={n}>
                  {n} bars
                </option>
              ))}
            </select>
          </label>
          <label className="chart-auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto refresh
          </label>
          <button
            disabled={loading}
            aria-label="Refresh chart"
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
          </button>
          <button
            disabled={!matching}
            aria-label="Download candle CSV"
            onClick={download}
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}{" "}
          {matching ? "The chart below is the last successful fetch." : ""}
        </p>
      )}
      {matching?.bars.length ? (
        <PriceChart
          key={`${chosen}:${interval}`}
          bars={matching.bars}
          meanWindow={lookback}
          daily={interval === "1d"}
          label={`${chosen} ${interval === "1d" ? "daily" : interval + " minute"} chart`}
        />
      ) : (
        <div className="chart-loading" role="status">
          {loading
            ? "Loading exchange candles…"
            : error
              ? "Chart unavailable. Check the message above."
              : "No candles returned for this instrument."}
        </div>
      )}
      {matching && (
        <div className="chart-provenance">
          <span>
            {matching.source} · {matching.bars.length} candles
          </span>
          <span>
            Fetched {timestamp(matching.fetchedAt)} · newest candle may be
            forming
          </span>
        </div>
      )}
    </section>
  );
}
