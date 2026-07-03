// Runtime risk guards — checked before placing any order

export interface RiskConfig {
  maxDailyLossUSDT:  number;   // e.g. 200
  maxOpenPositions:  number;   // e.g. 5
  minTimeBetweenMs:  number;   // e.g. 30_000 (30s cooldown)
  maxSingleTradeUSDT: number;  // e.g. 2500
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxDailyLossUSDT:   500,
  maxOpenPositions:   5,
  minTimeBetweenMs:   15_000,
  maxSingleTradeUSDT: 2_500,
};

interface RiskState {
  dailyLoss:       number;
  lastTradeMs:     number;
  openPositionCount: number;
  resetDayKey:     string;
}

let state: RiskState = {
  dailyLoss: 0, lastTradeMs: 0, openPositionCount: 0,
  resetDayKey: '',
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RiskCheckResult { allowed: boolean; reason?: string }

export function checkRiskLimits(
  amountUSDT: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskCheckResult {
  const today = todayKey();
  if (state.resetDayKey !== today) {
    state.dailyLoss = 0;
    state.resetDayKey = today;
  }
  if (state.dailyLoss >= config.maxDailyLossUSDT)
    return { allowed: false, reason: 'Daily loss limit reached' };
  if (state.openPositionCount >= config.maxOpenPositions)
    return { allowed: false, reason: 'Max open positions reached' };
  if (Date.now() - state.lastTradeMs < config.minTimeBetweenMs)
    return { allowed: false, reason: 'Cooldown period active' };
  if (amountUSDT > config.maxSingleTradeUSDT)
    return { allowed: false, reason: 'Single trade size exceeds limit' };
  return { allowed: true };
}

export function recordTrade(pnl: number): void {
  state.lastTradeMs = Date.now();
  if (pnl < 0) state.dailyLoss += Math.abs(pnl);
  state.openPositionCount++;
}

export function recordClose(pnl: number): void {
  state.openPositionCount = Math.max(0, state.openPositionCount - 1);
  if (pnl < 0) state.dailyLoss += Math.abs(pnl);
}

export function getRiskState(): Readonly<RiskState> { return state; }
