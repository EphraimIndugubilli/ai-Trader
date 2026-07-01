// Rate of Change — percentage change between current price and N periods ago.
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
