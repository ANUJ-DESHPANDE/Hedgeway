# Personal Market Desk Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Track verified progress here; preserve existing drafts.

**Goal:** Deliver the sourced Today → company → evidence → conversation workflow with coherent navigation and retained advanced tools.
**Architecture:** Preserve React/Node/SQLite and broker adapters. Add focused briefing services, explicit company context, readable layouts and persistent conversational state. No new paid dependencies.
**Tech Stack:** React 19, TypeScript, Express 5, Node 24, SQLite WAL/FTS5, Lightweight Charts.
**Spec:** Owner-supplied HEDGEWAY_IMPLEMENTATION_PROMPT.md and HEDGEWAY_PRODUCT_DIRECTION.md (private attachments; not copied to public repository).

## Global constraints
- Real data only; no automatic AI generations on navigation.
- Preserve credentials, database and existing feature routes. No paid usage or account actions.
- Today's ranks describe available coverage, not the entire exchange. Source and timestamp must remain visible.
- No personal investor profile or secrets in tracked documentation.

## Review focus
- Empty/new user still gets useful research and company discovery.
- Stale quotes never appear as current rankings; sector samples remain labelled.
- Company changes and late AI replies cannot corrupt the current discussion.
- Docked assistant must not squeeze chart below a usable width.
- Updates/restarts preserve credentials and user work.

## Tasks
- [x] Preserve drafts; run baseline unit/API tests (112 passed); create working branch and consistent database backup.
- [ ] Verify subscription inference official contract and included-only usage before implementing/enabling it. Verify actual endpoints rather than trusting brief claims.
- [ ] Complete briefing service/page: server/rundown.ts, src/pages/Today.tsx, src/today.css, tests/rundown.test.ts. GET /api/rundown returns typed saved-data view; refresh reads sources under existing cache. Unit tests cover invalid/future/stale dates, sector scope and news provenance.
- [ ] Rebuild shell: Today/Explore/Portfolio/Notebook, visible Explore sections and compatibility routes; real ticker with pause/reduced motion; meaningful responsive typography. Files main.tsx, navigation.ts, new market-desk.css and ticker component. Preserve direct routes to advanced modules.
- [ ] Recompose Markets and Research: visible discovery, compact controls, large stable chart, relevant evidence and usable reading states. Selected instrument passed explicitly, requests aborted on scope change.
- [ ] Finish chat draft: conversation-first, concise seeds, persistent drafts, source/context continuity, friendly failures and provider-specific privacy. No source refresh blocking routine sends by default. Meaningful regression tests.
- [ ] Notebook aggregates existing notes, discussions and saved sources with direct reopening; retain scanner, lab, IPO, portfolio and settings routes.
- [ ] Inspect desktop/mobile screenshots, run build/unit/browser regression, fix findings, verify real provider operations without paid generation, and report exact account/target limitations.

## Execution ledger
- Baseline HEAD 3e6af88. Existing AIDesk/rundown/Today/chat CSS drafts retained and copied privately before edits.
- Ruling: proceed from supplied detailed direction and existing code/screenshots without another design questionnaire; user explicitly requested autonomous execution.
- Subscription research worker exceeded account usage; root continues directly, no credits purchased.

## Verified implementation status — 13 November
- Implemented Today, shell/navigation, ticker, Notebook, source reader, immutable chart context, source handoff and persistent chat drafts. Existing advanced feature routes remain.
- Added bounded extractive older-turn retrieval; this is not versioned semantic memory or unlimited context.
- Verified official subscription documentation and implemented local sign-in/model discovery. Account authorization and included-only credit policy are unverified; generation is deliberately disabled. Gemini remains explicit and imported portfolio sharing is blocked for its free-tier path.
- Regression: 127 unit/API tests passed; full browser suite 31 passed with one intentionally inapplicable mobile case skipped (desktop dock interaction).
- Visual inspection: desktop 1440×900, laptop 1366×768, mobile 390×844; horizontal overflow absent. Fixed disclosure-heavy default news and declining-only Today coverage found during review.
- Pending acceptance/remaining spec: actual subscription consent and no-credit account controls, live-market latency, intended Windows install, verified Nifty-wide universe, full article/forum-thread ingestion, assistant streaming/cancellation/idempotency and durable versioned memory. No claim that the entire supplied roadmap is finished.
