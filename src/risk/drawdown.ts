// Drawdown analysis for equity curves

export interface DrawdownResult {
  current:     number;   // current drawdown as decimal (0–1)
  currentPct:  string;
  max:         number;   // maximum historical drawdown
  maxPct:      string;
  peak:        number;
  trough:      number;
  inDrawdown:  boolean;
  recoveryNeeded: number;  // % gain needed to recover from current DD
}

export function analyzeDrawdown(equity: number[]): DrawdownResult {
  if (equity.length === 0) {
    return {
      current: 0, currentPct: '0.00%', max: 0, maxPct: '0.00%',
      peak: 0, trough: 0, inDrawdown: false, recoveryNeeded: 0,
    };
  }

  let peak   = equity[0];
  let trough = equity[0];
  let maxDD  = 0;

  for (const v of equity) {
    if (v > peak) { peak = v; trough = v; }
    if (v < trough) trough = v;
    const dd = (peak - trough) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const last    = equity[equity.length - 1];
  const currDD  = last < peak ? (peak - last) / peak : 0;
  const recovPct = currDD > 0 ? (1 / (1 - currDD) - 1) * 100 : 0;

  return {
    current:    parseFloat(currDD.toFixed(4)),
    currentPct: (currDD * 100).toFixed(2) + '%',
    max:        parseFloat(maxDD.toFixed(4)),
    maxPct:     (maxDD * 100).toFixed(2) + '%',
    peak,
    trough,
    inDrawdown: currDD > 0.005,
    recoveryNeeded: parseFloat(recovPct.toFixed(2)),
  };
}
