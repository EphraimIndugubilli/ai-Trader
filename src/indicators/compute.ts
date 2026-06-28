// src/indicators/compute.ts
// Full technical analysis suite — typed, pure functions.

import {
  IndicatorResult, MACDResult, BollingerBands,
  StochasticResult, SupportResistance, VolumeSignal, AIAction
} from '../types/index';
import { getPrices, getVolume } from '../market/engine';

// ── Williams %R ────────────────────────────────────────────────────
export function williamsR(prices: number[], period = 14): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const highest = Math.max(...slice);
  const lowest = Math.min(...slice);
  if (highest === lowest) return -50;
  return parseFloat((((highest - slice[slice.length - 1]) / (highest - lowest)) * -100).toFixed(2));
}

// ── Primitives ────────────────────────────────────────────────────
export function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) val = prices[i] * k + val * (1 - k);
  return val;
}

export function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function rsi(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

export function macd(prices: number[]): MACDResult | null {
  if (prices.length < 35) return null;
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = ema12 - ema26;
  const history: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const e12 = ema(prices.slice(0, i), 12);
    const e26 = ema(prices.slice(0, i), 26);
    if (e12 && e26) history.push(e12 - e26);
  }
  const signal = ema(history, 9) ?? 0;
  return {
    macd:      parseFloat(macdLine.toFixed(6)),
    signal:    parseFloat(signal.toFixed(6)),
    histogram: parseFloat((macdLine - signal).toFixed(6)),
  };
}

export function bollingerBands(prices: number[], period = 20, mult = 2): BollingerBands | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean  = slice.reduce((a, b) => a + b, 0) / period;
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return {
    upper:     parseFloat((mean + mult * std).toFixed(6)),
    middle:    parseFloat(mean.toFixed(6)),
    lower:     parseFloat((mean - mult * std).toFixed(6)),
    bandwidth: parseFloat(((mult * 2 * std) / mean * 100).toFixed(4)),
  };
}

export function atr(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));
  const sumTR  = recent.slice(1).reduce((sum, p, i) => sum + Math.abs(p - recent[i]), 0);
  return parseFloat((sumTR / period).toFixed(8));
}

export function stochastic(prices: number[], kPeriod = 14): StochasticResult | null {
  if (prices.length < kPeriod) return null;
  const slice   = prices.slice(-kPeriod);
  const highest = Math.max(...slice);
  const lowest  = Math.min(...slice);
  if (highest === lowest) return { k: 50, d: 50 };
  const k = ((slice[slice.length - 1] - lowest) / (highest - lowest)) * 100;
  return { k: parseFloat(k.toFixed(2)), d: parseFloat(k.toFixed(2)) };
}

export function volumeSignal(volume: number[]): VolumeSignal {
  if (volume.length < 10) return 'normal';
  const recent = volume.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const avg    = volume.slice(-20).reduce((a, b) => a + b, 0) / 20;
  if (recent > avg * 1.5) return 'high';
  if (recent < avg * 0.6) return 'low';
  return 'normal';
}

export function supportResistance(prices: number[]): SupportResistance {
  if (prices.length < 20) return { support: null, resistance: null };
  const recent = prices.slice(-20);
  return {
    support:    parseFloat(Math.min(...recent).toFixed(6)),
    resistance: parseFloat(Math.max(...recent).toFixed(6)),
  };
}

export function trendStrength(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 0;
  const recent = prices.slice(-(period + 1));
  let up = 0, down = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d > 0) up += d; else down += Math.abs(d);
  }
  const total = up + down;
  return total === 0 ? 0 : parseFloat((Math.abs(up - down) / total * 100).toFixed(2));
}

// Rate of Change: percentage price change over N periods
export function roc(prices: number[], period = 10): number | null {
  if (prices.length < period + 1) return null;
  const past = prices[prices.length - 1 - period];
  if (past === 0) return null;
  return parseFloat((((prices[prices.length - 1] - past) / past) * 100).toFixed(4));
}

// RSI divergence: bullish if price makes lower low but RSI makes higher low
export function detectDivergence(prices: number[], period = 14): 'bullish' | 'bearish' | 'none' {
  if (prices.length < period * 2 + 1) return 'none';
  const half = Math.floor(prices.length / 2);
  const firstHalf = prices.slice(0, half);
  const secondHalf = prices.slice(half);

  const rsi1 = rsi(firstHalf, period);
  const rsi2 = rsi(secondHalf, period);
  if (!rsi1 || !rsi2) return 'none';

  const price1 = firstHalf[firstHalf.length - 1];
  const price2 = secondHalf[secondHalf.length - 1];

  if (price2 < price1 && rsi2 > rsi1) return 'bullish';
  if (price2 > price1 && rsi2 < rsi1) return 'bearish';
  return 'none';
}

// ── Full composite signal ─────────────────────────────────────────
export function compute(symbol: string): IndicatorResult | null {
  const prices = getPrices(symbol);
  const volume = getVolume(symbol);
  if (prices.length < 30) return null;

  const rsiVal    = rsi(prices);
  const macdVal   = macd(prices);
  const bb        = bollingerBands(prices);
  const ema9Val   = ema(prices, 9);
  const ema21Val  = ema(prices, 21);
  const ema50Val  = ema(prices, 50);
  const atrVal    = atr(prices);
  const stoch     = stochastic(prices);
  const wR        = williamsR(prices);
  const rocVal    = roc(prices, 10);
  const diverg    = detectDivergence(prices);
  const volSig    = volumeSignal(volume);
  const sr        = supportResistance(prices);
  const trend     = trendStrength(prices);
  const current   = prices[prices.length - 1];

  let score = 0;
  const reasons: string[] = [];

  if (rsiVal !== null) {
    if      (rsiVal < 30) { score += 30; reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`); }
    else if (rsiVal < 40) { score += 15; reasons.push(`RSI low (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 70) { score -= 30; reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 60) { score -= 15; reasons.push(`RSI high (${rsiVal.toFixed(1)})`); }
  }

  if (macdVal) {
    if      (macdVal.histogram > 0 && macdVal.macd > 0) { score += 20; reasons.push('MACD bullish crossover'); }
    else if (macdVal.histogram < 0 && macdVal.macd < 0) { score -= 20; reasons.push('MACD bearish crossover'); }
    else if (macdVal.histogram > 0)                      { score += 10; reasons.push('MACD histogram positive'); }
    else                                                  { score -= 10; reasons.push('MACD histogram negative'); }
  }

  if (ema9Val && ema21Val) {
    if      (ema9Val > ema21Val && current > ema21Val) { score += 20; reasons.push('EMA9 > EMA21 (uptrend)'); }
    else if (ema9Val < ema21Val && current < ema21Val) { score -= 20; reasons.push('EMA9 < EMA21 (downtrend)'); }
  }

  // EMA50 trend filter — confirms or weakens directional bias
  if (ema50Val) {
    if      (current > ema50Val && ema9Val && ema9Val > ema50Val) { score += 10; reasons.push(`Price above EMA50 (${ema50Val.toFixed(4)}) — bullish structure`); }
    else if (current < ema50Val && ema9Val && ema9Val < ema50Val) { score -= 10; reasons.push(`Price below EMA50 (${ema50Val.toFixed(4)}) — bearish structure`); }
  }

  // ROC momentum — strong positive/negative momentum confirms direction
  if (rocVal !== null) {
    if      (rocVal > 3)  { score += 12; reasons.push(`ROC momentum strong bullish (+${rocVal.toFixed(2)}%)`); }
    else if (rocVal > 1)  { score += 6;  reasons.push(`ROC momentum mild bullish (+${rocVal.toFixed(2)}%)`); }
    else if (rocVal < -3) { score -= 12; reasons.push(`ROC momentum strong bearish (${rocVal.toFixed(2)}%)`); }
    else if (rocVal < -1) { score -= 6;  reasons.push(`ROC momentum mild bearish (${rocVal.toFixed(2)}%)`); }
  }

  if (bb) {
    if      (current < bb.lower) { score += 15; reasons.push('Price below lower BB (mean reversion)'); }
    else if (current > bb.upper) { score -= 15; reasons.push('Price above upper BB (mean reversion)'); }
  }

  if (stoch) {
    if      (stoch.k < 20) { score += 10; reasons.push(`Stoch oversold (${stoch.k})`); }
    else if (stoch.k > 80) { score -= 10; reasons.push(`Stoch overbought (${stoch.k})`); }
  }

  // Williams %R
  if (wR !== null) {
    if      (wR <= -80) { score += 12; reasons.push(`Williams %R oversold (${wR})`); }
    else if (wR >= -20) { score -= 12; reasons.push(`Williams %R overbought (${wR})`); }
  }

  // RSI divergence
  if (diverg === 'bullish') { score += 18; reasons.push('Bullish RSI divergence detected'); }
  if (diverg === 'bearish') { score -= 18; reasons.push('Bearish RSI divergence detected'); }

  if      (volSig === 'high') { score *= 1.2; reasons.push('High volume confirms signal'); }
  else if (volSig === 'low')  { score *= 0.7; reasons.push('Low volume — signal weakened'); }

  score = Math.max(-100, Math.min(100, score));

  let action: AIAction = 'HOLD';
  let confidence = 0;
  if      (score >= 35)  { action = 'BUY';  confidence = Math.min(95, 40 + score * 0.55); }
  else if (score <= -35) { action = 'SELL'; confidence = Math.min(95, 40 + Math.abs(score) * 0.55); }
  else                   { action = 'HOLD'; confidence = Math.max(20, 50 - Math.abs(score)); }

  const atrFactor = atrVal ?? current * 0.01;
  const target = action === 'BUY'
    ? parseFloat((current + atrFactor * 2.5).toFixed(6))
    : action === 'SELL'
    ? parseFloat((current - atrFactor * 2.5).toFixed(6))
    : null;
  const stopLoss = action === 'BUY'
    ? parseFloat((current - atrFactor * 1.2).toFixed(6))
    : action === 'SELL'
    ? parseFloat((current + atrFactor * 1.2).toFixed(6))
    : null;

  return {
    symbol, current,
    rsi: rsiVal, macd: macdVal, bb,
    ema9: ema9Val, ema21: ema21Val, ema50: ema50Val,
    atr: atrVal, stoch, volSig, sr, trend,
    roc: rocVal,
    score: parseFloat(score.toFixed(2)),
    action, confidence: parseFloat(confidence.toFixed(1)),
    target, stopLoss, reasons,
  };
}
