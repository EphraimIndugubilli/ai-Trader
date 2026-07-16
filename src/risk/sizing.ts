// Position sizing models — Kelly criterion, fixed-fractional, and volatility-adjusted

export interface SizingInput {
  balance:      number;
  winRate:      number;   // 0–1
  avgWin:       number;   // average win in USDT
  avgLoss:      number;   // average loss in USDT (positive number)
  atr:          number;
  price:        number;
  riskPct:      number;   // max risk per trade as fraction (e.g. 0.01 = 1%)
}

export interface SizingResult {
  kelly:          number;   // Kelly optimal fraction
  halfKelly:      number;   // conservative half-Kelly
  fixedFractional: number;  // risk-pct based
  atrBased:       number;   // ATR stop-based size
  recommended:    number;   // min of all methods (most conservative)
}

export function calcPositionSize(input: SizingInput): SizingResult {
  const { balance, winRate, avgWin, avgLoss, atr, price, riskPct } = input;

  // Kelly: f* = (bp - q) / b  where b = win/loss ratio
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kelly = (b * winRate - (1 - winRate)) / b;
  const halfKelly = Math.max(0, kelly / 2) * balance;

  // Fixed-fractional: risk riskPct of balance per trade
  const fixedFractional = balance * riskPct;

  // ATR-based: risk riskPct of balance, stop = 1.5 ATR
  const riskBudget = balance * riskPct;
  const stopDist   = atr * 1.5;
  const qty        = stopDist > 0 ? riskBudget / stopDist : 0;
  const atrBased   = qty * price;

  const recommended = Math.min(
    halfKelly > 0 ? halfKelly : fixedFractional,
    fixedFractional,
    atrBased > 0 ? atrBased : fixedFractional
  );

  return {
    kelly:           parseFloat((Math.max(0, kelly) * 100).toFixed(2)),
    halfKelly:       parseFloat(halfKelly.toFixed(2)),
    fixedFractional: parseFloat(fixedFractional.toFixed(2)),
    atrBased:        parseFloat(atrBased.toFixed(2)),
    recommended:     parseFloat(recommended.toFixed(2)),
  };
}
