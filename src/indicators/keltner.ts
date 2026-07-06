// Keltner Channels — ATR-based envelope around an EMA.
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
