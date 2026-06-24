// src/trading/engine.ts
// Core trading engine — position lifecycle with trailing stops, persistence, and full typing.

import { v4 as uuidv4 } from 'uuid';
import {
  Position, ClosedTrade, OrderRequest, OrderResult,
  PortfolioSnapshot, CloseReason
} from '../types/index';
import { getPrice, calcLiquidationPrice, calcFundingPnL } from '../market/engine';
import { saveState, loadState, clearState } from '../persistence/store';

// ── Constants ─────────────────────────────────────────────────────
export const INITIAL_BALANCE    = 10_000;
export const FEE_RATE           = 0.001;
export const MAX_POSITION_PCT   = 0.25;
export const DEFAULT_LEVERAGE   = 5;

// ── State ─────────────────────────────────────────────────────────
let balance         = INITIAL_BALANCE;
let positions: Position[]       = [];
let closedTrades: ClosedTrade[] = [];
let equityHistory: number[]     = [INITIAL_BALANCE];

// Restore persisted state on startup
(function restore() {
  const saved = loadState();
  if (!saved) return;
  balance       = saved.balance;
  positions     = saved.positions;
  closedTrades  = saved.closedTrades;
  equityHistory = saved.equityHistory;
})();

function persist(): void {
  saveState({ balance, positions, closedTrades, equityHistory });
}

// ── Place Order ───────────────────────────────────────────────────
export function placeOrder(req: OrderRequest): OrderResult {
  const { symbol, side, amountUSDT, stopLoss, takeProfit, trailingStopPct, source = 'ai' } = req;

  const price = getPrice(symbol);
  if (price <= 0) return { ok: false, error: 'Invalid market price' };

  const maxAllowed = balance * MAX_POSITION_PCT;
  if (amountUSDT > balance) return { ok: false, error: 'Insufficient balance' };

  const amount = Math.min(amountUSDT, maxAllowed);
  const fee    = amount * FEE_RATE;
  const qty    = amount / price;

  // Initialise trailing stop price from entry
  let trailingPrice: number | null = null;
  if (trailingStopPct && trailingStopPct > 0) {
    trailingPrice = side === 'buy'
      ? parseFloat((price * (1 - trailingStopPct / 100)).toFixed(6))
      : parseFloat((price * (1 + trailingStopPct / 100)).toFixed(6));
  }

  balance -= (amount + fee);
  balance  = parseFloat(balance.toFixed(4));

  const position: Position = {
    id:               uuidv4(),
    symbol,
    name:             symbol.replace('-PERP', '/USDT'),
    side,
    price,
    amountUSDT:       amount,
    qty,
    fee,
    stopLoss:         stopLoss ?? null,
    takeProfit:       takeProfit ?? null,
    trailingStopPct:  trailingStopPct ?? null,
    trailingStopPrice: trailingPrice,
    source,
    timestamp:        Date.now(),
    timeStr:          new Date().toLocaleTimeString(),
    status:           'open',
  };

  positions.push(position);
  persist();
  return { ok: true, position };
}

// ── Close Position ────────────────────────────────────────────────
export function closePosition(id: string, reason: CloseReason = 'manual'): ClosedTrade | null {
  const idx = positions.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const pos        = positions[idx];
  const exitPrice  = getPrice(pos.symbol);
  const exitValue  = pos.qty * exitPrice;
  const rawPnl     = pos.side === 'buy' ? exitValue - pos.amountUSDT : pos.amountUSDT - exitValue;
  const fundingPnl = calcFundingPnL(pos);
  const exitFee    = exitValue * FEE_RATE;
  const netPnl     = parseFloat((rawPnl + fundingPnl - exitFee).toFixed(4));

  balance += pos.amountUSDT + netPnl;
  balance  = parseFloat(balance.toFixed(4));

  const closed: ClosedTrade = {
    ...pos,
    exitPrice,
    exitValue,
    pnl:           netPnl,
    exitTimestamp: Date.now(),
    exitTimeStr:   new Date().toLocaleTimeString(),
    exitReason:    reason,
    durationMs:    Date.now() - pos.timestamp,
    status:        'closed',
  };

  closedTrades.push(closed);
  positions.splice(idx, 1);
  equityHistory.push(parseFloat(getPortfolioValue().toFixed(2)));
  if (equityHistory.length > 500) equityHistory.shift();

  persist();
  return closed;
}

// ── Trailing stop ratchet — called on every market tick ──────────
function updateTrailingStops(): void {
  for (const pos of positions) {
    if (!pos.trailingStopPct || !pos.trailingStopPrice) continue;
    const curr = getPrice(pos.symbol);
    const pct  = pos.trailingStopPct / 100;

    if (pos.side === 'buy') {
      const newStop = parseFloat((curr * (1 - pct)).toFixed(6));
      if (newStop > pos.trailingStopPrice) pos.trailingStopPrice = newStop;
    } else {
      const newStop = parseFloat((curr * (1 + pct)).toFixed(6));
      if (newStop < pos.trailingStopPrice) pos.trailingStopPrice = newStop;
    }
  }
}

// ── Auto SL/TP/Trailing/Liquidation check ─────────────────────────
export function checkStops(): Array<{ trade: ClosedTrade; reason: CloseReason }> {
  updateTrailingStops();
  const results: Array<{ trade: ClosedTrade; reason: CloseReason }> = [];

  for (const pos of [...positions]) {
    const curr = getPrice(pos.symbol);

    // Liquidation
    const liqPrice = calcLiquidationPrice(pos, DEFAULT_LEVERAGE);
    if ((pos.side === 'buy' && curr <= liqPrice) ||
        (pos.side === 'sell' && curr >= liqPrice)) {
      const closed = closePosition(pos.id, 'liquidation');
      if (closed) results.push({ trade: closed, reason: 'liquidation' });
      continue;
    }

    // Trailing stop
    if (pos.trailingStopPrice) {
      if ((pos.side === 'buy'  && curr <= pos.trailingStopPrice) ||
          (pos.side === 'sell' && curr >= pos.trailingStopPrice)) {
        const closed = closePosition(pos.id, 'trailing_stop');
        if (closed) results.push({ trade: closed, reason: 'trailing_stop' });
        continue;
      }
    }

    // Fixed stop loss
    if (pos.stopLoss) {
      if ((pos.side === 'buy'  && curr <= pos.stopLoss) ||
          (pos.side === 'sell' && curr >= pos.stopLoss)) {
        const closed = closePosition(pos.id, 'stop_loss');
        if (closed) results.push({ trade: closed, reason: 'stop_loss' });
        continue;
      }
    }

    // Take profit
    if (pos.takeProfit) {
      if ((pos.side === 'buy'  && curr >= pos.takeProfit) ||
          (pos.side === 'sell' && curr <= pos.takeProfit)) {
        const closed = closePosition(pos.id, 'take_profit');
        if (closed) results.push({ trade: closed, reason: 'take_profit' });
      }
    }
  }

  return results;
}

// ── Stats ─────────────────────────────────────────────────────────
export function getPortfolioValue(): number {
  let posValue = 0;
  for (const pos of positions) {
    const curr    = getPrice(pos.symbol);
    const currVal = pos.qty * curr;
    const pnl     = pos.side === 'buy' ? currVal - pos.amountUSDT : pos.amountUSDT - currVal;
    posValue     += pos.amountUSDT + pnl;
  }
  return balance + posValue;
}

export function getUnrealizedPnL(): number {
  return parseFloat(
    positions.reduce((total, pos) => {
      const curr    = getPrice(pos.symbol);
      const currVal = pos.qty * curr;
      return total + (pos.side === 'buy' ? currVal - pos.amountUSDT : pos.amountUSDT - currVal);
    }, 0).toFixed(4)
  );
}

export function getPositionPnL(pos: Position): number {
  const curr    = getPrice(pos.symbol);
  const currVal = pos.qty * curr;
  const raw     = pos.side === 'buy' ? currVal - pos.amountUSDT : pos.amountUSDT - currVal;
  const funding = calcFundingPnL(pos);
  return parseFloat((raw + funding - currVal * FEE_RATE).toFixed(4));
}

export function getTotalPnL(): number {
  return parseFloat((getPortfolioValue() - INITIAL_BALANCE).toFixed(4));
}

export function getWinRate(): number | null {
  if (closedTrades.length === 0) return null;
  const wins = closedTrades.filter(t => t.pnl > 0).length;
  return parseFloat(((wins / closedTrades.length) * 100).toFixed(1));
}

export function getSnapshot(): PortfolioSnapshot {
  return {
    balance,
    portfolioValue:  getPortfolioValue(),
    unrealizedPnL:   getUnrealizedPnL(),
    totalPnL:        getTotalPnL(),
    winRate:         getWinRate(),
    openPositions:   positions.length,
    closedTrades:    closedTrades.length,
    timestamp:       Date.now(),
  };
}

// ── Reset & Getters ───────────────────────────────────────────────
export function reset(): void {
  balance       = INITIAL_BALANCE;
  positions     = [];
  closedTrades  = [];
  equityHistory = [INITIAL_BALANCE];
  clearState();
}

export function getBalance():       number          { return balance; }
export function getPositions():     Position[]      { return positions; }
export function getClosedTrades():  ClosedTrade[]   { return closedTrades; }
export function getEquityHistory(): number[]        { return equityHistory; }
