import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import { date, money, number } from "../api";
import type { Article, IPO, Mode, Portfolio, Quote } from "../types";
import type { Page } from "../navigation";
import { Empty, Panel, QuoteTable, Stat, colors } from "../ui";
export default function Overview({
  data,
  mode,
  go,
  watch,
  onWatch,
  importCSV,
}: {
  data: {
    portfolio: Portfolio;
    quotes: Quote[];
    articles: Article[];
    ipos: IPO[];
  };
  mode: Mode;
  go: (p: Page) => void;
  watch: string[];
  onWatch: (q: Quote) => void;
  importCSV: () => void;
}) {
  const p = data.portfolio;
  if (!p.positions.length)
    return (
      <>
        <section className="welcome-panel">
          <span className="eyebrow">MAKE ROOM FOR A CLEARER VIEW</span>
          <h2>Start with what you want to follow.</h2>
          <p>
            Read market news and track IPOs right away. Bring in your holdings
            whenever you’re ready.
          </p>
          <div className="button-row">
            <button className="primary" onClick={importCSV}>
              Import my holdings <ArrowRight size={16} />
            </button>
            <button onClick={() => go("Markets")}>Build a watchlist</button>
          </div>
          <p className="subtle">
            Already invest with Zerodha?{" "}
            <button className="text-button" onClick={() => go("Integrations")}>
              Connect Kite to sync holdings ↗
            </button>
          </p>
        </section>
        <div className="two-columns">
          <Panel
            title="Latest research"
            sub="Original sources. Fresh context."
            action={
              <button className="text-button" onClick={() => go("Research")}>
                Read all ↗
              </button>
            }
          >
            <div className="briefing-list">
              {data.articles.length ? (
                data.articles.slice(0, 4).map((a) => (
                  <a
                    className="briefing-item"
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div>
                      <small>{a.source}</small>
                      <h3>{a.title}</h3>
                    </div>
                    <ArrowUpRight size={16} />
                  </a>
                ))
              ) : (
                <Empty
                  title="Your briefing is getting started"
                  detail="Open Research to fetch news and forum discussions."
                  action={
                    <button onClick={() => go("Research")}>
                      Open research
                    </button>
                  }
                />
              )}
            </div>
          </Panel>
          <Panel
            title="IPO watch"
            sub="Issue dates and demand, with reported grey-market premiums."
            action={
              <button className="text-button" onClick={() => go("IPOs")}>
                Track IPOs ↗
              </button>
            }
          >
            {data.ipos.length ? (
              <div className="briefing-list">
                {data.ipos.slice(0, 4).map((ipo) => (
                  <button
                    className="ipo-preview"
                    key={ipo.slug}
                    onClick={() => go("IPOs")}
                  >
                    <span>
                      <strong>{ipo.name}</strong>
                      <small>
                        {ipo.status} · Closes {date(ipo.closeDate)}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Explore the primary market"
                detail="See current issues, subscription demand and reported GMP."
                action={
                  <button onClick={() => go("IPOs")}>Open IPO tracker</button>
                }
              />
            )}
          </Panel>
        </div>
        {data.quotes.length > 0 && (
          <Panel
            title="Your market watch"
            action={
              <button className="text-button" onClick={() => go("Markets")}>
                Manage watchlist ↗
              </button>
            }
          >
            <QuoteTable
              quotes={data.quotes.slice(0, 5)}
              watch={watch}
              onWatch={onWatch}
              compact
            />
          </Panel>
        )}
      </>
    );
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="PORTFOLIO VALUE"
          value={money(p.value)}
          detail={
            p.positions.length
              ? `${p.positions.length} holdings · ${number(p.coverage, 0)}% priced`
              : "Import holdings to get started"
          }
        />
        <Stat
          label="UNREALISED RETURN"
          value={money(p.pnl)}
          change={p.returnPct}
          detail="vs. acquisition cost"
        />
        <Stat
          label="CAPITAL INVESTED"
          value={p.positions.length ? money(p.invested) : "—"}
          detail="Excludes realised gains and dividends"
        />
        <Stat
          label="RESEARCH & DISCOVERY"
          value={String(data.articles.length)}
          detail={"Recent stories in your briefing"}
        />
      </div>
      <div className="overview-grid">
        <Panel
          title="Portfolio composition"
          sub="A view of your capital across sectors"
          action={
            <button className="text-button" onClick={() => go("Portfolio")}>
              Explore portfolio <ArrowUpRight size={15} />
            </button>
          }
        >
          <div className="composition">
            {p.sectors.length ? (
              <>
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(${p.sectors.map((s, i) => `${colors[i % colors.length]} ${p.sectors.slice(0, i).reduce((a, b) => a + b.weight, 0)}% ${p.sectors.slice(0, i + 1).reduce((a, b) => a + b.weight, 0)}%`).join(",")})`,
                  }}
                >
                  <div>
                    <span className="eyebrow">INVESTED ACROSS</span>
                    <strong>{p.sectors.length}</strong>
                    <span>sectors & asset classes</span>
                  </div>
                </div>
                <div className="allocation-list">
                  {p.sectors.map((s, i) => (
                    <div key={s.name}>
                      <span
                        className="legend-dot"
                        style={{ background: colors[i % colors.length] }}
                      />
                      <span>{s.name}</span>
                      <strong>{s.weight.toFixed(1)}%</strong>
                      <small>{money(s.value)}</small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Empty
                title="Your portfolio starts here"
                detail="Import a holdings CSV or connect Kite to see your allocation."
                action={
                  <button
                    className="primary"
                    onClick={() => go("Integrations")}
                  >
                    Connect your data <ArrowRight size={15} />
                  </button>
                }
              />
            )}
          </div>
          <div className="panel-note">
            <ShieldCheck size={15} />
            {p.sectors.length
              ? `${number(p.concentration, 3)} concentration index · Lower values indicate more evenly distributed holdings.`
              : "Connect Kite or import your holdings to build your portfolio."}
          </div>
        </Panel>
        <Panel
          title="On your radar"
          sub="Research worth a closer look"
          action={<span className="tag">BRIEFING</span>}
        >
          <div className="briefing-list">
            {data.articles.length ? (
              data.articles.slice(0, 3).map((a, i) => (
                <a
                  className="briefing-item"
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="briefing-index">0{i + 1}</span>
                  <div>
                    <small>{a.source}</small>
                    <h3>{a.title}</h3>
                  </div>
                  <ArrowUpRight size={16} />
                </a>
              ))
            ) : (
              <Empty
                title="Build your briefing"
                detail="Fetch the latest articles from the Research page."
              />
            )}
          </div>
          <button
            className="panel-bottom-button"
            onClick={() => go("Research")}
          >
            Open research feed <ArrowRight size={15} />
          </button>
        </Panel>
      </div>
      <div className="section-header">
        <div>
          <h2>Market watch</h2>
          <p>A focused view of Indian equities and ETFs</p>
        </div>
        <button className="text-button" onClick={() => go("Markets")}>
          All instruments <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="panel">
        {data.quotes.length ? (
          <QuoteTable
            quotes={data.quotes.slice(0, 5)}
            watch={watch}
            onWatch={onWatch}
            compact
          />
        ) : (
          <Empty
            title="No market snapshots yet"
            detail="Add instruments to your watchlist, connect a data provider, then refresh quotes."
            action={
              <button onClick={() => go("Markets")}>Set up watchlist</button>
            }
          />
        )}
      </div>
      <div className="bottom-feature">
        <div className="feature-icon">
          <FlaskConical size={24} />
        </div>
        <div>
          <span className="eyebrow">FROM IDEA TO EVIDENCE</span>
          <h3>Give your strategy a reality check.</h3>
          <p>Test the hypothesis. Account for costs. Inspect the drawdown.</p>
        </div>
        <button onClick={() => go("Strategy lab")}>
          Open strategy lab <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
