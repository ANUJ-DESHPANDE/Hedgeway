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

The stylesheet includes mobile layouts, visible focus states, dark/light themes and reduced-motion handling. Runtime smoke and static-render checks were executed; visual/browser interaction acceptance remains pending because this environment did not provide a browser tool.
