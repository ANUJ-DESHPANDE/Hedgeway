import { BookOpen, Bookmark, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, post, remove, timestamp } from "../api";
import type { Article, Mode } from "../types";
import type { Action, Page } from "../navigation";
import { Empty, Modal, Panel, Story } from "../ui";
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
  learn?: (symbol: string, article?: Article) => void;
  action: Action;
  busy: boolean;
  version: number;
  redditReady: boolean;
  go: (page: Page) => void;
}) {
  const [reading, setReading] = useState<Article | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [refreshState, setRefreshState] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.hidden) return;
      setRefreshState("Checking for new reporting…");
      post("/research/refresh")
        .then(() => {
          if (active) {
            setFeedVersion((v) => v + 1);
            setRefreshState("Reporting checked");
          }
        })
        .catch(() => {
          if (active)
            setRefreshState(
              "Some sources could not refresh. Saved reporting remains available.",
            );
        });
    };
    refresh();
    const timer = setInterval(refresh, 300000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
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
  }, [version, feedVersion]);
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
  }, [mode, query, kind, saved, version, feedVersion]);
  return (
    <>
      {reading && (
        <Modal title="Read the evidence" onClose={() => setReading(null)}>
          <div className="source-reader">
            <span className="desk-kicker">
              {reading.kind === "forum"
                ? "COMMUNITY OPINION"
                : "SOURCE EXCERPT"}
            </span>
            <h2>{reading.title}</h2>
            <p className="subtle">
              {reading.source} · Published {timestamp(reading.publishedAt)}
            </p>
            <blockquote>{reading.summary}</blockquote>
            <p className="subtle">
              This is the collected excerpt, not the full document. Open the
              original for complete context.
            </p>
            <div className="button-row">
              <a href={reading.url} target="_blank" rel="noreferrer">
                Open original source ↗
              </a>
              <button
                className="primary"
                onClick={() => {
                  learn?.(reading.symbols[0] || "", reading);
                  setReading(null);
                }}
              >
                Discuss this evidence
              </button>
            </div>
          </div>
        </Modal>
      )}
      <p className="research-refresh-state" role="status">
        {refreshState}
      </p>
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
                onRead={setReading}
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
          <Panel title="Read. Verify. Decide.">
            <div className="insight-copy">
              <div className="insight-icon">
                <BookOpen size={22} />
              </div>
              <h3>Build a view, not a headline reaction.</h3>
              <p>
                Read the original, compare independent sources, then ask what
                would change your mind.
              </p>
              <button
                className="primary"
                disabled={!items.length}
                onClick={() =>
                  learn?.(/^[A-Z0-9&_.-]{1,30}$/.test(query) ? query : "")
                }
              >
                Discuss the evidence
              </button>
              <div className="research-coverage">
                <strong>
                  {sources.filter((s) => s.count > 0).length} sources with
                  stored items
                </strong>
                <span>
                  {sources.filter((s) => s.status === "error").length}{" "}
                  unavailable on last refresh
                </span>
              </div>
              <details className="source-directory">
                <summary>Sources, freshness & connections</summary>
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
              </details>
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
