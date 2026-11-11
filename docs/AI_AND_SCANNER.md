# AI research and short-term setup checks

## AI desk

Refresh Research, then use the AI desk. Google Gemini 3.8 Flash is the default, with Flash-Lite available. A free-tier Google AI Studio project without billing enabled is required for free use; quotas and provider terms apply. The server verifies model availability before encrypting a supplied key. No model request runs automatically and quota errors do not trigger paid fallback. A browser Gemini subscription/session is not an API credential.

Start with a question about themes, competing explanations, catalysts or missing evidence. Add a trading symbol to narrow the evidence, or leave it empty for the recent feed. Symbol matching uses stored tags and headline text; limited tagging can miss relevant coverage. The displayed coverage count helps expose this limitation. Follow-up questions reuse recent discussion summaries and retrieve a fresh evidence packet.

Answers distinguish observations and hypotheses, show conditional scenarios, risks and next questions, and link their references to the exact evidence snapshot saved for that answer. Review the original sources before relying on an interpretation. Source-reference checks cannot establish that an interpretation is true. The model can misunderstand a source or omit important context.

### What is sent

- Your question, selected symbol and up to four previous question/summary pairs.
- Up to 50 stored news/forum headlines and short excerpts published in the last seven days, drawn across available publishers. This is not exhaustive full-article or full-comment scraping.
- Up to 20 last-received quotes, with source timestamps; these may be stale.
- For a selected symbol, the latest saved setup analysis with its timestamp, or the exact saved scan pinned by a scanner handoff. A pinned scan also restricts quote context to its exchange. Candle arrays are excluded.
- Only if you enable the sharing checkbox: up to 100 saved holdings with quantities and acquisition costs, plus scan sizing assumptions. These are not current balances or verified account history. Prior portfolio-shared discussion runs are omitted from subsequent requests when sharing is disabled.

Default requests go to Google Gemini. Free-tier submissions may be used to improve Google products; do not include information you do not want shared. The optional legacy OpenAI adapter uses `store: false` when explicitly configured. The local SQLite database stores questions, answers, evidence snapshots and reported token usage. Deleting a discussion removes its runs locally. Backups may retain previous copies. Removing a saved key does not remove an independently configured provider environment variable.

There is one concurrent model request per workspace, a configurable local limit of up to 120 requests per hour, in addition to provider quotas, a 90-second provider timeout and a 3,000-output-token cap for learning and 6,000 for research/challenge requests. Input size and model pricing also affect costs. Incomplete, malformed or unknown-citation answers are not saved. A failed response may still incur provider charges. No external tools, order APIs or autonomous AI polling are enabled.

## Setup scanner

Connect an entitled Upstox or Kite market-data account in Integrations. Enter an NSE symbol or BSE scrip code, choose a candle size and recent-average window, then scan. You can instead scan the first eight watchlist entries. Optional refresh runs once per minute while the tab is visible; candle retrieval is separate from tick streaming.

The scanner checks your dip-and-rebound idea using completed candles. Each condition is explained separately, including volume, upward confirmation, gaps, freshness and room after estimated costs. The chart compares price with its prior-bar average. Expand the assumptions to change thresholds, costs and hypothetical capital/risk limits. Review any plan as an illustration, not an instruction or executable order.

“Conditions met” means only that the displayed rules passed on those bars. It does not imply a validated advantage, predict a rally or guarantee that the next execution price resembles the last close. Old bars and saved results are labelled historical. Outside market hours, available historical broker candles can still be inspected without pretending they are current.

“Discuss this setup with AI” prepares an editable question in AI desk. Review and send it explicitly. The AI can explain the saved conditions alongside available source evidence; it cannot establish profitability. A handoff pins the exact scan and exchange, including when reviewing an older result. The AI desk shows its timestamp and lets you explicitly switch to the latest available scan. If a pinned scan has expired from the 1,000-run history, the request stops with an explanation instead of substituting another result.

Export scan evidence downloads JSON containing the original parameters, source, completed-candle inputs, evaluation time and analysis. New scans retain the complete session needed to reproduce all metrics; legacy scans display a notice if their original input capture was incomplete. Changing form settings does not rewrite a saved result. Stale badges and the freshness check update as time passes, even without incoming market ticks. Opening a saved scan pauses automatic scanning. History lists load small summaries and fetch full evidence only when you open a scan.

The scanner's mathematics and assumptions are documented in [Analytics](ANALYTICS.md).

## Learning and conversation

Teach me is the default approach. It asks the model to define unfamiliar terms, explain mechanisms and use clearly labeled hypothetical arithmetic only when helpful. Conceptual teaching is labeled Learning note and may work without market evidence. Market observations still require references to supplied sources. Challenge my thinking asks for competing interpretations, fees, invalidation conditions and missing assumptions. The model must not treat a user's proposed trade as a confirmed edge.

Follow-ups include the last 12 prior questions, summaries, selected concepts and open questions, plus freshly selected evidence. This is bounded context, not unlimited memory. Earlier discussions that included portfolio information are excluded when current portfolio sharing is off. Old citation IDs cannot be used as current evidence. Saved discussions restore their company and approach. Suggested next questions are editable before sending. Markdown exports preserve the answer and source attribution.

No model can guarantee sound trading judgment. Citation validation verifies reference identity, not the correctness of the interpretation. A real Google key was validated and Flash-Lite completed a source-grounded learning answer; transient 503 failures were also observed.

Learning requests select at most 12 source excerpts, challenge requests 24, and research requests 50. Prior-turn context is bounded to 10,000 serialized characters; full discussions remain stored locally. Input/output usage is shown per answer, including reported thinking tokens. Source refresh uses five-minute caches. Temporary Gemini 502/503/504 failures are retried once; quota errors are not retried or redirected to paid services.
