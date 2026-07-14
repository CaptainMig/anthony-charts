// ---------------------------------------------------------------------------
// Auto-escalation — after each sweep, every row whose headline-only verdict is
// PROVISIONAL, MISLEADING, or CONTESTED is queued for full-text scoring in the
// background: extract the article body, score headline-vs-body, persist the
// verdict (local + server via the caller's onVerdict). The dash updates as
// each verdict lands; rows outside these verdicts are never escalated, so
// opening them stays exactly as instant as before.
//
// Deliberately gentle: strictly serial with a fixed gap between items. A full
// sweep flags a modest fraction of ~200 headlines, so the queue drains in a
// few minutes — well inside /api/score's 200/min budget and never hammering
// publisher sites through /api/extract.
//
// Failures (paywall stubs, extraction timeouts, scoring errors) are skipped
// silently — the row keeps its sweep verdict, exactly as if never escalated.
// A session-scoped attempted set stops the same dead link from being re-hit
// by every subsequent sweep in this tab; a fresh session may retry it.
// ---------------------------------------------------------------------------
import { articleId } from './article.js';

// Sweep verdicts that warrant a full-text check: suspected-but-unconfirmed
// distortion (PROVISIONAL), legacy MISLEADING rows from old cached scans, and
// disputed framing (CONTESTED) where the body decides how flat the dispute is.
export const ESCALATE_VERDICTS = new Set(['PROVISIONAL', 'MISLEADING', 'CONTESTED']);

const RATE_MS = 2000; // gap between queue items
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const attempted = new Set(); // links tried this session — hit once, not per sweep

// Should this row join the escalation queue? `have` is the current full-text
// verdict map (local + server merged) keyed by article id.
export function needsEscalation(h, have) {
  return (
    ESCALATE_VERDICTS.has(h.score?.verdict) &&
    !have[articleId(h.link)] &&
    !attempted.has(h.link)
  );
}

/**
 * Drain the escalation queue: serial, rate-limited full-text scoring.
 *
 * @param rows        headline rows to escalate.
 * @param onVerdict   (link, { score, chars }) => void — a verdict landed.
 * @param onProgress  ({ done, total, updated }) => void — after every item.
 * @param shouldStop  () => boolean — abandon the queue (e.g. a new scan started).
 * @returns number of verdicts that landed.
 */
export async function escalateRows(rows, { onVerdict, onProgress, shouldStop } = {}) {
  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    if (shouldStop?.()) return updated;
    const h = rows[i];
    attempted.add(h.link);
    try {
      const ex = await fetch(`/api/extract?url=${encodeURIComponent(h.link)}`).then((r) => r.json());
      if (ex?.ok && !shouldStop?.()) {
        const sc = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headline: h.title, article: ex.text, mode: 'fulltext' }),
        }).then((r) => r.json());
        if (sc && !sc.fallback && sc.verdict) {
          onVerdict?.(h.link, {
            score: {
              verdict: sc.verdict,
              truth: sc.truth,
              sens: sc.sens,
              click: sc.click,
              rationale: sc.rationale,
            },
            chars: ex.chars,
          });
          updated++;
        }
      }
    } catch {
      /* skipped — the row keeps its sweep verdict */
    }
    onProgress?.({ done: i + 1, total: rows.length, updated });
    if (i < rows.length - 1) await sleep(RATE_MS);
  }
  return updated;
}
