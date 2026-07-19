// Double Exponential Moving Average — reduces EMA lag by applying EMA twice.
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
