// Advanced risk metrics — Value at Risk, Conditional VaR, Omega ratio

export function valueAtRisk(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx    = Math.floor((1 - confidence) * sorted.length);
  return Math.abs(sorted[Math.max(0, idx)]);
}

export function conditionalVaR(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted   = [...returns].sort((a, b) => a - b);
  const cutoff   = Math.floor((1 - confidence) * sorted.length);
  const tail     = sorted.slice(0, Math.max(1, cutoff));
  const avgLoss  = tail.reduce((s, v) => s + v, 0) / tail.length;
  return Math.abs(avgLoss);
}

export function omegaRatio(returns: number[], threshold = 0): number {
  const gains  = returns.filter(r => r > threshold).reduce((s, r) => s + (r - threshold), 0);
  const losses = returns.filter(r => r < threshold).reduce((s, r) => s + (threshold - r), 0);
  return losses === 0 ? 999 : parseFloat((gains / losses).toFixed(4));
}

export function ulcerIndex(equity: number[]): number {
  if (equity.length < 2) return 0;
  let peak = equity[0];
  const drawdowns: number[] = [];
  for (const v of equity) {
    if (v > peak) peak = v;
    drawdowns.push(((v - peak) / peak) * 100);
  }
  const sumSq = drawdowns.reduce((s, d) => s + d ** 2, 0);
  return parseFloat(Math.sqrt(sumSq / drawdowns.length).toFixed(4));
}

export interface RiskMetrics {
  var95:   number;
  cvar95:  number;
  omega:   number;
  ulcer:   number;
}

export function fullRiskMetrics(returns: number[], equity: number[]): RiskMetrics {
  return {
    var95:  valueAtRisk(returns, 0.95),
    cvar95: conditionalVaR(returns, 0.95),
    omega:  omegaRatio(returns),
    ulcer:  ulcerIndex(equity),
  };
}
