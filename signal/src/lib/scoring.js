// ---------------------------------------------------------------------------
// Headline scoring — calls the serverless proxy (/api/score), one call per
// headline, through a fixed-concurrency worker pool. The Anthropic key lives
// only on the server; nothing sensitive is in this bundle.
// ---------------------------------------------------------------------------
import { CONCURRENCY } from '../config.js';

const ENDPOINT = '/api/score';

// Score one headline via the proxy. Retries once; on total failure marks it
// UNVERIFIED so the row still renders.
async function scoreOne(headline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: headline.title, publication: headline.publication }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const score = await res.json();
      if (!score || !score.verdict) throw new Error('bad payload');
      return score;
    } catch (err) {
      if (attempt === 1) {
        // Final failure — degrade so the table still renders the row.
        return { verdict: 'UNVERIFIED', bias: 'CENTER', truth: 1, sens: 5, click: 5, failed: true };
      }
    }
  }
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
