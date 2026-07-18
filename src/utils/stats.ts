// Portfolio performance statistics — risk-adjusted return metrics

export function sharpeRatio(returns: number[], riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const excess = returns.map(r => r - riskFreeRate / 252);
  const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
  const variance = excess.reduce((s, v) => s + (v - mean) ** 2, 0) / excess.length;
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : parseFloat((mean / std * Math.sqrt(252)).toFixed(4));
}

export function sortinoRatio(returns: number[], riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const excess      = returns.map(r => r - riskFreeRate / 252);
  const mean        = excess.reduce((s, v) => s + v, 0) / excess.length;
  const negReturns  = excess.filter(r => r < 0);
  if (negReturns.length === 0) return 999;
  const downVar  = negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length;
  const downStd  = Math.sqrt(downVar);
  return downStd === 0 ? 0 : parseFloat((mean / downStd * Math.sqrt(252)).toFixed(4));
}

export function calmarRatio(annualReturn: number, maxDrawdown: number): number {
  return maxDrawdown === 0 ? 0 : parseFloat((annualReturn / maxDrawdown).toFixed(4));
}

export function omegaRatio(returns: number[], threshold = 0): number {
  const gains  = returns.filter(r => r > threshold).reduce((s, r) => s + (r - threshold), 0);
  const losses = returns.filter(r => r < threshold).reduce((s, r) => s + (threshold - r), 0);
  return losses === 0 ? 999 : parseFloat((gains / losses).toFixed(4));
}

export function equityToReturns(equity: number[]): number[] {
  return equity.slice(1).map((v, i) => equity[i] !== 0 ? (v - equity[i]) / equity[i] : 0);
}
