// ---------------------------------------------------------------------------
// Future hook: getIntegrityScore()
//
// Returns the current session's Integrity Score (0-100) — the percentage of
// scored headlines that are VERIFIED or CONTEXTUAL. This is the single value
// the AnthonyCharts.com Info Integrity meter will eventually consume.
//
// The app keeps this module's internal store updated as scoring progresses
// (see setIntegrityScore). The getter is also attached to window so it can be
// read from an embedding page without importing the bundle.
// ---------------------------------------------------------------------------

let currentScore = 0;

export function setIntegrityScore(score) {
  currentScore = Math.max(0, Math.min(100, Math.round(score || 0)));
}

export function getIntegrityScore() {
  return currentScore;
}

if (typeof window !== 'undefined') {
  window.getIntegrityScore = getIntegrityScore;
}
