import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  ShieldCheck,
  ScanLine,
  Sparkles,
  Radio,
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
        <section className="signal-hero">
          <div className="signal-copy">
            <span className="hero-kicker">
              <span /> INDEPENDENT THINKING. INDIAN MARKETS.
            </span>
            <h2>
              Find the signal.
              <br />
              <em>Own the decision.</em>
            </h2>
            <p>
              A sharper view of your markets. Track the moves, challenge the
              narrative, and turn a trading idea into something you can actually
              examine.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => go("Markets")}>
                Open market workspace <ArrowUpRight size={18} />
              </button>
              <button onClick={importCSV}>
                Import my holdings <ArrowRight size={16} />
              </button>
            </div>
            <div className="hero-footnote">
              <span className="hero-index">01 — YOUR EDGE STARTS HERE</span>
              <button
                className="text-button"
                onClick={() => go("Integrations")}
              >
                Connect Kite <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="signal-object">
            <div className="orbital-scene" aria-hidden="true">
              <div className="orbital-ring ring-one" />
              <div className="orbital-ring ring-two" />
              <div className="orbital-ring ring-three" />
              <div className="orbital-core">
                H<span>HEDGEWAY</span>
              </div>
              <span className="orbital-coordinate coordinate-one">
                RESEARCH
              </span>
              <span className="orbital-coordinate coordinate-two">
                PRICE ACTION
              </span>
              <span className="orbital-coordinate coordinate-three">
                CONVICTION
              </span>
            </div>
            <div className="signal-status">
              <Radio size={16} />
              <div>
                <strong>
                  {data.quotes.length
                    ? `${data.quotes.length} market snapshots`
                    : "Your feed is waiting"}
                </strong>
                <p>
                  {data.quotes.length
                    ? "Source timestamps travel with every quote."
                    : "Connect your broker. No simulated prices."}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Connect market feed"
                onClick={() => go("Integrations")}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
          </div>
        </section>
        <div className="launch-grid">
          <button onClick={() => go("Setup scanner")}>
            <span className="launch-icon">
              <ScanLine size={23} />
            </span>
            <span>
              <small>01 / PRICE ACTION</small>
              <strong>Catch the setup.</strong>
              <p>Your dip-and-rebound rules, made visible.</p>
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button onClick={() => go("AI desk")}>
            <span className="launch-icon">
              <Sparkles size={23} />
            </span>
            <span>
              <small>02 / RESEARCH INTELLIGENCE</small>
              <strong>Challenge the story.</strong>
              <p>Discuss the evidence. See what’s missing.</p>
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button onClick={() => go("Strategy lab")}>
            <span className="launch-icon">
              <FlaskConical size={23} />
            </span>
            <span>
              <small>03 / STRATEGY LAB</small>
              <strong>Put it to the test.</strong>
              <p>Real inputs. Explicit costs. Reproducible results.</p>
            </span>
            <ArrowUpRight size={19} />
          </button>
        </div>
        <div className="section-header editorial-heading">
          <div>
            <span className="eyebrow">THE INFORMATION ADVANTAGE</span>
            <h2>Beyond the price.</h2>
          </div>
          <span className="subtle">
            Source-linked research / Primary markets
          </span>
        </div>
        <div className="two-columns">
          <Panel
            title="Latest research"
            sub="Original sources. Fresh context."
            action={
              <button className="text-button" onClick={() => go("Research")}>
                Read all <ArrowUpRight size={14} />
              </button>
            }
          >
            <div className="briefing-list">
              {data.articles.length ? (
                data.articles.slice(0, 4).map((a, i) => (
                  <a
                    className="briefing-item"
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="briefing-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
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
                Track IPOs <ArrowUpRight size={14} />
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
                Manage watchlist <ArrowUpRight size={14} />
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
