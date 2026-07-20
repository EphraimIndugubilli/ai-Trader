// Portfolio Heat — total risk exposure as a percentage of account balance.
// High heat (> 6%) = too much at risk simultaneously.

export interface Position {
  amountUSDT:     number;
  stopLoss:       number | null;
  price:          number;
  side:           'buy' | 'sell';
}

export interface HeatReport {
  totalHeatPct:   number;   // total risk as % of balance
  positionCount:  number;
  avgHeatPerPos:  number;
  riskLevel:      'low' | 'medium' | 'high' | 'extreme';
  safeToAdd:      boolean;
}

export function portfolioHeat(positions: Position[], balance: number): HeatReport {
  if (balance <= 0) {
    return { totalHeatPct: 0, positionCount: 0, avgHeatPerPos: 0, riskLevel: 'low', safeToAdd: true };
  }

  let totalRisk = 0;
  for (const pos of positions) {
    if (pos.stopLoss === null) {
      totalRisk += pos.amountUSDT * 0.02;
    } else {
      const stopDist = Math.abs(pos.price - pos.stopLoss) / pos.price;
      totalRisk += pos.amountUSDT * stopDist;
    }
  }

  const heatPct = (totalRisk / balance) * 100;
  const avgHeat = positions.length > 0 ? heatPct / positions.length : 0;

  return {
    totalHeatPct:  parseFloat(heatPct.toFixed(2)),
    positionCount: positions.length,
    avgHeatPerPos: parseFloat(avgHeat.toFixed(2)),
    riskLevel:     heatPct > 10 ? 'extreme' : heatPct > 6 ? 'high' : heatPct > 3 ? 'medium' : 'low',
    safeToAdd:     heatPct < 6,
  };
}
