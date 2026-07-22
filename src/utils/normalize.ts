// Data normalization — scale indicator values to comparable ranges

export function minMaxScale(arr: number[], outMin = 0, outMax = 1): number[] {
  const min = Math.min(...arr), max = Math.max(...arr);
  const range = max - min;
  if (range === 0) return arr.map(() => (outMin + outMax) / 2);
  return arr.map(v => outMin + ((v - min) / range) * (outMax - outMin));
}

export function zscoreScale(arr: number[]): number[] {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  return std === 0 ? arr.map(() => 0) : arr.map(v => (v - mean) / std);
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function tanhScale(x: number): number {
  return Math.tanh(x);
}

export function scaleToRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function normalizeIndicator(value: number | null, min: number, max: number): number {
  if (value === null) return 0.5;
  return scaleToRange(value, min, max, 0, 1);
}
