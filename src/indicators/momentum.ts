// Momentum — raw price change over N periods, and composite multi-timeframe score.

export function momentum(prices: number[], period = 10): number | null {
  if (prices.length <= period) return null;
  return parseFloat((prices[prices.length - 1] - prices[prices.length - 1 - period]).toFixed(8));
}

export function momentumPct(prices: number[], period = 10): number | null {
  if (prices.length <= period) return null;
  const prev = prices[prices.length - 1 - period];
  if (prev === 0) return null;
  return parseFloat((((prices[prices.length - 1] - prev) / prev) * 100).toFixed(4));
}

export interface MomentumScore {
  short:  number | null;   // 5-bar
  medium: number | null;   // 10-bar
  long:   number | null;   // 20-bar
  composite: number;       // weighted average (-100 to +100)
}

export function momentumScore(prices: number[]): MomentumScore {
  const s = momentumPct(prices, 5);
  const m = momentumPct(prices, 10);
  const l = momentumPct(prices, 20);

  const cap = (v: number | null) => v === null ? 0 : Math.max(-100, Math.min(100, v * 10));
  const composite = (cap(s) * 0.5 + cap(m) * 0.3 + cap(l) * 0.2);

  return {
    short: s, medium: m, long: l,
    composite: parseFloat(composite.toFixed(2)),
  };
}
