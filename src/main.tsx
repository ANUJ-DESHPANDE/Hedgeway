import {
  AlertTriangle,
  Sparkles,
  ScanLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Moon,
  Newspaper,
  Plug,
  Rocket,
  Search,
  ShieldCheck,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { portfolio as calculatePortfolio } from "./analytics";
import { api, post, remove } from "./api";
import type { Page } from "./navigation";
import type { ScanReference } from "./intelligence-types";
import ImportModal from "./pages/ImportModal";
import "./styles.css";
import type { Article, IPO, Mode, Portfolio, Quote } from "./types";
import { Modal } from "./ui";
const AIDesk = lazy(() => import("./pages/AIDesk"));
const SetupScanner = lazy(() => import("./pages/SetupScanner"));
const Overview = lazy(() => import("./pages/Overview"));
const Markets = lazy(() => import("./pages/Markets"));
const PortfolioView = lazy(() => import("./pages/PortfolioView"));
const Research = lazy(() => import("./pages/Research"));
const IPOView = lazy(() => import("./pages/IPOView"));
const Lab = lazy(() => import("./pages/Lab"));
const Journal = lazy(() => import("./pages/Journal"));
const Integrations = lazy(() => import("./pages/Integrations"));

const pages: { name: Page; icon: typeof Wallet; group: string }[] = [
  { name: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { name: "Markets", icon: ChartNoAxesCombined, group: "" },
  { name: "Setup scanner", icon: ScanLine, group: "" },
  { name: "Portfolio", icon: Wallet, group: "" },
  { name: "Research", icon: Newspaper, group: "DISCOVER" },
  { name: "AI desk", icon: Sparkles, group: "" },
  { name: "IPOs", icon: Rocket, group: "" },
  { name: "Strategy lab", icon: FlaskConical, group: "" },
  { name: "Journal", icon: BookOpen, group: "PERSONAL" },
  { name: "Integrations", icon: Plug, group: "" },
];
const descriptions: Record<Page, string> = {
  Overview: "Your portfolio, market watch and latest research in one place.",
  "AI desk":
    "Discuss the evidence, challenge the story, and see what remains unknown.",
  "Setup scanner":
    "Your intraday dip-and-rebound rules, checked against real candles.",
  Markets: "Follow Indian equities and ETFs with source-aware prices.",
  Portfolio: "Understand what you own, and where your risk lives.",
  Research: "Follow the story. Keep the source. Form your own view.",
  IPOs: "Track the book, compare demand, and question the premium.",
  "Strategy lab":
    "Turn an investment hypothesis into a reproducible experiment.",
  Journal: "Write down the thesis before the market tests it.",
  Integrations: "Your data sources, connection health, and ingestion history.",
};

function App() {
  const [session, setSession] = useState<{
      authenticated: boolean;
      local: boolean;
    } | null>(null),
    [sessionError, setSessionError] = useState("");
  const [page, setPage] = useState<Page>(
    () =>
      pages.find((p) => p.name === decodeURIComponent(location.hash.slice(1)))
        ?.name || "Overview",
  );
  const [aiSeed, setAISeed] = useState<{
    question: string;
    symbol: string;
    scan?: ScanReference;
  } | null>(null);
  const [mode, setMode] = useState<Mode>("workspace");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("hedgeway-theme") || "dark",
  );
  const [data, setData] = useState<{
    portfolio: Portfolio;
    quotes: Quote[];
    articles: Article[];
    ipos: IPO[];
  } | null>(null);
  const [status, setStatus] = useState<any>(null),
    [watch, setWatch] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [search, setSearch] = useState(false),
    [importing, setImporting] = useState(false),
    [version, setVersion] = useState(0);
  const [streamStatus, setStreamStatus] = useState<{
    state: string;
    provider: string;
    message: string;
    lastTickAt: string | null;
  } | null>(null);
  const loadedMode = useRef(mode);
  const show = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    api("/session")
      .then(setSession)
      .catch((e) => setSessionError(e.message));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hedgeway-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("hedgeway-mode", mode);
  }, [mode]);
  useEffect(() => {
    const f = () =>
      setPage(
        pages.find((p) => p.name === decodeURIComponent(location.hash.slice(1)))
          ?.name || "Overview",
      );
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (p: Page) => {
    location.hash = encodeURIComponent(p);
    setPage(p);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    if (loadedMode.current !== mode) {
      setLoading(true);
      setData(null);
      loadedMode.current = mode;
    }
    setLoadError("");
    Promise.all([
      api(`/dashboard?mode=${mode}`),
      api("/status"),
      api<any[]>("/watchlist"),
    ])
      .then(([d, s, w]) => {
        if (active) {
          setData((current) => {
            const quotes = new Map(
              (d.quotes as Quote[]).map((q) => [
                `${q.exchange}:${q.symbol}`,
                q,
              ]),
            );
            for (const q of current?.quotes || []) {
              const incoming = quotes.get(`${q.exchange}:${q.symbol}`);
              if (incoming && q.asOf > incoming.asOf)
                quotes.set(`${q.exchange}:${q.symbol}`, q);
            }
            const merged = [...quotes.values()];
            return {
              ...d,
              quotes: merged,
              portfolio: calculatePortfolio(d.portfolio.positions, merged),
            };
          });
          setStatus(s);
          setWatch(w.map((x) => `${x.exchange}:${x.symbol}`));
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, version, session]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = setInterval(() => {
      if (!document.hidden) setVersion((v) => v + 1);
    }, 30_000);
    const refresh = () => {
      if (!document.hidden) setVersion((v) => v + 1);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const source = new EventSource("/api/stream");
    source.addEventListener("status", (event) => {
      try {
        setStreamStatus(JSON.parse(event.data));
      } catch {
        /* invalid events are ignored */
      }
    });
    source.addEventListener("quotes", (event) => {
      try {
        const incoming = JSON.parse(event.data) as Quote[];
        setData((current) => {
          if (!current) return current;
          const map = new Map(
            current.quotes.map((q) => [`${q.exchange}:${q.symbol}`, q]),
          );
          for (const q of incoming) {
            const old = map.get(`${q.exchange}:${q.symbol}`);
            if (!old || q.asOf >= old.asOf)
              map.set(`${q.exchange}:${q.symbol}`, q);
          }
          const quotes = [...map.values()];
          return {
            ...current,
            quotes,
            portfolio: calculatePortfolio(current.portfolio.positions, quotes),
          };
        });
      } catch {
        /* invalid events are ignored */
      }
    });
    source.onerror = () =>
      setStreamStatus((s) => ({
        provider: s?.provider || "Market feed",
        state: "disconnected",
        message:
          "Dashboard stream interrupted. Reconnecting automatically; displayed prices are last received values.",
        lastTickAt: s?.lastTickAt || null,
      }));
    return () => source.close();
  }, [session]);
  const action = async (fn: () => Promise<any>, message: string) => {
    setBusy(true);
    try {
      const result = await fn();
      const failures = Array.isArray(result)
        ? result.filter((r) => r.status === "error")
        : result?.status === "error"
          ? [result]
          : [];
      if (failures.length)
        show(
          failures.map((r: any) => `${r.provider}: ${r.message}`).join(" · "),
          true,
        );
      else show(message);
      setVersion((v) => v + 1);
      return !failures.length;
    } catch (e) {
      show((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggleWatch = (q: Quote) =>
    action(
      () =>
        watch.includes(`${q.exchange}:${q.symbol}`)
          ? remove(`/watchlist/${q.exchange}/${q.symbol}`)
          : post("/watchlist", { symbol: q.symbol, exchange: q.exchange }),
      "Watchlist updated",
    );
  if (!session)
    return (
      <div className="login-screen">
        <div className="brand">
          <Logo />
          hedgeway
        </div>
        {sessionError ? (
          <>
            <p role="alert">{sessionError}</p>
            <button onClick={() => location.reload()}>Retry connection</button>
          </>
        ) : (
          <p>Opening your workspace…</p>
        )}
      </div>
    );
  if (!session.authenticated)
    return <Login onLogin={() => api("/session").then(setSession)} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="terminal-header">
        <div className="terminal-top">
          <a href="#Overview" className="brand" aria-label="Hedgeway overview">
            <Logo />
            <span className="brand-word">
              HEDGEWAY<small>THE INVESTING LAB</small>
            </span>
          </a>
          <span className="terminal-location">INDIA / NSE + BSE</span>
          <div className="top-actions">
            <button
              className="search-button"
              aria-label="Quick navigation"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>Explore</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icon-button"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="terminal-connect"
              onClick={() => go("Integrations")}
            >
              <span
                className={`status-dot ${streamStatus?.state === "live" ? "" : "amber"}`}
              />
              {streamStatus?.state === "live"
                ? "FEED CONNECTED"
                : "CONNECT FEED"}
              <ArrowUpRight size={14} />
            </button>
            {!session.local && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  post("/logout").then(() =>
                    setSession({ authenticated: false, local: false }),
                  )
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
        <nav className="terminal-nav" aria-label="Main navigation">
          {pages.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "selected" : ""}`}
              onClick={() => go(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={15} />
              {name}
            </button>
          ))}
        </nav>
      </header>
      <div className="market-ribbon" aria-label="Market feed snapshots">
        <span className="ribbon-label">
          <span
            className={`status-dot ${streamStatus?.state === "live" ? "" : "amber"}`}
          />
          {streamStatus?.state === "live"
            ? "LIVE FEED"
            : data?.quotes.length
              ? "LAST SNAPSHOTS"
              : "MARKET FEED"}
        </span>
        <div className="ribbon-items">
          {data?.quotes.length ? (
            data.quotes.slice(0, 12).map((q) => (
              <button
                key={`${q.exchange}:${q.symbol}`}
                onClick={() => go("Markets")}
              >
                <strong>
                  {q.exchange}:{q.symbol}
                </strong>
                <span>₹{q.price.toLocaleString("en-IN")}</span>
                <span className={q.change >= 0 ? "positive" : "negative"}>
                  {q.change > 0 ? "+" : ""}
                  {q.change.toFixed(2)}%
                </span>
                <small>
                  {new Date(q.asOf).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  IST
                </small>
              </button>
            ))
          ) : (
            <span className="ribbon-empty">
              Your market, in real time.
              <span>Connect Upstox or Kite to bring this strip to life.</span>
            </span>
          )}
        </div>
      </div>
      <div
        className={`main-shell ${page === "Overview" ? "overview-shell" : ""}`}
      >
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR INVESTMENT WORKSPACE</div>
              <h1>{page === "Overview" ? "Your market overview" : page}</h1>
              <p>{descriptions[page]}</p>
            </div>
          </div>
          {[
            "Markets",
            "Portfolio",
            "Strategy lab",
            "Setup scanner",
            "Integrations",
          ].includes(page) && (
            <div
              className={`feed-banner ${streamStatus?.state === "live" ? "connected" : ""}`}
              role="status"
            >
              <span
                className={`status-dot ${streamStatus?.state === "live" ? "" : "amber"}`}
              />
              <span>
                <strong>{streamStatus?.provider || "Live market data"}</strong>{" "}
                ·{" "}
                {streamStatus?.message ||
                  "Connecting to your workspace stream…"}
              </span>
              <button
                className="text-button"
                onClick={() => go("Integrations")}
              >
                {streamStatus?.state === "live"
                  ? "Connection settings"
                  : "Connect prices"}{" "}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {loadError ? (
            <div className="error-box" role="alert">
              <AlertTriangle size={20} />
              <span>{loadError}</span>
              <button onClick={() => setVersion((v) => v + 1)}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div
              className="loading-grid"
              aria-label="Loading workspace"
              aria-busy="true"
            >
              {[1, 2, 3, 4, 5, 6].map((x) => (
                <div key={x} className="skeleton" />
              ))}
            </div>
          ) : (
            data && (
              <Suspense
                fallback={
                  <div className="skeleton" aria-label="Loading page" />
                }
              >
                {page === "Overview" && (
                  <Overview
                    data={data}
                    mode={mode}
                    go={go}
                    importCSV={() => setImporting(true)}
                    watch={watch}
                    onWatch={toggleWatch}
                  />
                )}
                {page === "Markets" && (
                  <Markets
                    quotes={data.quotes}
                    watch={watch}
                    onWatch={toggleWatch}
                    mode={mode}
                    busy={busy}
                    refresh={() =>
                      action(() => post("/quotes/refresh"), "Quotes refreshed")
                    }
                    removeWatch={(id) => {
                      const [exchange, symbol] = id.split(":");
                      void action(
                        () =>
                          remove(
                            `/watchlist/${exchange}/${encodeURIComponent(symbol)}`,
                          ),
                        "Instrument removed from watchlist",
                      );
                    }}
                    add={(symbol: string, exchange: string) =>
                      action(
                        () => post("/watchlist", { symbol, exchange }),
                        "Instrument added to watchlist",
                      )
                    }
                  />
                )}
                {page === "AI desk" && (
                  <AIDesk seed={aiSeed} go={go} show={show} />
                )}
                {page === "Setup scanner" && (
                  <SetupScanner
                    watch={watch}
                    connected={Boolean(
                      status.marketProvider === "upstox"
                        ? status.upstox
                        : status.kite.connected,
                    )}
                    go={go}
                    discuss={(scan) => {
                      setAISeed({
                        symbol: scan.symbol,
                        scan,
                        question: `Review this saved ${scan.exchange}:${scan.symbol} dip-and-rebound scan alongside the available news. Explain what supports it, what conflicts with it, whether the information is fresh, and what I should verify before deciding.`,
                      });
                      go("AI desk");
                    }}
                  />
                )}
                {page === "Portfolio" && (
                  <PortfolioView
                    portfolio={data.portfolio}
                    mode={mode}
                    importCSV={() => setImporting(true)}
                    busy={busy}
                    action={action}
                    go={go}
                  />
                )}
                {page === "Research" && (
                  <Research
                    redditReady={Boolean(status.reddit)}
                    go={go}
                    mode={mode}
                    action={action}
                    busy={busy}
                    version={version}
                  />
                )}
                {page === "IPOs" && (
                  <IPOView
                    mode={mode}
                    action={action}
                    busy={busy}
                    version={version}
                    show={show}
                  />
                )}
                {page === "Strategy lab" && (
                  <Lab
                    mode={mode}
                    show={show}
                    connected={Boolean(
                      status.marketProvider === "upstox"
                        ? status.upstox
                        : status.kite.connected,
                    )}
                    go={go}
                  />
                )}
                {page === "Journal" && (
                  <Journal action={action} busy={busy} version={version} />
                )}
                {page === "Integrations" && (
                  <Integrations
                    go={go}
                    status={status}
                    busy={busy}
                    action={action}
                    importCSV={() => setImporting(true)}
                    setWorkspace={() => setMode("workspace")}
                  />
                )}
              </Suspense>
            )
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={13} /> Personal research workspace · No order
              execution
            </span>
            <span>
              INR · Asia/Kolkata <span className="footer-divider">/</span>{" "}
              Hedgeway 2.0
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {search && <CommandPalette onClose={() => setSearch(false)} go={go} />}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={async (csv) => {
            if (
              await action(
                () => post("/holdings/import", { csv }),
                "Holdings imported. Connected price feeds update their value automatically.",
              )
            ) {
              setImporting(false);
              setMode("workspace");
              go("Portfolio");
            }
          }}
        />
      )}
    </div>
  );
}
function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true">
        <path d="M5 21V7h5v9L19 7h4v14h-5v-9l-9 9z" fill="currentColor" />
      </svg>
    </span>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <Logo />
          hedgeway
        </div>
        <h1>Your private workspace.</h1>
        <p>Sign in to view your portfolio and research.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await post("/login", { password });
              onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Workspace password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="negative" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Open workspace"}
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
function CommandPalette({
  onClose,
  go,
}: {
  onClose: () => void;
  go: (p: Page) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <Modal title="Go to…" onClose={onClose}>
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Search pages"
          placeholder="Portfolio, IPOs, research…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="command-results">
        {pages
          .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          .map((p) => (
            <button
              key={p.name}
              onClick={() => {
                go(p.name);
                onClose();
              }}
            >
              <p.icon size={18} />
              <span>{p.name}</span>
              <ArrowRight size={16} />
            </button>
          ))}
      </div>
    </Modal>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="login-screen">
        <h1>Something interrupted the workspace.</h1>
        <p>Your saved data is still in the database.</p>
        <button onClick={() => location.reload()}>Reload Hedgeway</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense
        fallback={<div className="login-screen">Loading Hedgeway…</div>}
      >
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
