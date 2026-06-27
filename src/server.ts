// src/server.ts
// Express backend: serves the dashboard, REST API, and Server-Sent Events
// for real-time AI think-stream and market data.

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';

import * as Market from './market/engine';
import { compute } from './indicators/compute';
import * as Trading from './trading/engine';
import { runCycle, setThinkEmitter } from './ai/brain';
import {
  localTraces, localErrors, localSpans,
  generateTriageReport
} from './monitoring/langfuse';
import {
  AIThinkStep, APIResponse, MarketDataResponse
} from './types/index';

const REQUIRED_ENV = ['OPENROUTER_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.warn(`[warn] Missing env vars: ${missing.join(', ')} — AI trading will use fallback mode`);
}




const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── SSE clients ────────────────────────────────────────────────────
type SSEClient = { id: string; res: Response };
const sseClients: SSEClient[] = [];

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { /* client disconnected */ }
  }
}

// Wire AI think steps to SSE
setThinkEmitter((step: AIThinkStep) => broadcast('think', step));

// ── SSE endpoint ───────────────────────────────────────────────────
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const clientId = `client-${Date.now()}`;
  sseClients.push({ id: clientId, res });
  res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);

  req.on('close', () => {
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// ── Market data ────────────────────────────────────────────────────
app.get('/api/market', (_req: Request, res: Response) => {
  const pairs = Market.getAllPairs().map(pair => {
    const s    = Market.getState(pair.symbol);
    const perp = Market.getPerpInfo(pair.symbol);
    return {
      symbol:   pair.symbol,
      name:     pair.name,
      price:    s?.price ?? 0,
      prevPrice: s?.prevPrice ?? 0,
      change24h: Market.getPriceChange(pair.symbol),
      perpInfo: perp ?? {},
    };
  });
  const resp: APIResponse<MarketDataResponse> = { ok: true, data: { pairs } };
  res.json(resp);
});

app.get('/api/market/:symbol/indicators', (req: Request, res: Response) => {
  const result = compute(req.params.symbol);
  res.json({ ok: !!result, data: result });
});

app.get('/api/market/:symbol/prices', (req: Request, res: Response) => {
  res.json({ ok: true, data: Market.getPrices(req.params.symbol) });
});

// ── Portfolio ──────────────────────────────────────────────────────
app.get('/api/portfolio', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      snapshot:    Trading.getSnapshot(),
      positions:   Trading.getPositions(),
      closedTrades: Trading.getClosedTrades().slice(-20),
      equityHistory: Trading.getEquityHistory().slice(-100),
    },
  });
});

// ── Manual order ───────────────────────────────────────────────────
app.post('/api/order', (req: Request, res: Response) => {
  const { symbol, side, amountUSDT, stopLoss, takeProfit } = req.body as {
    symbol: string; side: 'buy' | 'sell';
    amountUSDT: number; stopLoss?: number; takeProfit?: number;
  };

  if (!symbol || !side || !amountUSDT) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  const result = Trading.placeOrder({ symbol, side, amountUSDT, stopLoss, takeProfit, source: 'manual' });
  res.json(result);
});

app.post('/api/order/:id/close', (req: Request, res: Response) => {
  const closed = Trading.closePosition(req.params.id, 'manual');
  if (!closed) return res.status(404).json({ ok: false, error: 'Position not found' });
  res.json({ ok: true, data: closed });
});

app.post('/api/reset', (_req: Request, res: Response) => {
  Trading.reset();
  res.json({ ok: true });
});

// ── Trading stats ─────────────────────────────────────────────────
app.get('/api/stats', (_req: Request, res: Response) => {
  const closed = Trading.getClosedTrades();
  const snapshot = Trading.getSnapshot();
  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl <= 0);
  const totalPnL = closed.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const best = closed.length ? closed.reduce((a, b) => (a.pnl > b.pnl ? a : b)) : null;
  const worst = closed.length ? closed.reduce((a, b) => (a.pnl < b.pnl ? a : b)) : null;
  const equity = Trading.getEquityHistory();
  let peak = equity[0] ?? snapshot.balance;
  let maxDrawdown = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = (peak - e) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio from equity curve returns (annualised, risk-free rate = 0)
  let sharpeRatio: string = 'N/A';
  if (equity.length > 2) {
    const returns = equity.slice(1).map((v, i) => (v - equity[i]) / equity[i]);
    const meanR = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (meanR / stdDev * Math.sqrt(252)).toFixed(2) : 'N/A';
  }

  // Average trade duration
  const avgDurationMs = closed.length
    ? closed.reduce((s, t) => s + t.durationMs, 0) / closed.length
    : 0;
  const avgDurationMin = (avgDurationMs / 60_000).toFixed(1);

  res.json({
    ok: true,
    data: {
      totalTrades: closed.length,
      winRate: closed.length ? ((wins.length / closed.length) * 100).toFixed(1) + '%' : 'N/A',
      totalPnL: totalPnL.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : 'N/A',
      maxDrawdownPct: (maxDrawdown * 100).toFixed(2) + '%',
      sharpeRatio,
      avgTradeDurationMin: avgDurationMin,
      bestTrade: best ? { symbol: best.symbol, pnl: best.pnl.toFixed(2) } : null,
      worstTrade: worst ? { symbol: worst.symbol, pnl: worst.pnl.toFixed(2) } : null,
      openPositions: snapshot.openPositions,
      balance: snapshot.balance,
    },
  });
});

// ── Per-symbol performance breakdown ─────────────────────────────
app.get('/api/stats/symbols', (_req: Request, res: Response) => {
  const closed = Trading.getClosedTrades();
  const bySymbol: Record<string, { trades: number; wins: number; pnl: number; avgDurationMs: number }> = {};

  for (const t of closed) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, wins: 0, pnl: 0, avgDurationMs: 0 };
    const s = bySymbol[t.symbol];
    s.trades++;
    s.pnl += t.pnl;
    s.avgDurationMs += t.durationMs;
    if (t.pnl > 0) s.wins++;
  }

  const rows = Object.entries(bySymbol).map(([symbol, s]) => ({
    symbol,
    trades: s.trades,
    winRate: ((s.wins / s.trades) * 100).toFixed(1) + '%',
    totalPnL: s.pnl.toFixed(2),
    avgPnL: (s.pnl / s.trades).toFixed(2),
    avgDurationMin: (s.avgDurationMs / s.trades / 60_000).toFixed(1),
  })).sort((a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL));

  res.json({ ok: true, data: rows });
});

// ── Langfuse / Observability ───────────────────────────────────────
app.get('/api/monitoring/traces', (_req: Request, res: Response) => {
  res.json({ ok: true, data: localTraces.slice(0, 20) });
});

app.get('/api/monitoring/errors', (_req: Request, res: Response) => {
  res.json({ ok: true, data: localErrors.slice(0, 50) });
});

app.get('/api/monitoring/spans', (_req: Request, res: Response) => {
  res.json({ ok: true, data: localSpans.slice(0, 50) });
});

app.get('/api/monitoring/report', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(generateTriageReport());
});

// ── AI control ────────────────────────────────────────────────────
let aiInterval: ReturnType<typeof setInterval> | null = null;
let aiRunning = false;
const CYCLE_MS = 15_000;

app.post('/api/ai/start', (_req: Request, res: Response) => {
  if (aiRunning) return res.json({ ok: true, message: 'Already running' });
  aiRunning = true;
  runCycle();
  aiInterval = setInterval(() => { if (aiRunning) runCycle(); }, CYCLE_MS);
  broadcast('ai_status', { running: true });
  res.json({ ok: true, message: 'AI started' });
});

app.post('/api/ai/stop', (_req: Request, res: Response) => {
  aiRunning = false;
  if (aiInterval) { clearInterval(aiInterval); aiInterval = null; }
  broadcast('ai_status', { running: false });
  res.json({ ok: true, message: 'AI stopped' });
});

app.get('/api/ai/status', (_req: Request, res: Response) => {
  res.json({ ok: true, data: { running: aiRunning, model: process.env.AI_MODEL || 'anthropic/claude-sonnet-4-6' } });
});

// ── Health check ──────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  const snapshot = Trading.getSnapshot();
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    aiRunning,
    pairs: Market.getAllPairs().length,
    openPositions: snapshot.openPositions,
    balance: snapshot.balance,
    totalPnL: snapshot.totalPnL,
    timestamp: new Date().toISOString(),
  });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// ── Market tick loop ──────────────────────────────────────────────
Market.init();

setInterval(() => {
  Market.tick();
  const stops = Trading.checkStops();
  for (const { trade, reason } of stops) {
    broadcast('stop_hit', { trade, reason });
  }
  broadcast('tick', {
    prices: Market.getAllPairs().reduce<Record<string, number>>((acc, p) => {
      acc[p.symbol] = Market.getPrice(p.symbol);
      return acc;
    }, {}),
    snapshot: Trading.getSnapshot(),
  });
}, 2_000);

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n⚡ Pear Trader running at http://localhost:${PORT}`);
  console.log(`   Model:    ${process.env.AI_MODEL || 'anthropic/claude-sonnet-4-6'} via OpenRouter`);
  console.log(`   Langfuse: ${process.env.LANGFUSE_HOST || 'cloud.langfuse.com'}`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   Triage:   http://localhost:${PORT}/api/monitoring/report\n`);
});

// ── Graceful shutdown ─────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`\n[${signal}] Shutting down gracefully…`);
  if (aiInterval) clearInterval(aiInterval);
  for (const client of sseClients) {
    try { client.res.end(); } catch { /* ignore */ }
  }
  server.close(() => {
    console.log('Server closed. Goodbye.\n');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
