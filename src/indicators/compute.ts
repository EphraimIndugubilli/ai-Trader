// src/indicators/compute.ts
// Full technical analysis suite — typed, pure functions.

import {
  IndicatorResult, MACDResult, BollingerBands,
  StochasticResult, SupportResistance, VolumeSignal, AIAction, OBVResult,
  ConfluenceResult, ADXResult, BBSqueezeResult, VWAPResult,
} from '../types/index';
import { getPrices, getVolume } from '../market/engine';
import { cci } from './cci';
import { adx as computeADX } from './adx';

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

// ── Bollinger Band Squeeze ────────────────────────────────────────
// Trending 2026 quant signal: bands narrow (low bandwidth) before explosive
// moves because volatility contracts before it expands. A squeeze fires when
// current bandwidth drops below 85% of its own 40-period rolling average,
// meaning volatility is coiling — a significant directional move is likely.
// intensity (0-100) shows how deep into the squeeze we are.
export function bbSqueeze(prices: number[], period = 20, lookback = 40): BBSqueezeResult | null {
  if (prices.length < period + lookback) return null;
  const bwHistory: number[] = [];
  for (let i = period; i <= prices.length; i++) {
    const sl = prices.slice(i - period, i);
    const mean = sl.reduce((a, b) => a + b, 0) / period;
    const std  = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    if (mean > 0) bwHistory.push((4 * std) / mean * 100);
  }
  if (bwHistory.length < lookback) return null;
  const recent      = bwHistory.slice(-lookback);
  const avgBw       = recent.reduce((a, b) => a + b, 0) / recent.length;
  const currentBw   = recent[recent.length - 1];
  const minBw       = Math.min(...recent);
  const squeeze     = currentBw < avgBw * 0.85;
  const intensity   = squeeze ? Math.round((1 - currentBw / avgBw) * 100) : 0;
  return {
    squeeze,
    intensity,
    currentBandwidth: parseFloat(currentBw.toFixed(4)),
    avgBandwidth:     parseFloat(avgBw.toFixed(4)),
    minBandwidth:     parseFloat(minBw.toFixed(4)),
  };
}

export function stochastic(prices: number[], kPeriod = 14, dPeriod = 3): StochasticResult | null {
  if (prices.length < kPeriod + dPeriod - 1) return null;
  const ks: number[] = [];
  for (let offset = dPeriod - 1; offset >= 0; offset--) {
    const end   = prices.length - offset;
    const slice = prices.slice(end - kPeriod, end);
    const highest = Math.max(...slice);
    const lowest  = Math.min(...slice);
    if (highest === lowest) { ks.push(50); continue; }
    ks.push(((slice[slice.length - 1] - lowest) / (highest - lowest)) * 100);
  }
  const k = ks[ks.length - 1];
  const d = ks.reduce((a, b) => a + b, 0) / ks.length;
  return { k: parseFloat(k.toFixed(2)), d: parseFloat(d.toFixed(2)) };
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

// ── On-Balance Volume ─────────────────────────────────────────────
// OBV is the #1 trending volume indicator in 2026 — cumulative sum that
// adds volume on up-days and subtracts on down-days, revealing whether
// smart money is accumulating or distributing.
export function obv(prices: number[], volume: number[]): OBVResult | null {
  if (prices.length < 2 || volume.length < 2) return null;
  const len = Math.min(prices.length, volume.length);
  const series: number[] = [volume[0]];
  for (let i = 1; i < len; i++) {
    const prev = series[series.length - 1];
    if (prices[i] > prices[i - 1]) series.push(prev + volume[i]);
    else if (prices[i] < prices[i - 1]) series.push(prev - volume[i]);
    else series.push(prev);
  }
  const obvEma9  = ema(series, 9);
  const obvEma21 = ema(series, 21);
  let trend: OBVResult['trend'] = 'flat';
  if (obvEma9 !== null && obvEma21 !== null) {
    if      (obvEma9 > obvEma21 * 1.001) trend = 'rising';
    else if (obvEma9 < obvEma21 * 0.999) trend = 'falling';
  }
  return { value: series[series.length - 1], trend };
}

// ── VWAP with Standard Deviation Bands ───────────────────────────
// VWAP is the #1 institutional benchmark in 2026: it weights each price by
// its traded volume over the session, producing an average that reflects
// where real money transacted. Algo desks and market makers reference it
// for fair-value anchoring; retail overpaying above 2σ is a classic fade
// setup. SD bands (±1σ, ±2σ) turn it into a dynamic range filter:
// price hugging VWAP → balanced order flow; price above +2σ → stretched,
// institutional sellers likely activate. Computed over the available
// price/volume window as a session-anchored rolling calculation.
export function vwap(prices: number[], volume: number[]): VWAPResult | null {
  const len = Math.min(prices.length, volume.length);
  if (len < 10) return null;

  let cumVolume = 0, cumVolumePrice = 0;
  const tpv: number[] = [];
  for (let i = 0; i < len; i++) {
    const tp = prices[i];
    cumVolumePrice += tp * volume[i];
    cumVolume += volume[i];
    tpv.push(tp * volume[i]);
  }
  if (cumVolume === 0) return null;

  const vwapVal = cumVolumePrice / cumVolume;

  // Compute volume-weighted standard deviation
  let varianceSum = 0;
  for (let i = 0; i < len; i++) {
    varianceSum += volume[i] * (prices[i] - vwapVal) ** 2;
  }
  const sd = Math.sqrt(varianceSum / cumVolume);

  const current = prices[len - 1];
  const deviation = parseFloat(((current - vwapVal) / vwapVal * 100).toFixed(4));

  let zone: VWAPResult['zone'];
  if (current > vwapVal + 2 * sd)       zone = 'above_2sd';
  else if (current > vwapVal + sd)       zone = 'above_1sd';
  else if (current < vwapVal - 2 * sd)   zone = 'below_2sd';
  else if (current < vwapVal - sd)       zone = 'below_1sd';
  else                                    zone = 'near_vwap';

  return {
    vwap:       parseFloat(vwapVal.toFixed(6)),
    upperBand1: parseFloat((vwapVal + sd).toFixed(6)),
    lowerBand1: parseFloat((vwapVal - sd).toFixed(6)),
    upperBand2: parseFloat((vwapVal + 2 * sd).toFixed(6)),
    lowerBand2: parseFloat((vwapVal - 2 * sd).toFixed(6)),
    deviation,
    zone,
  };
}

// ── Three-way confluence gate ─────────────────────────────────────
// 2026 quant best practice: only enter a position when RSI, MACD, and OBV
// all vote the same direction. Single-indicator signals have too many
// false positives. Require ≥2 of 3 to agree before marking gated=true.
export function computeConfluence(prices: number[], volume: number[]): ConfluenceResult {
  const rsiVal  = rsi(prices);
  const macdVal = macd(prices);
  const obvVal  = obv(prices, volume);

  const rsiIsBull  = rsiVal !== null && rsiVal < 50;
  const rsiIsBear  = rsiVal !== null && rsiVal > 50;
  const macdIsBull = macdVal !== null && macdVal.histogram > 0 && macdVal.macd > 0;
  const macdIsBear = macdVal !== null && macdVal.histogram < 0 && macdVal.macd < 0;
  const obvIsBull  = obvVal !== null && obvVal.trend === 'rising';
  const obvIsBear  = obvVal !== null && obvVal.trend === 'falling';

  const bullCount = [rsiIsBull, macdIsBull, obvIsBull].filter(Boolean).length;
  const bearCount = [rsiIsBear, macdIsBear, obvIsBear].filter(Boolean).length;

  const direction: ConfluenceResult['direction'] =
    bullCount >= 2 ? 'bullish' : bearCount >= 2 ? 'bearish' : 'mixed';
  const score = Math.max(bullCount, bearCount);

  return {
    score,
    direction,
    rsiAligned:  direction === 'bullish' ? rsiIsBull  : rsiIsBear,
    macdAligned: direction === 'bullish' ? macdIsBull : macdIsBear,
    obvAligned:  direction === 'bullish' ? obvIsBull  : obvIsBear,
    gated:       score >= 2,
  };
}

// ── Full composite signal ─────────────────────────────────────────
export function compute(symbol: string): IndicatorResult | null {
  const prices = getPrices(symbol);
  const volume = getVolume(symbol);
  if (prices.length < 30) return null;

  const rsiVal    = rsi(prices);
  // 2026 crypto-trading research: traders shorten RSI from the classic
  // 14-period to 9 (or 11) to react faster to crypto's higher volatility.
  // Used here as a fast confirmation signal alongside the standard RSI,
  // not a replacement — the 14-period stays the primary read.
  const rsiFastVal = rsi(prices, 9);
  const bbSqueezeVal = bbSqueeze(prices);
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
  const obvVal    = obv(prices, volume);
  const sr        = supportResistance(prices);
  const trend     = trendStrength(prices);
  const cciVal    = cci(prices);
  const adxVal    = computeADX(prices);
  const vwapVal   = vwap(prices, volume);
  const current   = prices[prices.length - 1];

  let score = 0;
  const reasons: string[] = [];

  if (rsiVal !== null) {
    if      (rsiVal < 30) { score += 30; reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`); }
    else if (rsiVal < 40) { score += 15; reasons.push(`RSI low (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 70) { score -= 30; reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`); }
    else if (rsiVal > 60) { score -= 15; reasons.push(`RSI high (${rsiVal.toFixed(1)})`); }
  }

  // Fast RSI(9) confirmation — agrees with RSI(14) on extremes -> stronger
  // signal; disagrees -> the move may just be short-term noise, dampen it.
  if (rsiVal !== null && rsiFastVal !== null) {
    const slowExtreme = rsiVal < 35 ? 'oversold' : rsiVal > 65 ? 'overbought' : null;
    const fastExtreme = rsiFastVal < 35 ? 'oversold' : rsiFastVal > 65 ? 'overbought' : null;
    if (slowExtreme && fastExtreme === slowExtreme) {
      score += slowExtreme === 'oversold' ? 8 : -8;
      reasons.push(`RSI(9) confirms RSI(14) ${slowExtreme} (${rsiFastVal.toFixed(1)})`);
    } else if (slowExtreme && fastExtreme !== slowExtreme) {
      score *= 0.9;
      reasons.push(`RSI(9) (${rsiFastVal.toFixed(1)}) doesn't confirm RSI(14) — signal may be noise`);
    }
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

  // Bollinger Band Squeeze — 2026 breakout-coiling detector.
  // Narrow bands = compressed volatility about to expand. Boost the existing
  // directional score when a squeeze is active: the coming move is likely
  // larger than usual, so the signal deserves more weight. Dampen score
  // when bands are very wide (already expanded) to avoid chasing.
  if (bbSqueezeVal) {
    if (bbSqueezeVal.squeeze && bbSqueezeVal.intensity >= 15) {
      const boost = Math.min(12, bbSqueezeVal.intensity * 0.5);
      score += score > 0 ? boost : score < 0 ? -boost : 0;
      reasons.push(`BB Squeeze active (intensity ${bbSqueezeVal.intensity}%, BW ${bbSqueezeVal.currentBandwidth.toFixed(2)}%) — breakout coiling, amplifying directional signal`);
    } else if (!bbSqueezeVal.squeeze && bbSqueezeVal.currentBandwidth > bbSqueezeVal.avgBandwidth * 1.5) {
      score *= 0.88;
      reasons.push(`BB bands wide (BW ${bbSqueezeVal.currentBandwidth.toFixed(2)}% > 1.5× avg) — volatility already expanded, mean reversion risk dampens signal`);
    }
  }

  if (stoch) {
    if      (stoch.k < 20) { score += 10; reasons.push(`Stoch oversold (K=${stoch.k})`); }
    else if (stoch.k > 80) { score -= 10; reasons.push(`Stoch overbought (K=${stoch.k})`); }
    // K/D crossover: bullish when K rises above D from oversold; bearish when K falls below D from overbought
    if (stoch.k > stoch.d && stoch.k < 40) {
      score += 8; reasons.push(`Stoch bullish K/D crossover (K=${stoch.k} > D=${stoch.d}) from low zone`);
    } else if (stoch.k < stoch.d && stoch.k > 60) {
      score -= 8; reasons.push(`Stoch bearish K/D crossover (K=${stoch.k} < D=${stoch.d}) from high zone`);
    }
  }

  // Williams %R
  if (wR !== null) {
    if      (wR <= -80) { score += 12; reasons.push(`Williams %R oversold (${wR})`); }
    else if (wR >= -20) { score -= 12; reasons.push(`Williams %R overbought (${wR})`); }
  }

  // RSI divergence
  if (diverg === 'bullish') { score += 18; reasons.push('Bullish RSI divergence detected'); }
  if (diverg === 'bearish') { score -= 18; reasons.push('Bearish RSI divergence detected'); }

  // CCI — extreme readings confirm momentum exhaustion or reversal zones
  if (cciVal !== null) {
    if      (cciVal < -150) { score += 16; reasons.push(`CCI deeply oversold (${cciVal.toFixed(0)}) — strong mean-reversion buy zone`); }
    else if (cciVal < -100) { score += 10; reasons.push(`CCI oversold (${cciVal.toFixed(0)}) — potential reversal zone`); }
    else if (cciVal > 150)  { score -= 16; reasons.push(`CCI deeply overbought (${cciVal.toFixed(0)}) — strong mean-reversion sell zone`); }
    else if (cciVal > 100)  { score -= 10; reasons.push(`CCI overbought (${cciVal.toFixed(0)}) — watch for pullback`); }
  }

  if      (volSig === 'high') { score *= 1.2; reasons.push('High volume confirms signal'); }
  else if (volSig === 'low')  { score *= 0.7; reasons.push('Low volume — signal weakened'); }

  // OBV — cumulative volume flow confirmation
  if (obvVal) {
    if (obvVal.trend === 'rising' && score > 0) {
      score += 14; reasons.push('OBV rising — smart money accumulating');
    } else if (obvVal.trend === 'rising' && score < 0) {
      score += 8;  reasons.push('OBV rising against price drop — bullish divergence');
    } else if (obvVal.trend === 'falling' && score < 0) {
      score -= 14; reasons.push('OBV falling — distribution pressure confirmed');
    } else if (obvVal.trend === 'falling' && score > 0) {
      score -= 8;  reasons.push('OBV falling into price rise — bearish divergence');
    }
  }

  // ADX trend-strength gate — 2026 quant discipline: oscillators lie in
  // ranging markets. ADX < 15 means no meaningful trend exists, so RSI/MACD
  // crossovers are noise. ADX > 25 confirms the market is in a directional
  // trend, making those same signals significantly more reliable.
  if (adxVal) {
    if (adxVal.trend === 'strong') {
      const boost = score > 0 ? Math.min(100, score * 1.12) : Math.max(-100, score * 1.12);
      if (Math.abs(boost) > Math.abs(score)) {
        score = boost;
        reasons.push(`ADX ${adxVal.adx.toFixed(1)} — strong trend confirms directional bias (+12% signal boost)`);
      }
    } else if (adxVal.trend === 'weak') {
      score = score * 0.80;
      reasons.push(`ADX ${adxVal.adx.toFixed(1)} — weak/ranging market, oscillator signals less reliable (−20% dampen)`);
    }
  }

  // VWAP deviation signal — 2026 institutional benchmark.
  // Price above +2σ = stretched above fair value → fade/sell lean.
  // Price below −2σ = over-extended below fair value → mean-reversion buy lean.
  // Near VWAP (±1σ) = balanced; no VWAP edge, apply small confidence dampener.
  if (vwapVal) {
    if (vwapVal.zone === 'below_2sd') {
      score += 18; reasons.push(`VWAP: price ${Math.abs(vwapVal.deviation).toFixed(2)}% below −2σ band — institutional mean-reversion buy zone`);
    } else if (vwapVal.zone === 'below_1sd') {
      score += 9; reasons.push(`VWAP: price below −1σ (${vwapVal.deviation.toFixed(2)}% from VWAP) — demand zone`);
    } else if (vwapVal.zone === 'above_2sd') {
      score -= 18; reasons.push(`VWAP: price ${vwapVal.deviation.toFixed(2)}% above +2σ band — stretched, institutional fade zone`);
    } else if (vwapVal.zone === 'above_1sd') {
      score -= 9; reasons.push(`VWAP: price above +1σ (${vwapVal.deviation.toFixed(2)}% from VWAP) — supply zone`);
    } else {
      score *= 0.95; reasons.push(`VWAP: price near fair value (${vwapVal.deviation > 0 ? '+' : ''}${vwapVal.deviation.toFixed(2)}%) — no VWAP edge`);
    }
  }

  score = Math.max(-100, Math.min(100, score));

  let action: AIAction = 'HOLD';
  let confidence = 0;
  if      (score >= 35)  { action = 'BUY';  confidence = Math.min(95, 40 + score * 0.55); }
  else if (score <= -35) { action = 'SELL'; confidence = Math.min(95, 40 + Math.abs(score) * 0.55); }
  else                   { action = 'HOLD'; confidence = Math.max(20, 50 - Math.abs(score)); }

  const confluenceVal = computeConfluence(prices, volume);

  // Confluence gate: boost score when all 3 signals agree; dampen when mixed
  if (confluenceVal.gated && confluenceVal.direction === 'bullish' && score > 0) {
    score = Math.min(100, score * 1.15);
    reasons.push(`3-way confluence: RSI+MACD+OBV all bullish (score: ${confluenceVal.score}/3)`);
  } else if (confluenceVal.gated && confluenceVal.direction === 'bearish' && score < 0) {
    score = Math.max(-100, score * 1.15);
    reasons.push(`3-way confluence: RSI+MACD+OBV all bearish (score: ${confluenceVal.score}/3)`);
  } else if (!confluenceVal.gated) {
    score = score * 0.85;
    reasons.push(`Confluence weak (${confluenceVal.score}/3 indicators agree) — signal dampened`);
  }

  score = Math.max(-100, Math.min(100, score));

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
    rsi: rsiVal, rsiFast: rsiFastVal, macd: macdVal, bb, bbSqueeze: bbSqueezeVal,
    ema9: ema9Val, ema21: ema21Val, ema50: ema50Val,
    atr: atrVal, stoch, volSig, obv: obvVal, adx: adxVal, vwap: vwapVal, sr, trend,
    roc: rocVal, cci: cciVal,
    confluence: confluenceVal,
    score: parseFloat(score.toFixed(2)),
    action, confidence: parseFloat(confidence.toFixed(1)),
    target, stopLoss, reasons,
  };
}
