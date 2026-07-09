// Time and scheduling utilities for the trading engine

export function nowMs(): number { return Date.now(); }

export function elapsedMs(since: number): number { return Date.now() - since; }

export function elapsedSec(since: number): number { return Math.floor(elapsedMs(since) / 1000); }

export function elapsedMin(since: number): string { return (elapsedMs(since) / 60_000).toFixed(1); }

export function isoDate(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoTime(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function countdownSec(targetMs: number): number {
  return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
}

export type Session = 'asian' | 'london' | 'new_york' | 'overlap';

export function tradingSession(ms = Date.now()): Session {
  const hour = new Date(ms).getUTCHours();
  if (hour >= 12 && hour < 16) return 'overlap';   // London/NY overlap — highest volume
  if (hour >= 8  && hour < 17) return 'london';
  if (hour >= 13 && hour < 22) return 'new_york';
  return 'asian';
}

export function makeThrottle(limitMs: number): (fn: () => void) => void {
  let last = 0;
  return (fn) => {
    const now = Date.now();
    if (now - last >= limitMs) { last = now; fn(); }
  };
}
