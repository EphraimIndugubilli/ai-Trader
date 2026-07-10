// Aroon Indicator — identifies the time since the last high/low within a period.
// AroonUp near 100 = strong uptrend; AroonDown near 100 = strong downtrend.

export interface AroonResult {
  up:         number;   // 0–100
  down:       number;   // 0–100
  oscillator: number;   // up - down (-100 to +100)
  signal:     'uptrend' | 'downtrend' | 'consolidation';
}

export function aroon(prices: number[], period = 25): AroonResult | null {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(-(period + 1));

  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] >= slice[highIdx]) highIdx = i;
    if (slice[i] <= slice[lowIdx])  lowIdx  = i;
  }

  const up         = ((highIdx) / period) * 100;
  const down       = ((lowIdx)  / period) * 100;
  const oscillator = up - down;

  return {
    up:         parseFloat(up.toFixed(2)),
    down:       parseFloat(down.toFixed(2)),
    oscillator: parseFloat(oscillator.toFixed(2)),
    signal:     oscillator > 20 ? 'uptrend' : oscillator < -20 ? 'downtrend' : 'consolidation',
  };
}
