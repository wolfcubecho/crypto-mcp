import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Load environment variables
const API_KEY = process.env.COINMARKET_API_KEY;
if (!API_KEY) {
    throw new Error("Missing COINMARKET_API_KEY environment variable");
}

// Base CoinMarketCap API URL
const BASE_URL = "https://pro-api.coinmarketcap.com/v1";

// Create server instance
const server = new McpServer({
    name: "coinmarketcap",
    version: "1.0.0",
});

// Helper function for making CoinMarketCap API requests
// Simple in-memory cache with TTL
const CACHE_TTL_MS = parseInt(process.env.COINMARKET_CACHE_TTL || "15000", 10);
const apiCache: Map<string, { ts: number; data: any }> = new Map();

function buildCacheKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => {
            (acc as any)[key] = (params as any)[key];
            return acc;
        }, {} as Record<string, any>);
    return `${endpoint}|${JSON.stringify(sortedParams)}`;
}

async function makeApiRequest<T>(
    endpoint: string,
    params: Record<string, any> = {},
): Promise<T | null> {
    const headers = {
        "X-CMC_PRO_API_KEY": API_KEY as string,
        Accept: "application/json",
    };

    const url = new URL(`${BASE_URL}${endpoint}`);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
        }
    });

    // Cache lookup
    const key = buildCacheKey(endpoint, params);
    const cached = apiCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data as T;
    }

    try {
        const response = await fetch(url.toString(), { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = (await response.json()) as T;
        apiCache.set(key, { ts: Date.now(), data: json });
        return json;
    } catch (error) {
        console.error("Error making CoinMarketCap API request:", error);
        return null;
    }
}

// Register cryptocurrency listings tool
server.tool(
    "get-cryptocurrency-listings",
    "Get latest cryptocurrency listings with market data",
    {
        start: z.string().optional().describe("Offset (starting with 1)"),
        limit: z
            .string()
            .optional()
            .describe("Number of results (default: 100, max: 5000)"),
        sort: z
            .string()
            .optional()
            .describe("What to sort by (e.g., 'market_cap', 'volume_24h')"),
        sort_dir: z.string().optional().describe("Direction: 'asc' or 'desc'"),
        cryptocurrency_type: z
            .string()
            .optional()
            .describe("Filter by type (e.g., 'coins', 'tokens')"),
        convert: z
            .string()
            .optional()
            .describe("Currency to convert prices to (e.g., 'USD', 'EUR')"),
    },
    async (params) => {
        const defaultParams = {
            start: "1",
            limit: "100",
            convert: "USD",
            ...params,
        };

        const data = await makeApiRequest(
            "/cryptocurrency/listings/latest",
            defaultParams,
        );

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve cryptocurrency listings",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Register cryptocurrency quotes tool
server.tool(
    "get-cryptocurrency-quotes",
    "Get latest quotes for specific cryptocurrencies",
    {
        symbol: z
            .string()
            .optional()
            .describe("Comma-separated list of symbols (e.g., 'BTC,ETH')"),
        slug: z
            .string()
            .optional()
            .describe(
                "Comma-separated list of slugs (e.g., 'bitcoin,ethereum')",
            ),
        id: z
            .string()
            .optional()
            .describe("Comma-separated list of CoinMarketCap IDs"),
        convert: z
            .string()
            .optional()
            .describe("Currency to convert prices to (e.g., 'USD', 'EUR')"),
    },
    async (params) => {
        if (!params.symbol && !params.slug && !params.id) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Error: At least one of 'symbol', 'slug', or 'id' is required",
                    },
                ],
            };
        }

        const defaultParams = {
            convert: "USD",
            ...params,
        };

        const data = await makeApiRequest(
            "/cryptocurrency/quotes/latest",
            defaultParams,
        );

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve cryptocurrency quotes",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Register cryptocurrency map tool
server.tool(
    "get-cryptocurrency-map",
    "Get mapping of all cryptocurrencies to CoinMarketCap IDs",
    {
        listing_status: z
            .string()
            .optional()
            .describe("Filter by status (e.g., 'active', 'inactive')"),
        start: z.string().optional().describe("Offset (starting with 1)"),
        limit: z
            .string()
            .optional()
            .describe("Number of results (default: 100, max: 5000)"),
        symbol: z
            .string()
            .optional()
            .describe("Filter by symbol(s) (comma-separated)"),
    },
    async (params) => {
        const defaultParams = {
            listing_status: "active",
            start: "1",
            limit: "100",
            ...params,
        };

        const data = await makeApiRequest("/cryptocurrency/map", defaultParams);

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve cryptocurrency map",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Register cryptocurrency info tool
server.tool(
    "get-cryptocurrency-info",
    "Get metadata for cryptocurrencies",
    {
        symbol: z
            .string()
            .optional()
            .describe("Comma-separated list of symbols (e.g., 'BTC,ETH')"),
        slug: z
            .string()
            .optional()
            .describe(
                "Comma-separated list of slugs (e.g., 'bitcoin,ethereum')",
            ),
        id: z
            .string()
            .optional()
            .describe("Comma-separated list of CoinMarketCap IDs"),
    },
    async (params) => {
        if (!params.symbol && !params.slug && !params.id) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Error: At least one of 'symbol', 'slug', or 'id' is required",
                    },
                ],
            };
        }

        const data = await makeApiRequest("/cryptocurrency/info", params);

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve cryptocurrency info",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Register global metrics tool
server.tool(
    "get-global-metrics",
    "Get latest global cryptocurrency market metrics",
    {
        convert: z
            .string()
            .optional()
            .describe("Currency to convert prices to (e.g., 'USD', 'EUR')"),
    },
    async (params) => {
        const defaultParams = {
            convert: "USD",
            ...params,
        };

        const data = await makeApiRequest(
            "/global-metrics/quotes/latest",
            defaultParams,
        );

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve global metrics",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Register exchange listings tool
server.tool(
    "get-exchange-listings",
    "Get list of all exchanges with market data",
    {
        start: z.string().optional().describe("Offset (starting with 1)"),
        limit: z
            .string()
            .optional()
            .describe("Number of results (default: 100, max: 5000)"),
        sort: z
            .string()
            .optional()
            .describe("What to sort by (e.g., 'volume_24h')"),
        sort_dir: z.string().optional().describe("Direction: 'asc' or 'desc'"),
        market_type: z
            .string()
            .optional()
            .describe("Filter by market type (e.g., 'spot', 'derivatives')"),
        convert: z
            .string()
            .optional()
            .describe("Currency to convert prices to (e.g., 'USD', 'EUR')"),
    },
    async (params) => {
        const defaultParams = {
            start: "1",
            limit: "100",
            convert: "USD",
            ...params,
        };

        const data = await makeApiRequest(
            "/exchange/listings/latest",
            defaultParams,
        );

        if (!data) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to retrieve exchange listings",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    },
);

// Aggregated discovery: CMC top-N then narrow via Binance (compact summary)
const STABLES = new Set(["USDT","USDC","BUSD","TUSD","DAI","FDUSD"]);
function calcEMA(arr: number[], n: number): number | null {
    if (arr.length < n) return null;
    const k = 2 / (n + 1);
    let ema = arr[0];
    for (let i = 1; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
    return ema;
}
function sma(arr: number[], n: number): number | null {
    if (arr.length < n) return null;
    let sum = 0; for (let i = arr.length - n; i < arr.length; i++) sum += arr[i];
    return sum / n;
}
function rma(arr: number[], n: number): number | null {
    if (arr.length < n) return null;
    let sum = 0; for (let i = 0; i < n; i++) sum += arr[i];
    let val = sum / n; const alpha = 1 / n;
    for (let i = n; i < arr.length; i++) val = alpha * arr[i] + (1 - alpha) * val;
    return val;
}

server.tool(
    "discover-top",
    "CMC top-N discovery narrowed to resultCount via Binance 24h + OHLCV. Sort by market_cap, volume_24h, or percent_change_24h.",
    {
        topN: z.string().optional().describe("Number of CMC listings to scan (default: 20)"),
        resultCount: z.string().optional().describe("Number of results to return (default: 5)"),
        interval: z.string().optional().describe("Kline interval (default: 1h)"),
        limit: z.string().optional().describe("Number of klines to fetch (default: 250)"),
        convert: z.string().optional().describe("CMC convert currency (default: USD)"),
        sort: z.string().optional().describe("CMC sort field: market_cap | volume_24h | percent_change_24h (default: market_cap)"),
        sort_dir: z.string().optional().describe("Sort direction: desc | asc (default: desc)"),
    },
    async (params) => {
        const topN = parseInt(params.topN ?? "20", 10);
        const resultCount = parseInt(params.resultCount ?? "5", 10);
        const interval = params.interval ?? "1h";
        const limit = parseInt(params.limit ?? "250", 10);
        const convert = params.convert ?? "USD";

        // Step 1: CMC listings
        const sort = params.sort ?? "market_cap";
        const sort_dir = params.sort_dir ?? "desc";
        const listings = await makeApiRequest<any>("/cryptocurrency/listings/latest", { limit: topN, convert, sort, sort_dir });
        const data = listings?.data ?? [];
        const summaries: Array<{ symbol: string; price: number | null; pct24h: number | null; vol24h: number | null; atrPct: number | null; trend: 'up'|'down'|null; rating: 'strong_up'|'up'|'neutral'|'down'|'strong_down'; cmc?: { market_cap?: number; percent_change_24h?: number; rank?: number } | null; }>= [];

        for (const item of data) {
            const base: string = item?.symbol;
            if (!base || STABLES.has(base)) continue;
            const symbol = `${base}USDT`;
            try {
                const tRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
                if (!tRes.ok) continue;
                const ticker: any = await tRes.json();
                const kRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
                if (!kRes.ok) continue;
                const klines: any[] = await kRes.json() as any[];
                const closes = klines.map(k => parseFloat(k[4]));
                const highs = klines.map(k => parseFloat(k[2]));
                const lows = klines.map(k => parseFloat(k[3]));
                const lastClose = closes[closes.length - 1] ?? null;
                const tr: number[] = [];
                for (let i = 0; i < closes.length; i++) {
                    const hl = (highs[i] ?? 0) - (lows[i] ?? 0);
                    const hc = i > 0 ? Math.abs((highs[i] ?? 0) - (closes[i-1] ?? 0)) : 0;
                    const lc = i > 0 ? Math.abs((lows[i] ?? 0) - (closes[i-1] ?? 0)) : 0;
                    tr.push(Math.max(hl, hc, lc));
                }
                const atr = rma(tr, 14);
                const atrPct = atr && lastClose ? (atr / lastClose) * 100 : null;
                const ema50 = calcEMA(closes, 50);
                const ema200 = calcEMA(closes, 200);
                const sma200 = sma(closes, 200);
                let trend: 'up'|'down'|null = null;
                if (ema50 !== null && ema200 !== null) trend = ema50 > ema200 ? 'up' : 'down';
                else if (sma200 !== null && lastClose !== null) trend = lastClose > sma200 ? 'up' : 'down';
                const pct24h = ticker ? parseFloat(ticker.priceChangePercent) : null;
                const vol24h = ticker ? parseFloat(ticker.volume) : null;
                const cmcSlim = item ? {
                    market_cap: item.quote?.[convert]?.market_cap,
                    percent_change_24h: item.quote?.[convert]?.percent_change_24h,
                    rank: item.cmc_rank,
                } : null;
                let rating: 'strong_up'|'up'|'neutral'|'down'|'strong_down' = 'neutral';
                if (trend === 'up') rating = pct24h !== null && pct24h > 2 ? 'strong_up' : (pct24h !== null && pct24h > 1 ? 'up' : 'neutral');
                if (trend === 'down') rating = pct24h !== null && pct24h < -2 ? 'strong_down' : (pct24h !== null && pct24h < -1 ? 'down' : 'neutral');
                summaries.push({ symbol, price: lastClose, pct24h, vol24h, atrPct, trend, rating, cmc: cmcSlim });
            } catch { /* skip symbol on error */ }
        }

        const ratingScore = (r: 'strong_up'|'up'|'neutral'|'down'|'strong_down') => ({ strong_up: 4, up: 3, neutral: 2, down: 1, strong_down: 0 }[r]);
        // Ranking: prioritize strong_up and lower ATR%, then larger 24h move
        summaries.sort((a, b) => {
            const ra = ratingScore(a.rating); const rb = ratingScore(b.rating);
            if (rb !== ra) return rb - ra;
            const aAtr = a.atrPct !== null ? a.atrPct : Number.POSITIVE_INFINITY;
            const bAtr = b.atrPct !== null ? b.atrPct : Number.POSITIVE_INFINITY;
            if (aAtr !== bAtr) return aAtr - bAtr; // lower ATR% first
            const ma = a.pct24h !== null ? Math.abs(a.pct24h) : 0;
            const mb = b.pct24h !== null ? Math.abs(b.pct24h) : 0;
            return mb - ma;
        });
        const top = summaries.slice(0, resultCount);
        return { content: [ { type: "text", text: JSON.stringify(top, null, 2) } ] };
    }
);

// Single-call picker: CMC top-N then pick best via explicit strategy
server.tool(
    "discover-pick",
    "CMC top-N discovery then pick best resultCount via strategy (e.g., strong_up_low_atr).",
    {
        topN: z.string().optional().describe("Number of CMC listings to scan (default: 20)"),
        resultCount: z.string().optional().describe("Number of results to return (default: 5)"),
        interval: z.string().optional().describe("Kline interval (default: 1h)"),
        limit: z.string().optional().describe("Number of klines to fetch (default: 250)"),
        convert: z.string().optional().describe("CMC convert currency (default: USD)"),
        sort: z.string().optional().describe("CMC sort field: market_cap | volume_24h | percent_change_24h (default: market_cap)"),
        sort_dir: z.string().optional().describe("Sort direction: desc | asc (default: desc)"),
        strategy: z.string().optional().describe("Ranking strategy: strong_up_low_atr | strong_up_high_vol (default: strong_up_low_atr)"),
        rankMax: z.string().optional().describe("Max CMC rank to include (default: 50)"),
        atrPctMax: z.string().optional().describe("Max ATR% to include (default: 1.0)"),
    },
    async (params) => {
        const topN = parseInt(params.topN ?? "20", 10);
        const resultCount = parseInt(params.resultCount ?? "5", 10);
        const interval = params.interval ?? "1h";
        const limit = parseInt(params.limit ?? "250", 10);
        const convert = params.convert ?? "USD";
        const strategy = (params.strategy ?? "strong_up_low_atr").toLowerCase();
        const rankMax = parseInt(params.rankMax ?? "50", 10);
        const atrPctMax = parseFloat(params.atrPctMax ?? "1.0");

        // Step 1: CMC listings
        const sort = params.sort ?? "market_cap";
        const sort_dir = params.sort_dir ?? "desc";
        const listings = await makeApiRequest<any>("/cryptocurrency/listings/latest", { limit: topN, convert, sort, sort_dir });
        const data = listings?.data ?? [];
        const summaries: Array<{ symbol: string; price: number | null; pct24h: number | null; vol24h: number | null; atrPct: number | null; trend: 'up'|'down'|null; rating: 'strong_up'|'up'|'neutral'|'down'|'strong_down'; cmc?: { market_cap?: number; percent_change_24h?: number; rank?: number } | null; }>= [];

        for (const item of data) {
            const base: string = item?.symbol;
            if (!base || STABLES.has(base)) continue;
            const symbol = `${base}USDT`;
            try {
                const tRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
                if (!tRes.ok) continue;
                const ticker: any = await tRes.json();
                const kRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
                if (!kRes.ok) continue;
                const klines: any[] = await kRes.json() as any[];
                const closes = klines.map(k => parseFloat(k[4]));
                const highs = klines.map(k => parseFloat(k[2]));
                const lows = klines.map(k => parseFloat(k[3]));
                const lastClose = closes[closes.length - 1] ?? null;
                const tr: number[] = [];
                for (let i = 0; i < closes.length; i++) {
                    const hl = (highs[i] ?? 0) - (lows[i] ?? 0);
                    const hc = i > 0 ? Math.abs((highs[i] ?? 0) - (closes[i-1] ?? 0)) : 0;
                    const lc = i > 0 ? Math.abs((lows[i] ?? 0) - (closes[i-1] ?? 0)) : 0;
                    tr.push(Math.max(hl, hc, lc));
                }
                const atr = rma(tr, 14);
                const atrPct = atr && lastClose ? (atr / lastClose) * 100 : null;
                const ema50 = calcEMA(closes, 50);
                const ema200 = calcEMA(closes, 200);
                const sma200 = sma(closes, 200);
                let trend: 'up'|'down'|null = null;
                if (ema50 !== null && ema200 !== null) trend = ema50 > ema200 ? 'up' : 'down';
                else if (sma200 !== null && lastClose !== null) trend = lastClose > sma200 ? 'up' : 'down';
                const pct24h = ticker ? parseFloat(ticker.priceChangePercent) : null;
                const vol24h = ticker ? parseFloat(ticker.volume) : null;
                const cmcSlim = item ? {
                    market_cap: item.quote?.[convert]?.market_cap,
                    percent_change_24h: item.quote?.[convert]?.percent_change_24h,
                    rank: item.cmc_rank,
                } : null;
                let rating: 'strong_up'|'up'|'neutral'|'down'|'strong_down' = 'neutral';
                if (trend === 'up') rating = pct24h !== null && pct24h > 2 ? 'strong_up' : (pct24h !== null && pct24h > 1 ? 'up' : 'neutral');
                if (trend === 'down') rating = pct24h !== null && pct24h < -2 ? 'strong_down' : (pct24h !== null && pct24h < -1 ? 'down' : 'neutral');
                summaries.push({ symbol, price: lastClose, pct24h, vol24h, atrPct, trend, rating, cmc: cmcSlim });
            } catch { /* skip symbol on error */ }
        }

        // Apply filters: by rank and ATR%
        const filtered = summaries.filter(s => {
            const rankOk = s.cmc?.rank !== undefined ? (s.cmc!.rank! <= rankMax) : false;
            const atrOk = s.atrPct !== null ? (s.atrPct! <= atrPctMax) : false;
            return rankOk && atrOk;
        });

        const ratingScore = (r: 'strong_up'|'up'|'neutral'|'down'|'strong_down') => ({ strong_up: 4, up: 3, neutral: 2, down: 1, strong_down: 0 }[r]);
        const cmp = (a: typeof summaries[number], b: typeof summaries[number]) => {
            const ra = ratingScore(a.rating); const rb = ratingScore(b.rating);
            if (rb !== ra) return rb - ra;
            if (strategy === 'strong_up_high_vol') {
                const va = a.vol24h ?? 0; const vb = b.vol24h ?? 0;
                if (vb !== va) return vb - va; // higher volume first
                const aAtr = a.atrPct !== null ? a.atrPct : Number.POSITIVE_INFINITY;
                const bAtr = b.atrPct !== null ? b.atrPct : Number.POSITIVE_INFINITY;
                if (aAtr !== bAtr) return aAtr - bAtr; // lower ATR% next
            } else { // strong_up_low_atr (default)
                const aAtr = a.atrPct !== null ? a.atrPct : Number.POSITIVE_INFINITY;
                const bAtr = b.atrPct !== null ? b.atrPct : Number.POSITIVE_INFINITY;
                if (aAtr !== bAtr) return aAtr - bAtr; // lower ATR% first
                const va = a.vol24h ?? 0; const vb = b.vol24h ?? 0;
                if (vb !== va) return vb - va; // then higher volume
            }
            const ma = a.pct24h !== null ? Math.abs(a.pct24h) : 0;
            const mb = b.pct24h !== null ? Math.abs(b.pct24h) : 0;
            return mb - ma;
        };
        filtered.sort(cmp);
        const top = filtered.slice(0, resultCount);
        return { content: [ { type: "text", text: JSON.stringify(top, null, 2) } ] };
    }
);

// Run the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("CoinMarketCap MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
