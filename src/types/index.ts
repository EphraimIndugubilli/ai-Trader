// src/types/index.ts
// Central type definitions for the entire trading system

export type Side = 'buy' | 'sell';
export type OrderStatus = 'open' | 'closed' | 'cancelled';
export type CloseReason = 'manual' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'ai_decision' | 'liquidation';
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
  trailingStopPct: number | null;
  trailingStopPrice: number | null;
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
  trailingStopPct?: number | null;
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

export interface BBSqueezeResult {
  squeeze: boolean;
  intensity: number;          // 0-100: how far below avg bandwidth (0 = no squeeze)
  currentBandwidth: number;
  avgBandwidth: number;
  minBandwidth: number;       // 40-period low — floor of recent compression
}

export interface StochasticResult {
  k: number;
  d: number;
}

export interface SupportResistance {
  support: number | null;
  resistance: number | null;
}

export type OBVTrend = 'rising' | 'flat' | 'falling';

export interface OBVResult {
  value: number;
  trend: OBVTrend;
}

export interface ConfluenceResult {
  score: number;          // 0–3: how many of RSI/MACD/OBV agree on direction
  direction: 'bullish' | 'bearish' | 'mixed';
  rsiAligned:  boolean;
  macdAligned: boolean;
  obvAligned:  boolean;
  gated: boolean;         // true when ≥2 indicators agree — safe to enter
}

export type ADXTrend = 'strong' | 'moderate' | 'weak';

export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
  trend: ADXTrend;
}

export interface VWAPResult {
  vwap: number;
  upperBand1: number;   // VWAP + 1σ
  lowerBand1: number;   // VWAP − 1σ
  upperBand2: number;   // VWAP + 2σ
  lowerBand2: number;   // VWAP − 2σ
  deviation: number;    // current price deviation from VWAP as a % (positive = above)
  zone: 'above_2sd' | 'above_1sd' | 'near_vwap' | 'below_1sd' | 'below_2sd';
}

export type SuperTrendDirection = 'bullish' | 'bearish';

export interface SuperTrendResult {
  value: number;               // current band value (support if bullish, resistance if bearish)
  direction: SuperTrendDirection;
  distPct: number;             // price distance from SuperTrend line as % (positive = above)
  justFlipped: boolean;        // true if direction changed on the last bar
  period: number;
  multiplier: number;
}

export interface IndicatorResult {
  symbol: string;
  current: number;
  rsi: number | null;
  rsiFast: number | null;
  macd: MACDResult | null;
  bb: BollingerBands | null;
  bbSqueeze: BBSqueezeResult | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  atr: number | null;
  stoch: StochasticResult | null;
  volSig: VolumeSignal;
  obv: OBVResult | null;
  adx: ADXResult | null;
  vwap: VWAPResult | null;
  superTrend: SuperTrendResult | null;
  sr: SupportResistance;
  trend: number;
  roc: number | null;
  cci: number | null;
  divergence: 'bullish' | 'bearish' | 'none';
  confluence: ConfluenceResult;
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
