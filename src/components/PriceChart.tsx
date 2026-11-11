import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import { Maximize2, RotateCcw } from "lucide-react";
import type { IntradayBar } from "../trading";
import { money, number, timestamp } from "../api";

export function chartIndicators(bars: IntradayBar[], window: number) {
  let sum = 0,
    volume = 0,
    weighted = 0,
    session = "";
  return bars.map((b, i) => {
    const day = new Date(Date.parse(b.time) + 330 * 60000)
      .toISOString()
      .slice(0, 10);
    if (day !== session) {
      session = day;
      volume = 0;
      weighted = 0;
    }
    const mean = i >= window ? sum / window : null;
    sum += b.close;
    if (i >= window) sum -= bars[i - window].close;
    volume += b.volume;
    weighted += ((b.high + b.low + b.close) / 3) * b.volume;
    return {
      time: (Date.parse(b.time) / 1000) as UTCTimestamp,
      mean,
      vwap: volume ? weighted / volume : null,
    };
  });
}
export default function PriceChart({
  bars,
  meanWindow = 20,
  daily = false,
  label = "Price chart",
}: {
  bars: IntradayBar[];
  meanWindow?: number;
  daily?: boolean;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    wrapper = useRef<HTMLDivElement>(null),
    chartRef = useRef<IChartApi | null>(null),
    range = useRef<LogicalRange | null>(null);
  const [style, setStyle] = useState("candles"),
    [showMean, setShowMean] = useState(true),
    [showVwap, setShowVwap] = useState(false),
    [selected, setSelected] = useState<IntradayBar | null>(null),
    [expanded, setExpanded] = useState(false);
  const indicators = useMemo(
    () => chartIndicators(bars, meanWindow),
    [bars, meanWindow],
  );
  useEffect(() => {
    if (!host.current || !bars.length) return;
    const css = getComputedStyle(document.documentElement);
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: {
          type: ColorType.Solid,
          color: css.getPropertyValue("--panel").trim(),
        },
        textColor: css.getPropertyValue("--muted").trim(),
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: css.getPropertyValue("--border").trim() },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#898c99", labelBackgroundColor: "#353946" },
        horzLine: { color: "#898c99", labelBackgroundColor: "#353946" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.26 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: !daily,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        tickMarkFormatter: (time: number) =>
          new Date(time * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            ...(daily
              ? { day: "2-digit", month: "short" }
              : { hour: "2-digit", minute: "2-digit", hour12: false }),
          }),
      },
      localization: {
        locale: "en-IN",
        timeFormatter: (time: number) =>
          timestamp(new Date(time * 1000).toISOString()),
        priceFormatter: (p: number) =>
          p.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#35c6a1",
      downColor: "#ef7181",
      wickUpColor: "#35c6a1",
      wickDownColor: "#ef7181",
      borderVisible: false,
      visible: style === "candles",
      priceLineVisible: true,
      lastValueVisible: style === "candles",
    });
    candles.setData(
      bars.map((b) => ({
        ...b,
        time: (Date.parse(b.time) / 1000) as UTCTimestamp,
      })),
    );
    const area = chart.addSeries(AreaSeries, {
      lineColor: "#f5a65b",
      topColor: "#f5a65b35",
      bottomColor: "#f5a65b00",
      lineWidth: 2,
      visible: style === "line",
      lastValueVisible: style === "line",
      priceLineVisible: style === "line",
    });
    area.setData(
      bars.map((b) => ({
        time: (Date.parse(b.time) / 1000) as UTCTimestamp,
        value: b.close,
      })),
    );
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.83, bottom: 0 }, visible: false });
    volume.setData(
      bars.map((b) => ({
        time: (Date.parse(b.time) / 1000) as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "#35c6a14d" : "#ef71814d",
      })),
    );
    const mean = chart.addSeries(LineSeries, {
      color: "#f4bb74",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showMean,
    });
    mean.setData(
      indicators
        .filter((b) => b.mean !== null)
        .map((b) => ({ time: b.time, value: b.mean! })),
    );
    const vwap = chart.addSeries(LineSeries, {
      color: "#a19af5",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showVwap && !daily,
    });
    vwap.setData(
      indicators
        .filter((b) => b.vwap !== null)
        .map((b) => ({ time: b.time, value: b.vwap! })),
    );
    const byTime = new Map(bars.map((b) => [Date.parse(b.time) / 1000, b]));
    chart.subscribeCrosshairMove((p) =>
      setSelected(p.time ? byTime.get(Number(p.time)) || null : null),
    );
    if (range.current) chart.timeScale().setVisibleLogicalRange(range.current);
    else
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, bars.length - (daily ? 90 : 100)),
        to: bars.length + 4,
      });
    const observer = new MutationObserver(() => {
      const c = getComputedStyle(document.documentElement);
      chart.applyOptions({
        layout: {
          background: {
            type: ColorType.Solid,
            color: c.getPropertyValue("--panel").trim(),
          },
          textColor: c.getPropertyValue("--muted").trim(),
        },
        grid: { horzLines: { color: c.getPropertyValue("--border").trim() } },
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      range.current = chart.timeScale().getVisibleLogicalRange();
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, indicators, style, showMean, showVwap, daily]);
  const current = selected || bars.at(-1);
  return (
    <div
      ref={wrapper}
      className={`price-chart ${expanded ? "chart-expanded" : ""}`}
    >
      <div className="chart-controls">
        <div className="tabs" aria-label="Chart style">
          {["candles", "line"].map((s) => (
            <button
              key={s}
              className={style === s ? "active" : ""}
              aria-pressed={style === s}
              onClick={() => setStyle(s)}
            >
              {s === "candles" ? "Candles" : "Line"}
            </button>
          ))}
        </div>
        <div className="chart-overlays">
          <button
            aria-pressed={showMean}
            className={showMean ? "overlay-on mean" : ""}
            onClick={() => setShowMean((v) => !v)}
          >
            Average · {meanWindow}
          </button>
          {!daily && (
            <button
              aria-pressed={showVwap}
              className={showVwap ? "overlay-on vwap" : ""}
              onClick={() => setShowVwap((v) => !v)}
            >
              Session VWAP
            </button>
          )}
          <button
            title="Fit all candles"
            aria-label="Fit all candles"
            onClick={() => chartRef.current?.timeScale().fitContent()}
          >
            <RotateCcw size={15} />
          </button>
          <button
            title="Expand chart"
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      <div className="ohlc-readout" aria-label="Candle details">
        {current ? (
          <>
            <span>{timestamp(current.time)}</span>
            <span>
              O <b>{money(current.open, 2)}</b>
            </span>
            <span>
              H <b>{money(current.high, 2)}</b>
            </span>
            <span>
              L <b>{money(current.low, 2)}</b>
            </span>
            <span>
              C{" "}
              <b
                className={
                  current.close >= current.open ? "positive" : "negative"
                }
              >
                {money(current.close, 2)}
              </b>
            </span>
            <span>
              VOL <b>{number(current.volume, 0)}</b>
            </span>
          </>
        ) : (
          <span>No candles available</span>
        )}
      </div>
      <div
        ref={host}
        className="candle-canvas"
        role="img"
        aria-label={`${label}. ${bars.length} actual OHLC candles with volume. Details and accessible data below.`}
      />
      <div className="chart-footnote">
        <span>Drag to explore · pinch or scroll to zoom · times in IST</span>
        <span>
          Average excludes the current candle
          {!daily ? " · VWAP uses candle typical price" : ""}
        </span>
      </div>
      <details className="chart-data-table">
        <summary>View candle data</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time (IST)</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {bars
                .slice(-100)
                .reverse()
                .map((b) => (
                  <tr key={b.time}>
                    <td>{timestamp(b.time)}</td>
                    <td>{number(b.open, 2)}</td>
                    <td>{number(b.high, 2)}</td>
                    <td>{number(b.low, 2)}</td>
                    <td>{number(b.close, 2)}</td>
                    <td>{number(b.volume, 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p>
          Most recent 100 candles. Download the chart CSV for the full loaded
          series.
        </p>
      </details>
    </div>
  );
}
