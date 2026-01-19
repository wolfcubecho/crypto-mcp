# Crypto MCP

A [Model Context Protocol](https://modelcontextprotocol.io/introduction) (MCP) server that provides Claude AI with real-time access to cryptocurrency data from the CoinMarketCap API.

## Features

This server provides the following tools to Claude:

- **get-cryptocurrency-listings**: Get the latest cryptocurrency market data
- **get-cryptocurrency-quotes**: Retrieve quotes for specific cryptocurrencies
- **get-cryptocurrency-map**: Fetch the mapping of cryptocurrencies to CoinMarketCap IDs
- **get-cryptocurrency-info**: Get detailed metadata for specific cryptocurrencies
- **get-global-metrics**: Access global cryptocurrency market metrics
- **get-exchange-listings**: Get information about cryptocurrency exchanges

### Discovery Tools (Token-Efficient)

- **discover-top**: CMC top-N discovery narrowed via Binance 24h + OHLCV.
    - Params: `topN` (default 20), `resultCount` (default 5), `interval` (default `1h`), `limit` (default `250`), `convert` (default `USD`), `sort` (`market_cap|volume_24h|percent_change_24h`, default `market_cap`), `sort_dir` (`desc|asc`, default `desc`), `rankMax` (default `50`), `atrPctMax` (default `1.0`).
    - Ranking: prioritize stronger uptrend → lower ATR% → larger absolute 24h move.
    - Output: compact summaries including `symbol`, `price`, `pct24h`, `vol24h`, `atrPct`, `trend`, `rating`, and CMC `rank/market_cap`.

- **discover-pick**: Single-call “top N → best resultCount” with explicit strategy.
    - Params: same as `discover-top`, plus `strategy` (`strong_up_low_atr` default, or `strong_up_high_vol`).
    - Filters: applies `rankMax` and `atrPctMax` before ranking.
    - Strategy ranking:
        - `strong_up_low_atr`: stronger uptrend → lower ATR% → higher volume → larger absolute 24h move.
        - `strong_up_high_vol`: stronger uptrend → higher volume → lower ATR% → larger absolute 24h move.

## Prerequisites

- A CoinMarketCap API key (get one at [pro.coinmarketcap.com](https://pro.coinmarketcap.com))

## Integration with Claude Desktop

To integrate this MCP server with Claude Desktop:

1. Locate the Claude Desktop configuration file:

    - On macOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`

2. Add the following configuration to the file:

```json
{
    "mcpServers": {
        "cmc": {
            "command": "npx",
            "args": ["crypto-mcp"],
            "env": {
                "COINMARKET_API_KEY": "your-api-key-here"
            }
        }
    }
}
```

## Manual Installation

1. Clone this repository
2. Install dependencies:

```bash
# Using npm
npm install

# Using bun
bun install
```

3.  Build the TypeScript code:

```bash
# Using npm
npm run build

# Using bun
bun run build
```

## Usage in Claude

Once configured, you can ask Claude to perform various cryptocurrency-related tasks:

- "Show me the top 10 cryptocurrencies by market cap"
- "What's the current price of Bitcoin and Ethereum?"
- "What are the global cryptocurrency market metrics today?"
- "Tell me about the Binance exchange"

### Discovery Examples

- "Discover top 20 by market cap and pick best 5 with low volatility"
    - Tool: `discover-pick`
    - Suggested params: `{"topN":"20","resultCount":"5","interval":"1h","limit":"250","sort":"market_cap","sort_dir":"desc","rankMax":"50","atrPctMax":"1.0","strategy":"strong_up_low_atr"}`

- "Show compact discovery of top movers"
    - Tool: `discover-top`
    - Suggested params: `{"topN":"20","resultCount":"5","interval":"1h","limit":"250","sort":"percent_change_24h","sort_dir":"desc","rankMax":"50","atrPctMax":"2.0"}`

## ATR Explained (Volatility)

Average True Range (ATR) measures price volatility. It’s derived from True Range (TR), which for each candle is the maximum of:
- High − Low
- |High − Previous Close|
- |Low − Previous Close|

ATR is a smoothed (RMA) average of TR over a period (commonly 14). We use `ATR% = ATR / lastClose * 100` to scale volatility relative to price. Lower ATR% often indicates steadier moves; filtering with `atrPctMax` helps avoid choppy assets.

## Screenshots

### Top Cryptocurrencies

![Top Cryptocurrencies](assets/top.png)

### Cryptocurrency Metadata

![Cryptocurrency Metadata](assets/metadata.png)

### Market Metrics

![Market Metrics](assets/market_metrics.png)

## Development

This project uses TypeScript and the Model Context Protocol SDK to build a server that communicates with Claude AI.

To modify the available tools or add new endpoints, edit the `src/index.ts` file and rebuild the project.

### Local CLI Runners

Quick, auto-exiting discovery runs for testing:

```bash
# Top discovery with defaults (PowerShell on Windows)
$env:COINMARKET_API_KEY = "YOUR_KEY"; npm run discover

# Strategy picker with defaults
$env:COINMARKET_API_KEY = "YOUR_KEY"; npm run discover:pick

# Explicit thresholds
node .\examples\run-discover-pick.ts 20 5 strong_up_low_atr 1h 250 market_cap desc 50 1.0
```
