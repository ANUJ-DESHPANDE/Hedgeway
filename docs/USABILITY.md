# Usability decisions

The first-use flow prioritizes reading research, following companies and importing existing holdings. Broker credentials are needed only for account and market-data features.

| Friction found in the review                                           | Change                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty balances, allocation charts and risk tools dominate first launch | A focused start screen offers import/watchlist actions alongside real research and IPO content. Empty portfolios show one useful next step.                                   |
| Users must know exchange trading codes                                 | Company-name search uses the selected broker’s catalogue. A clearly labelled small metadata catalogue is available without credentials; exact-symbol entry remains available. |
| A typo can block a whole feed and cannot be removed without a price    | Valid instruments keep streaming. Unresolved symbols are identified and every watchlist item has a remove action.                                                             |
| CSV import writes before the user can see its effect                   | Choose file → server-validated preview → save. The preview separates additions and updates; invalid rows identify their CSV row number.                                       |
| Credential setup presents every option and technical detail at once    | One selected price provider, numbered instructions, encrypted in-app credential forms and an explicit next action. Optional source setup and operational logs are expandable. |
| A disconnected price banner interrupts news and journal workflows      | The detailed feed banner appears on market-dependent screens. Navigation still carries compact connection status.                                                             |
| Reddit sync fails immediately when unconfigured                        | The action routes to connection setup; the public forum feed remains usable.                                                                                                  |
| Advanced measures obscure the basic result                             | Risk, drawdown detail, GMP outcome studies and experiment assumptions are expandable. The lab explains the tested rule in plain language.                                     |
| Edited experiment settings can appear to describe old results          | Results retain their actual run parameters and explicitly request a rerun when inputs change.                                                                                 |
| Live updates can steal focus from a dialog                             | Focus setup runs only on dialog mount, traps only visible/enabled controls and restores the previous focus and page scroll on close.                                          |
| A completed IPO request can reopen a dismissed dialog                  | Responses update only the still-selected issue. Detail failures remain in the dialog with a retry action.                                                                     |

| AI setup overwhelms the research workflow | Setup collapses after connection; question starters fill an editable draft. Saved discussions preserve evidence, and source references open the corresponding excerpt. |
| A scanner looks like an unexplained buy signal | Each rule has a pass/wait explanation, with stale-data labels and a separate hypothetical plan. Advanced thresholds and sizing are expandable. |
| Sending a setup to AI could unexpectedly spend API credits | The scanner fills a question and selects the stock; the user reviews it and explicitly sends the paid request. |
| Sensitive portfolio details could enter every AI request | Holdings and sizing assumptions are excluded by default. A labelled checkbox enables sharing for that request. |

A second scanner review preserves the exact scan when handing it to AI, labels changed form settings without rewriting results, updates stale states on a timer, and exports the original evidence. Reviewing history pauses auto-refresh, loads only the selected scan and scrolls its result into view. Scoped AI retrieval applies the company filter before the feed limit.

The stylesheet includes mobile layouts, visible focus states, dark/light themes and reduced-motion handling. Desktop and mobile Chromium interaction tests exercise the primary workflows, including dialog focus during live updates. Screenshots of the overview, research, connections, AI desk and scanner were reviewed. Screen-reader and broader cross-browser acceptance remain separate deployment checks.

## Visual and navigation redesign

The permanent sidebar was replaced by a horizontal navigation deck and a searchable Explore control. The overview uses a dark graphite/orange palette, a strong typographic hierarchy, a decorative orbital graphic and direct actions for market watch, imports, setup analysis, research and testing. The graphic is not a market chart. It respects reduced-motion preferences. Market-strip values come only from stored broker quotes and carry timestamps; disconnected feeds do not generate prices. Mobile navigation scrolls horizontally, with Explore providing an alternative route to every page. Existing portfolio, import and scanner workflows remain available.
