# Hedgeway reassessment — 12 November 2026

## Product decision

The owner is a learner trader who repeatedly alternates between chart inspection, source reading and conversation. The core product is that loop, not a catalogue of ten feature pages. Keep the existing React/Node/SQLite and official Upstox/Gemini integrations. Replacing them merely to use newly installed plugins would add setup work and paid-service dependencies without fixing the workflow.

## Screenshot audit

Current-run captures were inspected at `/workspace/hedgeway-audit/` (private workspace artifacts, not production assets).

1. Workspace: real chart, clear timestamps, excessive broad news unrelated to selected company. Fix: scoped company coverage with explicit market-wide toggle and honest no-coverage state.
2. Research: source administration competes with reading. Fix: evidence discussion action and compact coverage summary, expandable source directory.
3. AI: question composer below a large setup introduction and six prompt cards. Fix: collapse setup details and starter prompts; keep symbol, approach and privacy controls available. Preserve drafts across drawer closure.
4. Connections: configured broker still resembles first-run onboarding. Fix: connected summary and collapsed provider settings.

Screenshots establish visual layout, not WCAG certification. Browser tests additionally check keyboard dismissal, focus, mobile overflow and workflow completion. Full screen-reader testing and formal contrast testing remain outside this pass.

## Installed capability inventory and application

Reviewed the complete available skill catalogue (51 entries at inspection time). Relevant groups:

- Product Design: visual audit, ideation and implementation guidance. Applied screenshot audit; existing code/screenshots and the owner's repeated delegation supply the target and authorization.
- Superpowers: test-first behavior fixes, independent review, verification. Applied regression tests that first reproduced draft loss and stale-response context errors.
- Firecrawl: research collection, official documentation, pricing and source-design extraction. Its chat connection is available, but no API secret is available to the local application. Chat installation must not be described as a deployed runtime integration. Credit balance alone does not prove a free subscription.
- MagicPath: optional interactive design alternatives; no requirement to recreate the working app on another platform.
- Exa: optional external multi-source research; no additional paid research job is needed for defects visible in this code.
- TinyFish: browser automation tools are connected. Existing Playwright captures and tests already exercise the local app without an additional cloud-browser service.
- Sites: hosted prototype tooling, not a drop-in host for this long-running SQLite/broker-stream application.
- Unrelated deck, pet, travel, lead-generation and property skills do not improve this dashboard.

## Module-by-module disposition

| Module | Decision and remaining limits |
| --- | --- |
| Market feeds | Preserve official broker stream, freshness states and reconnect logic. No silent Yahoo substitution. |
| Chart | Retain real OHLC/volume, mean, VWAP, intervals and exports; keep watchlist interactive with the desktop assistant. |
| Research | Show company scope explicitly, preserve publisher/time/source links and ingestion failures. Current ingestion is excerpts, not exhaustive full articles or forum replies. |
| AI learning | Preserve same-context draft/thread; reject late UI responses from an obsolete conversation context. Saved server-side discussions remain available. |
| Scanner | Retain transparent conditions, costs, invalidation and stale/historical labelling. Not a validated trading edge or order engine. |
| Portfolio | Keep transactional CSV preview/import and explicit unknown valuation states. Do not invent holdings. |
| IPOs | Keep missing GMP/subscription values null and source timestamps visible. |
| Strategy lab | Preserve no-lookahead calculations and reproducible exports; avoid presenting historical results as prediction. |
| Journal | Keep durable SQLite storage; no free ephemeral deployment masquerading as permanent storage. |
| Connections | Distinguish configured from fresh/live. Private connection transfer remains separate from public GitHub code. |
| Security | Keep encrypted stored credentials, ignored env/database files, authenticated remote access and source validation. |
| Delivery | Build, test, review, then update the existing repository. User still needs to pull changes into their Windows checkout. |

## Review findings incorporated

Independent review identified same-company reopen resets, stale asynchronous AI replies contaminating a new symbol, and the inability to operate the chart while the side sheet is open. Regression tests cover these behaviors. Desktop uses a nonmodal docked assistant; mobile uses a modal with focus trapping and scroll locking.

## Cost boundary

No new hosting, subscriptions, credit purchases, billing activation or paid API fallback. Installed chat connectors do not automatically become free production dependencies.

## Verification for this revision

Production build passed. All 112 unit/API tests passed. Playwright completed 29 desktop/mobile checks; one desktop-only dock check is intentionally skipped on mobile. Same-company reopen, obsolete AI replies, obsolete saved-thread loads and returning from saved discussion to chart context were reproduced as failing tests before their fixes. Final desktop/mobile captures showed no horizontal page overflow. Independent static review found no remaining important issues in the conversation fixes. This does not certify brokerage latency or unlimited model availability.
