// src/market/engine.ts
// Simulates Hyperliquid-style perpetuals market data.
// Mirrors the real Hyperliquid WebSocket/REST API shape so
// swapping in live data requires only changing the data source.

import {
  TradingPair, MarketState, PerpMarketInfo, PerpPosition, Position
} from '../types/index';

// ── Hyperliquid perp pairs (same as real HL perps) ─────────────────
export const PAIRS: TradingPair[] = [
  { symbol: 'BTC-PERP',  name: 'BTC/USDT',  base: 67400,  vol: 0.0012, decimals: 1 },
  { symbol: 'ETH-PERP',  name: 'ETH/USDT',  base: 3520,   vol: 0.0015, decimals: 2 },
  { symbol: 'SOL-PERP',  name: 'SOL/USDT',  base: 185,    vol: 0.0022, decimals: 3 },
  { symbol: 'ARB-PERP',  name: 'ARB/USDT',  base: 1.12,   vol: 0.0028, decimals: 5 },
  { symbol: 'DOGE-PERP', name: 'DOGE/USDT', base: 0.165,  vol: 0.0030, decimals: 5 },
  { symbol: 'WIF-PERP',  name: 'WIF/USDT',  base: 2.85,   vol: 0.0035, decimals: 5 },
];

const HISTORY_LEN = 80;
const state = new Map<string, MarketState>();
const perpInfo = new Map<string, PerpMarketInfo>();

// ── Initialise ─────────────────────────────────────────────────────
export function init(): void {
  for (const pair of PAIRS) {
    const prices: number[] = [];
    let price = pair.base;
    for (let i = 0; i < HISTORY_LEN; i++) {
      price *= 1 + (Math.random() - 0.495) * pair.vol * 2;
      prices.push(parseFloat(price.toFixed(pair.decimals)));
    }

    const volume: number[] = Array.from({ length: HISTORY_LEN }, () =>
      pair.base * (0.5 + Math.random() * 1.5)
    );

    state.set(pair.symbol, {
      ...pair,
      prices,
      price: prices[prices.length - 1],
      prevPrice: prices[prices.length - 2],
      trend: 0,
      volatilityMult: 1,
      volume,
    });

    // Hyperliquid-style perp metadata
    perpInfo.set(pair.symbol, {
      symbol: pair.symbol,
      markPrice: prices[prices.length - 1],
      indexPrice: prices[prices.length - 1] * (1 + (Math.random() - 0.5) * 0.001),
      fundingRate: (Math.random() - 0.5) * 0.0003, // -0.03% to +0.03% per hour
      openInterest: pair.base * 10000 * (0.5 + Math.random()),
      volume24h: pair.base * 50000 * Math.random(),
      nextFundingTime: Date.now() + 3600000,
    });
  }
}

// ── Tick (called every 2s) ─────────────────────────────────────────
export function tick(): void {
  for (const [symbol, s] of state) {
    s.prevPrice = s.price;

    // Volatility clustering
    s.volatilityMult = Math.random() < 0.05
      ? 1 + Math.random() * 3
      : s.volatilityMult * 0.95 + 0.05;

    // Trend drift
    s.trend = Math.max(-0.7, Math.min(0.7, s.trend + (Math.random() - 0.5) * 0.1));

    const change = ((Math.random() - 0.5) * 2 + s.trend * 0.3) * s.vol * s.volatilityMult;
    s.price = parseFloat(Math.max(0.00001, s.price * (1 + change)).toFixed(s.decimals));

    s.prices.push(s.price);
    if (s.prices.length > HISTORY_LEN) s.prices.shift();

    const absChange = Math.abs(change);
    s.volume.push(parseFloat((s.base * (0.3 + absChange * 100 + Math.random() * 1.2)).toFixed(2)));
    if (s.volume.length > HISTORY_LEN) s.volume.shift();

    // Update perp mark/index price + funding drift
    const perp = perpInfo.get(symbol)!;
    perp.markPrice  = s.price;
    perp.indexPrice = s.price * (1 + (Math.random() - 0.5) * 0.001);
    perp.fundingRate = Math.max(-0.001, Math.min(0.001,
      perp.fundingRate + (Math.random() - 0.5) * 0.00002));
    perp.openInterest *= 1 + (Math.random() - 0.5) * 0.005;
  }
}

// ── Liquidation price calculator (Hyperliquid-style) ──────────────
export function calcLiquidationPrice(
  position: Position,
  leverage: number = 5,
  maintenanceMarginRate: number = 0.005
): number {
  const { side, price: entryPrice } = position;
  // HL formula: liq = entry * (1 - 1/leverage + maintenanceMarginRate)  for long
  //                   entry * (1 + 1/leverage - maintenanceMarginRate)  for short
  if (side === 'buy') {
    return parseFloat((entryPrice * (1 - 1 / leverage + maintenanceMarginRate)).toFixed(2));
  }
  return parseFloat((entryPrice * (1 + 1 / leverage - maintenanceMarginRate)).toFixed(2));
}

// ── Funding PnL accumulator ────────────────────────────────────────
export function calcFundingPnL(position: Position): number {
  const perp = perpInfo.get(position.symbol);
  if (!perp) return 0;
  // Simplified: funding cost = notional * fundingRate * hoursHeld
  const hoursHeld = (Date.now() - position.timestamp) / 3_600_000;
  const notional  = position.qty * perp.markPrice;
  const fundingPnl = position.side === 'buy'
    ? -notional * perp.fundingRate * hoursHeld
    :  notional * perp.fundingRate * hoursHeld;
  return parseFloat(fundingPnl.toFixed(4));
}

// ── Getters ────────────────────────────────────────────────────────
export function getState(symbol: string): MarketState | undefined { return state.get(symbol); }
export function getPrice(symbol: string): number { return state.get(symbol)?.price ?? 0; }
export function getPrices(symbol: string): number[] { return state.get(symbol)?.prices ?? []; }
export function getVolume(symbol: string): number[] { return state.get(symbol)?.volume ?? []; }
export function getPerpInfo(symbol: string): PerpMarketInfo | undefined { return perpInfo.get(symbol); }
export function getAllPairs(): TradingPair[] { return PAIRS; }

export function getPriceChange(symbol: string): number {
  const s = state.get(symbol);
  if (!s || s.prices.length < 2) return 0;
  return ((s.prices[s.prices.length - 1] - s.prices[0]) / s.prices[0]) * 100;
}

export function formatPrice(price: number, symbol: string): string {
  const pair = PAIRS.find(p => p.symbol === symbol);
  const dp   = pair ? pair.decimals : 2;
  return price.toLocaleString('en-US', {
    minimumFractionDigits:  dp <= 2 ? dp : 4,
    maximumFractionDigits:  dp <= 2 ? dp : 5,
  });
}

export function getMarketSummaryForAI(): string {
  return PAIRS.map(pair => {
    const s = state.get(pair.symbol);
    const p = perpInfo.get(pair.symbol);
    if (!s || !p) return '';
    return (
      `${pair.symbol}: markPrice=${s.price}, indexPrice=${p.indexPrice.toFixed(2)}, ` +
      `fundingRate=${(p.fundingRate * 100).toFixed(4)}%/hr, OI=${p.openInterest.toFixed(0)}`
    );
  }).join('\n');
}
