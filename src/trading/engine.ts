// src/trading/engine.ts
// Core trading engine with full TypeScript types.
// Position lifecycle: open → monitor SL/TP → close → log.

import { v4 as uuidv4 } from 'uuid';
import {
  Position, ClosedTrade, OrderRequest, OrderResult,
  PortfolioSnapshot, CloseReason
} from '../types/index';
import { getPrice, calcLiquidationPrice, calcFundingPnL } from '../market/engine';

// ── Constants ─────────────────────────────────────────────────────
export const INITIAL_BALANCE    = 10_000;
export const FEE_RATE           = 0.001;   // 0.1% maker fee (Hyperliquid rate)
export const MAX_POSITION_PCT   = 0.25;    // max 25% of balance per trade
export const DEFAULT_LEVERAGE   = 5;       // 5x leverage (Hyperliquid default)

// ── State ─────────────────────────────────────────────────────────
let balance         = INITIAL_BALANCE;
let positions: Position[]      = [];
let closedTrades: ClosedTrade[] = [];
let equityHistory: number[]    = [INITIAL_BALANCE];

// ── Place Order ───────────────────────────────────────────────────
export function placeOrder(req: OrderRequest): OrderResult {
  const { symbol, side, amountUSDT, stopLoss, takeProfit, source = 'ai' } = req;

  const price = getPrice(symbol);
  if (price <= 0) return { ok: false, error: 'Invalid market price' };

  const maxAllowed = balance * MAX_POSITION_PCT;
  if (amountUSDT > balance) return { ok: false, error: 'Insufficient balance' };

  const amount = Math.min(amountUSDT, maxAllowed);
  const fee    = amount * FEE_RATE;
  const qty    = amount / price;

  balance -= (amount + fee);
  balance  = parseFloat(balance.toFixed(4));

  const position: Position = {
    id:          uuidv4(),
    symbol,
    name:        symbol.replace('-PERP', '/USDT'),
    side,
    price,
    amountUSDT:  amount,
    qty,
    fee,
    stopLoss:    stopLoss ?? null,
    takeProfit:  takeProfit ?? null,
    source,
    timestamp:   Date.now(),
    timeStr:     new Date().toLocaleTimeString(),
    status:      'open',
  };

  positions.push(position);
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

  return closed;
}

// ── Auto SL/TP check ──────────────────────────────────────────────
export function checkStops(): Array<{ trade: ClosedTrade; reason: CloseReason }> {
  const results: Array<{ trade: ClosedTrade; reason: CloseReason }> = [];

  for (const pos of [...positions]) {
    const curr = getPrice(pos.symbol);

    // Liquidation check
    const liqPrice = calcLiquidationPrice(pos, DEFAULT_LEVERAGE);
    if ((pos.side === 'buy' && curr <= liqPrice) ||
        (pos.side === 'sell' && curr >= liqPrice)) {
      const closed = closePosition(pos.id, 'liquidation');
      if (closed) results.push({ trade: closed, reason: 'liquidation' });
      continue;
    }

    if (pos.stopLoss) {
      if ((pos.side === 'buy'  && curr <= pos.stopLoss) ||
          (pos.side === 'sell' && curr >= pos.stopLoss)) {
        const closed = closePosition(pos.id, 'stop_loss');
        if (closed) results.push({ trade: closed, reason: 'stop_loss' });
        continue;
      }
    }

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
    const curr     = getPrice(pos.symbol);
    const currVal  = pos.qty * curr;
    const pnl      = pos.side === 'buy' ? currVal - pos.amountUSDT : pos.amountUSDT - currVal;
    posValue      += pos.amountUSDT + pnl;
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
}

export function getBalance():       number          { return balance; }
export function getPositions():     Position[]      { return positions; }
export function getClosedTrades():  ClosedTrade[]   { return closedTrades; }
export function getEquityHistory(): number[]        { return equityHistory; }
