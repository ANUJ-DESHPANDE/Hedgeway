# Verification record

Verified in the build workspace on 8 November 2026 UTC. This records observed checks, not a production certification.

## Automated checks

- `npm run check`: **99 tests across 9 files passed**, TypeScript strict checking passed, and the Vite production build completed.
- Coverage includes transaction rollback, exchange/symbol isolation, missing-price behavior, CSV validation, future-data independence, trading costs, secret encryption/tamper rejection, session expiry/revocation, request-origin enforcement, callback-state rejection, FTS/deduplication, IPO cooldown/provenance, credential lifecycle, binary feed decoding, a mocked stream-to-database-to-alert pipeline, intraday incomplete/future-bar exclusion, stale/gapped candles, cost-aware sizing, AI citation validation, evidence privacy, exact-scan/exchange grounding, scoped research retrieval, reproducible session capture, lazy scan-history retrieval and model failure recovery.
- `npm audit --audit-level=moderate`: **0 reported vulnerabilities** at the time of verification. This is a dependency advisory check, not a penetration test.
- The main frontend JavaScript bundle was approximately **244.5 kB / 78 kB gzip**. Chart code is a separate approximately **398 kB / 115.8 kB gzip** chunk. Pages are lazy loaded. These are build sizes, not measured browser performance scores.
- SQLite online backup completed; the reopened backup returned `PRAGMA integrity_check = ok` and preserved 80 ingested articles and 98 stored IPO snapshots.
- Tracked-file inspection confirmed that environment secrets, account tokens, runtime databases and build artifacts were excluded from Git.

## Deployment and workflow checks

The production image built successfully and the isolated container smoke test passed: non-root user, read-only root filesystem, static frontend delivery, health check, unauthenticated API rejection, secure session cookie flags, foreign-origin rejection, empty real-data state, authenticated SSE, persistence across container restart and logout revocation. The smoke test creates and removes its own temporary database volume.

Additional workflow regressions cover import preview without mutation, company-name discovery without fabricated prices, BSE scrip-code normalization, useful first-use screens, unavailable Reddit setup and disabled experiments without a price source. Static component checks are supplemented by **14 Playwright browser cases across desktop Chrome and mobile Chrome emulation**: all ten screens, searchable Explore navigation, horizontal overflow and page errors, CSV preview/save/delete, focus persistence during live updates and Escape restoration, disconnected AI/scanner states, cited AI reports/follow-ups, and scanner results with exact-scan AI handoff, changed-setting warnings, automatic stale labels, saved-scan retrieval and original-evidence export. Populated AI/scanner interactions use explicit isolated test fixtures, not a live provider account.

Desktop and mobile screenshots were reviewed using real ingested public content. Review led to clearer first-use states, replacement of unsupported text glyphs, active-first IPO ordering and a fix for hidden numeric fields blocking scanner submission. This is not a comprehensive assistive-technology audit.

## Public-provider checks

A real ingestion pass successfully received 50 Economic Times articles and 30 ValuePickr forum topics. The Xflot list endpoint returned 100 records, stored by issue identity; an IPO detail request returned 14 reported GMP observations. That issue returned no category subscription observations, and no substitute values were generated.

A subsequent refresh added nine new Economic Times articles, deduplicated already stored ValuePickr topics, and refreshed 100 IPO records. Moneycontrol returned HTTP 403 in this environment. The job was recorded as failed while the other providers continued. Provider availability and coverage can change independently of Hedgeway.

## Acceptance checks still requiring the intended environment

- Account-authorized Upstox streaming/history and a complete Kite login/holdings sync. Protocol and boundary tests use isolated fixtures; they do not prove a brokerage account's entitlement or real market-hour latency.
- Approved Reddit OAuth access; no Reddit credentials were available.
- A paid OpenAI Responses request with an authorized API key. Contract, privacy and UI tests isolate model responses; they do not establish model accuracy or account/model access.
- Comprehensive assistive-technology review, additional browser engines and intended-device acceptance.
- Public HTTPS deployment, certificate validation, market-hour reconnect/expiry behavior and sustained uptime. Deployment files are supplied; no externally hosted installation is claimed.

CI runs the unit/API checks, desktop/mobile browser workflows, dependency audit, container build and the isolated container smoke test on pushes and pull requests. See the repository's Actions tab for the status of the exact commit being reviewed.
