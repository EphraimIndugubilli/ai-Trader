// Commodity Channel Index — measures deviation from the average price.
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
