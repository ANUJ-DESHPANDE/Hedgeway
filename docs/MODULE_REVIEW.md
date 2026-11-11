# Module review — 11 November 2026

This review covers the distinct runtime modules and their connections. It is an engineering review and test record, not a claim that every possible workflow or production condition has been exhausted.

| Module | Refinement / verified design | Boundary and integration |
|---|---|---|
| App shell and overview | Graphite/orange theme, horizontal navigation, searchable Explore, source-aware market ribbon, useful empty states; lazy route chunks | Broker connectivity and last-trade freshness are separate. No decorative chart is presented as market data. |
| Instrument discovery | Fixed Upstox's unsupported result-page size; exact exchange/symbol resolution; metadata-only search stays separate from prices | Upstox and Kite catalogues; explicit NSE metadata for unconnected/Yahoo use; unsupported BSE mappings are rejected. |
| Quotes and streaming | Account-authorized REST and V3 feed tested; corrected previous-close and last-trade-time parsing; reconnection/watchdog, batched SSE and persistence | Read-only APIs. Old quotes stay timestamped and cannot trigger live price alerts. Provider switching clears prior-provider quote snapshots. |
| Chart workspace | TradingView Lightweight Charts candles, volume, area view, prior-bar mean, VWAP, time controls, pan/zoom, accessible table and CSV | Actual Upstox/Kite candles or explicitly chosen Yahoo research. Company context carries into AI, scanner and news; external TradingView link. |
| Setup scanner | Completed-bar rules, adjustable recent average, confirmation/volume, gaps/freshness, transaction-cost sizing, saved reproducible input | Scanner uses real completed candles, not the possibly forming chart candle. Yahoo is always research-only. Exact scan ID/exchange is pinned for AI discussion. |
| AI learning desk | Gemini default; free-model allowlist; Teach me / Read evidence / Challenge thinking; 12-turn bounded context; editable follow-ups; learning-note export | No paid fallback, autonomous inference or trading tools. A real Google key and Flash-Lite answer were validated; transient service failures remain visible. Free-tier billing configuration is controlled by Google. |
| Evidence selection | Source-diversified recent excerpts, scoped SQL filtering before limits, current quote timestamps, strict citation IDs, portfolio sharing off by default | General learning explanations are distinct from current market observations. Source validity does not prove model reasoning. |
| Research ingestion | Independent RSS feeds fetch concurrently, per-feed jobs expose failures, canonical URL deduplication and SQLite FTS | NSE and RBI disclosures, TradingQnA, Mint, ET and ValuePickr use public feeds; official timezone-less dates are normalized as IST. Moneycontrol's rejection is visible. Reddit uses official OAuth and requires approved credentials; no hidden scraping bypass. |
| Portfolio and imports | SQL constraints, exchange/symbol keys, non-mutating preview, atomic imports, missing-price coverage and sector/concentration views | CSV and optional Kite holdings sync. Position snapshots are not cash-flow-adjusted investment returns; no invented holdings. |
| Strategy lab / analytics | Full-bar signal delay, costs, benchmark, drawdown, volatility and tail-risk calculations with future-data-independence tests | Historical data/CSV experiments; no claim of trained predictive model, out-of-sample edge or actual trading P&L. |
| IPO monitor | Dated list/detail snapshots, GMP disputes, QIB/category blanks when unavailable, outcome analysis and throttled requests | New iCalendar export carries reported opening/closing dates to Apple/Google/Outlook calendars; broker cutoff times must be checked. |
| Journal and alerts | Private persisted thesis/risk/catalyst notes and price alerts | Alerts are NSE and evaluated only from recent broker prices. No SMS/email/webhook or order placement is implied. AI learning notes export as Markdown. |
| Database / backup | WAL, FTS5, transactions, indexes, durable provider caches and SQLite online backup | Runtime data and credentials are excluded from Git and Docker build context. Backup requires retaining the encryption key privately. |
| Security / access | AES-GCM secrets, session expiry/revocation, origin checks, rate-limited login and AI, bounded provider responses, no token in client output | Local loopback by default. Remote production requires strong password and HTTPS cookies/origin. Multi-user tenancy is not claimed. |
| Build / operations | TypeScript strict checks, unit/API/browser tests, dependency audit, non-root read-only container and persistence smoke test | GitHub Actions repeats release checks. No public-host deployment, paid service activation or Windows execution is implied. |

## Performance choices

Market ticks are coalesced into browser updates every 100 ms and database snapshots every second. Candles have provider-aware caching; chart auto-refresh runs only while the page is visible. Obsolete chart fetches are aborted, and selected-company responses are checked before display. Chart code is lazy loaded with market/scanner pages. Historical scan lists return summaries instead of every candle array. Feed requests execute concurrently with independent failure recording. Yahoo HTTP 429 causes durable backoff rather than retries through alternate hosts.

## Interoperability

- Upstox read-only data and Kite portfolio/data APIs are independent selections.
- Google Gemini receives a bounded evidence packet through its native API, not a scraped browser chat session.
- TradingView links carry the selected exchange/symbol; local chart CSV is usable in spreadsheets and notebooks.
- IPO `.ics` downloads import into common calendars without granting account permissions.
- AI `.md` downloads keep learning notes portable across local files and note applications.
- Holdings CSV, historical-price CSV, saved scanner JSON and SQLite backup remain available.

Use [VERIFICATION.md](VERIFICATION.md) for executed checks and outstanding account/environment acceptance tests.
