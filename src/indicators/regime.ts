// Market regime detection — classifies current market structure.
// Used to select appropriate strategy: trend-following vs mean-reversion.

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeResult {
  regime:     MarketRegime;
  confidence: number;        // 0–100
  adxStrength: number;
  volatilityPct: number;
}

function ema(prices: number[], p: number): number | null {
  if (prices.length < p) return null;
  const k = 2 / (p + 1);
  let v = prices.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < prices.length; i++) v = prices[i] * k + v * (1 - k);
  return v;
}

export function detectRegime(prices: number[], period = 20): RegimeResult | null {
  if (prices.length < period * 2) return null;

  const slice   = prices.slice(-period);
  const mean    = slice.reduce((s, v) => s + v, 0) / period;
  const std     = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  const volPct  = (std / mean) * 100;

  const e9  = ema(prices, 9);
  const e21 = ema(prices, 21);
  const curr = prices[prices.length - 1];

  let regime: MarketRegime = 'ranging';
  let confidence = 50;

  if (volPct > 5) {
    regime = 'volatile';
    confidence = Math.min(95, 50 + volPct * 3);
  } else if (e9 && e21) {
    const spread = Math.abs(e9 - e21) / e21 * 100;
    if (spread > 0.5) {
      regime = curr > e21 ? 'trending_up' : 'trending_down';
      confidence = Math.min(95, 50 + spread * 15);
    } else {
      regime = 'ranging';
      confidence = Math.min(95, 50 + (2 - volPct) * 20);
    }
  }

  return {
    regime,
    confidence: parseFloat(confidence.toFixed(1)),
    adxStrength: parseFloat((e9 && e21 ? Math.abs(e9 - e21) / e21 * 100 : 0).toFixed(2)),
    volatilityPct: parseFloat(volPct.toFixed(2)),
  };
}
