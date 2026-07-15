// Ichimoku Kinko Hyo — comprehensive trend/support/resistance system.
// Uses close price as a simplified proxy for high/low since we have single-price data.

export interface IchimokuResult {
  tenkan:    number;         // conversion line (9-period midpoint)
  kijun:     number;         // base line (26-period midpoint)
  senkouA:   number;         // cloud upper (average of tenkan+kijun, plotted 26 ahead)
  senkouB:   number;         // cloud lower (52-period midpoint, plotted 26 ahead)
  chikou:    number;         // lagging span (close plotted 26 behind)
  cloudColor: 'green' | 'red' | 'flat';
  signal:    'bullish' | 'bearish' | 'neutral';
}

function midpoint(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return (Math.max(...slice) + Math.min(...slice)) / 2;
}

export function ichimoku(prices: number[]): IchimokuResult | null {
  const tenkan = midpoint(prices, 9);
  const kijun  = midpoint(prices, 26);
  const senkouB = midpoint(prices, 52);
  if (!tenkan || !kijun || !senkouB) return null;

  const senkouA = (tenkan + kijun) / 2;
  const chikou  = prices[prices.length - 1];
  const current = prices[prices.length - 1];

  const cloudColor: 'green' | 'red' | 'flat' =
    senkouA > senkouB ? 'green' : senkouA < senkouB ? 'red' : 'flat';

  const aboveCloud  = current > Math.max(senkouA, senkouB);
  const belowCloud  = current < Math.min(senkouA, senkouB);
  const tenkanAbove = tenkan > kijun;

  const signal: 'bullish' | 'bearish' | 'neutral' =
    aboveCloud && tenkanAbove ? 'bullish'
    : belowCloud && !tenkanAbove ? 'bearish'
    : 'neutral';

  return {
    tenkan:     parseFloat(tenkan.toFixed(6)),
    kijun:      parseFloat(kijun.toFixed(6)),
    senkouA:    parseFloat(senkouA.toFixed(6)),
    senkouB:    parseFloat(senkouB.toFixed(6)),
    chikou,
    cloudColor,
    signal,
  };
}
