import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Mode, Quote } from "../types";
import { Empty, Panel, QuoteTable } from "../ui";
export default function Markets({
  quotes,
  watch,
  onWatch,
  mode,
  busy,
  refresh,
  add,
  removeWatch,
}: {
  quotes: Quote[];
  watch: string[];
  onWatch: (q: Quote) => void;
  mode: Mode;
  busy: boolean;
  refresh: () => void;
  add: (s: string, e: string) => Promise<boolean>;
  removeWatch: (id: string) => void;
}) {
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
      <Panel
        title="Find a company to follow"
        sub="Search a company name or trading symbol, then add it to your watchlist."
      >
        <div className="company-search">
          <div className="inline-form">
            <label className="grow">
              Company or symbol
              <input
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
                              watch.includes(`${item.exchange}:${item.symbol}`)
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
    </>
  );
}
