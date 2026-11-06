# Analytics methodology

## Portfolio snapshot

For each position, invested cost is `quantity × averagePrice`; marked value is `quantity × lastPrice`; unrealised P&L is their difference. Percentage return divides that difference by acquisition cost. Dividends, fees, realised gains and cash-flow timing are not inferred from a holdings snapshot.

Quotes are joined on **exchange and symbol**. If any holding is unpriced, total portfolio value, P&L and percentage return are unavailable. Coverage reports the fraction of positions with quotes. Priced-position weights and sector allocation are explicitly based on the priced subset.

Concentration uses `HHI = sum(weight²)` with weights in `[0,1]`. Warnings identify an individual holding above 25%, a sector above 40%, and quotes over 36 hours old. These thresholds are descriptive heuristics, not suitability advice. The live connection banner and individual quote timestamps provide the more immediate freshness context.

Stress tests apply an explicit percentage shock to current value. The UI applies a uniform shock; the API accepts per-sector shocks with `All` as a fallback. There is no probabilistic claim or inferred correlation model.

## Moving-average experiment

The strategy is long or cash. It computes a trailing mean, delays the decision by one full bar, executes at the prior close and earns the following close-to-close return. This conservative convention avoids claiming execution at the very close required to know the signal.

Starting equity is 100 for both strategy and buy-and-hold. Per-side cost is charged on every exposure change: `(1 − turnover × costBps / 10000) × (1 + exposure × return) − 1`. Cash earns zero; the final position is marked to market and not force-liquidated. Buy-and-hold is gross of costs, so the UI labels that distinction.

- Annualised return: `(ending / starting)^(252 / observedReturnDays) − 1`.
- Volatility: sample standard deviation of daily returns × `sqrt(252)`.
- Sharpe: `(meanDailyReturn − 0.06/252) / sampleSD × sqrt(252)`; undefined for zero variance.
- Drawdown: equity divided by running peak minus one; maximum drawdown is the minimum observed value.
- VaR: the negative empirical fifth-percentile daily return, floored at zero.
- Expected shortfall: negative mean of the worst `ceil(5% × n)` daily returns, floored at zero.

Exports include input prices, a SHA-256 data fingerprint, source, parameters and results. Prices must be positive, finite, unique by date and chronological. Duplicate CSV dates are rejected. Broker candle corporate-action adjustments are not assumed; adjusted data is preferable when available.

This is a single-security exploratory experiment. It does not implement execution simulation, taxes, liquidity/market impact, borrow costs, walk-forward optimization or a survivorship-free universe. Selecting parameters on the same sample can overfit. Test a separate period and inspect corporate actions before interpreting results.

## Research tone

A small positive/negative word lexicon assigns a headline score; nearby negation reverses a matched word. The score is the signed matched-word count divided by total matched words. Zero means neutral or no matched terms. This is transparent text processing, not a trained sentiment model, confidence score or trading recommendation.

## IPO outcomes

The outcome study displays the provider's sample size, directional hit rate and mean absolute percentage-point error. It does not recalculate statistics from incomplete data or assume the sample is unbiased. GMP is unofficial; uncertainty and disputed-source flags are retained.
