import { Bell, BookOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, date, money, post, remove, timestamp } from "../api";
import type { Alert, Note } from "../types";
import type { Action } from "../navigation";
import { Empty, Panel } from "../ui";
export default function Journal({
  action,
  busy,
  version,
}: {
  action: Action;
  busy: boolean;
  version: number;
}) {
  const [notes, setNotes] = useState<Note[]>([]),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [symbol, setSymbol] = useState(""),
    [thesis, setThesis] = useState(""),
    [risk, setRisk] = useState(""),
    [catalyst, setCatalyst] = useState(""),
    [alertSymbol, setAlertSymbol] = useState(""),
    [target, setTarget] = useState(""),
    [direction, setDirection] = useState("above"),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api<Note[]>("/notes"), api<Alert[]>("/alerts")])
      .then(([n, a]) => {
        if (active) {
          setNotes(n);
          setAlerts(a);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  return (
    <>
      <div className="notice">
        <BookOpen size={16} />
        Journal entries and alerts are saved privately in your workspace.
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="two-columns">
        <Panel
          title="Write an investment thesis"
          sub="Make your assumptions explicit."
        >
          <form
            className="journal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action(
                  () => post("/notes", { symbol, thesis, risk, catalyst }),
                  "Research note saved",
                )
              ) {
                setSymbol("");
                setThesis("");
                setRisk("");
                setCatalyst("");
              }
            }}
          >
            <label>
              Instrument
              <input
                placeholder="e.g. INFY"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                pattern="[A-Z0-9&_.-]{1,30}"
                required
              />
            </label>
            <label>
              Thesis
              <textarea
                placeholder="What do you believe, and what evidence supports it?"
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                maxLength={3000}
                required
              />
            </label>
            <label>
              What would change your mind?
              <textarea
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                maxLength={2000}
                placeholder="Risks, contrary evidence, invalidation conditions…"
              />
            </label>
            <label>
              Next catalyst
              <input
                value={catalyst}
                onChange={(e) => setCatalyst(e.target.value)}
                maxLength={2000}
                placeholder="Earnings, regulatory decision, management update…"
              />
            </label>
            <button className="primary" disabled={busy}>
              <Plus size={15} />
              Save thesis
            </button>
          </form>
        </Panel>
        <Panel
          title="Price alerts"
          sub="NSE price conditions, evaluated on incoming ticks and quote refresh."
        >
          <form
            className="journal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action(
                  () =>
                    post("/alerts", {
                      symbol: alertSymbol,
                      direction,
                      target: Number(target),
                    }),
                  "Price alert created",
                )
              ) {
                setAlertSymbol("");
                setTarget("");
              }
            }}
          >
            <label>
              NSE symbol
              <input
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. RELIANCE"
                pattern="[A-Z0-9&_.-]{1,30}"
                required
              />
            </label>
            <div className="two-fields">
              <label>
                Condition
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="above">At or above</option>
                  <option value="below">At or below</option>
                </select>
              </label>
              <label>
                Target price · ₹
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  required
                />
              </label>
            </div>
            <button disabled={busy}>
              <Bell size={15} />
              Create alert
            </button>
            <p className="subtle">
              Add the symbol to your watchlist. Alerts are shown here after
              incoming broker ticks or quote refresh. Monitoring runs while the
              server is active; alerts appear here without email or push
              delivery.
            </p>
          </form>
          <div className="alert-list">
            {alerts.map((a) => (
              <div key={a.id}>
                <Bell size={16} />
                <div>
                  <strong>
                    {a.symbol} {a.direction} {money(a.target, 2)}
                  </strong>
                  <small>
                    {a.triggered_at
                      ? `Triggered ${timestamp(a.triggered_at)}`
                      : "Waiting for a qualifying quote"}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Delete ${a.symbol} alert`}
                  onClick={() =>
                    action(() => remove(`/alerts/${a.id}`), "Alert removed")
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Research journal" sub={`${notes.length} saved theses`}>
        {notes.length ? (
          <div className="note-grid">
            {notes.map((n) => (
              <article className="note-card" key={n.id}>
                <div className="note-head">
                  <span className="ticker-tag">{n.symbol}</span>
                  <small>{date(n.updated_at)}</small>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${n.symbol} note`}
                    onClick={() => {
                      if (window.confirm("Delete this research note?"))
                        void action(
                          () => remove(`/notes/${n.id}`),
                          "Note removed",
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p>{n.thesis}</p>
                {n.risk && (
                  <>
                    <h4>Invalidation / risk</h4>
                    <p>{n.risk}</p>
                  </>
                )}
                {n.catalyst && (
                  <>
                    <h4>Next catalyst</h4>
                    <p>{n.catalyst}</p>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="A record of your thinking"
            detail="Your notes will appear here, ready to revisit when new evidence arrives."
          />
        )}
      </Panel>
    </>
  );
}
