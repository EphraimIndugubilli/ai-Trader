// Portfolio exposure analysis — measures directional bias and concentration risk

export interface Position {
  symbol:     string;
  side:       'buy' | 'sell';
  amountUSDT: number;
}

export interface ExposureReport {
  totalLong:      number;
  totalShort:     number;
  netExposure:    number;   // long - short (positive = net long)
  grossExposure:  number;   // long + short
  longPct:        number;   // % of gross that is long
  shortPct:       number;
  topSymbol:      string | null;
  topSymbolPct:   number;
  diversification: 'concentrated' | 'moderate' | 'diversified';
}

export function analyzeExposure(positions: Position[]): ExposureReport {
  if (positions.length === 0) {
    return {
      totalLong: 0, totalShort: 0, netExposure: 0, grossExposure: 0,
      longPct: 0, shortPct: 0, topSymbol: null, topSymbolPct: 0,
      diversification: 'diversified',
    };
  }

  const totalLong  = positions.filter(p => p.side === 'buy').reduce((s, p) => s + p.amountUSDT, 0);
  const totalShort = positions.filter(p => p.side === 'sell').reduce((s, p) => s + p.amountUSDT, 0);
  const gross      = totalLong + totalShort;

  const bySymbol: Record<string, number> = {};
  for (const p of positions) bySymbol[p.symbol] = (bySymbol[p.symbol] ?? 0) + p.amountUSDT;
  const top     = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0];
  const topPct  = gross > 0 ? (top[1] / gross) * 100 : 0;

  return {
    totalLong,
    totalShort,
    netExposure:   parseFloat((totalLong - totalShort).toFixed(2)),
    grossExposure: parseFloat(gross.toFixed(2)),
    longPct:       parseFloat((gross > 0 ? (totalLong / gross) * 100 : 0).toFixed(1)),
    shortPct:      parseFloat((gross > 0 ? (totalShort / gross) * 100 : 0).toFixed(1)),
    topSymbol:     top ? top[0] : null,
    topSymbolPct:  parseFloat(topPct.toFixed(1)),
    diversification: topPct > 60 ? 'concentrated' : topPct > 40 ? 'moderate' : 'diversified',
  };
}
