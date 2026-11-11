import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  RefreshCw,
  Upload,
} from "lucide-react";
import { number, post, remove, timestamp } from "../api";
import type { Action, Page } from "../navigation";
import type { Job } from "../types";
import { Panel } from "../ui";
export default function Integrations({
  status,
  busy,
  action,
  importCSV,
  setWorkspace,
  go,
}: {
  status: any;
  busy: boolean;
  action: Action;
  importCSV: () => void;
  setWorkspace: () => void;
  go: (page: Page) => void;
}) {
  const [token, setToken] = useState(""),
    [kiteKey, setKiteKey] = useState(""),
    [kiteSecret, setKiteSecret] = useState(""),
    [showKite, setShowKite] = useState(false);
  const recent = new Map<string, Job>();
  for (const job of status.jobs as Job[])
    if (!recent.has(job.provider)) recent.set(job.provider, job);
  const failures = [...recent.values()].filter(
    (j) => j.status === "error",
  ).length;
  const isYahoo = status.marketProvider === "yahoo";
  const isKite = status.marketProvider === "kite";
  return (
    <>
      <Panel
        title="Connect your prices"
        sub="Pick one price provider. You can keep your portfolio with a different broker."
      >
        <div className="integration-body connection-steps">
          <label>
            1. Choose a provider
            <select
              value={status.marketProvider}
              disabled={busy}
              onChange={(e) =>
                action(
                  () => post("/market/provider", { provider: e.target.value }),
                  "Price provider updated",
                )
              }
            >
              <option value="yahoo">
                Yahoo research · no account · NSE snapshots
              </option>
              <option value="upstox">
                Upstox · free · Upstox account required
              </option>
              <option value="kite">Zerodha Kite · paid market data plan</option>
            </select>
          </label>
          <p>
            {isYahoo
              ? "No signup or API key. Unofficial NSE snapshots and historical candles; timing and availability are not guaranteed. Select Yahoo explicitly; it never substitutes for a failed broker feed."
              : isKite
                ? "Use Kite for both your holdings and prices. Live prices and history need its market-data plan."
                : "Upstox provides a free, read-only Analytics Token. This is a key for market data; Hedgeway does not place trades."}
          </p>
          <p className="subtle">
            {isYahoo
              ? "Add NSE companies in Markets, then select Refresh quotes. Yahoo supports 1-minute and 5-minute research candles, with no BSE ticker mapping."
              : "After connecting, add companies in Markets. Prices start updating automatically."}
          </p>
        </div>
      </Panel>
      {isYahoo && (
        <Panel
          title="Research without an account"
          sub="No fabricated data. No paid fallback."
        >
          <div className="integration-body">
            <p>
              Yahoo may rate-limit requests. Quotes are cached for one minute.
              Intraday results stay labelled historical/research even if recent;
              use an entitled broker for live entry timing.
            </p>
            <button className="primary" onClick={() => go("Markets")}>
              Add NSE companies <ArrowRight size={16} />
            </button>
          </div>
        </Panel>
      )}
      {!isKite && !isYahoo && (
        <Panel
          title="2. Connect Upstox"
          sub={
            status.upstox
              ? "Your token is saved. Add companies to start receiving their prices."
              : "One account key, saved privately on this server."
          }
          action={
            <span className={`tag ${status.upstox ? "green" : ""}`}>
              {status.upstox ? "TOKEN SAVED" : "NOT CONNECTED"}
            </span>
          }
        >
          <div className="integration-body">
            {!status.upstox && (
              <ol className="setup-list">
                <li>Sign in to your Upstox account and open Developer Apps.</li>
                <li>Open the Analytics tab and generate an Analytics Token.</li>
                <li>
                  Paste that token below. Hedgeway checks it before saving.
                </li>
              </ol>
            )}
            {!status.upstox && (
              <a
                className="button"
                href="https://upstox.com/developer/api-documentation/analytics-token/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Upstox’s step-by-step guide <ArrowUpRight size={15} />
              </a>
            )}
            {status.upstox && (
              <div className="button-row">
                <button className="primary" onClick={() => go("Markets")}>
                  Add companies to follow <ArrowRight size={16} />
                </button>
              </div>
            )}
            <details className="disclosure compact" open={!status.upstox}>
              <summary>
                {status.upstox
                  ? "Replace or remove saved token"
                  : "I have my Analytics Token"}
              </summary>
              <form
                className="token-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await action(
                      () => post("/upstox/token", { token }),
                      "Upstox connected. Add companies in Markets to start receiving prices.",
                    )
                  )
                    setToken("");
                }}
              >
                <label>
                  Analytics Token
                  <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste the token from Upstox"
                    required
                    minLength={20}
                  />
                </label>
                <div className="button-row">
                  <button className="primary" disabled={busy || !token}>
                    {busy ? "Checking…" : "Check & connect"}
                  </button>
                  {status.upstox && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action(
                          () => remove("/upstox"),
                          "Saved token removed. Environment-provided credentials, if any, still apply.",
                        )
                      }
                    >
                      Remove saved token
                    </button>
                  )}
                </div>
                <p className="subtle">
                  Encrypted on this server. The saved token is never displayed
                  again.
                </p>
              </form>
            </details>
          </div>
        </Panel>
      )}
      {(isKite || showKite || status.kite.connected) && (
        <Panel
          title={isKite ? "2. Connect Zerodha Kite" : "Your Zerodha holdings"}
          sub="Sign in at Zerodha to bring your holdings into Hedgeway."
          action={
            <span className={`tag ${status.kite.connected ? "green" : ""}`}>
              {status.kite.connected
                ? "CONNECTED"
                : status.kite.configured
                  ? "READY TO SIGN IN"
                  : "APP SETUP NEEDED"}
            </span>
          }
        >
          <div className="integration-body">
            <details
              className="disclosure compact"
              open={!status.kite.configured}
            >
              <summary>
                {status.kite.configured
                  ? "Manage Kite app credentials"
                  : "First time? Set up your Kite app"}
              </summary>
              <ol className="setup-list">
                <li>
                  Create an app in the{" "}
                  <a
                    href="https://developers.kite.trade/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Kite developer console <ArrowUpRight size={14} />
                  </a>
                  .
                </li>
                <li>
                  Use the redirect URL below. Copy the app’s API key and API
                  secret.
                </li>
                <li>Save them here, then choose “Sign in with Zerodha”.</li>
              </ol>
              <div className="copy-field">
                <code>{status.callback}</code>
                <button
                  aria-label="Copy Kite redirect URL"
                  onClick={() =>
                    action(
                      () => navigator.clipboard.writeText(status.callback),
                      "Redirect URL copied",
                    )
                  }
                >
                  <Copy size={15} />
                  Copy
                </button>
              </div>
              <form
                className="token-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await action(
                      () =>
                        post("/kite/credentials", {
                          apiKey: kiteKey,
                          apiSecret: kiteSecret,
                        }),
                      "App credentials saved. Sign in with Zerodha to verify them.",
                    )
                  ) {
                    setKiteKey("");
                    setKiteSecret("");
                  }
                }}
              >
                <label>
                  API key
                  <input
                    autoComplete="off"
                    value={kiteKey}
                    onChange={(e) => setKiteKey(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  API secret
                  <input
                    type="password"
                    autoComplete="off"
                    value={kiteSecret}
                    onChange={(e) => setKiteSecret(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>
                <div className="button-row">
                  <button disabled={busy || !kiteKey || !kiteSecret}>
                    Save app credentials
                  </button>
                  {status.kite.configured && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action(
                          () => remove("/kite/credentials"),
                          "Saved app credentials removed. Environment configuration, if any, still applies.",
                        )
                      }
                    >
                      Remove saved credentials
                    </button>
                  )}
                </div>
              </form>
              <p className="subtle">
                Kite’s free Personal API can supply holdings. Its live-price and
                historical-data plan is separate.
              </p>
            </details>
            {status.kite.configured && (
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const result = await post("/kite/connect");
                      window.location.assign(result.url);
                    }, "Opening Zerodha sign-in…")
                  }
                >
                  {status.kite.connected
                    ? "Reconnect Zerodha"
                    : "Sign in with Zerodha"}
                  <ArrowUpRight size={15} />
                </button>
                {status.kite.connected && (
                  <>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setWorkspace();
                        if (
                          await action(
                            () => post("/kite/sync"),
                            "Holdings synced",
                          )
                        )
                          go("Portfolio");
                      }}
                    >
                      Sync my holdings
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action(
                          () => remove("/kite"),
                          "Kite disconnected from Hedgeway",
                        )
                      }
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            )}
            <p className="subtle">
              Kite requires a fresh login each day. Enter your broker password
              and OTP only on Zerodha’s page.
            </p>
          </div>
        </Panel>
      )}
      <Panel
        title="Bring in your portfolio"
        sub="Choose the route that suits you. Both use your real holdings."
      >
        <div className="integration-body button-row">
          <button className="primary" onClick={importCSV}>
            <Upload size={16} />
            Import holdings CSV
          </button>
          {!isKite && !showKite && !status.kite.connected && (
            <button onClick={() => setShowKite(true)}>
              Use my Zerodha holdings <ArrowRight size={15} />
            </button>
          )}
          <p className="subtle">
            CSV imports include a review step. Your portfolio stays private.
          </p>
        </div>
      </Panel>
      <details className="disclosure">
        <summary>
          News, forums & IPO sources{" "}
          {failures > 0 && (
            <span className="tag amber">
              {failures} source{failures === 1 ? "" : "s"} need attention
            </span>
          )}
        </summary>
        <Panel
          title="Research and IPO updates"
          sub={
            status.scheduler
              ? "Automatic updates are on while Hedgeway is running."
              : "Use the refresh buttons to fetch the latest available data."
          }
        >
          <div className="integration-body">
            <p>
              Economic Times and Moneycontrol supply articles. ValuePickr
              supplies forum discussions. Xflot supplies IPO details and
              reported GMP; category details are requested when you open an
              issue.
            </p>
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() =>
                  action(() => post("/research/refresh"), "Research updated")
                }
              >
                <RefreshCw size={15} />
                Refresh research
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(() => post("/ipos/refresh"), "IPOs updated")
                }
              >
                <RefreshCw size={15} />
                Refresh IPOs
              </button>
            </div>
            <details className="disclosure compact">
              <summary>
                Reddit setup · {status.reddit ? "configured" : "optional"}
              </summary>
              <p>
                Reddit requires an approved API app. ValuePickr discussions are
                available without this setup.
              </p>
              <p>
                For the server administrator: set REDDIT_CLIENT_ID,
                REDDIT_CLIENT_SECRET and a descriptive REDDIT_USER_AGENT in the
                private environment configuration.
              </p>
              <a
                href="https://www.reddit.com/dev/api/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Reddit API documentation <ArrowUpRight size={14} />
              </a>
            </details>
            <p className="subtle">
              IPO requests share a one-minute provider cooldown. Figures show
              their retrieval time and may lag the source.
            </p>
          </div>
        </Panel>
        <Panel
          title="Recent source activity"
          sub={`${number(status.database.articles, 0)} articles · ${number(status.database.ipoSnapshots, 0)} IPO snapshots stored`}
        >
          {status.jobs.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Result</th>
                    <th>Records</th>
                    <th>When</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {status.jobs.map((job: Job) => (
                    <tr key={job.id}>
                      <td>{job.provider}</td>
                      <td>
                        <span
                          className={`tag ${job.status === "success" ? "green" : job.status === "error" ? "red" : ""}`}
                        >
                          {job.status === "success"
                            ? "Updated"
                            : job.status === "error"
                              ? "Could not update"
                              : "Updating"}
                        </span>
                      </td>
                      <td>{job.count}</td>
                      <td>{timestamp(job.started_at)}</td>
                      <td className="job-message">
                        {job.message || "Completed"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-note">
              No updates yet. Refresh a source above to get started.
            </p>
          )}
        </Panel>
      </details>
      <p className="subtle">
        <Check size={14} /> {status.auth} · Only you can access this workspace.
      </p>
    </>
  );
}
