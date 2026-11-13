import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, Sparkles } from "lucide-react";
import { api, money, pct, post, timestamp } from "../api";
import type { Rundown } from "../../server/rundown";
import type { Quote } from "../types";
import "../today.css";
export function Today({
  onDiscuss,
  onSelect,
  quotes,
  watch,
}: {
  onDiscuss: (question: string, articleId?: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
  quotes: Quote[];
  watch: string[];
}) {
  const [data, setData] = useState<Rundown | null>(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [query, setQuery] = useState("");
  const [matches, setMatches] = useState<
    { symbol: string; name: string; exchange: string }[]
  >([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Rundown>("/rundown")
        .then((d) => {
          if (active) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(
      () =>
        api<{ items: typeof matches }>(
          `/instruments/search?q=${encodeURIComponent(query)}&exchange=NSE`,
          { signal: c.signal },
        )
          .then((result) => setMatches(result.items))
          .catch(() => {
            if (!c.signal.aborted) setMatches([]);
          }),
      300,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query]);
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await post("/research/refresh");
      setData(await api("/rundown"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };
  const lead = data?.headlines[0];
  const currentMoves = data ? [...data.movers, ...data.laggards] : [];
  return (
    <div className="daily-desk">
      <aside className="daily-watch" aria-label="Today's watchlist">
        <div className="daily-watch-heading">
          <h2>Your watchlist</h2>
          <span>{watch.length}</span>
        </div>
        <label className="daily-search">
          <Search size={17} />
          <input
            aria-label="Find a company from Today"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a company"
          />
        </label>
        {matches.length > 0 && (
          <div className="daily-search-results">
            {matches.slice(0, 6).map((s) => (
              <button
                key={`${s.exchange}:${s.symbol}`}
                onClick={() => onSelect(s.symbol, s.exchange)}
              >
                <strong>{s.symbol}</strong>
                <small>{s.name}</small>
              </button>
            ))}
          </div>
        )}
        {watch.map((id) => {
          const q = quotes.find((x) => `${x.exchange}:${x.symbol}` === id);
          const [exchange, symbol] = id.split(":");
          return (
            <button
              className="daily-watch-row"
              key={id}
              onClick={() => onSelect(symbol, exchange)}
            >
              <span>
                <strong>{symbol}</strong>
                <small>{q?.name || exchange}</small>
              </span>
              <span>
                <b>{money(q?.price, 2)}</b>
                <small className={q && q.change >= 0 ? "positive" : "negative"}>
                  {q ? pct(q.change) : "Awaiting quote"}
                </small>
              </span>
            </button>
          );
        })}
        {!watch.length && (
          <p className="daily-watch-empty">
            Follow a company to keep its price and research close. Search above
            to start.
          </p>
        )}
        <div className="daily-discover">
          <span className="desk-kicker">COMPANIES TO EXPLORE</span>
          {data?.starters.slice(0, 6).map((s) => (
            <button
              key={s.symbol}
              onClick={() => onSelect(s.symbol, s.exchange)}
            >
              <span>
                <strong>{s.symbol}</strong>
                <small>{s.sector}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          <p>Company directory · not recommendations</p>
        </div>
      </aside>
      <div className="daily-main">
        <header className="daily-header">
          <div>
            <span className="desk-kicker">YOUR PERSONAL MARKET DESK</span>
            <h1>
              Today, in perspective<span>.</span>
            </h1>
            <p>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Asia/Kolkata",
              })}{" "}
              <span> / INDIA</span>
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh today's reporting"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={18} className={refreshing ? "spin" : ""} />
          </button>
        </header>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {!data && <p role="status">Opening your market brief…</p>}
        {data && (
          <>
            <div className="daily-pulse">
              <div>
                <span className="desk-kicker">TRACKED EQUITIES</span>
                <strong>
                  {data.universe.current || data.lastSnapshot.quotes.length}
                  <small>
                    {data.universe.current
                      ? " observed today"
                      : " last available"}
                  </small>
                </strong>
              </div>
              <div>
                <span>Advancing / declining</span>
                <strong>
                  <b className="positive">{data.breadth.advancing}</b>
                  <small> / </small>
                  <b className="negative">{data.breadth.declining}</b>
                </strong>
              </div>
              <div>
                <span>Collected today</span>
                <strong>
                  {data.coverage.currentItems}
                  <small> collected items</small>
                </strong>
              </div>
            </div>
            <section className="daily-lead">
              <span className="desk-kicker">
                {lead ? "IN THE REPORTING" : "THE BRIEFING"}
              </span>
              <h2>
                {lead ? (
                  <a href={lead.url} target="_blank" rel="noreferrer">
                    {lead.title}
                    <ArrowUpRight size={22} />
                  </a>
                ) : (
                  "Make room for a clearer view."
                )}
              </h2>
              <p>
                {lead
                  ? lead.summary.slice(0, 360)
                  : "Your company watch, dated market observations and collected reporting come together here. Open a company to investigate its chart and evidence."}
              </p>
              {lead && (
                <div className="daily-source">
                  {lead.source} <span>· {timestamp(lead.publishedAt)}</span>
                </div>
              )}
              <button
                className="daily-discuss"
                onClick={() =>
                  onDiscuss(
                    lead
                      ? `Help me understand this reporting: ${lead.title}. What is established, what is uncertain, and what should I verify?`
                      : "Walk me through the available market reporting. What changed and what is uncertain?",
                    lead?.id,
                  )
                }
              >
                <Sparkles size={17} /> Think it through with Hedgeway{" "}
                <ArrowUpRight size={16} />
              </button>
            </section>
            <div className="daily-columns">
              <section>
                <div className="daily-section-heading">
                  <h2>On the radar</h2>
                  <span>Dated reporting</span>
                </div>
                {data.headlines.slice(1, 5).map((a, i) => (
                  <a
                    className="daily-story"
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="daily-story-index">0{i + 1}</span>
                    <div>
                      <small>
                        {a.source} · {timestamp(a.publishedAt)}
                      </small>
                      <h3>{a.title}</h3>
                      <p>{a.summary.slice(0, 150)}</p>
                    </div>
                    <ArrowUpRight size={16} />
                  </a>
                ))}
                {data.headlines.length < 2 && (
                  <div className="daily-quiet">
                    <p>No recent reporting collected yet.</p>
                    <button
                      disabled={refreshing}
                      onClick={() => void refresh()}
                    >
                      {refreshing
                        ? "Checking sources…"
                        : "Collect latest reporting"}
                    </button>
                  </div>
                )}
              </section>
              <section>
                <div className="daily-section-heading">
                  <h2>
                    {data.universe.current
                      ? "Moves in your list"
                      : "Last observations"}
                  </h2>
                  <span>Tracked coverage</span>
                </div>
                {(data.universe.current
                  ? currentMoves
                  : data.lastSnapshot.quotes
                ).map((q) => (
                  <button
                    className="daily-mover"
                    key={`${q.exchange}:${q.symbol}`}
                    onClick={() => onSelect(q.symbol, q.exchange)}
                  >
                    <span>
                      <strong>{q.symbol}</strong>
                      <small>{q.sector}</small>
                    </span>
                    <span>
                      <b>{money(q.price, 2)}</b>
                      <small
                        className={q.change >= 0 ? "positive" : "negative"}
                      >
                        {pct(q.change)}
                      </small>
                    </span>
                  </button>
                ))}
                {!data.universe.current && !data.lastSnapshot.quotes.length && (
                  <p className="daily-quiet">
                    Current eligible quotes will appear here as your connected
                    feed supplies them.
                  </p>
                )}
                {data.universe.current > 0 && !currentMoves.length && (
                  <p className="daily-quiet">
                    The tracked quotes are unchanged from their previous close.
                  </p>
                )}
                <p className="daily-caption">
                  {data.universe.description}.{" "}
                  {data.universe.current
                    ? "Current IST-day observations; timestamps may differ."
                    : "Older observations are not today’s rankings."}
                </p>
                <div className="daily-section-heading">
                  <h2>Sector pulse</h2>
                </div>
                {data.sectors.slice(0, 5).map((s) => (
                  <div className="daily-sector" key={s.name}>
                    <span>
                      {s.name}
                      <small>
                        {s.count} tracked{" "}
                        {s.count === 1 ? "equity" : "equities"}
                      </small>
                    </span>
                    <b className={s.change >= 0 ? "positive" : "negative"}>
                      {pct(s.change)}
                    </b>
                  </div>
                ))}
                <p className="daily-caption">
                  Equal-weight tracked equities, not sector-index returns. No
                  missing prices are estimated.
                </p>
              </section>
            </div>
            <section className="daily-themes">
              {(
                [
                  ["policy", "Policy & RBI"],
                  ["macro", "Macro & global"],
                  ["earnings", "Business & earnings"],
                ] as const
              ).map(([key, title]) => (
                <div key={key}>
                  <h2>{title}</h2>
                  {data.themes[key].slice(0, 2).map((a) => (
                    <a href={a.url} target="_blank" rel="noreferrer" key={a.id}>
                      <small>
                        {a.source} · {a.current ? "Today" : "Recent"}
                      </small>
                      <strong>{a.title}</strong>
                    </a>
                  ))}
                  {!data.themes[key].length && (
                    <p>
                      No matching coverage collected in the last seven days.
                    </p>
                  )}
                </div>
              ))}
            </section>
            <footer className="daily-foot">
              Updated {timestamp(data.generatedAt)} · Source excerpts, not
              exhaustive coverage. Reporting provides context, not proof of why
              a price moved.
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
