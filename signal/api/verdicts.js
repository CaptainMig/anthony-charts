// ---------------------------------------------------------------------------
// Server-side full-text verdict store (Vercel function).
//
//   GET  /api/verdicts                        → health { ok, entries, durable }
//   POST /api/verdicts  { ids: [...] }        → batch lookup { verdicts: { id: entry } }
//   PUT  /api/verdicts  { id, score, chars }  → persist one full-text verdict
//
// Entries are { at, score: { verdict, truth, sens, click, rationale }, chars },
// keyed by the client's stable article id (djb2/base36 of the link — see
// src/lib/article.js). Written by the article detail page and the post-sweep
// auto-escalation queue; read back by every client so an article is full-text
// scored ONCE globally, not once per device.
//
// Two layers, honest about each (same discipline as api/aggregate.js):
//  - Instance memory: fast, shared by every request a warm instance serves,
//    lost on cold start.
//  - Optional Redis via REST when the standard Vercel KV / Upstash env vars
//    are set (KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/
//    UPSTASH_REDIS_REST_TOKEN) — that makes verdicts durable across instances
//    and deploys, with a 30-day TTL. Without it, the client's localStorage
//    layer plus re-escalation on later sweeps refill memory naturally; a KV
//    outage degrades to memory-only, never to an error the client sees.
//
// No auth exists anywhere in this app, so writes are shape-validated hard
// (model verdicts only, clamped axes, bounded rationale) and rate-limited —
// a poisoned write can at worst store a well-formed verdict.
// ---------------------------------------------------------------------------
import { VERDICTS } from '../src/config.js';

const MAX_ENTRIES = 5000; // memory cap — oldest-inserted evicted past this
const MAX_BATCH = 500; // lookup ids per request
const KV_TTL_SECONDS = 30 * 24 * 60 * 60; // news is stale long before 30 days

const store = new Map(); // id -> { at, score, chars }

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_PREFIX = 'signal:ftv:';

// Naive per-IP rate limit for writes, same pattern as api/score.js.
const rateLimits = new Map();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

const ID_RE = /^[a-z0-9]{1,16}$/;
const VALID_VERDICTS = new Set(VERDICTS); // full-text verdicts are model verdicts only

// One Redis command over the Upstash REST protocol. Returns the result, or
// null on any failure / when KV isn't configured — callers always fall back
// to instance memory.
async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()).result ?? null;
  } catch {
    return null;
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || 'unknown';
}

const clampAxis = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(10, Math.max(0, v)) : null;
};

// Normalize an untrusted body into a storable entry, or null when malformed.
function cleanEntry(b) {
  const s = b?.score;
  const verdict = String(s?.verdict || '').toUpperCase();
  if (!VALID_VERDICTS.has(verdict)) return null;
  return {
    at: Date.now(),
    score: {
      verdict,
      truth: clampAxis(s.truth),
      sens: clampAxis(s.sens),
      click: clampAxis(s.click),
      rationale: typeof s.rationale === 'string' ? s.rationale.trim().slice(0, 420) : '',
    },
    chars: Number.isFinite(Number(b.chars)) ? Math.max(0, Math.round(Number(b.chars))) : 0,
  };
}

function remember(id, entry) {
  store.delete(id); // re-insert so Map order stays oldest-first for eviction
  store.set(id, entry);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health — confirms the function deployed and whether a durable layer exists.
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, entries: store.size, durable: !!(KV_URL && KV_TOKEN) });
  }

  // Batch lookup. POST (not GET) so a full scan's worth of ids fits in the body.
  if (req.method === 'POST') {
    const ids = [...new Set(Array.isArray(req.body?.ids) ? req.body.ids : [])]
      .filter((id) => typeof id === 'string' && ID_RE.test(id))
      .slice(0, MAX_BATCH);
    if (!ids.length) return res.status(400).json({ ok: false, reason: 'no valid ids' });

    const verdicts = {};
    const misses = [];
    for (const id of ids) {
      const hit = store.get(id);
      if (hit) verdicts[id] = hit;
      else misses.push(id);
    }

    // Durable layer for the misses — one MGET, results hydrate memory.
    if (misses.length) {
      const rows = await kv(['MGET', ...misses.map((id) => KV_PREFIX + id)]);
      if (Array.isArray(rows)) {
        rows.forEach((raw, i) => {
          if (!raw) return;
          try {
            const entry = JSON.parse(raw);
            if (entry?.score?.verdict) {
              verdicts[misses[i]] = entry;
              remember(misses[i], entry);
            }
          } catch {
            /* corrupt row — treat as a miss */
          }
        });
      }
    }

    return res.status(200).json({ ok: true, verdicts });
  }

  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit writes per IP per minute.
  const ip = clientIp(req);
  const now = Date.now();
  let window = rateLimits.get(ip);
  if (!window || now > window.reset) window = { count: 0, reset: now + RATE_WINDOW_MS };
  window.count++;
  rateLimits.set(ip, window);
  if (window.count > RATE_LIMIT) return res.status(429).json({ error: 'Rate limited' });

  const id = String(req.body?.id || '');
  if (!ID_RE.test(id)) return res.status(400).json({ ok: false, reason: 'bad id' });
  const entry = cleanEntry(req.body);
  if (!entry) return res.status(400).json({ ok: false, reason: 'malformed verdict' });

  remember(id, entry);
  const durable = await kv(['SET', KV_PREFIX + id, JSON.stringify(entry), 'EX', KV_TTL_SECONDS]);
  return res.status(200).json({ ok: true, persisted: durable ? 'kv' : 'memory' });
}
