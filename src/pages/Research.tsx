import { BookOpen, Bookmark, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, post, remove, timestamp } from "../api";
import type { Article, Mode } from "../types";
import type { Action, Page } from "../navigation";
import { Empty, Panel, Story } from "../ui";
export default function Research({
  mode,
  seed = "",
  learn,
  action,
  busy,
  version,
  redditReady,
  go,
}: {
  mode: Mode;
  seed?: string;
  learn?: (symbol: string) => void;
  action: Action;
  busy: boolean;
  version: number;
  redditReady: boolean;
  go: (page: Page) => void;
}) {
  const [sources, setSources] = useState<
    {
      name: string;
      category: string;
      status: string;
      count: number;
      newest: string | null;
      message: string;
    }[]
  >([]);
  useEffect(() => {
    let active = true;
    api("/research/sources")
      .then((s) => {
        if (active) setSources(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version]);
  const [items, setItems] = useState<Article[]>([]),
    [query, setQuery] = useState(seed),
    [kind, setKind] = useState(""),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        api<Article[]>(
          `/research?mode=${mode}&q=${encodeURIComponent(query)}&kind=${kind}&saved=${saved}`,
        )
          .then((v) => {
            if (active) {
              setItems(v);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, query, kind, saved, version]);
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["", "All sources"],
            ["article", "Articles"],
            ["official", "Official disclosures"],
            ["forum", "Forums"],
          ].map(([v, t]) => (
            <button
              key={v}
              className={kind === v ? "active" : ""}
              onClick={() => setKind(v)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="button-row">
          <button
            disabled={!items.length}
            onClick={() =>
              learn?.(/^[A-Z0-9&_.-]{1,30}$/.test(query) ? query : "")
            }
          >
            Help me understand this research
          </button>
          <button
            disabled={busy}
            onClick={() =>
              redditReady
                ? action(
                    () => post("/research/reddit"),
                    "Reddit posts imported",
                  )
                : go("Integrations")
            }
          >
            {redditReady ? "Sync Reddit" : "Connect Reddit"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              action(
                () => post("/research/refresh"),
                "Research feeds refreshed",
              )
            }
          >
            <RefreshCw size={15} />
            Refresh feeds
          </button>
        </div>
      </div>
      <div className="research-layout">
        <Panel
          title="The research desk"
          sub="Headlines, short excerpts, and direct links to original sources"
        >
          <div className="filter-bar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Search research"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search companies, themes or headlines…"
              />
            </div>
            <button
              className={saved ? "active-filter" : ""}
              disabled={false}
              onClick={() => setSaved(!saved)}
            >
              <Bookmark size={15} />
              {saved ? "Saved only" : "Saved"}
            </button>
          </div>
          {error ? (
            <p className="error-box" role="alert">
              {error}
            </p>
          ) : loading && !items.length ? (
            <div className="skeleton" />
          ) : items.length ? (
            items.map((a) => (
              <Story
                key={a.id}
                article={a}
                onSave={(a) =>
                  action(
                    () =>
                      a.saved
                        ? remove(`/bookmarks/${a.id}`)
                        : post(`/bookmarks/${a.id}`),
                    "Saved articles updated",
                  )
                }
              />
            ))
          ) : (
            <Empty
              title="No stories here yet"
              detail={
                query || kind || saved
                  ? "Try another search or clear your filters."
                  : "Fetch the latest headlines and forum discussions."
              }
              action={
                query || kind || saved ? (
                  <button
                    onClick={() => {
                      setQuery("");
                      setKind("");
                      setSaved(false);
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => post("/research/refresh"),
                        "Research updated",
                      )
                    }
                  >
                    Fetch news
                  </button>
                )
              }
            />
          )}
        </Panel>
        <div>
          <Panel title="Read with context">
            <div className="insight-copy">
              <div className="insight-icon">
                <BookOpen size={22} />
              </div>
              <h3>Signals are a starting point.</h3>
              <p>
                Headline tone uses a small, transparent word lexicon. It can
                miss sarcasm, nuance and context. It is not a trading signal.
              </p>
              <hr />
              <h4>Sources in your workspace</h4>
              <ul className="source-health-list">
                {sources.map((s) => (
                  <li key={s.name}>
                    <div>
                      <strong>{s.name}</strong>
                      <span
                        className={`tag ${s.status === "error" ? "amber" : ""}`}
                      >
                        {s.category === "official"
                          ? "Official disclosure"
                          : s.category === "community"
                            ? "Trader opinions"
                            : "Reporting"}
                      </span>
                    </div>
                    <small>
                      {s.count} stored items · latest {timestamp(s.newest)}
                    </small>
                    {s.status === "error" ? (
                      <p className="subtle">
                        Unavailable on last refresh: {s.message}
                      </p>
                    ) : s.status === "not_fetched" ? (
                      <p className="subtle">Not fetched yet</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p>
                Open the original article before acting. Forums contain
                unverified opinions.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
