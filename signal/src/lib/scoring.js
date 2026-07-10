// ---------------------------------------------------------------------------
// Headline scoring — calls the serverless proxy (/api/score), one call per
// headline, through a fixed-concurrency worker pool. The Anthropic key lives
// only on the server; nothing sensitive is in this bundle.
// ---------------------------------------------------------------------------
import { CONCURRENCY } from '../config.js';

const ENDPOINT = '/api/score';
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The honest failure marker. NEVER a default score dressed up as a verdict —
// UNSCORED rows render grey and are excluded from every average, and the app
// runs one retry pass over them after the first sweep completes.
export function unscoredMarker(reason) {
  return {
    verdict: 'UNSCORED',
    unscored: true,
    truth: null,
    sens: null,
    click: null,
    rationale: `not scored (${reason})`,
  };
}

// True for rows that carry a real model verdict. Also rejects the legacy
// `failed: true` fallback rows that older cached scans may still contain.
export function isRealScore(score) {
  return !!score && !score.unscored && !score.failed;
}

// Score one headline via the proxy. Retries throttling/server errors with
// exponential backoff + jitter; gives up on auth/bad-request errors (they
// won't fix themselves). A structured server fallback ({ok:false} — upstream
// timeout/error after the server burned its own 25s budget) is returned as
// UNSCORED immediately; the caller's post-sweep retry pass picks it up.
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
        if (score?.fallback) {
          console.warn(`[signal] /api/score fallback (${score.reason}): ${score.detail || ''}`);
          return unscoredMarker(score.reason || 'error');
        }
        if (!score || !score.verdict) throw new Error('response missing verdict');
        return score;
      }

      const detail = await res.json().catch(() => ({}));
      // Auth / bad request won't recover on retry — stop and surface it.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        console.warn(`[signal] /api/score ${res.status} (not retrying): ${detail.error || ''}`);
        break;
      }
      // 429 / 5xx — retryable.
      throw new Error(`HTTP ${res.status}${detail.error ? ` — ${detail.error}` : ''}`);
    } catch (err) {
      lastErr = err;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      // 0.5s, 1s, 2s (+ jitter) — eases throttling from our proxy or Anthropic.
      await sleep(500 * 2 ** attempt + Math.random() * 250);
    }
  }

  console.warn('[signal] /api/score failed after retries, marking UNSCORED:', lastErr?.message || lastErr);
  return unscoredMarker('proxy unreachable');
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
