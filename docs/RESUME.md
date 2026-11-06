# Recruiter-facing description

**Hedgeway | Indian-market investing workspace**

TypeScript, React, Node.js, Express, SQLite/FTS5, WebSockets, Docker, GitHub Actions

- Built a personal investing platform with broker-stream adapters, transactional portfolio imports, source-linked news/forum ingestion and historical IPO snapshots; implemented SQL constraints, full-text search, encrypted credentials and authenticated server-sent events.
- Implemented a reproducible strategy lab with delayed signals, trading costs, drawdown, volatility and tail-risk metrics; verified future-data independence and failure handling with automated tests.

Use only the features you can explain and demonstrate. Do not claim deployment uptime, exchange latency, live brokerage validation, a trained ML model, or investment performance that has not been measured. Add the final CI test count only after the corresponding commit passes CI.

## Suggested walkthrough

1. Explain the SQL schema, composite exchange/symbol keys and atomic import rollback.
2. Trace one broker frame through decoding, normalization, SSE delivery and snapshot persistence.
3. Show how missing prices keep portfolio totals unavailable.
4. Demonstrate an RSS import twice and show canonical-URL deduplication plus FTS search.
5. Explain why a headline lexicon is not a predictive ML model.
6. Run a historical-price CSV experiment, vary costs, and explain the full-bar signal delay.
7. Show credential encryption, callback-state binding, CSRF tests, CI and a consistent database backup.
