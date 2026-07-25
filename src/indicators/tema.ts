// Triple Exponential Moving Average — least lag of all EMA variants.
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
