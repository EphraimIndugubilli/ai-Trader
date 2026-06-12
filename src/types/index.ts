// src/types/index.ts
// Central type definitions for the entire trading system

export type Side = 'buy' | 'sell';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type CloseReason = 'manual' | 'stop_loss' | 'take_profit' | 'ai_decision' | 'liquidation';
export type AIAction = 'BUY' | 'SELL' | 'HOLD' | 'CLOSE' | 'CLOSE_ALL';
export type SignalStrength = 'strong' | 'moderate' | 'weak';
export type VolumeSignal = 'high' | 'normal' | 'low';
export type TradeSource = 'ai' | 'manual';

// ── Market ────────────────────────────────────────────────────────
export interface TradingPair {
  symbol: string;
  name: string;
  base: number;
  vol: number;       // volatility factor
  decimals: number;
}

export interface MarketState {
  symbol: string;
  name: string;
  base: number;
  vol: number;
  decimals: number;
  prices: number[];
  price: number;
  prevPrice: number;
  trend: number;
  volatilityMult: number;
  volume: number[];
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  prevPrice: number;
  timestamp: number;
}

// ── Hyperliquid Perps (simulated) ─────────────────────────────────
export interface PerpMarketInfo {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;       // hourly funding rate
  openInterest: number;
  volume24h: number;
  nextFundingTime: number;   // unix ms
}

export interface PerpPosition extends Position {
  markPrice: number;
  liquidationPrice: number;
  margin: number;
  leverage: number;
  unrealizedFundingPnl: number;
}

// ── Orders & Positions ────────────────────────────────────────────
export interface Order {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  price: number;
  amountUSDT: number;
  qty: number;
  fee: number;
  stopLoss: number | null;
  takeProfit: number | null;
  source: TradeSource;
  timestamp: number;
  timeStr: string;
}

export interface Position extends Order {
  status: OrderStatus;
}

export interface ClosedTrade extends Position {
  exitPrice: number;
  exitValue: number;
  pnl: number;
  exitTimestamp: number;
  exitTimeStr: string;
  exitReason: CloseReason;
  durationMs: number;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  amountUSDT: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  source?: TradeSource;
}

export interface OrderResult {
  ok: boolean;
  position?: Position;
  error?: string;
}

// ── Technical Indicators ──────────────────────────────────────────
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

export interface StochasticResult {
  k: number;
  d: number;
}

export interface SupportResistance {
  support: number | null;
  resistance: number | null;
}

export interface IndicatorResult {
  symbol: string;
  current: number;
  rsi: number | null;
  macd: MACDResult | null;
  bb: BollingerBands | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  atr: number | null;
  stoch: StochasticResult | null;
  volSig: VolumeSignal;
  sr: SupportResistance;
  trend: number;
  score: number;
  action: AIAction;
  confidence: number;
  target: number | null;
  stopLoss: number | null;
  reasons: string[];
}

// ── AI Brain ──────────────────────────────────────────────────────
export interface AIDecision {
  action: AIAction;
  symbol?: string;
  amount?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning: string;
}

export interface AIThinkStep {
  type: 'step' | 'data' | 'signal' | 'warn' | 'exec' | 'profit' | 'loss';
  text: string;
  timestamp: number;
}

export interface AISignalDisplay {
  action: AIAction;
  confidence: number;
  target: number | null;
  stopLoss: number | null;
}

// ── Langfuse / Observability ──────────────────────────────────────
export interface PipelineTrace {
  traceId: string;
  sessionId: string;
  name: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  metadata: TraceMetadata;
}

export interface TraceMetadata {
  symbol?: string;
  action?: AIAction;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  fallback?: boolean;
  hallucinationDetected?: boolean;
  jsonParseError?: boolean;
  apiError?: boolean;
  cycleNumber?: number;
}

export interface SpanEvent {
  traceId: string;
  spanId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startTime: number;
  endTime: number;
  level: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  metadata?: Record<string, unknown>;
}

export interface PipelineError {
  traceId: string;
  stage: 'market_scan' | 'indicator_compute' | 'prompt_build' |
         'api_call' | 'json_parse' | 'decision_validate' | 'order_execute';
  error: string;
  raw?: string;
  recovered: boolean;
  fallbackUsed: boolean;
  timestamp: number;
}

// ── Portfolio ─────────────────────────────────────────────────────
export interface PortfolioSnapshot {
  balance: number;
  portfolioValue: number;
  unrealizedPnL: number;
  totalPnL: number;
  winRate: number | null;
  openPositions: number;
  closedTrades: number;
  timestamp: number;
}

// ── API Responses ─────────────────────────────────────────────────
export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface MarketDataResponse {
  pairs: Array<{
    symbol: string;
    name: string;
    price: number;
    prevPrice: number;
    change24h: number;
    perpInfo: PerpMarketInfo;
  }>;
}
