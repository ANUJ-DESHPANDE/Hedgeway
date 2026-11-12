# Verification record

Checked on 11 November 2026. This records executed checks, not a production certification or a guarantee of trading performance.

## Automated checks

- **111 tests across 10 files**, strict TypeScript checking and the Vite production build passed. Tests cover financial calculations, imports/transactions, exchange isolation, provider contracts, feed timestamps, encryption/authentication, binary streams, complete/stale candles, reproducibility, source citations/privacy, Gemini request routing, quota failures, one bounded service retry, chart indicators and calendar export.
- **16 Playwright cases** passed across desktop and mobile Chrome emulation. They cover all ten pages, navigation, import preview/save/delete, modal focus, unavailable-provider behavior, sourced AI answers, scanner history/export/AI handoff, chart controls/downloads and learning handoff. AI/chart/scanner fixtures are isolated in the test suite.
- Dependency audit: **0 reported vulnerabilities** at verification time. This is not a penetration test.
- Main frontend bundle: approximately **245.6 kB / 78.4 kB gzip**. Lightweight Charts component chunk: **182.4 kB / 59 kB gzip**; existing Recharts chunk: **398.4 kB / 115.8 kB gzip**. Pages/chart code are lazy loaded; these are build sizes, not browser performance scores.
- Online SQLite backup completed and its integrity check returned `ok`. The runtime database also passed `quick_check` following an environment interruption.
- Inspection of tracked/new files found no supplied Upstox token, Gemini key or encryption key. Runtime configuration, databases and backups are excluded from Git and container build context.

## Real market-data acceptance

An authorized Upstox Analytics Token was validated and stored encrypted. Exact instrument lookup, REST quotes and V3 WebSocket authorization/subscription succeeded for Reliance, Infosys and HDFC Bank. The socket received actual price frames. Historical endpoints returned 495 daily close observations for the strategy adapter, and the chart endpoint returned 375 one-minute, 125 three-minute, 75 five-minute and 248 daily OHLCV candles for Reliance during the checks.

Verification occurred outside the active trading session. Last-trade timestamps were retained, and the stream was correctly labeled as older snapshots. This does **not** establish market-hour latency, long-run reconnect behavior or equivalence to the Kite client. The real scanner returned a stale result after market close instead of an actionable current setup.

Live testing found and fixed Upstox's search-page limit and the difference between after-close OHLC close, daily net change and last-trade time. Regression tests cover both.

Desktop and mobile screenshots in `docs/images/markets-*.jpg` show actual provider candles. Both viewport widths passed the real-data horizontal-overflow check. A mobile issue involving an absolutely positioned table label was fixed by containing it in the scroll wrapper. Source-coverage information is now visible on mobile.

## Real research and AI acceptance

A live ingestion pass stored 60 NSE disclosure items, 10 RBI releases, 30 TradingQnA topics, 35 Mint items, 50 new Economic Times items and four new ValuePickr topics, in addition to earlier stored content. NSE and RBI publish timezone-less dates: their adapters explicitly interpret them as IST. Moneycontrol returned HTTP 403; its failure stays visible while other feeds continue.

These adapters read public RSS headlines/excerpts and link to original articles/documents. They do not claim exhaustive scraping, full PDF/article reading, all forum comments or representative trader sentiment.

The supplied Google key passed model-access validation and was encrypted. The user confirmed the Google project was Free tier. Gemini Flash-Lite completed a real source-grounded INFY learning request (941 input tokens, 575 output tokens). An independent minimal generation request also succeeded. Some fuller requests returned HTTP 503; the app now retries temporary 502/503/504 errors once within the same timeout and then preserves the question with a clear error. It does not change to a paid provider. Google service availability and quotas remain outside Hedgeway's control.

Gemini 3.8 Flash and 3.5 Flash-Lite are the explicit supported models. The workspace was switched to Flash-Lite during acceptance checks. Free API use depends on Google's project tier and terms, not just the model name. No billing was enabled.

## Deployment and operations

The production container built. Its first startup smoke attempt hit this cloud workspace's disk limit; disposable Docker build cache was removed, and the retry passed: non-root user, read-only root filesystem, static frontend, health, unauthenticated API rejection, secure cookies, CSRF rejection, empty real-data state, SSE, persistent SQLite after restart and logout revocation.

GitHub Actions repeats tests, production build, dependency audit, desktop/mobile browser checks, container build and runtime smoke tests for the pushed commit. Consult its exact commit status before treating a release as verified.

## Remaining environment/account acceptance

- Sustained live-market streaming, expiry/reconnect behavior and intended-PC acceptance.
- Kite account login/holdings sync and approved Reddit OAuth credentials.
- Comprehensive assistive-technology checks and additional browser engines.
- Public HTTPS hosting and uptime: deployment artifacts are included; no externally hosted installation is claimed.
- AI accuracy is not established by a valid source ID or passing integration tests. Review original material and recognize coverage gaps before making decisions.

## CI infrastructure follow-up — 12 November

The first published run passed tests, build and audit, then failed while Ubuntu package mirrors could not be resolved during Playwright dependency installation. CI now pins Ubuntu 24.04 and verifies/uses a preinstalled Chrome or Chromium when available; it falls back to the normal Playwright installer otherwise. Browser tests are not skipped.
