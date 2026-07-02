// Formatting utilities for prices, PnL, percentages, and durations

export function formatUSDT(value: number, decimals = 2): string {
  return '$' + value.toFixed(decimals).replace(/B(?=(d{3})+(?!d))/g, ',');
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

export function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return sign + formatUSDT(value);
}

export function formatDuration(ms: number): string {
  if (ms < 60_000)        return Math.round(ms / 1000) + 's';
  if (ms < 3_600_000)     return Math.round(ms / 60_000) + 'm';
  if (ms < 86_400_000)    return (ms / 3_600_000).toFixed(1) + 'h';
  return (ms / 86_400_000).toFixed(1) + 'd';
}

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1)    return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

export function formatNumber(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(decimals) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(decimals) + 'K';
  return n.toFixed(decimals);
}
