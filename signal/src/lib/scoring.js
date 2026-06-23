// ---------------------------------------------------------------------------
// Headline scoring — calls the serverless proxy (/api/score), one call per
// headline, through a fixed-concurrency worker pool. The Anthropic key lives
// only on the server; nothing sensitive is in this bundle.
// ---------------------------------------------------------------------------
import { CONCURRENCY } from '../config.js';

const ENDPOINT = '/api/score';
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Score one headline via the proxy. Retries throttling/server errors with
// exponential backoff + jitter; gives up on auth/bad-request errors (they
// won't fix themselves). On total failure marks the row UNVERIFIED so it still
// renders.
async function scoreOne(headline) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: headline.title, article: headline.summary || '' }),
      });

      if (res.ok) {
        const score = await res.json();
        if (!score || !score.verdict) throw new Error('response missing verdict');
        return score;
      }

      const detail = await res.json().catch(() => ({}));
      // Auth / bad request won't recover on retry — stop and surface it.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        console.warn(`[signal] /api/score ${res.status} (not retrying): ${detail.error || ''}`);
        break;
      }
      // 429 / 5xx / timeout — retryable.
      throw new Error(`HTTP ${res.status}${detail.error ? ` — ${detail.error}` : ''}`);
    } catch (err) {
      lastErr = err;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      // 0.5s, 1s, 2s (+ jitter) — eases throttling from our proxy or Anthropic.
      await sleep(500 * 2 ** attempt + Math.random() * 250);
    }
  }

  console.warn('[signal] /api/score failed after retries, using fallback:', lastErr?.message || lastErr);
  return { verdict: 'UNVERIFIED', truth: 5, sens: 5, click: 5, rationale: 'scoring failed', failed: true };
}

/**
 * Score every headline with a fixed-concurrency worker pool.
 *
 * @param headlines   array of headline objects.
 * @param onScored    (headline, score) => void — fires as each one finishes.
 * @param shouldStop  () => boolean — return true to abort the run early.
 */
export async function scoreHeadlines(headlines, { onScored, shouldStop } = {}) {
  let next = 0;

  async function worker() {
    while (true) {
      if (shouldStop?.()) return;
      const i = next++;
      if (i >= headlines.length) return;
      const headline = headlines[i];
      const score = await scoreOne(headline);
      if (shouldStop?.()) return;
      onScored?.(headline, score);
    }
  }

  const pool = Array.from({ length: Math.min(CONCURRENCY, headlines.length) }, worker);
  await Promise.all(pool);
}
