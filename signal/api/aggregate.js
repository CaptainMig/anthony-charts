// ---------------------------------------------------------------------------
// Signal → AnthonyCharts aggregate contract (Vercel function).
//
// GET  /api/aggregate → { asOf, windowHours: 24, scored, total,
//                         meanIntegrity, medianIntegrity, source }
//   computed over the last 24h of REAL scores only (UNSCORED/fallback rows
//   are excluded before they ever reach this endpoint — see App.jsx).
//
// POST /api/aggregate — the Signal client submits its scan summary when a
//   sweep completes. Scoring happens in the browser (the key stays
//   server-side, but the scores live client-side), so this endpoint is the
//   hand-off point, held in instance memory.
//
// Serverless memory is ephemeral: a cold instance has no snapshot. GET then
// falls back to the committed static /aggregate.json, whose deliberately
// empty seed (scored: 0) trips the anthonycharts generator's stale/thin
// guard — the published meter can never move on missing data.
// ---------------------------------------------------------------------------

const WINDOW_HOURS = 24;
const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000; // beyond this, memory is stale too

let latest = null; // { asOf, scored, total, meanIntegrity, medianIntegrity }

const inRange = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const b = req.body || {};
    const ok =
      inRange(b.scored, 0, 2000) &&
      inRange(b.total, 0, 2000) &&
      b.scored <= b.total &&
      (b.scored === 0 || (inRange(b.meanIntegrity, 0, 100) && inRange(b.medianIntegrity, 0, 100)));
    if (!ok) return res.status(400).json({ ok: false, reason: 'malformed snapshot' });

    latest = {
      asOf: new Date().toISOString(),
      windowHours: WINDOW_HOURS,
      scored: Math.round(b.scored),
      total: Math.round(b.total),
      meanIntegrity: b.scored ? Math.round(b.meanIntegrity * 10) / 10 : null,
      medianIntegrity: b.scored ? Math.round(b.medianIntegrity * 10) / 10 : null,
    };
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Cache 1h at the CDN per the contract.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

  if (latest && Date.now() - Date.parse(latest.asOf) < MAX_SNAPSHOT_AGE_MS) {
    return res.status(200).json({ ...latest, source: 'live' });
  }

  // Cold instance / no sweep yet — serve the committed static fallback.
  try {
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const r = await fetch(`${origin}/aggregate.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const fallback = await r.json();
      return res.status(200).json({ windowHours: WINDOW_HOURS, ...fallback, source: 'static' });
    }
  } catch {
    /* fall through to the empty snapshot */
  }
  return res.status(200).json({
    asOf: null,
    windowHours: WINDOW_HOURS,
    scored: 0,
    total: 0,
    meanIntegrity: null,
    medianIntegrity: null,
    source: 'none',
  });
}
