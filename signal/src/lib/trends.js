// ---------------------------------------------------------------------------
// Google Trends — DISPLAY ONLY. This is search popularity, NOT integrity.
//
// Nothing here ever feeds a Fidelity / Sensationalism / Clickbait / Slam /
// Framing Integrity score. It is a parallel axis the user compares by eye.
// Fetched independently of scoring; any failure degrades to "unavailable" and
// must never break a scan or the dashboard.
// ---------------------------------------------------------------------------

// Unofficial endpoint (Google killed the official Trends API) — fetched through
// our own server proxy because the browser can't reach it (CORS).
const TRENDS_RSS = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=US';

/**
 * Fetch the daily US trending searches. Always resolves (never throws):
 *   { status: 'ok', terms: [{ term, traffic }] } | { status: 'error' }
 * No retries — a slow/broken Trends endpoint must not delay anything.
 */
export async function fetchTrends() {
  try {
    const res = await fetch(`/api/feed?url=${encodeURIComponent(TRENDS_RSS)}`);
    if (!res.ok) return { status: 'error' };
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) {
      return { status: 'error' };
    }
    const terms = data.items
      .slice(0, 10)
      .map((it) => ({ term: (it.title || '').trim(), traffic: (it.traffic || '').trim() }))
      .filter((t) => t.term.length > 0);
    return terms.length ? { status: 'ok', terms } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a matcher over the trending terms. Returns (title) => matchedTerm|null.
 * Case-insensitive, word-boundary, whole-term substring — deliberately simple
 * (no NLP). Display-only cross-reference; never changes a score or a filter.
 */
export function makeTrendingMatcher(terms) {
  const compiled = (terms || [])
    .map((t) => (typeof t === 'string' ? t : t.term))
    .filter((t) => t && t.trim().length >= 3) // skip 1–2 char terms (too noisy)
    .map((t) => ({ term: t, re: new RegExp(`\\b${escapeRe(t.trim())}\\b`, 'i') }));

  return (title) => {
    if (!title) return null;
    for (const { term, re } of compiled) if (re.test(title)) return term;
    return null;
  };
}
