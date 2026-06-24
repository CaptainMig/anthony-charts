// ---------------------------------------------------------------------------
// Today's Briefing — a 2–4 sentence integrity summary TEMPLATED FROM NUMBERS.
//
// HARD RULE: every clause is a fixed string selected by a numeric threshold.
// There is no model call, no fetch, no free-text generation anywhere in this
// file. A media-integrity tool whose own summary was an ungrounded AI paragraph
// would be a contradiction — the briefing is pure provenance. Every value comes
// from the scan's existing aggregates, so the briefing and the stat strip can
// never disagree.
// ---------------------------------------------------------------------------

const round1 = (n) => Math.round(n * 10) / 10;

function integrityBand(fi) {
  if (fi >= 85) return 'headlines tracked their articles closely today';
  if (fi >= 70) return 'framing was mostly faithful, with some drift';
  if (fi >= 50) return 'a meaningful share of headlines oversold their stories';
  return 'headline framing diverged sharply from the reporting';
}

function toneBand(s) {
  if (s <= 3) return 'flat and proportionate';
  if (s <= 5) return 'moderately charged';
  return 'heated';
}

function clickbaitClause(c) {
  if (c <= 3) return ', with little curiosity-gap baiting.';
  if (c <= 5) return ', with some information withheld to drive clicks.';
  return ', and headlines frequently withheld the payoff.';
}

// Dominant verdict = mode of the five verdicts; ties broken by this precedence.
const VERDICT_PRECEDENCE = ['VERIFIED', 'CONTEXTUAL', 'UNVERIFIED', 'CONTESTED', 'MISLEADING'];

function dominantVerdict(counts) {
  let best = null;
  let bestCount = -1;
  for (const v of VERDICT_PRECEDENCE) {
    const c = counts[v] || 0;
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

const VERDICT_SENTENCE = {
  VERIFIED: 'Most coverage was straight — verdicts skewed Verified.',
  CONTEXTUAL:
    'The dominant issue was omission, not fabrication — most flags were Contextual (true but missing context).',
  UNVERIFIED: 'Hedged or developing claims led the day — most flags were Unverified.',
  CONTESTED: 'Disputed framing led the day — most flags were Contested.',
  MISLEADING: 'Distortion was elevated today — Misleading was the leading flag.',
};

/**
 * Build the briefing string from already-computed scan aggregates.
 * Pure: no side effects, no network. Unit-testable.
 *
 * @param b.date        "Mon DD" string (computed by the caller, not here).
 * @param b.n           headlines scored.
 * @param b.sources     active sources.
 * @param b.fi          Framing Integrity % (the strip's integer).
 * @param b.fiLo,b.fiHi Framing Integrity 95% CI bounds (the strip's integers).
 * @param b.avgSens     avg sensationalism (strip value).
 * @param b.avgClick    avg clickbait (strip value).
 * @param b.verdictCounts { VERIFIED, CONTEXTUAL, CONTESTED, UNVERIFIED, MISLEADING }.
 * @param b.slam        { computed, flaggedCount, index, lo, hi, topOutlet } | null.
 */
export function buildBriefing(b) {
  const date = b.date;

  // Scan failed / nothing scored — no fabricated numbers.
  if (!b.n || b.n <= 0) {
    return `${date} — scan incomplete; not enough scored headlines to brief.`;
  }

  const fi = Math.round(b.fi);
  const fiLo = Math.round(b.fiLo);
  const fiHi = Math.round(b.fiHi);
  const s1 = `${date} — ${b.n} headlines across ${b.sources} sources. Framing Integrity ${fi}% (${fiLo}–${fiHi}), ${integrityBand(fi)}.`;

  const s2 = `Tone ran ${toneBand(round1(b.avgSens))}${clickbaitClause(round1(b.avgClick))}`;

  const s3 = VERDICT_SENTENCE[dominantVerdict(b.verdictCounts || {})] || '';

  const sentences = [s1, s2, s3];

  // Sentence 4 only when the Slam Index is computed AND not underpowered.
  if (b.slam && b.slam.computed && b.slam.flaggedCount >= 5) {
    const si = Math.round(b.slam.index);
    const lo = Math.round(b.slam.lo);
    const hi = Math.round(b.slam.hi);
    const tail = b.slam.topOutlet ? `, concentrated in ${b.slam.topOutlet}.` : '.';
    sentences.push(`Manufactured-conflict framing (Slam Index) sat at ${si}% (${lo}–${hi})${tail}`);
  }

  return sentences.join(' ');
}
