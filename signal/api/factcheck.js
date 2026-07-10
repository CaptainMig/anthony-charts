// ---------------------------------------------------------------------------
// Fact-check cross-reference (Vercel function).
//
// Queries the Google Fact Check Tools API (free key, server-side only — set
// GOOGLE_FACTCHECK_API_KEY in Vercel env) with a headline's key claim and
// returns any published reviews: publisher, rating, url.
//
// Honesty rule: when the key is missing or the API errors, this returns a
// structured "unavailable" result — the client renders that state plainly
// rather than faking "no matching fact-checks" coverage it never looked up.
// ---------------------------------------------------------------------------

const API = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // query -> { at, payload }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (req.query?.q || '').toString().trim().slice(0, 300);
  if (!q) return res.status(400).json({ ok: false, reason: 'Missing q' });

  const key = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!key) return res.status(200).json({ ok: false, reason: 'not configured' });

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(hit.payload);
  }

  try {
    const u = `${API}?query=${encodeURIComponent(q)}&languageCode=en&pageSize=5&key=${key}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return res.status(200).json({ ok: false, reason: `HTTP ${r.status}` });

    const data = await r.json();
    const reviews = (data.claims || []).flatMap((claim) =>
      (claim.claimReview || []).map((cr) => ({
        claim: claim.text || '',
        claimant: claim.claimant || '',
        publisher: cr.publisher?.name || cr.publisher?.site || 'unknown',
        rating: cr.textualRating || '',
        url: cr.url || '',
        date: cr.reviewDate || claim.claimDate || null,
      }))
    );

    const payload = { ok: true, reviews: reviews.slice(0, 8) };
    cache.set(q, { at: Date.now(), payload });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return res.status(200).json({ ok: false, reason: timeout ? 'timeout' : e.message });
  }
}
