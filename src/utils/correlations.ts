// Price correlation analysis between trading pairs

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ax = a.slice(-n), bx = b.slice(-n);
  const ma = ax.reduce((s, v) => s + v, 0) / n;
  const mb = bx.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const ea = ax[i] - ma, eb = bx[i] - mb;
    num += ea * eb;
    da  += ea ** 2;
    db  += eb ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : parseFloat((num / denom).toFixed(4));
}

export function rollingCorrelation(a: number[], b: number[], period = 20): number[] {
  const result: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = period - 1; i < n; i++) {
    const wa = a.slice(i - period + 1, i + 1);
    const wb = b.slice(i - period + 1, i + 1);
    result.push(pearsonCorrelation(wa, wb));
  }
  return result;
}

export type CorrelationMatrix = Record<string, Record<string, number>>;

export function correlationMatrix(priceMap: Record<string, number[]>): CorrelationMatrix {
  const symbols = Object.keys(priceMap);
  const matrix: CorrelationMatrix = {};
  for (const a of symbols) {
    matrix[a] = {};
    for (const b of symbols) {
      matrix[a][b] = a === b ? 1 : pearsonCorrelation(priceMap[a], priceMap[b]);
    }
  }
  return matrix;
}

export function correlationLabel(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.8) return r > 0 ? 'strong positive' : 'strong negative';
  if (abs >= 0.5) return r > 0 ? 'moderate positive' : 'moderate negative';
  if (abs >= 0.2) return r > 0 ? 'weak positive' : 'weak negative';
  return 'uncorrelated';
}
