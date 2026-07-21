// Chande Momentum Oscillator — measures momentum using sum of up/down days.
// Range: -100 to +100. Above +50 = strong up; below -50 = strong down.

export function cmo(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));

  let sumUp = 0, sumDown = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0)      sumUp   += diff;
    else if (diff < 0) sumDown += Math.abs(diff);
  }

  const denom = sumUp + sumDown;
  if (denom === 0) return 0;
  return parseFloat(((sumUp - sumDown) / denom * 100).toFixed(2));
}

export function cmoSignal(value: number | null): 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear' {
  if (value === null)  return 'neutral';
  if (value > 50)      return 'strong_bull';
  if (value > 20)      return 'bull';
  if (value < -50)     return 'strong_bear';
  if (value < -20)     return 'bear';
  return 'neutral';
}
