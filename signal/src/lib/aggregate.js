// ---------------------------------------------------------------------------
// Scan → /api/aggregate submission (the Signal → AnthonyCharts contract).
//
// After each completed sweep the client summarizes its REAL scores from the
// last 24h (UNSCORED/fallback rows and older items excluded) and posts the
// snapshot to /api/aggregate, where the anthonycharts.com generator reads it
// at build time. Fire-and-forget: a failed submit never touches the scan UI.
// ---------------------------------------------------------------------------
import { isRealScore } from './scoring.js';
import { articleIntegrity } from './article.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Summarize a finished scan. `collected` rows carry `.score` and `.pubDate`.
 * Only rows that are really scored AND dated within the 24h window count —
 * undated rows can't prove freshness, so they stay out of the contract.
 */
export function computeAggregate(collected, now = Date.now()) {
  const windowed = collected.filter((h) => {
    if (!isRealScore(h.score)) return false;
    const t = h.pubDate ? new Date(h.pubDate).getTime() : NaN;
    return Number.isFinite(t) && now - t <= WINDOW_MS;
  });
  const vals = windowed.map((h) => articleIntegrity(h.score)).filter((v) => v != null);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  return {
    scored: vals.length,
    total: collected.length,
    meanIntegrity: mean == null ? null : Math.round(mean * 10) / 10,
    medianIntegrity: median(vals),
  };
}

export function submitAggregate(collected) {
  const snapshot = computeAggregate(collected);
  return fetch('/api/aggregate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  }).catch(() => {
    /* best-effort — never disturbs the scan */
  });
}
