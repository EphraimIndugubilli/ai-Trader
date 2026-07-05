// Array utility functions for time-series processing

export function rollingWindow<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = size - 1; i < arr.length; i++) {
    result.push(arr.slice(i - size + 1, i + 1));
  }
  return result;
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const len = Math.min(a.length, b.length);
  return Array.from({ length: len }, (_, i) => [a[i], b[i]]);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export function diff(arr: number[]): number[] {
  return arr.slice(1).map((v, i) => v - arr[i]);
}

export function pctChange(arr: number[]): number[] {
  return arr.slice(1).map((v, i) => arr[i] !== 0 ? (v - arr[i]) / arr[i] : 0);
}

export function cumsum(arr: number[]): number[] {
  let s = 0;
  return arr.map(v => (s += v));
}

export function rollingMax(arr: number[], period: number): number[] {
  return rollingWindow(arr, period).map(w => Math.max(...w));
}

export function rollingMin(arr: number[], period: number): number[] {
  return rollingWindow(arr, period).map(w => Math.min(...w));
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}
