// src/indicators/hma.ts
// Hull Moving Average (HMA) — reduces lag versus EMA/WMA while retaining smoothness.
// Formula: HMA(n) = WMA( 2·WMA(n/2) − WMA(n), √n )
// 2026 trend: HMA is increasingly adopted in crypto trading terminals as the
// primary trend-direction filter because it responds to price changes roughly
// twice as fast as a same-period EMA without introducing the choppiness of a
// shorter EMA — a key edge in volatile perp markets.

function wma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  // Weighted sum: most recent bar gets weight `period`, oldest gets weight 1
  const denom = (period * (period + 1)) / 2;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += slice[i] * (i + 1);
  }
  return sum / denom;
}

function wmaOfSeries(series: number[], period: number): number | null {
  if (series.length < period) return null;
  const slice = series.slice(-period);
  const denom = (period * (period + 1)) / 2;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += slice[i] * (i + 1);
  }
  return sum / denom;
}

export interface HMAResult {
  value: number;
  direction: 'bullish' | 'bearish';
  slope: number;
  period: number;
}

export function hma(prices: number[], period = 20): HMAResult | null {
  const halfPeriod  = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod  = Math.max(2, Math.round(Math.sqrt(period)));
  // We need enough bars to compute WMA(period) first, then sqrtPeriod more bars
  // for the final WMA step.
  const minBars = period + sqrtPeriod + 2;
  if (prices.length < minBars) return null;

  // Build the intermediate series: 2·WMA(halfPeriod) − WMA(period)
  // We need at least sqrtPeriod values of this series.
  const intermLen = sqrtPeriod + 5; // a few extra for numerical stability
  const intermed: number[] = [];

  for (let tail = prices.length - intermLen; tail <= prices.length; tail++) {
    if (tail < period) continue;
    const slice = prices.slice(0, tail);
    const wH = wma(slice, halfPeriod);
    const wF = wma(slice, period);
    if (wH != null && wF != null) intermed.push(2 * wH - wF);
  }

  if (intermed.length < sqrtPeriod + 1) return null;

  const current = wmaOfSeries(intermed, sqrtPeriod);
  if (current == null) return null;

  // Previous HMA value (drop last element from the intermediate series)
  const prev = wmaOfSeries(intermed.slice(0, -1), sqrtPeriod);
  const slope = prev != null ? parseFloat((current - prev).toFixed(6)) : 0;

  return {
    value:     parseFloat(current.toFixed(6)),
    direction: slope >= 0 ? 'bullish' : 'bearish',
    slope,
    period,
  };
}
