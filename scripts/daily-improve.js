#!/usr/bin/env node
// scripts/daily-improve.js
// Applies the next pending improvement from the rotation list and records it.

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const LOG_FILE = path.join(__dirname, 'applied.json');
const MSG_FILE = '/tmp/improvement-message.txt';

let applied = [];
try { applied = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { applied = []; }

// ── 30-day rotation of real TypeScript modules ────────────────────
const improvements = [

  // ── Day 0 ─────────────────────────────────────────────────────
  {
    file: 'src/utils/math.ts',
    message: 'feat: add math utils (mean, stddev, percentile, z-score, linear regression)',
    content:
`// Core statistical math utilities used across indicators and risk modules

export const mean = (a: number[]): number =>
  a.reduce((s, v) => s + v, 0) / a.length;

export const variance = (a: number[]): number => {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length;
};

export const stddev = (a: number[]): number => Math.sqrt(variance(a));

export const percentile = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

export const zscore = (a: number[]): number[] => {
  const m = mean(a), s = stddev(a);
  return s === 0 ? a.map(() => 0) : a.map(v => (v - m) / s);
};

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const roundTo = (v: number, d: number): number =>
  Math.round(v * 10 ** d) / 10 ** d;

export function linreg(y: number[]): { slope: number; intercept: number; r2: number } {
  const n = y.length;
  const sx = (n * (n - 1)) / 2;
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = (n * (n - 1) * (2 * n - 1)) / 6;
  const sxy = y.reduce((s, v, i) => s + i * v, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope: roundTo(slope, 8), intercept: roundTo(intercept, 8), r2: roundTo(r2, 4) };
}
`,
  },

  // ── Day 1 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/cci.ts',
    message: 'feat: add CCI (Commodity Channel Index) indicator',
    content:
`// Commodity Channel Index — measures deviation from the average price.
// Values above +100 indicate overbought; below -100 indicate oversold.

export function cci(prices: number[], period = 20): number | null {
  if (prices.length < period) return null;
  const slice  = prices.slice(-period);
  const avg    = slice.reduce((s, v) => s + v, 0) / period;
  const meanDev = slice.reduce((s, v) => s + Math.abs(v - avg), 0) / period;
  if (meanDev === 0) return 0;
  return parseFloat(((slice[slice.length - 1] - avg) / (0.015 * meanDev)).toFixed(2));
}

export function cciSignal(value: number | null): 'overbought' | 'oversold' | 'neutral' {
  if (value === null) return 'neutral';
  if (value > 100)   return 'overbought';
  if (value < -100)  return 'oversold';
  return 'neutral';
}
`,
  },

  // ── Day 2 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/adx.ts',
    message: 'feat: add ADX (Average Directional Index) for trend strength measurement',
    content:
`// Average Directional Index — measures trend strength, not direction.
// ADX > 25 = strong trend; ADX < 20 = weak/ranging market.

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'strong' | 'moderate' | 'weak';
}

export function adx(prices: number[], period = 14): ADXResult | null {
  if (prices.length < period * 2) return null;

  const tr: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const curr = prices[i], prev = prices[i - 1];
    tr.push(Math.abs(curr - prev));
    const up   = curr - prev;
    const down = prev - curr;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const recent = (arr: number[]) => arr.slice(-period).reduce((s, v) => s + v, 0);
  const smoothTR  = recent(tr);
  const smoothPDM = recent(plusDM);
  const smoothMDM = recent(minusDM);

  if (smoothTR === 0) return null;

  const plusDI  = (smoothPDM / smoothTR) * 100;
  const minusDI = (smoothMDM / smoothTR) * 100;
  const diSum   = plusDI + minusDI;
  const dx      = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;

  return {
    adx:     parseFloat(dx.toFixed(2)),
    plusDI:  parseFloat(plusDI.toFixed(2)),
    minusDI: parseFloat(minusDI.toFixed(2)),
    trend:   dx > 25 ? 'strong' : dx > 15 ? 'moderate' : 'weak',
  };
}
`,
  },

  // ── Day 3 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/obv.ts',
    message: 'feat: add OBV (On-Balance Volume) indicator for volume-price momentum',
    content:
`// On-Balance Volume — cumulative volume indicator confirming price trends.
// Rising OBV with rising price confirms uptrend; divergence warns of reversal.

export function obv(prices: number[], volumes: number[]): number[] {
  if (prices.length < 2 || volumes.length < 2) return [];
  const result: number[] = [0];
  for (let i = 1; i < prices.length; i++) {
    const prev = result[result.length - 1];
    if (prices[i] > prices[i - 1])      result.push(prev + volumes[i]);
    else if (prices[i] < prices[i - 1]) result.push(prev - volumes[i]);
    else                                 result.push(prev);
  }
  return result;
}

export function obvTrend(prices: number[], volumes: number[], period = 10): 'rising' | 'falling' | 'flat' {
  const series = obv(prices, volumes);
  if (series.length < period) return 'flat';
  const slice = series.slice(-period);
  const first = slice[0], last = slice[slice.length - 1];
  const change = (last - first) / (Math.abs(first) || 1);
  if (change > 0.01)  return 'rising';
  if (change < -0.01) return 'falling';
  return 'flat';
}
`,
  },

  // ── Day 4 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/roc.ts',
    message: 'feat: add ROC (Rate of Change) momentum indicator',
    content:
`// Rate of Change — percentage change between current price and N periods ago.
// Positive ROC = upward momentum; negative = downward momentum.

export function roc(prices: number[], period = 12): number | null {
  if (prices.length <= period) return null;
  const current  = prices[prices.length - 1];
  const previous = prices[prices.length - 1 - period];
  if (previous === 0) return null;
  return parseFloat((((current - previous) / previous) * 100).toFixed(4));
}

export function rocSeries(prices: number[], period = 12): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period) return null;
    const prev = prices[i - period];
    if (prev === 0) return null;
    return parseFloat((((prices[i] - prev) / prev) * 100).toFixed(4));
  });
}

export function rocSignal(value: number | null, threshold = 3): 'bullish' | 'bearish' | 'neutral' {
  if (value === null)      return 'neutral';
  if (value > threshold)   return 'bullish';
  if (value < -threshold)  return 'bearish';
  return 'neutral';
}
`,
  },

  // ── Day 5 ─────────────────────────────────────────────────────
  {
    file: 'src/utils/formatters.ts',
    message: 'feat: add number, currency, and duration formatter utilities',
    content:
`// Formatting utilities for prices, PnL, percentages, and durations

export function formatUSDT(value: number, decimals = 2): string {
  return '$' + value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

export function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return sign + formatUSDT(value);
}

export function formatDuration(ms: number): string {
  if (ms < 60_000)        return Math.round(ms / 1000) + 's';
  if (ms < 3_600_000)     return Math.round(ms / 60_000) + 'm';
  if (ms < 86_400_000)    return (ms / 3_600_000).toFixed(1) + 'h';
  return (ms / 86_400_000).toFixed(1) + 'd';
}

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1)    return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

export function formatNumber(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(decimals) + 'K';
  return n.toFixed(decimals);
}
`,
  },

  // ── Day 6 ─────────────────────────────────────────────────────
  {
    file: 'src/risk/limits.ts',
    message: 'feat: add risk limit guards (max daily loss, position cap, cooldown)',
    content:
`// Runtime risk guards — checked before placing any order

export interface RiskConfig {
  maxDailyLossUSDT:  number;   // e.g. 200
  maxOpenPositions:  number;   // e.g. 5
  minTimeBetweenMs:  number;   // e.g. 30_000 (30s cooldown)
  maxSingleTradeUSDT: number;  // e.g. 2500
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDailyLossUSDT:   500,
  maxOpenPositions:   5,
  minTimeBetweenMs:   15_000,
  maxSingleTradeUSDT: 2_500,
};

interface RiskState {
  dailyLoss:       number;
  lastTradeMs:     number;
  openPositionCount: number;
  resetDayKey:     string;
}

let state: RiskState = {
  dailyLoss: 0, lastTradeMs: 0, openPositionCount: 0,
  resetDayKey: '',
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RiskCheckResult { allowed: boolean; reason?: string }

export function checkRiskLimits(
  amountUSDT: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskCheckResult {
  const today = todayKey();
  if (state.resetDayKey !== today) {
    state.dailyLoss = 0;
    state.resetDayKey = today;
  }
  if (state.dailyLoss >= config.maxDailyLossUSDT)
    return { allowed: false, reason: 'Daily loss limit reached' };
  if (state.openPositionCount >= config.maxOpenPositions)
    return { allowed: false, reason: 'Max open positions reached' };
  if (Date.now() - state.lastTradeMs < config.minTimeBetweenMs)
    return { allowed: false, reason: 'Cooldown period active' };
  if (amountUSDT > config.maxSingleTradeUSDT)
    return { allowed: false, reason: 'Single trade size exceeds limit' };
  return { allowed: true };
}

export function recordTrade(pnl: number): void {
  state.lastTradeMs = Date.now();
  if (pnl < 0) state.dailyLoss += Math.abs(pnl);
  state.openPositionCount++;
}

export function recordClose(pnl: number): void {
  state.openPositionCount = Math.max(0, state.openPositionCount - 1);
  if (pnl < 0) state.dailyLoss += Math.abs(pnl);
}

export function getRiskState(): Readonly<RiskState> { return state; }
`,
  },

  // ── Day 7 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/vwap.ts',
    message: 'feat: add VWAP (Volume Weighted Average Price) indicator',
    content:
`// Volume Weighted Average Price — institutional benchmark for fair value.
// Price above VWAP = bullish bias; below VWAP = bearish bias.

export interface VWAPResult {
  vwap:       number;
  upperBand:  number;   // VWAP + 1 std dev
  lowerBand:  number;   // VWAP - 1 std dev
  position:   'above' | 'below' | 'at';
}

export function vwap(prices: number[], volumes: number[]): VWAPResult | null {
  const n = Math.min(prices.length, volumes.length);
  if (n < 2) return null;

  let cumTPV = 0, cumVol = 0;
  const tpvArr: number[] = [];

  for (let i = 0; i < n; i++) {
    const tp  = prices[i]; // simplified: use close as typical price
    const vol = volumes[i] || 1;
    cumTPV += tp * vol;
    cumVol += vol;
    tpvArr.push(tp);
  }

  if (cumVol === 0) return null;
  const vwapVal = cumTPV / cumVol;

  const variance = tpvArr.reduce((s, tp) => s + (tp - vwapVal) ** 2, 0) / n;
  const std      = Math.sqrt(variance);
  const current  = prices[n - 1];

  return {
    vwap:      parseFloat(vwapVal.toFixed(6)),
    upperBand: parseFloat((vwapVal + std).toFixed(6)),
    lowerBand: parseFloat((vwapVal - std).toFixed(6)),
    position:  current > vwapVal * 1.001 ? 'above'
             : current < vwapVal * 0.999 ? 'below'
             : 'at',
  };
}
`,
  },

  // ── Day 8 ─────────────────────────────────────────────────────
  {
    file: 'src/utils/arrays.ts',
    message: 'feat: add array utilities (rolling window, zip, chunk, diff, cumsum)',
    content:
`// Array utility functions for time-series processing

export function rollingWindow<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = size - 1; i < arr.length; i++) {
    result.push(arr.slice(i - size + 1, i + 1));
  }
  return result;
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const len = Math.min(a.length, b.length);
  return Array.from({ length: len }, (_, i) => [a[i], b[i]]);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export function diff(arr: number[]): number[] {
  return arr.slice(1).map((v, i) => v - arr[i]);
}

export function pctChange(arr: number[]): number[] {
  return arr.slice(1).map((v, i) => arr[i] !== 0 ? (v - arr[i]) / arr[i] : 0);
}

export function cumsum(arr: number[]): number[] {
  let s = 0;
  return arr.map(v => (s += v));
}

export function rollingMax(arr: number[], period: number): number[] {
  return rollingWindow(arr, period).map(w => Math.max(...w));
}

export function rollingMin(arr: number[], period: number): number[] {
  return rollingWindow(arr, period).map(w => Math.min(...w));
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
`,
  },

  // ── Day 9 ─────────────────────────────────────────────────────
  {
    file: 'src/indicators/keltner.ts',
    message: 'feat: add Keltner Channels indicator for volatility-based bands',
    content:
`// Keltner Channels — ATR-based envelope around an EMA.
// Price outside channels signals potential breakout or mean reversion.

export interface KeltnerResult {
  upper:    number;
  middle:   number;   // EMA
  lower:    number;
  width:    number;   // as % of middle
  squeeze:  boolean;  // Keltner narrower than BB (momentum setup)
}

function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) val = prices[i] * k + val * (1 - k);
  return val;
}

function atr(prices: number[], period: number): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));
  const sumTR  = recent.slice(1).reduce((s, p, i) => s + Math.abs(p - recent[i]), 0);
  return sumTR / period;
}

export function keltner(prices: number[], period = 20, mult = 2): KeltnerResult | null {
  const mid  = ema(prices, period);
  const atrV = atr(prices, period);
  if (!mid || !atrV) return null;

  const upper = mid + mult * atrV;
  const lower = mid - mult * atrV;
  const width = ((upper - lower) / mid) * 100;

  return {
    upper:   parseFloat(upper.toFixed(6)),
    middle:  parseFloat(mid.toFixed(6)),
    lower:   parseFloat(lower.toFixed(6)),
    width:   parseFloat(width.toFixed(4)),
    squeeze: width < 3,
  };
}
`,
  },

  // ── Day 10 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/mfi.ts',
    message: 'feat: add MFI (Money Flow Index) volume-weighted momentum oscillator',
    content:
`// Money Flow Index — RSI-style oscillator weighted by volume.
// MFI > 80 = overbought; MFI < 20 = oversold.

export function mfi(prices: number[], volumes: number[], period = 14): number | null {
  const n = Math.min(prices.length, volumes.length);
  if (n < period + 1) return null;

  const tp  = prices.slice(-(period + 1));
  const vol = volumes.slice(-(period + 1));

  let posFlow = 0, negFlow = 0;
  for (let i = 1; i < tp.length; i++) {
    const mfRaw = tp[i] * vol[i];
    if (tp[i] > tp[i - 1])      posFlow += mfRaw;
    else if (tp[i] < tp[i - 1]) negFlow += mfRaw;
  }

  if (negFlow === 0) return 100;
  if (posFlow === 0) return 0;

  const ratio = posFlow / negFlow;
  return parseFloat((100 - 100 / (1 + ratio)).toFixed(2));
}

export function mfiSignal(value: number | null): 'overbought' | 'oversold' | 'neutral' {
  if (value === null) return 'neutral';
  if (value >= 80)   return 'overbought';
  if (value <= 20)   return 'oversold';
  return 'neutral';
}
`,
  },

  // ── Day 11 ────────────────────────────────────────────────────
  {
    file: 'src/risk/exposure.ts',
    message: 'feat: add portfolio exposure analyzer (long/short balance, concentration)',
    content:
`// Portfolio exposure analysis — measures directional bias and concentration risk

export interface Position {
  symbol:     string;
  side:       'buy' | 'sell';
  amountUSDT: number;
}

export interface ExposureReport {
  totalLong:      number;
  totalShort:     number;
  netExposure:    number;   // long - short (positive = net long)
  grossExposure:  number;   // long + short
  longPct:        number;   // % of gross that is long
  shortPct:       number;
  topSymbol:      string | null;
  topSymbolPct:   number;
  diversification: 'concentrated' | 'moderate' | 'diversified';
}

export function analyzeExposure(positions: Position[]): ExposureReport {
  if (positions.length === 0) {
    return {
      totalLong: 0, totalShort: 0, netExposure: 0, grossExposure: 0,
      longPct: 0, shortPct: 0, topSymbol: null, topSymbolPct: 0,
      diversification: 'diversified',
    };
  }

  const totalLong  = positions.filter(p => p.side === 'buy').reduce((s, p) => s + p.amountUSDT, 0);
  const totalShort = positions.filter(p => p.side === 'sell').reduce((s, p) => s + p.amountUSDT, 0);
  const gross      = totalLong + totalShort;

  const bySymbol: Record<string, number> = {};
  for (const p of positions) bySymbol[p.symbol] = (bySymbol[p.symbol] ?? 0) + p.amountUSDT;
  const top     = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0];
  const topPct  = gross > 0 ? (top[1] / gross) * 100 : 0;

  return {
    totalLong,
    totalShort,
    netExposure:   parseFloat((totalLong - totalShort).toFixed(2)),
    grossExposure: parseFloat(gross.toFixed(2)),
    longPct:       parseFloat((gross > 0 ? (totalLong / gross) * 100 : 0).toFixed(1)),
    shortPct:      parseFloat((gross > 0 ? (totalShort / gross) * 100 : 0).toFixed(1)),
    topSymbol:     top ? top[0] : null,
    topSymbolPct:  parseFloat(topPct.toFixed(1)),
    diversification: topPct > 60 ? 'concentrated' : topPct > 40 ? 'moderate' : 'diversified',
  };
}
`,
  },

  // ── Day 12 ────────────────────────────────────────────────────
  {
    file: 'src/utils/time.ts',
    message: 'feat: add time utilities (session detection, countdown, elapsed, throttle)',
    content:
`// Time and scheduling utilities for the trading engine

export function nowMs(): number { return Date.now(); }

export function elapsedMs(since: number): number { return Date.now() - since; }

export function elapsedSec(since: number): number { return Math.floor(elapsedMs(since) / 1000); }

export function elapsedMin(since: number): string { return (elapsedMs(since) / 60_000).toFixed(1); }

export function isoDate(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoTime(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function countdownSec(targetMs: number): number {
  return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
}

export type Session = 'asian' | 'london' | 'new_york' | 'overlap';

export function tradingSession(ms = Date.now()): Session {
  const hour = new Date(ms).getUTCHours();
  if (hour >= 12 && hour < 16) return 'overlap';   // London/NY overlap — highest volume
  if (hour >= 8  && hour < 17) return 'london';
  if (hour >= 13 && hour < 22) return 'new_york';
  return 'asian';
}

export function makeThrottle(limitMs: number): (fn: () => void) => void {
  let last = 0;
  return (fn) => {
    const now = Date.now();
    if (now - last >= limitMs) { last = now; fn(); }
  };
}
`,
  },

  // ── Day 13 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/aroon.ts',
    message: 'feat: add Aroon oscillator for identifying trend changes and strength',
    content:
`// Aroon Indicator — identifies the time since the last high/low within a period.
// AroonUp near 100 = strong uptrend; AroonDown near 100 = strong downtrend.

export interface AroonResult {
  up:         number;   // 0–100
  down:       number;   // 0–100
  oscillator: number;   // up - down (-100 to +100)
  signal:     'uptrend' | 'downtrend' | 'consolidation';
}

export function aroon(prices: number[], period = 25): AroonResult | null {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(-(period + 1));

  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] >= slice[highIdx]) highIdx = i;
    if (slice[i] <= slice[lowIdx])  lowIdx  = i;
  }

  const up         = ((highIdx) / period) * 100;
  const down       = ((lowIdx)  / period) * 100;
  const oscillator = up - down;

  return {
    up:         parseFloat(up.toFixed(2)),
    down:       parseFloat(down.toFixed(2)),
    oscillator: parseFloat(oscillator.toFixed(2)),
    signal:     oscillator > 20 ? 'uptrend' : oscillator < -20 ? 'downtrend' : 'consolidation',
  };
}
`,
  },

  // ── Day 14 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/momentum.ts',
    message: 'feat: add momentum indicator and multi-period momentum score',
    content:
`// Momentum — raw price change over N periods, and composite multi-timeframe score.

export function momentum(prices: number[], period = 10): number | null {
  if (prices.length <= period) return null;
  return parseFloat((prices[prices.length - 1] - prices[prices.length - 1 - period]).toFixed(8));
}

export function momentumPct(prices: number[], period = 10): number | null {
  if (prices.length <= period) return null;
  const prev = prices[prices.length - 1 - period];
  if (prev === 0) return null;
  return parseFloat((((prices[prices.length - 1] - prev) / prev) * 100).toFixed(4));
}

export interface MomentumScore {
  short:  number | null;   // 5-bar
  medium: number | null;   // 10-bar
  long:   number | null;   // 20-bar
  composite: number;       // weighted average (-100 to +100)
}

export function momentumScore(prices: number[]): MomentumScore {
  const s = momentumPct(prices, 5);
  const m = momentumPct(prices, 10);
  const l = momentumPct(prices, 20);

  const cap = (v: number | null) => v === null ? 0 : Math.max(-100, Math.min(100, v * 10));
  const composite = (cap(s) * 0.5 + cap(m) * 0.3 + cap(l) * 0.2);

  return {
    short: s, medium: m, long: l,
    composite: parseFloat(composite.toFixed(2)),
  };
}
`,
  },

  // ── Day 15 ────────────────────────────────────────────────────
  {
    file: 'src/risk/drawdown.ts',
    message: 'feat: add drawdown tracker with max drawdown, current drawdown, and recovery',
    content:
`// Drawdown analysis for equity curves

export interface DrawdownResult {
  current:     number;   // current drawdown as decimal (0–1)
  currentPct:  string;
  max:         number;   // maximum historical drawdown
  maxPct:      string;
  peak:        number;
  trough:      number;
  inDrawdown:  boolean;
  recoveryNeeded: number;  // % gain needed to recover from current DD
}

export function analyzeDrawdown(equity: number[]): DrawdownResult {
  if (equity.length === 0) {
    return {
      current: 0, currentPct: '0.00%', max: 0, maxPct: '0.00%',
      peak: 0, trough: 0, inDrawdown: false, recoveryNeeded: 0,
    };
  }

  let peak   = equity[0];
  let trough = equity[0];
  let maxDD  = 0;

  for (const v of equity) {
    if (v > peak) { peak = v; trough = v; }
    if (v < trough) trough = v;
    const dd = (peak - trough) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const last    = equity[equity.length - 1];
  const currDD  = last < peak ? (peak - last) / peak : 0;
  const recovPct = currDD > 0 ? (1 / (1 - currDD) - 1) * 100 : 0;

  return {
    current:    parseFloat(currDD.toFixed(4)),
    currentPct: (currDD * 100).toFixed(2) + '%',
    max:        parseFloat(maxDD.toFixed(4)),
    maxPct:     (maxDD * 100).toFixed(2) + '%',
    peak,
    trough,
    inDrawdown: currDD > 0.005,
    recoveryNeeded: parseFloat(recovPct.toFixed(2)),
  };
}
`,
  },

  // ── Day 16 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/regime.ts',
    message: 'feat: add market regime detector (trending, ranging, volatile)',
    content:
`// Market regime detection — classifies current market structure.
// Used to select appropriate strategy: trend-following vs mean-reversion.

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeResult {
  regime:     MarketRegime;
  confidence: number;        // 0–100
  adxStrength: number;
  volatilityPct: number;
}

function ema(prices: number[], p: number): number | null {
  if (prices.length < p) return null;
  const k = 2 / (p + 1);
  let v = prices.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < prices.length; i++) v = prices[i] * k + v * (1 - k);
  return v;
}

export function detectRegime(prices: number[], period = 20): RegimeResult | null {
  if (prices.length < period * 2) return null;

  const slice   = prices.slice(-period);
  const mean    = slice.reduce((s, v) => s + v, 0) / period;
  const std     = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  const volPct  = (std / mean) * 100;

  const e9  = ema(prices, 9);
  const e21 = ema(prices, 21);
  const curr = prices[prices.length - 1];

  let regime: MarketRegime = 'ranging';
  let confidence = 50;

  if (volPct > 5) {
    regime = 'volatile';
    confidence = Math.min(95, 50 + volPct * 3);
  } else if (e9 && e21) {
    const spread = Math.abs(e9 - e21) / e21 * 100;
    if (spread > 0.5) {
      regime = curr > e21 ? 'trending_up' : 'trending_down';
      confidence = Math.min(95, 50 + spread * 15);
    } else {
      regime = 'ranging';
      confidence = Math.min(95, 50 + (2 - volPct) * 20);
    }
  }

  return {
    regime,
    confidence: parseFloat(confidence.toFixed(1)),
    adxStrength: parseFloat((e9 && e21 ? Math.abs(e9 - e21) / e21 * 100 : 0).toFixed(2)),
    volatilityPct: parseFloat(volPct.toFixed(2)),
  };
}
`,
  },

  // ── Day 17 ────────────────────────────────────────────────────
  {
    file: 'src/utils/signals.ts',
    message: 'feat: add signal aggregation utilities (vote, weighted consensus, conflict detection)',
    content:
`// Signal aggregation — combine multiple indicator signals into a consensus

export type Signal = 'bullish' | 'bearish' | 'neutral';

export interface WeightedSignal {
  signal: Signal;
  weight: number;   // 0–1
  source: string;
}

export interface Consensus {
  direction: Signal;
  strength:  number;   // 0–100
  agreement: number;   // % of signals agreeing with consensus
  conflicts: string[]; // sources that disagree
}

export function aggregate(signals: WeightedSignal[]): Consensus {
  if (signals.length === 0) {
    return { direction: 'neutral', strength: 0, agreement: 0, conflicts: [] };
  }

  let bullScore = 0, bearScore = 0, totalWeight = 0;
  for (const s of signals) {
    totalWeight += s.weight;
    if (s.signal === 'bullish') bullScore += s.weight;
    else if (s.signal === 'bearish') bearScore += s.weight;
  }

  const direction: Signal = bullScore > bearScore ? 'bullish'
    : bearScore > bullScore ? 'bearish' : 'neutral';
  const dominantScore = Math.max(bullScore, bearScore);
  const strength = totalWeight > 0 ? (dominantScore / totalWeight) * 100 : 0;

  const conflicts = signals
    .filter(s => s.signal !== 'neutral' && s.signal !== direction)
    .map(s => s.source);

  const agreeing = signals.filter(s => s.signal === direction).length;
  const agreement = (agreeing / signals.length) * 100;

  return {
    direction,
    strength: parseFloat(strength.toFixed(1)),
    agreement: parseFloat(agreement.toFixed(1)),
    conflicts,
  };
}

export function simpleVote(signals: Signal[]): Signal {
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) counts[s]++;
  if (counts.bullish > counts.bearish && counts.bullish > counts.neutral) return 'bullish';
  if (counts.bearish > counts.bullish && counts.bearish > counts.neutral) return 'bearish';
  return 'neutral';
}
`,
  },

  // ── Day 18 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/ichimoku.ts',
    message: 'feat: add Ichimoku Cloud components (tenkan, kijun, senkou spans, chikou)',
    content:
`// Ichimoku Kinko Hyo — comprehensive trend/support/resistance system.
// Uses close price as a simplified proxy for high/low since we have single-price data.

export interface IchimokuResult {
  tenkan:    number;         // conversion line (9-period midpoint)
  kijun:     number;         // base line (26-period midpoint)
  senkouA:   number;         // cloud upper (average of tenkan+kijun, plotted 26 ahead)
  senkouB:   number;         // cloud lower (52-period midpoint, plotted 26 ahead)
  chikou:    number;         // lagging span (close plotted 26 behind)
  cloudColor: 'green' | 'red' | 'flat';
  signal:    'bullish' | 'bearish' | 'neutral';
}

function midpoint(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return (Math.max(...slice) + Math.min(...slice)) / 2;
}

export function ichimoku(prices: number[]): IchimokuResult | null {
  const tenkan = midpoint(prices, 9);
  const kijun  = midpoint(prices, 26);
  const senkouB = midpoint(prices, 52);
  if (!tenkan || !kijun || !senkouB) return null;

  const senkouA = (tenkan + kijun) / 2;
  const chikou  = prices[prices.length - 1];
  const current = prices[prices.length - 1];

  const cloudColor: 'green' | 'red' | 'flat' =
    senkouA > senkouB ? 'green' : senkouA < senkouB ? 'red' : 'flat';

  const aboveCloud  = current > Math.max(senkouA, senkouB);
  const belowCloud  = current < Math.min(senkouA, senkouB);
  const tenkanAbove = tenkan > kijun;

  const signal: 'bullish' | 'bearish' | 'neutral' =
    aboveCloud && tenkanAbove ? 'bullish'
    : belowCloud && !tenkanAbove ? 'bearish'
    : 'neutral';

  return {
    tenkan:     parseFloat(tenkan.toFixed(6)),
    kijun:      parseFloat(kijun.toFixed(6)),
    senkouA:    parseFloat(senkouA.toFixed(6)),
    senkouB:    parseFloat(senkouB.toFixed(6)),
    chikou,
    cloudColor,
    signal,
  };
}
`,
  },

  // ── Day 19 ────────────────────────────────────────────────────
  {
    file: 'src/risk/sizing.ts',
    message: 'feat: add Kelly criterion and fixed-fractional position sizing',
    content:
`// Position sizing models — Kelly criterion, fixed-fractional, and volatility-adjusted

export interface SizingInput {
  balance:      number;
  winRate:      number;   // 0–1
  avgWin:       number;   // average win in USDT
  avgLoss:      number;   // average loss in USDT (positive number)
  atr:          number;
  price:        number;
  riskPct:      number;   // max risk per trade as fraction (e.g. 0.01 = 1%)
}

export interface SizingResult {
  kelly:          number;   // Kelly optimal fraction
  halfKelly:      number;   // conservative half-Kelly
  fixedFractional: number;  // risk-pct based
  atrBased:       number;   // ATR stop-based size
  recommended:    number;   // min of all methods (most conservative)
}

export function calcPositionSize(input: SizingInput): SizingResult {
  const { balance, winRate, avgWin, avgLoss, atr, price, riskPct } = input;

  // Kelly: f* = (bp - q) / b  where b = win/loss ratio
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kelly = (b * winRate - (1 - winRate)) / b;
  const halfKelly = Math.max(0, kelly / 2) * balance;

  // Fixed-fractional: risk riskPct of balance per trade
  const fixedFractional = balance * riskPct;

  // ATR-based: risk riskPct of balance, stop = 1.5 ATR
  const riskBudget = balance * riskPct;
  const stopDist   = atr * 1.5;
  const qty        = stopDist > 0 ? riskBudget / stopDist : 0;
  const atrBased   = qty * price;

  const recommended = Math.min(
    halfKelly > 0 ? halfKelly : fixedFractional,
    fixedFractional,
    atrBased > 0 ? atrBased : fixedFractional
  );

  return {
    kelly:           parseFloat((Math.max(0, kelly) * 100).toFixed(2)),
    halfKelly:       parseFloat(halfKelly.toFixed(2)),
    fixedFractional: parseFloat(fixedFractional.toFixed(2)),
    atrBased:        parseFloat(atrBased.toFixed(2)),
    recommended:     parseFloat(recommended.toFixed(2)),
  };
}
`,
  },

  // ── Day 20 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/pivot.ts',
    message: 'feat: add pivot points calculator (classic, Fibonacci, Camarilla levels)',
    content:
`// Pivot Points — intraday support and resistance levels derived from prior session.

export interface PivotLevels {
  pp: number;    // pivot point
  r1: number; r2: number; r3: number;   // resistance
  s1: number; s2: number; s3: number;   // support
}

export function classicPivot(high: number, low: number, close: number): PivotLevels {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

export function fibPivot(high: number, low: number, close: number): PivotLevels {
  const pp    = (high + low + close) / 3;
  const range = high - low;
  return {
    pp,
    r1: pp + 0.382 * range,
    r2: pp + 0.618 * range,
    r3: pp + 1.000 * range,
    s1: pp - 0.382 * range,
    s2: pp - 0.618 * range,
    s3: pp - 1.000 * range,
  };
}

export function pivotFromPrices(prices: number[]): PivotLevels | null {
  if (prices.length < 2) return null;
  const recent = prices.slice(-20);
  const high   = Math.max(...recent);
  const low    = Math.min(...recent);
  const close  = recent[recent.length - 1];
  return classicPivot(high, low, close);
}

export function nearestLevel(price: number, levels: PivotLevels): { level: string; distance: number } {
  const map: Record<string, number> = levels as unknown as Record<string, number>;
  let nearest = 'pp', minDist = Infinity;
  for (const [k, v] of Object.entries(map)) {
    const d = Math.abs(price - v);
    if (d < minDist) { minDist = d; nearest = k; }
  }
  return { level: nearest, distance: parseFloat(minDist.toFixed(6)) };
}
`,
  },

  // ── Day 21 ────────────────────────────────────────────────────
  {
    file: 'src/utils/stats.ts',
    message: 'feat: add portfolio performance statistics (Sharpe, Sortino, Calmar, Omega)',
    content:
`// Portfolio performance statistics — risk-adjusted return metrics

export function sharpeRatio(returns: number[], riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const excess = returns.map(r => r - riskFreeRate / 252);
  const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
  const variance = excess.reduce((s, v) => s + (v - mean) ** 2, 0) / excess.length;
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : parseFloat((mean / std * Math.sqrt(252)).toFixed(4));
}

export function sortinoRatio(returns: number[], riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const excess      = returns.map(r => r - riskFreeRate / 252);
  const mean        = excess.reduce((s, v) => s + v, 0) / excess.length;
  const negReturns  = excess.filter(r => r < 0);
  if (negReturns.length === 0) return 999;
  const downVar  = negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length;
  const downStd  = Math.sqrt(downVar);
  return downStd === 0 ? 0 : parseFloat((mean / downStd * Math.sqrt(252)).toFixed(4));
}

export function calmarRatio(annualReturn: number, maxDrawdown: number): number {
  return maxDrawdown === 0 ? 0 : parseFloat((annualReturn / maxDrawdown).toFixed(4));
}

export function omegaRatio(returns: number[], threshold = 0): number {
  const gains  = returns.filter(r => r > threshold).reduce((s, r) => s + (r - threshold), 0);
  const losses = returns.filter(r => r < threshold).reduce((s, r) => s + (threshold - r), 0);
  return losses === 0 ? 999 : parseFloat((gains / losses).toFixed(4));
}

export function equityToReturns(equity: number[]): number[] {
  return equity.slice(1).map((v, i) => equity[i] !== 0 ? (v - equity[i]) / equity[i] : 0);
}
`,
  },

  // ── Day 22 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/dema.ts',
    message: 'feat: add DEMA (Double Exponential Moving Average) for reduced lag',
    content:
`// Double Exponential Moving Average — reduces EMA lag by applying EMA twice.
// More responsive than EMA; useful for fast signal generation.

function ema(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k   = 2 / (period + 1);
  const out: number[] = [];
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(val);
  for (let i = period; i < prices.length; i++) {
    val = prices[i] * k + val * (1 - k);
    out.push(val);
  }
  return out;
}

export function dema(prices: number[], period = 21): number | null {
  if (prices.length < period * 2) return null;
  const ema1 = ema(prices, period);
  const ema2 = ema(ema1, period);
  if (ema2.length === 0) return null;
  const last1 = ema1[ema1.length - 1];
  const last2 = ema2[ema2.length - 1];
  return parseFloat((2 * last1 - last2).toFixed(8));
}

export function demaCross(prices: number[], fastPeriod = 9, slowPeriod = 21): 'bullish' | 'bearish' | 'neutral' {
  const fast = dema(prices, fastPeriod);
  const slow = dema(prices, slowPeriod);
  if (!fast || !slow) return 'neutral';
  if (fast > slow) return 'bullish';
  if (fast < slow) return 'bearish';
  return 'neutral';
}
`,
  },

  // ── Day 23 ────────────────────────────────────────────────────
  {
    file: 'src/risk/heat.ts',
    message: 'feat: add portfolio heat calculator (total risk exposure as % of balance)',
    content:
`// Portfolio Heat — total risk exposure as a percentage of account balance.
// High heat (> 6%) = too much at risk simultaneously.

export interface Position {
  amountUSDT:     number;
  stopLoss:       number | null;
  price:          number;
  side:           'buy' | 'sell';
}

export interface HeatReport {
  totalHeatPct:   number;   // total risk as % of balance
  positionCount:  number;
  avgHeatPerPos:  number;
  riskLevel:      'low' | 'medium' | 'high' | 'extreme';
  safeToAdd:      boolean;
}

export function portfolioHeat(positions: Position[], balance: number): HeatReport {
  if (balance <= 0) {
    return { totalHeatPct: 0, positionCount: 0, avgHeatPerPos: 0, riskLevel: 'low', safeToAdd: true };
  }

  let totalRisk = 0;
  for (const pos of positions) {
    if (pos.stopLoss === null) {
      totalRisk += pos.amountUSDT * 0.02;
    } else {
      const stopDist = Math.abs(pos.price - pos.stopLoss) / pos.price;
      totalRisk += pos.amountUSDT * stopDist;
    }
  }

  const heatPct = (totalRisk / balance) * 100;
  const avgHeat = positions.length > 0 ? heatPct / positions.length : 0;

  return {
    totalHeatPct:  parseFloat(heatPct.toFixed(2)),
    positionCount: positions.length,
    avgHeatPerPos: parseFloat(avgHeat.toFixed(2)),
    riskLevel:     heatPct > 10 ? 'extreme' : heatPct > 6 ? 'high' : heatPct > 3 ? 'medium' : 'low',
    safeToAdd:     heatPct < 6,
  };
}
`,
  },

  // ── Day 24 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/cmo.ts',
    message: 'feat: add CMO (Chande Momentum Oscillator) for measuring raw momentum',
    content:
`// Chande Momentum Oscillator — measures momentum using sum of up/down days.
// Range: -100 to +100. Above +50 = strong up; below -50 = strong down.

export function cmo(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));

  let sumUp = 0, sumDown = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0)      sumUp   += diff;
    else if (diff < 0) sumDown += Math.abs(diff);
  }

  const denom = sumUp + sumDown;
  if (denom === 0) return 0;
  return parseFloat(((sumUp - sumDown) / denom * 100).toFixed(2));
}

export function cmoSignal(value: number | null): 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear' {
  if (value === null)  return 'neutral';
  if (value > 50)      return 'strong_bull';
  if (value > 20)      return 'bull';
  if (value < -50)     return 'strong_bear';
  if (value < -20)     return 'bear';
  return 'neutral';
}
`,
  },

  // ── Day 25 ────────────────────────────────────────────────────
  {
    file: 'src/utils/normalize.ts',
    message: 'feat: add data normalization utilities (min-max, z-score, sigmoid, tanh scaling)',
    content:
`// Data normalization — scale indicator values to comparable ranges

export function minMaxScale(arr: number[], outMin = 0, outMax = 1): number[] {
  const min = Math.min(...arr), max = Math.max(...arr);
  const range = max - min;
  if (range === 0) return arr.map(() => (outMin + outMax) / 2);
  return arr.map(v => outMin + ((v - min) / range) * (outMax - outMin));
}

export function zscoreScale(arr: number[]): number[] {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  return std === 0 ? arr.map(() => 0) : arr.map(v => (v - mean) / std);
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function tanhScale(x: number): number {
  return Math.tanh(x);
}

export function scaleToRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function normalizeIndicator(value: number | null, min: number, max: number): number {
  if (value === null) return 0.5;
  return scaleToRange(value, min, max, 0, 1);
}
`,
  },

  // ── Day 26 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/dpo.ts',
    message: 'feat: add DPO (Detrended Price Oscillator) for cycle analysis',
    content:
`// Detrended Price Oscillator — removes trend to reveal price cycles.
// Useful for identifying overbought/oversold conditions within a cycle.

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function dpo(prices: number[], period = 20): number | null {
  const shift = Math.floor(period / 2) + 1;
  if (prices.length < period + shift) return null;

  const priceAtShift = prices[prices.length - 1 - shift];
  const smaSlice     = prices.slice(0, prices.length - shift);
  const smaVal       = sma(smaSlice, period);
  if (smaVal === null) return null;

  return parseFloat((priceAtShift - smaVal).toFixed(8));
}

export function dpoBias(value: number | null): 'above_cycle' | 'below_cycle' | 'at_cycle' {
  if (value === null)    return 'at_cycle';
  if (value > 0)         return 'above_cycle';
  if (value < 0)         return 'below_cycle';
  return 'at_cycle';
}
`,
  },

  // ── Day 27 ────────────────────────────────────────────────────
  {
    file: 'src/risk/metrics.ts',
    message: 'feat: add VaR, CVaR (Expected Shortfall), and Omega ratio risk metrics',
    content:
`// Advanced risk metrics — Value at Risk, Conditional VaR, Omega ratio

export function valueAtRisk(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx    = Math.floor((1 - confidence) * sorted.length);
  return Math.abs(sorted[Math.max(0, idx)]);
}

export function conditionalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted   = [...returns].sort((a, b) => a - b);
  const cutoff   = Math.floor((1 - confidence) * sorted.length);
  const tail     = sorted.slice(0, Math.max(1, cutoff));
  const avgLoss  = tail.reduce((s, v) => s + v, 0) / tail.length;
  return Math.abs(avgLoss);
}

export function omegaRatio(returns: number[], threshold = 0): number {
  const gains  = returns.filter(r => r > threshold).reduce((s, r) => s + (r - threshold), 0);
  const losses = returns.filter(r => r < threshold).reduce((s, r) => s + (threshold - r), 0);
  return losses === 0 ? 999 : parseFloat((gains / losses).toFixed(4));
}

export function ulcerIndex(equity: number[]): number {
  if (equity.length < 2) return 0;
  let peak = equity[0];
  const drawdowns: number[] = [];
  for (const v of equity) {
    if (v > peak) peak = v;
    drawdowns.push(((v - peak) / peak) * 100);
  }
  const sumSq = drawdowns.reduce((s, d) => s + d ** 2, 0);
  return parseFloat(Math.sqrt(sumSq / drawdowns.length).toFixed(4));
}

export interface RiskMetrics {
  var95:   number;
  cvar95:  number;
  omega:   number;
  ulcer:   number;
}

export function fullRiskMetrics(returns: number[], equity: number[]): RiskMetrics {
  return {
    var95:  valueAtRisk(returns, 0.95),
    cvar95: conditionalVaR(returns, 0.95),
    omega:  omegaRatio(returns),
    ulcer:  ulcerIndex(equity),
  };
}
`,
  },

  // ── Day 28 ────────────────────────────────────────────────────
  {
    file: 'src/indicators/tema.ts',
    message: 'feat: add TEMA (Triple Exponential Moving Average) for minimal lag',
    content:
`// Triple Exponential Moving Average — least lag of all EMA variants.
// TEMA = 3*EMA1 - 3*EMA2 + EMA3

function emaArr(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k   = 2 / (period + 1);
  let val   = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [val];
  for (let i = period; i < prices.length; i++) {
    val = prices[i] * k + val * (1 - k);
    out.push(val);
  }
  return out;
}

export function tema(prices: number[], period = 21): number | null {
  if (prices.length < period * 3) return null;
  const ema1 = emaArr(prices, period);
  const ema2 = emaArr(ema1, period);
  const ema3 = emaArr(ema2, period);
  if (!ema1.length || !ema2.length || !ema3.length) return null;
  const t = 3 * ema1[ema1.length - 1]
          - 3 * ema2[ema2.length - 1]
          +     ema3[ema3.length - 1];
  return parseFloat(t.toFixed(8));
}

export function temaTrend(prices: number[], period = 21): 'up' | 'down' | 'flat' {
  if (prices.length < period * 3 + 2) return 'flat';
  const curr = tema(prices, period);
  const prev = tema(prices.slice(0, -1), period);
  if (!curr || !prev) return 'flat';
  const change = (curr - prev) / Math.abs(prev) * 100;
  if (change > 0.05)  return 'up';
  if (change < -0.05) return 'down';
  return 'flat';
}
`,
  },

  // ── Day 29 ────────────────────────────────────────────────────
  {
    file: 'src/utils/correlations.ts',
    message: 'feat: add price correlation utilities (Pearson, rolling correlation, pair matrix)',
    content:
`// Price correlation analysis between trading pairs

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(-n), bx = b.slice(-n);
  const ma = ax.reduce((s, v) => s + v, 0) / n;
  const mb = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const ea = ax[i] - ma, eb = bx[i] - mb;
    num += ea * eb;
    da  += ea ** 2;
    db  += eb ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : parseFloat((num / denom).toFixed(4));
}

export function rollingCorrelation(a: number[], b: number[], period = 20): number[] {
  const result: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = period - 1; i < n; i++) {
    const wa = a.slice(i - period + 1, i + 1);
    const wb = b.slice(i - period + 1, i + 1);
    result.push(pearsonCorrelation(wa, wb));
  }
  return result;
}

export type CorrelationMatrix = Record<string, Record<string, number>>;

export function correlationMatrix(priceMap: Record<string, number[]>): CorrelationMatrix {
  const symbols = Object.keys(priceMap);
  const matrix: CorrelationMatrix = {};
  for (const a of symbols) {
    matrix[a] = {};
    for (const b of symbols) {
      matrix[a][b] = a === b ? 1 : pearsonCorrelation(priceMap[a], priceMap[b]);
    }
  }
  return matrix;
}

export function correlationLabel(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.8) return r > 0 ? 'strong positive' : 'strong negative';
  if (abs >= 0.5) return r > 0 ? 'moderate positive' : 'moderate negative';
  if (abs >= 0.2) return r > 0 ? 'weak positive' : 'weak negative';
  return 'uncorrelated';
}
`,
  },

];

// ── Apply next pending improvement ───────────────────────────────
let next = improvements.find(i => !applied.includes(i.file));
if (!next) {
  // Full cycle complete — reset and start over
  applied = [];
  fs.writeFileSync(LOG_FILE, JSON.stringify(applied, null, 2));
  next = improvements[0];
}

const fullPath = path.join(ROOT, next.file);
fs.mkdirSync(path.dirname(fullPath), { recursive: true });
fs.writeFileSync(fullPath, next.content.trimStart());
fs.writeFileSync(MSG_FILE, next.message);

applied.push(next.file);
fs.writeFileSync(LOG_FILE, JSON.stringify(applied, null, 2));

console.log('Applied  :', next.message);
console.log('File     :', next.file);
console.log('Remaining:', improvements.length - applied.length, 'in this cycle');
