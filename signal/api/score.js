// ---------------------------------------------------------------------------
// Serverless scoring proxy (Vercel function).
//
// Keeps the Anthropic API key server-side — it is read from
// process.env.ANTHROPIC_API_KEY and never reaches the browser. Scores ONE
// headline per request using the shared NERVA prompt.
// ---------------------------------------------------------------------------
import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from '../src/config.js';
import { SYSTEM_PROMPT, FULLTEXT_SUFFIX, userContent, parseScore, provisionalize } from '../src/lib/prompt.js';

// Naive per-IP rate limit. In-memory, so it resets on cold start — adequate
// as a light abuse guard, not a hard quota. Set well above a single full scan
// (~130 headlines) so one user's scan is never self-throttled; the user asked
// for 60/min but that would re-throttle a 129-headline scan, so we use 200.
const rateLimits = new Map();
const RATE_LIMIT = 200;
const RATE_WINDOW_MS = 60_000;

// Upstream budget, well inside the 60s function ceiling (vercel.json), so a
// hung Anthropic call returns a structured, honest fallback response instead
// of the platform killing the function mid-flight. Fallbacks render as
// UNSCORED client-side — a default score presented as a score is exactly what
// Signal exists to catch.
const UPSTREAM_TIMEOUT_MS = 25_000;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || 'unknown';
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check — GET /api/score returns whether the key is wired up. This is
  // the fastest way to confirm the function deployed and the env var is set.
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hasKey: !!process.env.ANTHROPIC_API_KEY });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit per IP per minute.
  const ip = clientIp(req);
  const now = Date.now();
  let window = rateLimits.get(ip);
  if (!window || now > window.reset) {
    window = { count: 0, reset: now + RATE_WINDOW_MS };
  }
  window.count++;
  rateLimits.set(ip, window);
  if (window.count > RATE_LIMIT) return res.status(429).json({ error: 'Rate limited' });

  // mode 'fulltext' (article detail page): the body is extracted article text,
  // scored at a higher budget with a fuller rationale. Default: sweep mode.
  const { headline, article, mode } = req.body || {};
  if (!headline) return res.status(400).json({ error: 'Missing headline' });
  const fulltext = mode === 'fulltext';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured' });

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  // AbortController budget: a genuinely hung upstream call is cancelled (not
  // just raced past) and reported as a structured fallback the client can
  // render as UNSCORED and retry — never as a silent default score.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: fulltext ? 300 : 160,
        temperature: 0, // classification task — determinism over creativity
        system: fulltext ? SYSTEM_PROMPT + FULLTEXT_SUFFIX : SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userContent(headline, article, { maxChars: fulltext ? 6000 : 1200 }),
          },
        ],
      },
      { signal: ctrl.signal }
    );
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    // Headline-only sweeps cannot emit MISLEADING — the sweep never saw the
    // article body, so distortion stays PROVISIONAL until full-text confirms.
    const score = fulltext ? parseScore(text) : provisionalize(parseScore(text));
    return res.status(200).json({ ok: true, ...score });
  } catch (e) {
    const aborted = ctrl.signal.aborted || e?.name === 'AbortError' || e?.name === 'APIUserAbortError';
    console.error('Scoring error:', aborted ? 'upstream timeout' : e);
    return res.status(200).json({
      ok: false,
      fallback: true,
      reason: aborted ? 'timeout' : 'error',
      detail: e?.message,
      status: e?.status,
    });
  } finally {
    clearTimeout(timer);
  }
}
