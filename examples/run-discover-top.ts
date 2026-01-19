import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const STABLES = new Set(['USDT','USDC','BUSD','TUSD','DAI','FDUSD']);

function calcEMA(arr: number[], n: number): number | null {
  if (arr.length < n) return null; const k = 2 / (n + 1);
  let ema = arr[0]; for (let i = 1; i < arr.length; i++) ema = arr[i] * k + ema * (1 - k);
  return ema;
}
function sma(arr: number[], n: number): number | null { if (arr.length < n) return null; let s = 0; for (let i = arr.length - n; i < arr.length; i++) s += arr[i]; return s / n; }
function rma(arr: number[], n: number): number | null { if (arr.length < n) return null; let s = 0; for (let i = 0; i < n; i++) s += arr[i]; let v = s / n; const a = 1 / n; for (let i = n; i < arr.length; i++) v = a * arr[i] + (1 - a) * v; return v; }

function rate(trend: 'up'|'down'|null, pct24h: number | null) {
  if (trend === 'up') return pct24h !== null && pct24h > 2 ? 'strong_up' : (pct24h !== null && pct24h > 1 ? 'up' : 'neutral');
  if (trend === 'down') return pct24h !== null && pct24h < -2 ? 'strong_down' : (pct24h !== null && pct24h < -1 ? 'down' : 'neutral');
  return 'neutral';
}

async function main() {
  const [topNArg, resultArg, interval = '1h', limitArg, sort = 'market_cap', sort_dir = 'desc', rankMaxArg, atrPctMaxArg] = process.argv.slice(2);
  const topN = parseInt(topNArg || '20', 10);
  const resultCount = parseInt(resultArg || '5', 10);
  const limit = parseInt(limitArg || '250', 10);
  const convert = 'USD';
  const rankMax = parseInt(rankMaxArg || '50', 10);
  const atrPctMax = parseFloat(atrPctMaxArg || '1.0');

  if (!process.env.COINMARKET_API_KEY) console.warn('COINMARKET_API_KEY not set; CMC calls will fail');

  const lres = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=${topN}&convert=${convert}&sort=${sort}&sort_dir=${sort_dir}`, {
    headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKET_API_KEY as string, 'Accept': 'application/json' }
  });
  const ljson: any = lres.ok ? await lres.json() : { data: [] };
  const data: any[] = ljson.data || [];

  const out: any[] = [];
  for (const item of data) {
    const base = item?.symbol as string; if (!base || STABLES.has(base)) continue;
    const symbol = `${base}USDT`;
    try {
      const tRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      if (!tRes.ok) continue; const ticker: any = await tRes.json();
      const kRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!kRes.ok) continue; const klines: any[] = await kRes.json() as any[];
      const closes = klines.map(k => parseFloat(k[4]));
      const highs = klines.map(k => parseFloat(k[2]));
      const lows = klines.map(k => parseFloat(k[3]));
      const lastClose = closes[closes.length - 1] ?? null;
      const tr: number[] = [];
      for (let i = 0; i < closes.length; i++) { const hl = (highs[i] ?? 0) - (lows[i] ?? 0); const hc = i > 0 ? Math.abs((highs[i] ?? 0) - (closes[i-1] ?? 0)) : 0; const lc = i > 0 ? Math.abs((lows[i] ?? 0) - (closes[i-1] ?? 0)) : 0; tr.push(Math.max(hl, hc, lc)); }
      const atr = rma(tr, 14); const atrPct = atr && lastClose ? (atr / lastClose) * 100 : null;
      const ema50 = calcEMA(closes, 50); const ema200 = calcEMA(closes, 200); const sma200 = sma(closes, 200);
      let trend: 'up'|'down'|null = null; if (ema50 !== null && ema200 !== null) trend = ema50 > ema200 ? 'up' : 'down'; else if (sma200 !== null && lastClose !== null) trend = lastClose > sma200 ? 'up' : 'down';
      const pct24h = ticker ? parseFloat(ticker.priceChangePercent) : null;
      const vol24h = ticker ? parseFloat(ticker.volume) : null;
      out.push({ symbol, price: lastClose, pct24h, vol24h, atrPct, trend, rating: rate(trend, pct24h), cmc: { market_cap: item.quote?.[convert]?.market_cap, percent_change_24h: item.quote?.[convert]?.percent_change_24h, rank: item.cmc_rank } });
    } catch {}
  }

  // Apply filters: by rank and ATR%
  const filtered = out.filter(s => {
    const rankOk = s.cmc?.rank !== undefined ? (s.cmc.rank <= rankMax) : false;
    const atrOk = s.atrPct !== null ? (s.atrPct <= atrPctMax) : false;
    return rankOk && atrOk;
  });

  const score: Record<string, number> = { strong_up: 4, up: 3, neutral: 2, down: 1, strong_down: 0 };
  filtered.sort((a,b)=>{
    const ra = score[a.rating]??0, rb = score[b.rating]??0; if (rb!==ra) return rb-ra;
    const aAtr = a.atrPct !== null ? a.atrPct : Number.POSITIVE_INFINITY;
    const bAtr = b.atrPct !== null ? b.atrPct : Number.POSITIVE_INFINITY;
    if (aAtr !== bAtr) return aAtr - bAtr; // lower ATR% first
    const ma = a.pct24h?Math.abs(a.pct24h):0, mb = b.pct24h?Math.abs(b.pct24h):0; return mb-ma;
  });
  console.log(JSON.stringify(filtered.slice(0, resultCount), null, 2));
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
