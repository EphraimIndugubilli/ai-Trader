// Volume Weighted Average Price — institutional benchmark for fair value.
// Price above VWAP = bullish bias; below VWAP = bearish bias.

export interface VWAPResult {
  vwap:       number;
  upperBand:  number;   // VWAP + 1 std dev
  lowerBand:  number;   // VWAP - 1 std dev
  position:   'above' | 'below' | 'at';
}

export function vwap(prices: number[], volumes: number[]): VWAPResult | null {
  const n = Math.min(prices.length, volumes.length);
  if (n < 2) return null;

  let cumTPV = 0, cumVol = 0;
  const tpvArr: number[] = [];

  for (let i = 0; i < n; i++) {
    const tp  = prices[i]; // simplified: use close as typical price
    const vol = volumes[i] || 1;
    cumTPV += tp * vol;
    cumVol += vol;
    tpvArr.push(tp);
  }

  if (cumVol === 0) return null;
  const vwapVal = cumTPV / cumVol;

  const variance = tpvArr.reduce((s, tp) => s + (tp - vwapVal) ** 2, 0) / n;
  const std      = Math.sqrt(variance);
  const current  = prices[n - 1];

  return {
    vwap:      parseFloat(vwapVal.toFixed(6)),
    upperBand: parseFloat((vwapVal + std).toFixed(6)),
    lowerBand: parseFloat((vwapVal - std).toFixed(6)),
    position:  current > vwapVal * 1.001 ? 'above'
             : current < vwapVal * 0.999 ? 'below'
             : 'at',
  };
}
