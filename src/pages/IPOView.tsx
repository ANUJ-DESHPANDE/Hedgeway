import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, date, money, number, pct, post, timestamp } from "../api";
import type { IPO, Mode } from "../types";
import type { Action } from "../navigation";
import { Empty, Modal, Panel, Stat, tooltipStyle } from "../ui";
export default function IPOView({
  mode,
  action,
  busy,
  version,
  show,
}: {
  mode: Mode;
  action: Action;
  busy: boolean;
  version: number;
  show: (s: string, e?: boolean) => void;
}) {
  const [items, setItems] = useState<IPO[]>([]),
    [filter, setFilter] = useState("ALL"),
    [selected, setSelected] = useState<IPO | null>(null),
    [error, setError] = useState(""),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState(""),
    [score, setScore] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api<IPO[]>(`/ipos?mode=${mode}`)
      .then((v) => {
        if (active) {
          setItems(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, version]);
  const loadDetail = async (issue: IPO) => {
    setSelected(issue);
    setDetailBusy(true);
    setDetailError("");
    try {
      const detail = await api<IPO>(`/ipos/${issue.slug}`);
      setSelected((current) =>
        current?.slug === issue.slug ? detail : current,
      );
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailBusy(false);
    }
  };
  const list = items.filter((p) => filter === "ALL" || p.status === filter);
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {["ALL", "OPEN", "UPCOMING", "CLOSED", "LISTED"].map((s) => (
            <button
              key={s}
              className={s === filter ? "active" : ""}
              onClick={() => setFilter(s)}
            >
              {s === "ALL"
                ? "All issues"
                : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            action(() => post("/ipos/refresh"), "IPO snapshots updated")
          }
        >
          <RefreshCw size={15} />
          Refresh IPOs
        </button>
      </div>
      <div className="notice">
        <AlertTriangle size={16} />
        <span>
          GMP is unofficial and may be disputed. It is not a listing-price
          forecast. Missing figures stay blank.
        </span>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <Panel
        title="Primary market monitor"
        sub={`${items.length} tracked issues · Open an issue to inspect category demand and reported GMP`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company / issue</th>
                <th>Price band</th>
                <th>Min. application</th>
                <th>Reported GMP</th>
                <th>Total subscription</th>
                <th>Closes</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.slug}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>
                      <span
                        className={`tag ${p.status === "OPEN" ? "green" : ""}`}
                      >
                        {p.status}
                      </span>{" "}
                      {p.board}
                    </small>
                  </td>
                  <td>
                    {money(p.priceMin)} – {money(p.priceMax)}
                  </td>
                  <td>
                    {p.lotSize !== null && p.priceMax !== null
                      ? money(p.lotSize * p.priceMax)
                      : "—"}
                    <small>{number(p.lotSize, 0)} shares / lot</small>
                  </td>
                  <td>
                    <span className={p.gmpDisputed ? "warning" : ""}>
                      {money(p.lastGmp)} {p.gmpDisputed && "⚠"}
                    </span>
                    <small>Unofficial</small>
                  </td>
                  <td>{p.lastSubX == null ? "—" : `${number(p.lastSubX)}×`}</td>
                  <td>{date(p.closeDate)}</td>
                  <td>
                    <button
                      aria-label={`View ${p.name}`}
                      disabled={detailBusy}
                      onClick={() => void loadDetail(p)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            title="No issues in this view"
            detail="Refresh IPOs to fetch provider data. Use the status tabs to explore other issues."
          />
        )}
        <div className="panel-note">
          Data:{" "}
          {
            <a
              href="https://www.xflot.com/api-docs"
              target="_blank"
              rel="noopener noreferrer"
            >
              Xflot public API <ArrowUpRight size={14} />
            </a>
          }{" "}
          · Fetched {timestamp(items[0]?.asOf)}. Fetch time may differ from the
          underlying observation time.
        </div>
      </Panel>
      {items[0]?.disclaimer && (
        <p className="disclaimer">{items[0].disclaimer}</p>
      )}
      <details className="disclosure">
        <summary>Explore GMP versus actual listing outcomes</summary>
        <Panel
          title="Does the grey market get it right?"
          sub="Compare historical implied premiums with actual listing outcomes."
        >
          <div className="scoreboard-intro">
            <div>
              <h3>Measure the story against the result.</h3>
              <p>
                Inspect the provider’s observed listing sample, directional hit
                rate and average error. Coverage and survivorship can affect
                these figures.
              </p>
            </div>
            <button
              disabled={busy}
              onClick={async () => {
                try {
                  setScore(await api("/ipos/scoreboard"));
                } catch (e) {
                  show((e as Error).message, true);
                }
              }}
            >
              Load outcome study <ArrowUpRight size={16} />
            </button>
          </div>
          {score && (
            <>
              <div className="stats-grid three">
                <Stat
                  label="OBSERVED LISTINGS"
                  value={number(score.summary.n, 0)}
                />
                <Stat
                  label="DIRECTION HIT RATE"
                  value={
                    score.summary.directionHitPct == null
                      ? "—"
                      : `${number(score.summary.directionHitPct)}%`
                  }
                />
                <Stat
                  label="MEAN ABSOLUTE ERROR"
                  value={
                    score.summary.avgAbsErrorPp == null
                      ? "—"
                      : `${number(score.summary.avgAbsErrorPp)} pp`
                  }
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>Implied GMP return</th>
                      <th>Actual listing return</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {score.rows.slice(0, 30).map((r: any) => (
                      <tr key={r.slug}>
                        <td>{r.name}</td>
                        <td>{pct(r.impliedPct)}</td>
                        <td>{pct(r.actualPct)}</td>
                        <td>{number(r.errorPp)} pp</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="disclaimer">{score.disclaimer}</p>
            </>
          )}
        </Panel>
      </details>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="modal-body">
            <div className="button-row">
              <span className="tag green">{selected.status}</span>
              <span className="tag">{selected.board}</span>
            </div>
            <div className="stats-grid two">
              <Stat
                label="ISSUE SIZE"
                value={
                  selected.issueSizeCr === null
                    ? "—"
                    : `₹${number(selected.issueSizeCr)} Cr`
                }
              />
              <Stat
                label="REPORTED GMP"
                value={money(selected.lastGmp)}
                detail={
                  selected.gmpDisputed ? "Disputed by provider" : "Unofficial"
                }
              />
            </div>
            {detailError && (
              <div className="error-box" role="alert">
                <span>{detailError}</span>
                <button
                  disabled={detailBusy}
                  onClick={() => void loadDetail(selected)}
                >
                  Retry details
                </button>
              </div>
            )}
            <h3>Category subscription</h3>
            <p className="subtle">
              Demand relative to shares offered. QIB means institutional
              investors; NII means non-institutional investors.
            </p>
            {selected.detailsAsOf && (
              <p className="subtle">
                Details fetched {timestamp(selected.detailsAsOf)}
              </p>
            )}
            {detailBusy ? (
              <p>Fetching category data…</p>
            ) : selected.subs?.length ? (
              <div className="subscription-grid">
                {selected.subs.map((s) => (
                  <div key={s.category}>
                    <span>{s.category}</span>
                    <strong>
                      {s.timesSub === null ? "—" : `${number(s.timesSub)}×`}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtle">
                Category data has not been retrieved or is not reported. Check
                provider status and retry after the cooldown.
              </p>
            )}
            {!!selected.gmp?.length && (
              <>
                <h3>Reported premium history</h3>
                <div className="chart small-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selected.gmp}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="observedAt"
                        tickFormatter={(v) => date(v)}
                        tick={{ fill: "var(--muted)", fontSize: 10 }}
                      />
                      <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="gmp"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            <p className="disclaimer">{selected.disclaimer}</p>
            <p className="subtle">
              {selected.source} · fetched {timestamp(selected.asOf)}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
