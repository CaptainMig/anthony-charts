// ---------------------------------------------------------------------------
// Permutation test — does the slam → sensationalism gap on the CURRENT scan
// exceed what random label assignment would produce? This is a falsification
// hook: it can (and should be able to) come back NEGATIVE. It says nothing
// about future scans — only whether THIS scan's gap is distinguishable from
// sampling noise.
// ---------------------------------------------------------------------------
import { mulberry32, seedFrom } from './prng.js';

const MIN_GROUP = 5; // too few flagged/unflagged headlines to test meaningfully

/**
 * Two-sided permutation test of mean(values | group) − mean(values | !group).
 * @param group   per-headline boolean (e.g. slam-flagged).
 * @param values  per-headline number (e.g. sensationalism score).
 * @returns { observedDiff, p, n_flagged, n_rest } or { underpowered: true, ... }.
 */
export function permutationTest(group, values, { iterations = 5000 } = {}) {
  const n = group.length;
  const flagged = [];
  for (let i = 0; i < n; i++) if (group[i]) flagged.push(i);
  const n_flagged = flagged.length;
  const n_rest = n - n_flagged;

  if (n_flagged < MIN_GROUP || n_rest < MIN_GROUP) {
    return { underpowered: true, n_flagged, n_rest };
  }

  let sumFlagged = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += values[i];
    if (group[i]) sumFlagged += values[i];
  }
  const observedDiff = sumFlagged / n_flagged - (total - sumFlagged) / n_rest;
  const absObs = Math.abs(observedDiff);

  // Null: randomly reassign which headlines are "flagged" and recompute the gap.
  const rand = mulberry32(seedFrom(group, values));
  const order = Array.from({ length: n }, (_, i) => i);
  let count = 0;

  for (let it = 0; it < iterations; it++) {
    // Partial Fisher–Yates: first n_flagged slots become a uniform random subset.
    for (let i = 0; i < n_flagged; i++) {
      const j = i + ((rand() * (n - i)) | 0);
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    let s = 0;
    for (let i = 0; i < n_flagged; i++) s += values[order[i]];
    const diff = s / n_flagged - (total - s) / n_rest;
    if (Math.abs(diff) >= absObs) count++;
  }

  return { observedDiff, p: count / iterations, n_flagged, n_rest };
}
