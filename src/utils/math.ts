// Core statistical math utilities used across indicators and risk modules

export const mean = (a: number[]): number =>
  a.reduce((s, v) => s + v, 0) / a.length;

export const variance = (a: number[]): number => {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length;
};

export const stddev = (a: number[]): number => Math.sqrt(variance(a));

export const percentile = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

export const zscore = (a: number[]): number[] => {
  const m = mean(a), s = stddev(a);
  return s === 0 ? a.map(() => 0) : a.map(v => (v - m) / s);
};

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const roundTo = (v: number, d: number): number =>
  Math.round(v * 10 ** d) / 10 ** d;

export function linreg(y: number[]): { slope: number; intercept: number; r2: number } {
  const n = y.length;
  const sx = (n * (n - 1)) / 2;
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = (n * (n - 1) * (2 * n - 1)) / 6;
  const sxy = y.reduce((s, v, i) => s + i * v, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope: roundTo(slope, 8), intercept: roundTo(intercept, 8), r2: roundTo(r2, 4) };
}
