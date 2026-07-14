// ---------------------------------------------------------------------------
// Derived statistics — atmosphere distribution, strip stats, scorecards.
// ---------------------------------------------------------------------------
import { DISPLAY_VERDICTS, INTEGRITY_VERDICTS } from '../config.js';

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// Empty count map keyed by verdict, preserving display order. Uses the display
// set (includes PROVISIONAL) — rows can carry policy verdicts, not just model ones.
export function emptyVerdictCounts() {
  return DISPLAY_VERDICTS.reduce((acc, v) => ((acc[v] = 0), acc), {});
}

/**
 * Framing Integrity: % of scored headlines that are VERIFIED or CONTEXTUAL,
 * 0-100 — the share whose headline fairly represents its own article (not a
 * measure of whether the news is true). This is the value the renamed
 * getFramingIntegrity() export surfaces. (Internal name kept for a small diff.)
 */
export function integrityScore(scored) {
  if (!scored.length) return 0;
  const good = scored.filter((h) => INTEGRITY_VERDICTS.includes(h.score.verdict)).length;
  return Math.round((good / scored.length) * 100);
}

// Verdict distribution across all scored headlines, with counts + percentages.
export function atmosphere(scored) {
  const counts = emptyVerdictCounts();
  for (const h of scored) counts[h.score.verdict]++;
  const total = scored.length;
  return DISPLAY_VERDICTS.map((verdict) => ({
    verdict,
    count: counts[verdict],
    pct: total ? (counts[verdict] / total) * 100 : 0,
  }));
}

// The six headline stats for the strip.
export function stripStats(scored, { totalHeadlines, sourcesActive }) {
  return {
    totalHeadlines,
    sourcesActive,
    avgTruth: round1(avg(scored.map((h) => h.score.truth))),
    avgSens: round1(avg(scored.map((h) => h.score.sens))),
    avgClick: round1(avg(scored.map((h) => h.score.click))),
    integrity: integrityScore(scored),
  };
}

/**
 * Per-publication scorecards. Grouped by publication; each carries its owner,
 * verdict distribution, and average truth / sens / clickbait.
 */
export function scorecards(scored) {
  const byPub = new Map();
  for (const h of scored) {
    if (!byPub.has(h.publication)) {
      byPub.set(h.publication, { publication: h.publication, owner: h.owner, items: [] });
    }
    byPub.get(h.publication).items.push(h);
  }

  return [...byPub.values()]
    .map((group) => {
      const counts = emptyVerdictCounts();
      for (const h of group.items) counts[h.score.verdict]++;
      const total = group.items.length;
      return {
        publication: group.publication,
        owner: group.owner,
        count: total,
        distribution: DISPLAY_VERDICTS.map((verdict) => ({
          verdict,
          count: counts[verdict],
          pct: total ? (counts[verdict] / total) * 100 : 0,
        })),
        avgTruth: round1(avg(group.items.map((h) => h.score.truth))),
        avgSens: round1(avg(group.items.map((h) => h.score.sens))),
        avgClick: round1(avg(group.items.map((h) => h.score.click))),
        integrity: integrityScore(group.items),
      };
    })
    .sort((a, b) => b.count - a.count || a.publication.localeCompare(b.publication));
}

// Relative age label for a headline, e.g. "3h" or "2d".
export function ageLabel(pubDate) {
  if (!pubDate) return '—';
  const then = new Date(pubDate).getTime();
  if (!Number.isFinite(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// Numeric age in minutes, for sorting the Age column.
export function ageMinutes(pubDate) {
  if (!pubDate) return Infinity;
  const then = new Date(pubDate).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.max(0, (Date.now() - then) / 60000);
}
