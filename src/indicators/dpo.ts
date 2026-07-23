// Detrended Price Oscillator — removes trend to reveal price cycles.
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
