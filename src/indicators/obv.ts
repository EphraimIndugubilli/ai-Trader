// On-Balance Volume — cumulative volume indicator confirming price trends.
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
