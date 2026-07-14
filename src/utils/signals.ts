// Signal aggregation — combine multiple indicator signals into a consensus

export type Signal = 'bullish' | 'bearish' | 'neutral';

export interface WeightedSignal {
  signal: Signal;
  weight: number;   // 0–1
  source: string;
}

export interface Consensus {
  direction: Signal;
  strength:  number;   // 0–100
  agreement: number;   // % of signals agreeing with consensus
  conflicts: string[]; // sources that disagree
}

export function aggregate(signals: WeightedSignal[]): Consensus {
  if (signals.length === 0) {
    return { direction: 'neutral', strength: 0, agreement: 0, conflicts: [] };
  }

  let bullScore = 0, bearScore = 0, totalWeight = 0;
  for (const s of signals) {
    totalWeight += s.weight;
    if (s.signal === 'bullish') bullScore += s.weight;
    else if (s.signal === 'bearish') bearScore += s.weight;
  }

  const direction: Signal = bullScore > bearScore ? 'bullish'
    : bearScore > bullScore ? 'bearish' : 'neutral';
  const dominantScore = Math.max(bullScore, bearScore);
  const strength = totalWeight > 0 ? (dominantScore / totalWeight) * 100 : 0;

  const conflicts = signals
    .filter(s => s.signal !== 'neutral' && s.signal !== direction)
    .map(s => s.source);

  const agreeing = signals.filter(s => s.signal === direction).length;
  const agreement = (agreeing / signals.length) * 100;

  return {
    direction,
    strength: parseFloat(strength.toFixed(1)),
    agreement: parseFloat(agreement.toFixed(1)),
    conflicts,
  };
}

export function simpleVote(signals: Signal[]): Signal {
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) counts[s]++;
  if (counts.bullish > counts.bearish && counts.bullish > counts.neutral) return 'bullish';
  if (counts.bearish > counts.bullish && counts.bearish > counts.neutral) return 'bearish';
  return 'neutral';
}
