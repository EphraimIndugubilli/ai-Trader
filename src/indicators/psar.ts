// Parabolic SAR (Stop and Reverse)
// ─────────────────────────────────
// Welles Wilder's trailing stop indicator. A rising SAR below the price marks
// a bullish trend; a falling SAR above the price marks a bearish trend. When
// price crosses the SAR line the trend reverses — the indicator "stops and
// reverses". Crypto applications typically use the same defaults as equities:
//   AF start = 0.02, AF step = 0.02, AF max = 0.20
//
// The SAR value on the last bar is the current trailing stop level.
// Returns null if fewer than 5 bars are available.

export interface ParabolicSARResult {
  value: number;                   // current SAR level
  direction: 'bullish' | 'bearish'; // price above SAR → bullish; below → bearish
  distPct: number;                 // (price − SAR) / price × 100  (negative when bearish)
  af: number;                      // current acceleration factor (how tightly SAR tracks EP)
  justFlipped: boolean;            // true if SAR reversed direction on the last bar
}

export function parabolicSAR(
  prices: number[],
  afStep  = 0.02,
  afMax   = 0.20,
): ParabolicSARResult | null {
  if (prices.length < 5) return null;

  // Initialise: assume bullish start, SAR = first bar low approximation
  let bullish  = true;
  let sar      = prices[0];
  let ep       = prices[0];   // extreme point (highest high in uptrend, lowest low in downtrend)
  let af       = afStep;
  let prevBullish = bullish;

  for (let i = 1; i < prices.length; i++) {
    const price    = prices[i];
    const prevPrice = prices[i - 1];

    // Advance SAR
    let nextSAR = sar + af * (ep - sar);

    if (bullish) {
      // SAR must not be above the two most recent lows
      const minPrev = i >= 2 ? Math.min(prices[i - 1], prices[i - 2]) : prices[i - 1];
      if (nextSAR > minPrev) nextSAR = minPrev;

      if (price < nextSAR) {
        // Reversal — switch to bearish
        prevBullish = true;
        bullish     = false;
        nextSAR     = ep;   // SAR jumps to the extreme point of the prior trend
        ep          = price;
        af          = afStep;
      } else {
        prevBullish = false;
        if (price > ep) {
          ep = price;
          af = Math.min(af + afStep, afMax);
        }
      }
    } else {
      // Bearish: SAR must not be below the two most recent highs
      const maxPrev = i >= 2 ? Math.max(prices[i - 1], prices[i - 2]) : prices[i - 1];
      if (nextSAR < maxPrev) nextSAR = maxPrev;

      if (price > nextSAR) {
        // Reversal — switch to bullish
        prevBullish = false;
        bullish     = true;
        nextSAR     = ep;
        ep          = price;
        af          = afStep;
      } else {
        prevBullish = true;
        if (price < ep) {
          ep = price;
          af = Math.min(af + afStep, afMax);
        }
      }
    }

    sar = nextSAR;
  }

  const current   = prices[prices.length - 1];
  const distPct   = parseFloat((((current - sar) / current) * 100).toFixed(3));
  const justFlipped = bullish !== prevBullish;

  return {
    value:       parseFloat(sar.toFixed(6)),
    direction:   bullish ? 'bullish' : 'bearish',
    distPct,
    af:          parseFloat(af.toFixed(4)),
    justFlipped,
  };
}
