import MarketChart from "../components/MarketChart";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Article, Mode, Quote } from "../types";
import { Empty, Panel, QuoteTable } from "../ui";
export default function Markets({
  quotes,
  articles,
  explore,
  researchOnly,
  watch,
  onWatch,
  mode,
  busy,
  refresh,
  add,
  removeWatch,
}: {
  quotes: Quote[];
  articles: Article[];
  explore: (action: "learn" | "scan" | "news", instrument: string) => void;
  researchOnly: boolean;
  watch: string[];
  onWatch: (q: Quote) => void;
  mode: Mode;
  busy: boolean;
  refresh: () => void;
  add: (s: string, e: string) => Promise<boolean>;
  removeWatch: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const activeInstrument = watch.includes(selected) ? selected : watch[0] || "";
  const activeSymbol = activeInstrument.split(":")[1] || "";
  const [companyNews, setCompanyNews] = useState<Article[]>([]);
  const [allNews, setAllNews] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  useEffect(() => {
    setCompanyNews([]);
    setNewsError("");
    if (!activeSymbol || allNews) {
      setNewsLoading(false);
      return;
    }
    const controller = new AbortController();
    setNewsLoading(true);
    api<Article[]>(
      `/research?mode=workspace&q=${encodeURIComponent(activeSymbol)}&kind=&saved=false`,
      { signal: controller.signal },
    )
      .then((items) => {
        if (!controller.signal.aborted) setCompanyNews(items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNewsError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setNewsLoading(false);
      });
    return () => controller.abort();
  }, [activeSymbol, allNews, articles]);
  const stories = allNews || !activeSymbol ? articles : companyNews;
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("symbol"),
    [newSymbol, setNewSymbol] = useState(""),
    [exchange, setExchange] = useState("NSE");
  const [company, setCompany] = useState(""),
    [matches, setMatches] = useState<
      { symbol: string; name: string; exchange: string }[]
    >([]),
    [searching, setSearching] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [catalogue, setCatalogue] = useState("");
  useEffect(() => {
    let active = true;
    setMatches([]);
    setLookupError("");
    if (company.trim().length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api<{
        source: string;
        items: { symbol: string; name: string; exchange: string }[];
      }>(
        `/instruments/search?q=${encodeURIComponent(company.trim())}&exchange=${exchange}`,
      )
        .then((result) => {
          if (active) {
            setMatches(result.items);
            setCatalogue(result.source);
          }
        })
        .catch((e) => {
          if (active) setLookupError(e.message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [company, exchange]);
  const list = quotes
    .filter(
      (q) =>
        `${q.symbol} ${q.name} ${q.sector}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter !== "watchlist" || watch.includes(`${q.exchange}:${q.symbol}`)),
    )
    .sort((a, b) =>
      sort === "gainers"
        ? b.change - a.change
        : sort === "losers"
          ? a.change - b.change
          : a.symbol.localeCompare(b.symbol),
    );
  return (
    <>
      <div className="trading-desk">
        <aside className="desk-watchlist" aria-label="Watchlist">
          <div className="desk-section-heading">
            <h2>Watchlist</h2>
            <button
              className="icon-button"
              aria-label="Find a company"
              onClick={() => {
                document
                  .getElementById("company-finder")
                  ?.setAttribute("open", "");
                document.getElementById("company-search")?.focus();
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <p className="desk-caption">Your companies. One click away.</p>
          {watch.length ? (
            watch.map((id) => {
              const q = quotes.find((q) => `${q.exchange}:${q.symbol}` === id);
              return (
                <button
                  className={`watch-tile ${activeInstrument === id ? "active" : ""}`}
                  key={id}
                  onClick={() => setSelected(id)}
                >
                  <span>
                    <strong>{id.split(":")[1]}</strong>
                    <small>{q?.name || id.split(":")[0]}</small>
                  </span>
                  <span>
                    <strong>
                      {q ? `₹${q.price.toLocaleString("en-IN")}` : "—"}
                    </strong>
                    <small
                      className={q && q.change >= 0 ? "positive" : "negative"}
                    >
                      {q
                        ? `${q.change > 0 ? "+" : ""}${q.change.toFixed(2)}%`
                        : "Awaiting feed"}
                    </small>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="desk-empty">
              <strong>Start with a company you know</strong>
              <p>Use + to search and add your first stock.</p>
            </div>
          )}
          <div className="watchlist-foot">
            NSE / BSE <span>{watch.length} followed</span>
          </div>
        </aside>
        <div className="desk-chart">
          {" "}
          <MarketChart
            selected={activeInstrument}
            onSelect={setSelected}
            watch={watch}
            quotes={quotes}
            explore={explore}
            researchOnly={researchOnly}
          />
        </div>
        <aside
          className="desk-intelligence"
          aria-label="Research beside your chart"
        >
          <div className="desk-section-heading">
            <h2>In focus</h2>
            <span className="tag">Research</span>
          </div>
          <p className="desk-caption">Context before conviction.</p>
          <button
            className="desk-ask"
            onClick={() => explore("learn", activeInstrument || "NSE:")}
          >
            <span>✦</span>
            <strong>Think it through with AI</strong>
            <small>
              Understand the move. Challenge your thesis. Weigh the risk.
            </small>
            <b>Start a conversation ↗</b>
          </button>
          <div className="desk-section-heading">
            <h3>
              {allNews || !activeSymbol
                ? "Across the market"
                : `Research for ${activeSymbol}`}
            </h3>
          </div>
          {stories.slice(0, 5).map((a) => (
            <a
              className="desk-story"
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
            >
              <small>
                {a.source} ·{" "}
                {new Date(a.publishedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </small>
              <strong>{a.title}</strong>
              <span>Read source ↗</span>
            </a>
          ))}
          {!stories.length && (
            <div className="desk-empty">
              <p>
                {newsLoading
                  ? "Finding company coverage…"
                  : newsError ||
                    (activeSymbol && !allNews
                      ? "No matching company coverage in the collected sources. This does not mean there is no news."
                      : "No research collected yet.")}
              </p>
              <button
                onClick={() => explore("news", activeInstrument || "NSE:")}
              >
                Open research
              </button>
            </div>
          )}
          {activeSymbol && (
            <button
              className="news-scope"
              onClick={() => setAllNews((v) => !v)}
            >
              {allNews ? `Focus on ${activeSymbol}` : "Show all market news"}
            </button>
          )}
        </aside>
      </div>
      <details className="desk-details">
        <summary>All quotes & sorting</summary>
        <div className="toolbar">
          <div className="tabs">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              All instruments <span>{quotes.length}</span>
            </button>
            <button
              className={filter === "watchlist" ? "active" : ""}
              onClick={() => setFilter("watchlist")}
            >
              My watchlist <span>{watch.length}</span>
            </button>
          </div>
          <button disabled={busy} onClick={refresh}>
            <RefreshCw size={15} />
            Refresh quotes
          </button>
        </div>
        <div className="panel">
          <div className="filter-bar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search instruments"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search symbol, company or sector"
              />
            </div>
            <select
              aria-label="Sort instruments"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="symbol">Symbol A–Z</option>
              <option value="gainers">Top gainers</option>
              <option value="losers">Top losers</option>
            </select>
          </div>
          {list.length ? (
            <QuoteTable quotes={list} watch={watch} onWatch={onWatch} />
          ) : (
            <Empty
              title={
                filter === "watchlist"
                  ? "No priced watchlist instruments"
                  : "No matching instruments"
              }
              detail="Add a symbol below and connect Upstox or Kite in Integrations. Exchange ticks appear automatically once the feed connects."
            />
          )}
        </div>
      </details>
      <details className="desk-details" id="company-finder">
        <summary>Add a company to your watchlist</summary>
        <Panel
          title="Find a company to follow"
          sub="Search a company name or trading symbol, then add it to your watchlist."
        >
          <div className="company-search">
            <div className="inline-form">
              <label className="grow">
                Company or symbol
                <input
                  id="company-search"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Try Infosys or HDFC Bank"
                  autoComplete="off"
                />
              </label>
              <label>
                Exchange
                <select
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                >
                  <option>NSE</option>
                  <option>BSE</option>
                </select>
              </label>
            </div>
            {company.trim().length >= 2 && (
              <div aria-live="polite">
                {searching ? (
                  <p className="subtle">Searching companies…</p>
                ) : lookupError ? (
                  <p className="error-box">{lookupError}</p>
                ) : (
                  <>
                    <p className="subtle">{catalogue}</p>
                    {matches.length ? (
                      <ul className="company-results">
                        {matches.map((item) => (
                          <li key={item.symbol}>
                            <div>
                              <strong>{item.name}</strong>
                              <small>
                                {item.exchange} · {item.symbol}
                              </small>
                            </div>
                            <button
                              disabled={
                                busy ||
                                watch.includes(
                                  `${item.exchange}:${item.symbol}`,
                                )
                              }
                              onClick={async () => {
                                if (await add(item.symbol, item.exchange))
                                  setCompany("");
                              }}
                            >
                              {watch.includes(
                                `${item.exchange}:${item.symbol}`,
                              ) ? (
                                "Added"
                              ) : (
                                <>
                                  <Plus size={14} />
                                  Add
                                </>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="subtle">
                        No matching companies. Try a trading symbol or use the
                        exact-symbol option below.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <details className="disclosure compact">
            <summary>Add an exact symbol or BSE code</summary>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await add(newSymbol, exchange)) setNewSymbol("");
              }}
            >
              <label>
                Exchange
                <select
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                >
                  <option>NSE</option>
                  <option>BSE</option>
                </select>
              </label>
              <label className="grow">
                Symbol
                <input
                  placeholder={
                    exchange === "NSE" ? "e.g. HDFCBANK" : "e.g. 500325"
                  }
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  pattern="[A-Z0-9&_.-]{1,30}"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                <Plus size={16} />
                Add to watchlist
              </button>
            </form>
          </details>
          {watch.length > 0 && (
            <div className="watch-symbols button-row">
              {watch.map((id) => (
                <button
                  key={id}
                  disabled={busy}
                  aria-label={`Remove ${id} from watchlist`}
                  onClick={() => removeWatch(id)}
                >
                  {id}
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
        </Panel>
      </details>
    </>
  );
}
