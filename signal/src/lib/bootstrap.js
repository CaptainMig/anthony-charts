// ---------------------------------------------------------------------------
// Bootstrap confidence interval — quantifies the SAMPLING uncertainty of a
// statistic computed on the CURRENT scan. This is uncertainty on the
// measurement, not a forecast: it describes how much the point estimate would
// wobble if we redrew this same-size sample, nothing about any future scan.
// ---------------------------------------------------------------------------
import { mulberry32, seedFrom } from './prng.js';

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Percentile-method bootstrap CI.
 * @param values  array of numbers (e.g. per-headline 0/1).
 * @param statFn  statistic to compute on a resample (e.g. mean ×100).
 * @returns { point, lo, hi } — observed estimate + 95% interval (alpha=0.05).
 */
export function bootstrapCI(values, statFn, { iterations = 2000, alpha = 0.05 } = {}) {
  const n = values.length;
  if (n === 0) return { point: 0, lo: 0, hi: 0 };

  const point = statFn(values);
  const rand = mulberry32(seedFrom(values)); // deterministic per scan
  const stats = new Array(iterations);
  const sample = new Array(n);

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      sample[i] = values[(rand() * n) | 0]; // resample WITH replacement
    }
    stats[it] = statFn(sample);
  }

  stats.sort((a, b) => a - b);
  return {
    point,
    lo: percentile(stats, alpha / 2),
    hi: percentile(stats, 1 - alpha / 2),
  };
}
