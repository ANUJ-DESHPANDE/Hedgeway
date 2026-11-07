# Architecture and data contracts

## Runtime

Node 24 runs an Express 5 API, a broker stream worker and a bounded ingestion scheduler. Vite builds a React 19 client. Production serves the compiled client from the same origin as the API. Server-sent events provide one-way updates without exposing broker access tokens to JavaScript.

The deployment is intentionally single-owner and single-instance. SQLite WAL is suitable for this workload and supports transactions, indexes, constraints and FTS5. Horizontal replication and multi-user tenancy are not implemented; use PostgreSQL and explicit tenant authorization before changing that scope.

## Durable state

| Table                           | Role / invariant                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `holdings`                      | Composite exchange/symbol primary key; positive quantities and average prices; import commits atomically      |
| `quotes`                        | Last broker snapshot with source and exchange time; no seeded market prices                                   |
| `watchlist`                     | Explicit tracked exchange/symbol pairs                                                                        |
| `articles`, `articles_fts`      | Unique canonical URL; FTS trigger maintains search index; publication and retrieval times are separate        |
| `bookmarks`                     | Foreign key to articles; deletion cascades                                                                    |
| `ipo_snapshots`                 | Append-only observed provider payloads keyed by issue and retrieval time                                      |
| `notes`, `alerts`               | Personal research and price conditions; triggered alert timestamps persist                                    |
| `jobs`, `audit_log`             | Ingestion outcomes and a bounded description of state changes; no tokens or personal broker responses in logs |
| `sessions`, `oauth_states`      | SHA-256 session-token digests, expiry and one-use broker callback state                                       |
| `broker_session`, `credentials` | AES-256-GCM-encrypted tokens; encryption key lives outside the database                                       |
| `ai_threads`, `ai_runs`         | Saved discussions and atomic validated answer/evidence snapshots; deleting a thread cascades to its runs      |
| `scanner_runs`                  | Intraday parameters, inputs, checks and hypothetical plan; latest 1,000 runs retained                         |
| `cache`                         | Provider TTLs, request coalescing and durable IPO cooldown; never used for passwords                          |

Migrations run before the API starts. Applied migration files are immutable; add a numbered migration for schema changes. Runtime request handlers do not create tables.

## Market-data flow

1. Resolve watchlist/holding symbols through the selected broker's instrument catalog or exact search API. Never infer tokens from another security.
2. Open one broker WebSocket. Upstox sends protobuf; Kite sends documented binary equity packets.
3. Normalize price, previous close, exchange, symbol, source and exchange/server event time. Skip malformed or unsupported packets; never invent missing prices.
4. Keep the latest value per instrument in memory. Emit a browser update at most every 100 ms and persist a snapshot every second. This is a dashboard feed, not a lossless tick archive.
5. Recompute acquisition-cost portfolio values in the client using the same pure analytics module as the server.
6. Reconnect with bounded exponential delay. A 45-second heartbeat watchdog detects silent connections. A disconnected feed is visible; old values remain last-received snapshots.

The application caps subscribed personal instruments at 500, browser stream clients at 20, and watchlist entries at 100. It does not place orders. The stream selection is independent of the holdings provider.

## Ingestion

Feeds use a fixed source allowlist, timeouts, response-size limits, XML entity rejection, canonical-link deduplication and short text excerpts. Untrusted source content renders as React text. Reddit uses official app authentication and stores headline metadata, not full comment trees. The scheduler cannot grant access when a publisher or Reddit rejects a request.

IPO requests share a durable global one-minute cooldown and a five-minute payload cache. Missing subscription/GMP values stay `null`. Attribution and provider disclaimers travel with payloads.

## HTTP API

Core routes: `GET /api/dashboard`, `GET/POST /api/watchlist`, `POST /api/holdings/import`, `GET /api/export`, `POST /api/quotes/refresh`, `GET /api/stream`, `GET /api/research`, `POST /api/research/refresh`, `POST /api/research/reddit`, `GET /api/ipos`, `GET /api/ipos/:slug`, `GET /api/ipos/:slug/snapshots`, `GET /api/ipos/scoreboard`, `POST /api/lab`, `POST /api/stress`, `GET/POST /api/notes`, `GET/POST /api/alerts`, and `GET /api/status`.

Mutation bodies pass Zod validation. SQL arguments use prepared statements. Sensitive APIs require a session outside local mode; mutations also require the configured Origin. Errors expose a bounded useful message, while credentials remain server-side. A public `/api/health` checks SQLite availability without revealing portfolio content.

## AI and intraday decision support

`POST /api/scanner` resolves up to eight exact exchange/symbol pairs and fetches real broker candles through a 15-second cache. The pure analysis excludes unfinished candles and isolates the latest IST trading session. Each instrument fails independently. Results retain their source, parameters, bar timestamps and fetch time; saved results are historical reviews.

`POST /api/ai/ask` builds a bounded evidence packet from recent stored articles, quotes and an optional saved scan. It sends an explicit request to OpenAI Responses with strict structured output and `store: false`. No browser, URL-fetch, code-execution or trading tools are granted to the model. Source text is labelled untrusted and rendered as escaped text. These boundaries reduce prompt-injection impact; they do not guarantee reliable model judgment.

The server checks the response schema, rejects unknown evidence IDs and requires citations for observations before atomically saving the answer and its source snapshot. Citation validation establishes referential integrity, not factual entailment. Default requests exclude holdings and position-sizing assumptions. See [AI and scanner details](AI_AND_SCANNER.md) for privacy, limits and costs.
