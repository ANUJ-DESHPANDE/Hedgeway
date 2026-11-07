# AI research and short-term setup checks

## AI desk

Refresh Research, then open AI desk and connect an OpenAI API key. The server checks that the chosen model is available to your API account before encrypting the key. The default is GPT-5.5; another compatible `gpt-` model can be entered. A ChatGPT subscription does not include API billing. No model request runs automatically.

Start with a question about themes, competing explanations, catalysts or missing evidence. Add a trading symbol to narrow the evidence, or leave it empty for the recent feed. Symbol matching uses stored tags and headline text; limited tagging can miss relevant coverage. The displayed coverage count helps expose this limitation. Follow-up questions reuse recent discussion summaries and retrieve a fresh evidence packet.

Answers distinguish observations and hypotheses, show conditional scenarios, risks and next questions, and link their references to the exact evidence snapshot saved for that answer. Review the original sources before relying on an interpretation. Source-reference checks cannot establish that an interpretation is true. The model can misunderstand a source or omit important context.

### What is sent

- Your question, selected symbol and up to four previous question/summary pairs.
- Up to 50 stored news/forum headlines and short excerpts published in the last seven days, drawn across available publishers. This is not exhaustive full-article or full-comment scraping.
- Up to 20 last-received quotes, with source timestamps; these may be stale.
- For a selected symbol, the latest saved setup analysis with its timestamp, or the exact saved scan pinned by a scanner handoff. A pinned scan also restricts quote context to its exchange. Candle arrays are excluded.
- Only if you enable the sharing checkbox: up to 100 saved holdings with quantities and acquisition costs, plus scan sizing assumptions. These are not current balances or verified account history. Prior portfolio-shared discussion runs are omitted from subsequent requests when sharing is disabled.

Requests go to OpenAI with `store: false`; OpenAI's account/data-retention policies still apply. The local SQLite database stores questions, answers, evidence snapshots and reported token usage. Deleting a discussion removes its runs locally. Backups may retain previous copies. Removing the saved key does not remove an independently configured `OPENAI_API_KEY` environment variable.

There is one concurrent model request per workspace, a 30-request hourly limit, a 90-second provider timeout and a 7,000-output-token cap per request. Input size and model pricing also affect costs. Incomplete, malformed or unknown-citation answers are not saved. A failed response may still incur provider charges. No external tools, order APIs or autonomous AI polling are enabled.

## Setup scanner

Connect an entitled Upstox or Kite market-data account in Integrations. Enter an NSE symbol or BSE scrip code, choose a candle size and recent-average window, then scan. You can instead scan the first eight watchlist entries. Optional refresh runs once per minute while the tab is visible; candle retrieval is separate from tick streaming.

The scanner checks your dip-and-rebound idea using completed candles. Each condition is explained separately, including volume, upward confirmation, gaps, freshness and room after estimated costs. The chart compares price with its prior-bar average. Expand the assumptions to change thresholds, costs and hypothetical capital/risk limits. Review any plan as an illustration, not an instruction or executable order.

“Conditions met” means only that the displayed rules passed on those bars. It does not imply a validated advantage, predict a rally or guarantee that the next execution price resembles the last close. Old bars and saved results are labelled historical. Outside market hours, available historical broker candles can still be inspected without pretending they are current.

“Discuss this setup with AI” prepares an editable question in AI desk. Review and send it explicitly. The AI can explain the saved conditions alongside available source evidence; it cannot establish profitability. A handoff pins the exact scan and exchange, including when reviewing an older result. The AI desk shows its timestamp and lets you explicitly switch to the latest available scan. If a pinned scan has expired from the 1,000-run history, the request stops with an explanation instead of substituting another result.

Export scan evidence downloads JSON containing the original parameters, source, completed-candle inputs, evaluation time and analysis. New scans retain the complete session needed to reproduce all metrics; legacy scans display a notice if their original input capture was incomplete. Changing form settings does not rewrite a saved result. Stale badges and the freshness check update as time passes, even without incoming market ticks. Opening a saved scan pauses automatic scanning. History lists load small summaries and fetch full evidence only when you open a scan.

The scanner's mathematics and assumptions are documented in [Analytics](ANALYTICS.md).
