// src/indicators/fibonacci.ts
// Fibonacci Retracement Levels — 2026 crypto research consensus:
// "Fibonacci levels are indispensable for crypto technical analysis;
// the 61.8% golden ratio is the most reliable reversal zone."
// Uses the lookback window's swing high and swing low to derive levels,
// then determines whether the current price is in the golden zone
// (38.2%–61.8% retracement) or near a key level (within ATR proximity).

import { FibonacciLevel, FibonacciResult } from '../types/index';

const RATIOS: { ratio: number; label: string }[] = [
  { ratio: 0,     label: '0%'    },
  { ratio: 0.236, label: '23.6%' },
  { ratio: 0.382, label: '38.2%' },
  { ratio: 0.5,   label: '50.0%' },
  { ratio: 0.618, label: '61.8%' },
  { ratio: 0.786, label: '78.6%' },
  { ratio: 1,     label: '100%'  },
];

export function fibonacci(
  prices: number[],
  lookback = 100,
  atr: number | null = null,
): FibonacciResult | null {
  if (prices.length < 10) return null;

  const window = prices.slice(-Math.min(lookback, prices.length));
  const swingHigh = Math.max(...window);
  const swingLow  = Math.min(...window);
  const range = swingHigh - swingLow;

  if (range <= 0) return null;

  const current = prices[prices.length - 1];

  // Levels measured from swing low — each level is (swingLow + ratio * range)
  const levels: FibonacciLevel[] = RATIOS.map(({ ratio, label }) => ({
    ratio,
    label,
    price: parseFloat((swingLow + ratio * range).toFixed(6)),
  }));

  // Retracement % — how far the current price has pulled back from the swing high
  // 0% = at swing high; 100% = back to swing low; values > 100 = new low
  const retracementPct = parseFloat((((swingHigh - current) / range) * 100).toFixed(2));

  // Nearest support (largest level.price ≤ current) and resistance (smallest > current)
  let nearestSupport: FibonacciLevel | null = null;
  let nearestResistance: FibonacciLevel | null = null;
  for (const lvl of levels) {
    if (lvl.price <= current) nearestSupport = lvl;
    else if (nearestResistance === null) nearestResistance = lvl;
  }

  // Golden zone: retracement between 38.2% and 61.8% — highest-probability reversal band
  const inGoldenZone = retracementPct >= 38.2 && retracementPct <= 61.8;

  // Near-level detection: within ATR distance of any key ratio (0.382, 0.5, 0.618, 0.786)
  const threshold = atr ?? range * 0.02;
  const keyRatios = [0.382, 0.5, 0.618, 0.786];
  const nearLevel = levels.find(
    (lvl) => keyRatios.includes(lvl.ratio) && Math.abs(lvl.price - current) <= threshold,
  ) ?? null;

  return {
    swingHigh,
    swingLow,
    levels,
    retracementPct,
    nearestSupport,
    nearestResistance,
    inGoldenZone,
    nearLevel,
  };
}
