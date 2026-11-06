# Third-party sources

Runtime dependencies retain their respective licenses, recorded in the lockfile and installed packages.

`server/providers/proto/MarketDataFeed.proto` is the Upstox V3 wire-format schema downloaded from [Upstox's official documentation](https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto). It is included for interoperability, with its original package and message definitions intact. It is not original Hedgeway application code. Recheck the upstream schema when upgrading the provider.

The Kite equity binary decoder implements the publicly documented [Kite Connect v3 WebSocket protocol](https://kite.trade/docs/connect/v3/websocket/). No SDK source was copied.

Product research considered [Ghostfolio](https://github.com/ghostfolio/ghostfolio), [OpenBB](https://openbb.co/), [Portfolio Performance](https://www.portfolio-performance.info/en/), and [Freqtrade's look-ahead analysis](https://github.com/freqtrade/freqtrade/blob/develop/docs/lookahead-analysis.md). Hedgeway's application implementation is independent; no code or visual assets from those projects are included.

Market/news/IPO content is obtained from its named providers. The application license does not grant redistribution rights over exchange data, publisher articles, or community content. Provider credentials and fetched datasets are excluded from this repository.
