// src/monitoring/langfuse.ts
// Langfuse observability layer — traces AI pipeline execution,
// catches hallucinations, logs errors, and generates daily triage reports.
// Mirrors exactly what Pear Protocol uses in production.

import { Langfuse } from 'langfuse';
import {
  PipelineTrace, SpanEvent, PipelineError,
  AIAction, TraceMetadata
} from '../types/index';

// ── Langfuse client (uses env vars in production) ─────────────────
// LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
const langfuse = new Langfuse({
  publicKey:  process.env.LANGFUSE_PUBLIC_KEY  || 'pk-lf-demo',
  secretKey:  process.env.LANGFUSE_SECRET_KEY  || 'sk-lf-demo',
  baseUrl:    process.env.LANGFUSE_HOST        || 'https://cloud.langfuse.com',
  flushAt: 1,      // flush immediately for real-time monitoring
  flushInterval: 0,
});

// ── In-memory log (shown in dashboard when Langfuse is not connected) ──
export const localTraces: PipelineTrace[]  = [];
export const localErrors: PipelineError[]  = [];
export const localSpans:  SpanEvent[]      = [];

let cycleCount   = 0;
let sessionId    = `session-${Date.now()}`;

// ── Start a new AI cycle trace ─────────────────────────────────────
export function startCycleTrace(
  cycle: number,
  input: Record<string, unknown>
): PipelineTrace {
  cycleCount = cycle;
  const traceId = `trace-cycle-${cycle}-${Date.now()}`;

  const trace: PipelineTrace = {
    traceId,
    sessionId,
    name: `ai_trading_cycle_${cycle}`,
    input,
    startTime: Date.now(),
    metadata: { cycleNumber: cycle },
  };

  // Push to Langfuse
  try {
    langfuse.trace({
      id:      traceId,
      name:    trace.name,
      input:   input,
      session: sessionId,
      metadata: { cycle, ...input },
    });
  } catch (_) { /* offline — local only */ }

  localTraces.unshift(trace);
  if (localTraces.length > 50) localTraces.pop();
  return trace;
}

// ── Log a span within a trace (individual pipeline stage) ──────────
export function logSpan(params: {
  traceId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  level?: SpanEvent['level'];
  metadata?: Record<string, unknown>;
}): SpanEvent {
  const span: SpanEvent = {
    traceId:   params.traceId,
    spanId:    `span-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name:      params.name,
    input:     params.input,
    output:    params.output,
    error:     params.error,
    startTime: Date.now(),
    endTime:   Date.now(),
    level:     params.level || (params.error ? 'ERROR' : 'DEFAULT'),
    metadata:  params.metadata,
  };

  try {
    langfuse.span({
      traceId:  span.traceId,
      id:       span.spanId,
      name:     span.name,
      input:    span.input as Record<string, unknown>,
      output:   span.output as Record<string, unknown>,
      level:    span.level,
      metadata: span.metadata,
    });
  } catch (_) {}

  localSpans.unshift(span);
  if (localSpans.length > 200) localSpans.pop();
  return span;
}

// ── Log a generation (LLM call) ────────────────────────────────────
export function logGeneration(params: {
  traceId:    string;
  model:      string;
  prompt:     string;
  completion: string;
  tokens?:    { prompt: number; completion: number; total: number };
  error?:     string;
  metadata?:  TraceMetadata;
}): void {
  try {
    langfuse.generation({
      traceId:         params.traceId,
      name:            'ai_trade_decision',
      model:           params.model,
      input:           [{ role: 'user', content: params.prompt }],
      output:          params.completion,
      usage:           params.tokens
        ? { input: params.tokens.prompt, output: params.tokens.completion, total: params.tokens.total }
        : undefined,
      metadata:        params.metadata,
      level:           params.error ? 'ERROR' : 'DEFAULT',
    });
  } catch (_) {}
}

// ── Record a pipeline error ────────────────────────────────────────
export function recordError(params: {
  traceId:     string;
  stage:       PipelineError['stage'];
  error:       string;
  raw?:        string;
  recovered:   boolean;
  fallbackUsed: boolean;
}): PipelineError {
  const entry: PipelineError = {
    ...params,
    timestamp: Date.now(),
  };

  logSpan({
    traceId:  params.traceId,
    name:     `error_${params.stage}`,
    error:    params.error,
    level:    'ERROR',
    metadata: {
      stage:       params.stage,
      raw:         params.raw?.slice(0, 500),
      recovered:   params.recovered,
      fallback:    params.fallbackUsed,
    },
  });

  localErrors.unshift(entry);
  if (localErrors.length > 100) localErrors.pop();
  return entry;
}

// ── Detect AI hallucination ────────────────────────────────────────
export function detectHallucination(params: {
  traceId:  string;
  raw:      string;
  decision: Record<string, unknown> | null;
  validSymbols: string[];
}): { hallucinated: boolean; reason?: string } {
  const { traceId, raw, decision, validSymbols } = params;

  if (!decision) {
    const result = { hallucinated: true, reason: 'No valid JSON decision extracted from response' };
    logSpan({
      traceId, name: 'hallucination_check',
      error: result.reason, level: 'WARNING',
      metadata: { raw: raw.slice(0, 300) },
    });
    return result;
  }

  const action = String(decision.action || '');
  const validActions: AIAction[] = ['BUY', 'SELL', 'HOLD', 'CLOSE', 'CLOSE_ALL'];
  if (!validActions.includes(action as AIAction)) {
    const result = { hallucinated: true, reason: `Invalid action: "${action}"` };
    logSpan({ traceId, name: 'hallucination_check', error: result.reason, level: 'WARNING' });
    return result;
  }

  if ((action === 'BUY' || action === 'SELL') && decision.symbol) {
    if (!validSymbols.includes(String(decision.symbol))) {
      const result = { hallucinated: true, reason: `Hallucinated symbol: "${decision.symbol}"` };
      logSpan({ traceId, name: 'hallucination_check', error: result.reason, level: 'WARNING' });
      return result;
    }
  }

  if ((action === 'BUY' || action === 'SELL') && decision.amount) {
    const amt = Number(decision.amount);
    if (isNaN(amt) || amt <= 0 || amt > 100000) {
      const result = { hallucinated: true, reason: `Suspicious amount: ${decision.amount}` };
      logSpan({ traceId, name: 'hallucination_check', error: result.reason, level: 'WARNING' });
      return result;
    }
  }

  logSpan({ traceId, name: 'hallucination_check', output: { passed: true }, level: 'DEFAULT' });
  return { hallucinated: false };
}

// ── Close a trace ──────────────────────────────────────────────────
export function closeTrace(
  traceId:  string,
  output:   Record<string, unknown>,
  metadata?: TraceMetadata
): void {
  const trace = localTraces.find(t => t.traceId === traceId);
  if (trace) {
    trace.output    = output;
    trace.endTime   = Date.now();
    trace.durationMs = trace.endTime - trace.startTime;
    trace.metadata  = { ...trace.metadata, ...metadata };
  }
  try {
    langfuse.trace({ id: traceId, output, metadata });
  } catch (_) {}
}

// ── Daily bug/triage report ────────────────────────────────────────
export function generateTriageReport(): string {
  const now    = new Date().toLocaleString();
  const errors = localErrors.slice(0, 20);
  const traces = localTraces.slice(0, 10);

  const errorsByStage = errors.reduce<Record<string, number>>((acc, e) => {
    acc[e.stage] = (acc[e.stage] || 0) + 1;
    return acc;
  }, {});

  const hallucinations = errors.filter(e =>
    e.error.toLowerCase().includes('hallucin') ||
    e.error.toLowerCase().includes('invalid action') ||
    e.error.toLowerCase().includes('symbol')
  ).length;

  const apiErrors   = errors.filter(e => e.stage === 'api_call').length;
  const jsonErrors  = errors.filter(e => e.stage === 'json_parse').length;
  const recovered   = errors.filter(e => e.recovered).length;

  let report = `PEAR PROTOCOL — AI PIPELINE TRIAGE REPORT\n`;
  report    += `Generated: ${now}\n`;
  report    += `Session: ${sessionId}\n`;
  report    += `${'─'.repeat(50)}\n\n`;

  report += `SUMMARY\n`;
  report += `  Total cycles run      : ${cycleCount}\n`;
  report += `  Total errors logged   : ${errors.length}\n`;
  report += `  AI hallucinations     : ${hallucinations}\n`;
  report += `  API call failures     : ${apiErrors}\n`;
  report += `  JSON parse errors     : ${jsonErrors}\n`;
  report += `  Auto-recovered errors : ${recovered}\n\n`;

  if (Object.keys(errorsByStage).length > 0) {
    report += `ERRORS BY PIPELINE STAGE\n`;
    for (const [stage, count] of Object.entries(errorsByStage)) {
      report += `  ${stage.padEnd(25)} ${count}\n`;
    }
    report += '\n';
  }

  if (errors.length > 0) {
    report += `RECENT ERROR LOG\n`;
    errors.slice(0, 8).forEach((e, i) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      report += `  [${i + 1}] ${time} | ${e.stage}\n`;
      report += `       Error    : ${e.error}\n`;
      report += `       Recovered: ${e.recovered ? 'YES' : 'NO'} | Fallback: ${e.fallbackUsed ? 'YES' : 'NO'}\n`;
    });
    report += '\n';
  }

  report += `RECENT TRACES\n`;
  traces.slice(0, 5).forEach(t => {
    const dur  = t.durationMs ? `${t.durationMs}ms` : 'running';
    const time = new Date(t.startTime).toLocaleTimeString();
    report += `  ${time} | ${t.name} | ${dur}\n`;
    if (t.error) report += `         ERROR: ${t.error}\n`;
  });

  report += `\n${'─'.repeat(50)}\n`;
  report += `Action items:\n`;
  if (hallucinations > 2)
    report += `  ⚠ High hallucination rate (${hallucinations}) — review prompt constraints\n`;
  if (apiErrors > 3)
    report += `  ⚠ Repeated API failures — check OpenRouter key / rate limits\n`;
  if (jsonErrors > 2)
    report += `  ⚠ JSON parse errors — tighten output format instructions\n`;
  if (errors.length === 0)
    report += `  ✓ No errors detected — pipeline running cleanly\n`;

  return report;
}

export { langfuse };
