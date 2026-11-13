import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { money, pct, timestamp } from "../api";
import type { Quote } from "../types";
export default function MarketTicker({
  quotes,
  onSelect,
}: {
  quotes: Quote[];
  onSelect: (q: Quote) => void;
}) {
  const [paused, setPaused] = useState(
    () => localStorage.getItem("hedgeway-ticker-paused") === "true",
  );
  const items = quotes.slice(0, 16);
  return (
    <div
      className={`market-tape ${paused ? "is-paused" : ""}`}
      aria-label="Market snapshots"
    >
      <span className="tape-label">LAST OBSERVED</span>
      <div className="tape-window">
        <div className="tape-track">
          {[0, 1].map((copy) => (
            <div
              className="tape-group"
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {items.map((q) =>
                copy === 0 ? (
                  <button
                    key={`${q.exchange}:${q.symbol}`}
                    title={`${q.source} · ${timestamp(q.asOf)}`}
                    onClick={() => onSelect(q)}
                  >
                    <strong>{q.symbol}</strong>
                    <span>{money(q.price, 2)}</span>
                    <b className={q.change >= 0 ? "positive" : "negative"}>
                      {pct(q.change)}
                    </b>
                  </button>
                ) : (
                  <span
                    className="tape-clone"
                    key={`${q.exchange}:${q.symbol}`}
                  >
                    <strong>{q.symbol}</strong>
                    <span>{money(q.price, 2)}</span>
                    <b className={q.change >= 0 ? "positive" : "negative"}>
                      {pct(q.change)}
                    </b>
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
        {!items.length && (
          <span className="tape-empty">
            Indian markets · Quotes appear when your connected feed supplies
            them
          </span>
        )}
      </div>
      {!!items.length && (
        <button
          className="tape-pause"
          aria-label={paused ? "Resume ticker" : "Pause ticker"}
          onClick={() =>
            setPaused((v) => {
              localStorage.setItem("hedgeway-ticker-paused", String(!v));
              return !v;
            })
          }
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      )}
    </div>
  );
}
