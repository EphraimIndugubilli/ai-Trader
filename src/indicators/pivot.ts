// Pivot Points — intraday support and resistance levels derived from prior session.

export interface PivotLevels {
  pp: number;    // pivot point
  r1: number; r2: number; r3: number;   // resistance
  s1: number; s2: number; s3: number;   // support
}

export function classicPivot(high: number, low: number, close: number): PivotLevels {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

export function fibPivot(high: number, low: number, close: number): PivotLevels {
  const pp    = (high + low + close) / 3;
  const range = high - low;
  return {
    pp,
    r1: pp + 0.382 * range,
    r2: pp + 0.618 * range,
    r3: pp + 1.000 * range,
    s1: pp - 0.382 * range,
    s2: pp - 0.618 * range,
    s3: pp - 1.000 * range,
  };
}

export function pivotFromPrices(prices: number[]): PivotLevels | null {
  if (prices.length < 2) return null;
  const recent = prices.slice(-20);
  const high   = Math.max(...recent);
  const low    = Math.min(...recent);
  const close  = recent[recent.length - 1];
  return classicPivot(high, low, close);
}

export function nearestLevel(price: number, levels: PivotLevels): { level: string; distance: number } {
  const map: Record<string, number> = levels as unknown as Record<string, number>;
  let nearest = 'pp', minDist = Infinity;
  for (const [k, v] of Object.entries(map)) {
    const d = Math.abs(price - v);
    if (d < minDist) { minDist = d; nearest = k; }
  }
  return { level: nearest, distance: parseFloat(minDist.toFixed(6)) };
}
