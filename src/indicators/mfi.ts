// Money Flow Index — RSI-style oscillator weighted by volume.
// MFI > 80 = overbought; MFI < 20 = oversold.

export function mfi(prices: number[], volumes: number[], period = 14): number | null {
  const n = Math.min(prices.length, volumes.length);
  if (n < period + 1) return null;

  const tp  = prices.slice(-(period + 1));
  const vol = volumes.slice(-(period + 1));

  let posFlow = 0, negFlow = 0;
  for (let i = 1; i < tp.length; i++) {
    const mfRaw = tp[i] * vol[i];
    if (tp[i] > tp[i - 1])      posFlow += mfRaw;
    else if (tp[i] < tp[i - 1]) negFlow += mfRaw;
  }

  if (negFlow === 0) return 100;
  if (posFlow === 0) return 0;

  const ratio = posFlow / negFlow;
  return parseFloat((100 - 100 / (1 + ratio)).toFixed(2));
}

export function mfiSignal(value: number | null): 'overbought' | 'oversold' | 'neutral' {
  if (value === null) return 'neutral';
  if (value >= 80)   return 'overbought';
  if (value <= 20)   return 'oversold';
  return 'neutral';
}
