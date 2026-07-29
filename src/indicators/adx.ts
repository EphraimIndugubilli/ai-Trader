// Average Directional Index — measures trend strength, not direction.
// ADX > 25 = strong trend; ADX < 20 = weak/ranging market.

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: 'strong' | 'moderate' | 'weak';
}

export function adx(prices: number[], period = 14): ADXResult | null {
  if (prices.length < period * 2) return null;

  const tr: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const curr = prices[i], prev = prices[i - 1];
    tr.push(Math.abs(curr - prev));
    const up   = curr - prev;
    const down = prev - curr;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const recent = (arr: number[]) => arr.slice(-period).reduce((s, v) => s + v, 0);
  const smoothTR  = recent(tr);
  const smoothPDM = recent(plusDM);
  const smoothMDM = recent(minusDM);

  if (smoothTR === 0) return null;

  const plusDI  = (smoothPDM / smoothTR) * 100;
  const minusDI = (smoothMDM / smoothTR) * 100;
  const diSum   = plusDI + minusDI;
  const dx      = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;

  return {
    adx:     parseFloat(dx.toFixed(2)),
    plusDI:  parseFloat(plusDI.toFixed(2)),
    minusDI: parseFloat(minusDI.toFixed(2)),
    trend:   dx > 25 ? 'strong' : dx > 15 ? 'moderate' : 'weak',
  };
}
