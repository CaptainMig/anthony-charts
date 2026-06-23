// ---------------------------------------------------------------------------
// Dashboard hook: getFramingIntegrity()
//
// Returns the current session's Framing Integrity (0-100) — the percentage of
// scored headlines that are VERIFIED or CONTEXTUAL, i.e. the share of headlines
// that fairly represent their OWN article. This is NOT a measure of whether the
// news is true; faithful framing of slanted reporting still scores high.
//
// This is the single value the Anthony Charts Framing Integrity meter consumes.
//
// ── RENAME NOTE (for the dashboard/globe consumer) ──────────────────────────
// Previously exported as `getIntegrityScore()` / `window.getIntegrityScore`.
// Renamed to `getFramingIntegrity` / `window.getFramingIntegrity` so the name
// no longer overclaims ground-truth verification. Update the consumer to read
// `window.getFramingIntegrity()`.
// ---------------------------------------------------------------------------

let currentScore = 0;

export function setFramingIntegrity(score) {
  currentScore = Math.max(0, Math.min(100, Math.round(score || 0)));
}

export function getFramingIntegrity() {
  return currentScore;
}

if (typeof window !== 'undefined') {
  window.getFramingIntegrity = getFramingIntegrity;
}
