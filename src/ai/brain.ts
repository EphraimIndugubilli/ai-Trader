// src/ai/brain.ts
// AI trading brain — uses Vercel AI SDK with OpenRouter as the provider.
// Every call is traced via Langfuse for full observability.
// Hallucination detection runs on every response before execution.

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  AIDecision, AIThinkStep, IndicatorResult, AIAction
} from '../types/index';
import { getAllPairs, getPrice, getMarketSummaryForAI } from '../market/engine';
import { compute } from '../indicators/compute';
import {
  startCycleTrace, closeTrace, logSpan, logGeneration,
  recordError, detectHallucination
} from '../monitoring/langfuse';
import {
  placeOrder, closePosition, getBalance, getPositions,
  getSnapshot, getPositionPnL
} from '../trading/engine';

// ── OpenRouter via Vercel AI SDK ──────────────────────────────────
// OpenRouter gives access to claude-3-5-sonnet, GPT-4o, Llama, Mixtral etc.
// Switch model string to change the underlying LLM — no code change needed.
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env.OPENROUTER_API_KEY || 'demo-key',
  headers: {
    'HTTP-Referer': 'https://github.com/EphraimIndugubilli/pear-trader',
    'X-Title':      'Pear Protocol Paper Trader',
  },
});

// Model to use — configurable via env var
const MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4-6';

// ── Think step emitter (SSE to frontend) ─────────────────────────
type ThinkEmitter = (step: AIThinkStep) => void;
let globalEmitter: ThinkEmitter | null = null;
export function setThinkEmitter(fn: ThinkEmitter): void { globalEmitter = fn; }

function emit(text: string, type: AIThinkStep['type'] = 'data'): void {
  const step: AIThinkStep = { type, text, timestamp: Date.now() };
  globalEmitter?.(step);
}

// ── Main AI think cycle ───────────────────────────────────────────
let cycleCount = 0;

export async function runCycle(): Promise<void> {
  cycleCount++;
  emit(`── Cycle #${cycleCount} — ${new Date().toLocaleTimeString()} ──`, 'step');
  emit('Scanning all Hyperliquid perp markets…', 'step');

  // 1. Compute indicators for all pairs
  const analyses: IndicatorResult[] = [];
  for (const pair of getAllPairs()) {
    const analysis = compute(pair.symbol);
    if (analysis) {
      analyses.push(analysis);
      emit(
        `${pair.symbol}: RSI=${analysis.rsi?.toFixed(1)} | ` +
        `MACD=${analysis.macd ? (analysis.macd.histogram > 0 ? 'BULL' : 'BEAR') : 'N/A'} | ` +
        `Score=${analysis.score > 0 ? '+' : ''}${analysis.score.toFixed(0)} | ` +
        `Signal=${analysis.action}`,
        'data'
      );
    }
  }

  // 2. Pick best opportunity
  const best = selectBestOpportunity(analyses);
  if (best) {
    emit(`Best opportunity: ${best.symbol} | Action=${best.action} | Confidence=${best.confidence}%`, 'signal');
    emit(`Reasons: ${best.reasons.slice(0, 3).join(' · ')}`, 'data');
  }

  // 3. Check if existing positions need review
  const positions = getPositions();
  if (positions.length > 0) {
    emit(`Reviewing ${positions.length} open position(s)…`, 'step');
    for (const pos of positions) {
      const pnl = getPositionPnL(pos);
      const pct = ((pnl / pos.amountUSDT) * 100).toFixed(2);
      emit(`  ${pos.name} ${pos.side.toUpperCase()} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pct}%)`, 'data');
    }
  }

  // 4. Start Langfuse trace
  const snapshot  = getSnapshot();
  const traceData = {
    cycle: cycleCount, balance: snapshot.balance,
    portfolioValue: snapshot.portfolioValue,
    totalPnL: snapshot.totalPnL,
    openPositions: snapshot.openPositions,
    bestSymbol: best?.symbol, bestAction: best?.action,
    bestScore: best?.score,
  };
  const trace = startCycleTrace(cycleCount, traceData);

  // 5. Call AI via Vercel AI SDK + OpenRouter
  emit('Calling AI model via OpenRouter…', 'step');
  const prompt = buildPrompt(analyses, best, snapshot);

  try {
    logSpan({
      traceId: trace.traceId,
      name:    'prompt_build',
      output:  { promptLength: prompt.length },
    });

    const startTime = Date.now();
    const result = await generateText({
      model:       openrouter(MODEL),
      system:      SYSTEM_PROMPT,
      prompt,
      maxTokens:   1000,
      temperature: 0.3,
    });

    const duration = Date.now() - startTime;
    const responseText = result.text;
    emit(`AI response received in ${duration}ms`, 'data');

    // Log generation to Langfuse
    logGeneration({
      traceId:    trace.traceId,
      model:      MODEL,
      prompt,
      completion: responseText,
      tokens: {
        prompt:     result.usage?.promptTokens     ?? 0,
        completion: result.usage?.completionTokens ?? 0,
        total:      result.usage?.totalTokens      ?? 0,
      },
    });

    // 6. Stream reasoning to UI
    const lines = responseText.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const type = classifyLine(line);
      emit(line, type);
    }

    // 7. Extract & validate decision
    const rawDecision = extractJSON(responseText);

    // Hallucination detection via Langfuse
    const hallucinationCheck = detectHallucination({
      traceId:       trace.traceId,
      raw:           responseText,
      decision:      rawDecision as Record<string, unknown> | null,
      validSymbols:  getAllPairs().map(p => p.symbol),
    });

    if (hallucinationCheck.hallucinated) {
      emit(`⚠ Hallucination detected: ${hallucinationCheck.reason}`, 'warn');
      recordError({
        traceId:      trace.traceId,
        stage:        'decision_validate',
        error:        hallucinationCheck.reason ?? 'Hallucination',
        raw:          responseText.slice(0, 400),
        recovered:    true,
        fallbackUsed: true,
      });
      executeFallback(best, trace.traceId);
      closeTrace(trace.traceId, { action: 'fallback', reason: hallucinationCheck.reason });
      return;
    }

    // 8. Execute decision
    await executeDecision(rawDecision as AIDecision, best, trace.traceId);
    closeTrace(trace.traceId, { action: rawDecision?.action ?? 'unknown' });

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit(`API error: ${errMsg}`, 'warn');

    recordError({
      traceId:      trace.traceId,
      stage:        'api_call',
      error:        errMsg,
      recovered:    true,
      fallbackUsed: true,
    });

    emit('Falling back to indicator-only signals…', 'warn');
    executeFallback(best, trace.traceId);
    closeTrace(trace.traceId, { action: 'fallback_api_error', error: errMsg });
  }
}

// ── Execute AI decision ───────────────────────────────────────────
async function executeDecision(
  decision: AIDecision | null,
  best: IndicatorResult | undefined,
  traceId: string
): Promise<void> {
  if (!decision) {
    emit('Could not parse AI decision — holding.', 'warn');
    return;
  }

  const { action, symbol, amount, stopLoss, takeProfit } = decision;
  const positions = getPositions();

  if (action === 'CLOSE_ALL') {
    emit('EXECUTING: Close all positions', 'exec');
    for (const pos of [...positions]) {
      const closed = closePosition(pos.id, 'ai_decision');
      if (closed) {
        emit(
          `CLOSED ${closed.name} — P&L: ${closed.pnl >= 0 ? '+' : ''}$${closed.pnl.toFixed(2)}`,
          closed.pnl >= 0 ? 'profit' : 'loss'
        );
      }
    }
    return;
  }

  if (action === 'CLOSE' && symbol) {
    const pos = positions.find(p => p.symbol === symbol);
    if (pos) {
      const closed = closePosition(pos.id, 'ai_decision');
      if (closed) {
        emit(
          `EXECUTED CLOSE ${closed.name} — P&L: ${closed.pnl >= 0 ? '+' : ''}$${closed.pnl.toFixed(2)}`,
          closed.pnl >= 0 ? 'profit' : 'loss'
        );
        logSpan({ traceId, name: 'order_execute', output: { action: 'CLOSE', pnl: closed.pnl } });
      }
    }
    return;
  }

  if ((action === 'BUY' || action === 'SELL') && symbol && amount && amount > 0) {
    const alreadyHolding = positions.some(p => p.symbol === symbol);
    if (alreadyHolding) {
      emit(`Already holding ${symbol} — skipping duplicate entry.`, 'warn');
      return;
    }

    // ATR-based sizing: risk 1% of portfolio value per trade
    const atrSized = calcAtrPositionSize(symbol, decision, getSnapshot().portfolioValue);
    const finalAmount = Math.min(amount, atrSized ?? amount);

    const result = placeOrder({
      symbol, side: action.toLowerCase() as 'buy' | 'sell',
      amountUSDT: finalAmount, stopLoss, takeProfit,
      trailingStopPct: 2.5,
      source: 'ai',
    });

    if (result.ok && result.position) {
      emit(
        `EXECUTED: ${action} ${symbol} $${amount.toFixed(2)} @ $${result.position.price} | ` +
        `SL: ${stopLoss?.toFixed(2) ?? '—'} | TP: ${takeProfit?.toFixed(2) ?? '—'}`,
        'exec'
      );
      logSpan({
        traceId, name: 'order_execute',
        output: { action, symbol, amount, price: result.position.price },
      });
    } else {
      emit(`Order failed: ${result.error}`, 'warn');
      recordError({
        traceId, stage: 'order_execute',
        error: result.error ?? 'Unknown order error',
        recovered: false, fallbackUsed: false,
      });
    }
    return;
  }

  if (action === 'HOLD') {
    emit('Signal: HOLD — no trade executed this cycle.', 'warn');
  }
}

// ── Fallback (pure indicator signal) ─────────────────────────────
function executeFallback(best: IndicatorResult | undefined, traceId: string): void {
  if (!best || best.action === 'HOLD') {
    emit('[Fallback] HOLD — indicators inconclusive', 'warn');
    return;
  }
  const balance = getBalance();
  const amount  = parseFloat((balance * 0.15).toFixed(2));
  if (amount < 10) { emit('[Fallback] Balance too low', 'warn'); return; }

  const alreadyHolding = getPositions().some(p => p.symbol === best.symbol);
  if (alreadyHolding) { emit(`[Fallback] Already holding ${best.symbol}`, 'warn'); return; }

  best.reasons.forEach(r => emit(`  → ${r}`, 'data'));
  emit(`[Fallback] ${best.action} ${best.symbol} $${amount.toFixed(2)}`, 'exec');

  const result = placeOrder({
    symbol: best.symbol,
    side:   best.action.toLowerCase() as 'buy' | 'sell',
    amountUSDT: amount,
    stopLoss:   best.stopLoss ?? undefined,
    takeProfit: best.target   ?? undefined,
    trailingStopPct: 2.5,
    source: 'ai',
  });

  if (result.ok) {
    logSpan({ traceId, name: 'fallback_execute', output: { symbol: best.symbol, amount } });
  }
}

// ── ATR-based position sizing (1% portfolio risk per trade) ──────
function calcAtrPositionSize(
  symbol: string,
  decision: AIDecision,
  portfolioValue: number
): number | null {
  const analysis = compute(symbol);
  if (!analysis?.atr || !decision.stopLoss) return null;
  const price    = analysis.current;
  const riskPerUnit = Math.abs(price - decision.stopLoss);
  if (riskPerUnit <= 0) return null;
  const riskBudget  = portfolioValue * 0.01; // risk 1% of portfolio
  const qty         = riskBudget / riskPerUnit;
  return parseFloat((qty * price).toFixed(2));
}

// ── Best opportunity selector ─────────────────────────────────────
function selectBestOpportunity(analyses: IndicatorResult[]): IndicatorResult | undefined {
  const positions = getPositions();
  return analyses
    .filter(a => a.action !== 'HOLD')
    .sort((a, b) => Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence)
    .find(a => !positions.some(p => p.symbol === a.symbol));
}

// ── JSON extractor ────────────────────────────────────────────────
function extractJSON(text: string): AIDecision | null {
  try {
    const block = text.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ?? text.match(/\{[\s\S]*"action"[\s\S]*\}/)?.[0];
    if (!block) return null;
    return JSON.parse(block) as AIDecision;
  } catch {
    return null;
  }
}

// ── Line classifier ───────────────────────────────────────────────
function classifyLine(line: string): AIThinkStep['type'] {
  const l = line.toLowerCase();
  if (l.includes('executed') || l.includes('order placed')) return 'exec';
  if (l.includes('buy') && l.includes('signal'))            return 'signal';
  if (l.includes('sell') && l.includes('signal'))           return 'signal';
  if (l.includes('hold') || l.includes('warning'))          return 'warn';
  if (l.includes('step') || l.includes('phase') || l.includes('──')) return 'step';
  if (l.includes('profit'))                                  return 'profit';
  if (l.includes('loss'))                                    return 'loss';
  return 'data';
}

// ── System prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert crypto trading AI specializing in Hyperliquid perpetuals.
You analyze technical indicators and perp-specific metrics (funding rates, OI, mark/index spread).
You think step-by-step, are disciplined about risk management, and always output a JSON decision.
Rules: max 25% balance per trade, always set stopLoss, never trade hallucinated symbols.
Position sizing is ATR-based (1% portfolio risk per trade). Trailing stops are auto-applied at 2.5%.
Review open positions for trailing-stop efficiency and take-profit targets before entering new trades.`;

// ── Prompt builder ────────────────────────────────────────────────
function buildPrompt(
  analyses: IndicatorResult[],
  best: IndicatorResult | undefined,
  snapshot: ReturnType<typeof getSnapshot>
): string {
  const positions = getPositions();
  const posStr = positions.length === 0
    ? 'None'
    : positions.map(p => {
        const pnl = getPositionPnL(p);
        return `${p.name} ${p.side.toUpperCase()} @ ${p.price} | cost=$${p.amountUSDT.toFixed(2)} | unrealizedPnL=${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | SL=${p.stopLoss ?? '—'} | TP=${p.takeProfit ?? '—'}`;
      }).join('\n');

  const mktStr = analyses.map(a =>
    `${a.symbol}: price=${a.current} | RSI=${a.rsi?.toFixed(1)} | ` +
    `MACD=${a.macd ? (a.macd.histogram > 0 ? 'bullish' : 'bearish') : 'N/A'} | ` +
    `EMA9=${a.ema9?.toFixed(2)} vs EMA21=${a.ema21?.toFixed(2)} | ` +
    `BB=[${a.bb?.lower?.toFixed(2)}, ${a.bb?.upper?.toFixed(2)}] | ` +
    `ATR=${a.atr?.toFixed(5)} | Score=${a.score > 0 ? '+' : ''}${a.score.toFixed(0)} | Vol=${a.volSig}`
  ).join('\n');

  const perpStr = getMarketSummaryForAI();

  return `PORTFOLIO: balance=$${snapshot.balance.toFixed(2)} | value=$${snapshot.portfolioValue.toFixed(2)} | P&L=${snapshot.totalPnL >= 0 ? '+' : ''}$${snapshot.totalPnL.toFixed(2)} | winRate=${snapshot.winRate ?? 'N/A'}%

OPEN POSITIONS:
${posStr}

TECHNICAL INDICATORS:
${mktStr}

HYPERLIQUID PERP DATA:
${perpStr}

BEST SIGNAL: ${best?.symbol ?? 'none'} | ${best?.action ?? 'HOLD'} | confidence=${best?.confidence ?? 0}% | reasons: ${best?.reasons?.slice(0, 3).join(', ') ?? 'none'}

Analyze the situation in 3-5 lines, check open positions for exit signals, then output your decision as:

\`\`\`json
{
  "action": "BUY" | "SELL" | "HOLD" | "CLOSE" | "CLOSE_ALL",
  "symbol": "BTC-PERP",
  "amount": 500,
  "stopLoss": 67000,
  "takeProfit": 68500,
  "reasoning": "one sentence"
}
\`\`\`

Max trade size: $${(snapshot.balance * 0.25).toFixed(2)}. Always set stopLoss.`;
}
