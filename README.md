# 🍐 Pear Trader — AI Pipeline Monitor

Autonomous crypto paper trading terminal built to match the Pear Protocol internship stack exactly.

---

## Tech Stack — 1:1 with Pear Protocol

| Pear Protocol Requirement | This Project |
|--------------------------|--------------|
| TypeScript (heavy) | Full TypeScript — all 8 source files strictly typed |
| Vercel AI SDK | `generateText()` from `ai` package with streaming |
| OpenRouter | Provider for all AI calls — swap model in `.env` |
| Langfuse | Full tracing: traces, spans, generations, hallucination detection |
| AI pipeline monitoring | `src/monitoring/langfuse.ts` — every call traced |
| Triage reports | `GET /api/monitoring/report` — daily bug report endpoint |
| TypeScript codebase tracing | 8 typed modules with clear data flow |
| Hyperliquid perps knowledge | Simulated: funding rates, mark/index price, liquidation calc |

---

## Project Structure

```
pear-trader/
├── src/
│   ├── types/
│   │   └── index.ts          # All interfaces: Position, Order, PipelineTrace, AIDecision…
│   ├── market/
│   │   └── engine.ts         # Hyperliquid-style perp simulation (funding, mark price, OI)
│   ├── indicators/
│   │   └── compute.ts        # RSI, MACD, EMA, Bollinger Bands, ATR, Stochastic (typed)
│   ├── trading/
│   │   └── engine.ts         # Portfolio engine: orders, positions, P&L, liquidation check
│   ├── ai/
│   │   └── brain.ts          # Vercel AI SDK + OpenRouter — streams reasoning, executes trades
│   ├── monitoring/
│   │   └── langfuse.ts       # Langfuse traces, spans, generations, hallucination detection
│   └── server.ts             # Express REST API + SSE for real-time streaming
├── public/
│   ├── index.html            # Dashboard with Langfuse monitor panel
│   └── style.css
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Setup

```bash
git clone https://github.com/EphraimIndugubilli/pear-trader
cd pear-trader
npm install
cp .env.example .env
# Add your OPENROUTER_API_KEY and LANGFUSE keys to .env
npm run dev
# Open http://localhost:3000
```

---

## How the AI Pipeline Works

```
Market Tick (2s)
    │
    ▼
Indicator Engine ──── RSI, MACD, EMA, BB, ATR, Stochastic, Volume
    │
    ▼
Best Opportunity Selector ──── score × confidence ranking
    │
    ▼
Langfuse: startCycleTrace() ──── logs input context
    │
    ▼
Vercel AI SDK: generateText() ──── OpenRouter → claude-sonnet-4-6
    │                                (or any model via env var)
    ▼
Langfuse: logGeneration() ──── logs prompt, completion, token usage
    │
    ▼
Hallucination Detection ──── validates action, symbol, amount
    │              │
    │           (fail) ──── recordError() → fallback to indicators
    ▼
JSON Decision Parser ──── extracts AIDecision struct
    │
    ▼
Order Executor ──── placeOrder() / closePosition()
    │
    ▼
Langfuse: closeTrace() ──── logs output, duration, metadata
    │
    ▼
SSE Broadcast ──── streams every step to dashboard in real-time
```

---

## Langfuse Observability

Every AI cycle produces:
- **1 trace** — full cycle context (input + output)
- **N spans** — each pipeline stage (prompt_build, api_call, json_parse, order_execute)
- **1 generation** — LLM call with prompt, completion, token usage
- **Error events** — stage, message, recovered?, fallbackUsed?
- **Hallucination events** — what was detected and why

### Triage Report

```bash
curl http://localhost:3000/api/monitoring/report
```

Outputs a plain-text daily report:
```
PEAR PROTOCOL — AI PIPELINE TRIAGE REPORT
Generated: 12/06/2026, 14:30:00
──────────────────────────────────────────
SUMMARY
  Total cycles run      : 24
  Total errors logged   : 3
  AI hallucinations     : 1
  API call failures     : 1
  JSON parse errors     : 1
  Auto-recovered errors : 3

ERRORS BY PIPELINE STAGE
  api_call                  1
  json_parse                1
  decision_validate         1

RECENT ERROR LOG
  [1] 14:28:05 | json_parse
       Error    : No valid JSON decision extracted
       Recovered: YES | Fallback: YES
...
```

---

## Hyperliquid Perp Mechanics (Simulated)

| Concept | Implementation |
|---------|---------------|
| Mark price | Simulated with small spread vs index |
| Index price | Mark × (1 ± 0.001) noise |
| Funding rate | -0.1% to +0.1%/hr, drifts realistically |
| Open interest | Tracks with price volume |
| Liquidation price | `entry × (1 - 1/leverage + maintenanceMargin)` |
| Funding P&L | Accrues on open positions each hour |
| Perp symbols | BTC-PERP, ETH-PERP, SOL-PERP, ARB-PERP, DOGE-PERP, WIF-PERP |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stream` | GET SSE | Real-time market ticks + AI think steps |
| `/api/market` | GET | All pairs with perp metadata |
| `/api/market/:symbol/indicators` | GET | Full indicator result for symbol |
| `/api/portfolio` | GET | Balance, positions, equity history |
| `/api/order` | POST | Place manual order |
| `/api/order/:id/close` | POST | Close position by ID |
| `/api/ai/start` | POST | Start AI trading loop |
| `/api/ai/stop` | POST | Stop AI trading loop |
| `/api/monitoring/traces` | GET | Recent Langfuse traces |
| `/api/monitoring/errors` | GET | Pipeline error log |
| `/api/monitoring/spans` | GET | Recent spans |
| `/api/monitoring/report` | GET | Plain-text triage report |

---

## Why This Maps to the Pear Protocol Role

**Monitor & Triage** — The Langfuse monitor panel in the dashboard is exactly what the role requires: catching AI model errors and execution failures in real-time.

**Trace the Stack** — `src/monitoring/langfuse.ts` logs every pipeline stage as a named span. When something fails, you can see exactly which stage broke and why.

**Ship Reports** — `GET /api/monitoring/report` generates a structured daily triage report showing error counts by stage, hallucination rate, and recovery status.

**Hallucination detection** — `detectHallucination()` validates every AI response before execution: checks action validity, symbol existence, amount sanity.

**TypeScript** — Strict mode, all interfaces defined in `src/types/index.ts`, no `any` types.

**Vercel AI SDK** — `generateText()` from the `ai` package with OpenRouter as provider.

**Hyperliquid** — Perp symbols (BTC-PERP format), funding rates, mark/index price spread, liquidation price formula all implemented.
