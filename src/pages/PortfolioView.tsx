import {
  AlertTriangle,
  ArrowRight,
  Download,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { money, number, remove, timestamp } from "../api";
import type { Mode, Portfolio } from "../types";
import type { Action, Page } from "../navigation";
import { Empty, Panel, Stat, colors } from "../ui";
export default function PortfolioView({
  portfolio: p,
  mode,
  importCSV,
  busy,
  action,
  go,
}: {
  portfolio: Portfolio;
  mode: Mode;
  importCSV: () => void;
  busy: boolean;
  action: Action;
  go: (p: Page) => void;
}) {
  const [shock, setShock] = useState(-10);
  if (!p.positions.length)
    return (
      <Panel title="Your portfolio, in one place">
        <Empty
          title="Bring in the investments you already own"
          detail="Upload the holdings CSV from your broker, or connect Kite to sync them. You can review a CSV before saving anything."
          action={
            <div className="button-row">
              <button className="primary" onClick={importCSV}>
                Choose holdings file <Upload size={16} />
              </button>
              <button onClick={() => go("Integrations")}>Connect Kite</button>
            </div>
          }
        />
      </Panel>
    );
  return (
    <>
      <div className="toolbar">
        <span className="subtle">Holdings and returns · INR</span>
        <div className="button-row">
          <a className="button" href="/api/export">
            <Download size={15} />
            Export my holdings
          </a>
          <button className="primary" onClick={importCSV}>
            <Upload size={15} />
            Import CSV
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="CURRENT VALUE"
          value={money(p.value)}
          detail={`${number(p.coverage, 0)}% of positions priced`}
        />
        <Stat
          label="INVESTED"
          value={p.positions.length ? money(p.invested) : "—"}
          detail="Quantity × average acquisition price"
        />
        <Stat
          label="UNREALISED P&L"
          value={money(p.pnl)}
          change={p.returnPct}
        />
        <Stat
          label="HOLDINGS"
          value={String(p.positions.length)}
          detail={`${p.sectors.length} sectors / asset classes`}
        />
      </div>
      {p.warnings.map((w) => (
        <div key={w} className="notice">
          <AlertTriangle size={16} />
          {w}
        </div>
      ))}
      <Panel
        title="Your holdings"
        sub="Latest received prices are shown with their timestamps."
      >
        {p.positions.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Quantity</th>
                  <th>Avg. cost</th>
                  <th>Last price</th>
                  <th>Value</th>
                  <th>Unrealised P&L</th>
                  <th>Weight</th>
                  {<th>Manage</th>}
                </tr>
              </thead>
              <tbody>
                {p.positions.map((h) => (
                  <tr key={`${h.exchange}:${h.symbol}`}>
                    <td>
                      <strong>{h.symbol}</strong>
                      <small>
                        {h.sector} · {h.exchange}
                      </small>
                    </td>
                    <td>{number(h.quantity)}</td>
                    <td>{money(h.averagePrice, 2)}</td>
                    <td>
                      {money(h.price, 2)}
                      <small>{timestamp(h.asOf)}</small>
                    </td>
                    <td>{money(h.value)}</td>
                    <td
                      className={
                        h.pnl == null
                          ? "muted"
                          : h.pnl >= 0
                            ? "positive"
                            : "negative"
                      }
                    >
                      {money(h.pnl)}
                    </td>
                    <td>{h.weight.toFixed(1)}%</td>
                    {
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${h.symbol}`}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${h.symbol} from the portfolio? You can restore it by importing again.`,
                              )
                            )
                              void action(
                                () =>
                                  remove(`/holdings/${h.exchange}/${h.symbol}`),
                                "Holding removed",
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    }
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Bring your portfolio into focus"
            detail="Import a holdings CSV, or connect Kite and sync your account. No holdings are created automatically."
            action={
              <button className="primary" onClick={importCSV}>
                Import holdings <Upload size={16} />
              </button>
            }
          />
        )}
      </Panel>
      {p.value !== null ? (
        <details className="disclosure">
          <summary>Explore portfolio risk</summary>
          <div className="two-columns">
            <Panel
              title="Stress test"
              sub="A transparent, uniform price shock—not a probability forecast."
            >
              <div className="stress-control">
                <label htmlFor="shock">
                  Portfolio shock <strong>{shock}%</strong>
                </label>
                <input
                  id="shock"
                  type="range"
                  min="-50"
                  max="30"
                  value={shock}
                  onChange={(e) => setShock(Number(e.target.value))}
                />
                <div className="stress-values">
                  <div>
                    <span>Estimated impact</span>
                    <strong className={shock < 0 ? "negative" : "positive"}>
                      {p.value == null ? "—" : money((p.value * shock) / 100)}
                    </strong>
                  </div>
                  <div>
                    <span>Stressed value</span>
                    <strong>
                      {p.value == null
                        ? "—"
                        : money(p.value * (1 + shock / 100))}
                    </strong>
                  </div>
                </div>
                <p className="subtle">
                  Shows what your holdings would be worth if every price changed
                  by this amount.
                </p>
              </div>
            </Panel>
            <Panel
              title="Concentration check"
              sub="Know which positions drive your portfolio."
            >
              <div className="concentration-list">
                {[...p.positions]
                  .sort((a, b) => b.weight - a.weight)
                  .slice(0, 5)
                  .map((h, i) => (
                    <div key={h.symbol}>
                      <span>{h.symbol}</span>
                      <div className="meter">
                        <span
                          style={{
                            width: `${h.weight}%`,
                            background: colors[i],
                          }}
                        />
                      </div>
                      <strong>{h.weight.toFixed(1)}%</strong>
                    </div>
                  ))}
              </div>
              <div className="panel-note">
                These are holding weights, not historical risk contributions.{" "}
                <button
                  className="text-button"
                  onClick={() => go("Strategy lab")}
                >
                  Explore the lab <ArrowRight size={14} />
                </button>
              </div>
            </Panel>
          </div>
        </details>
      ) : (
        <div className="notice">
          <span>
            Connect market prices to calculate your portfolio value and risk.
          </span>
          <button onClick={() => go("Integrations")}>Connect prices</button>
        </div>
      )}
    </>
  );
}
