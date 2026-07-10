// ---------------------------------------------------------------------------
// Info Integrity × Signal Scanner blend (Task 4 plumbing).
//
// The generator fetches Signal's /api/aggregate at build time and — ONLY when
// data/issue-data.json's signal_blend.enabled is true — re-weights the Info
// Integrity composite from IFCN 50 / RSF 30 / NewsGuard 20 to
// IFCN 40 / RSF 25 / NewsGuard 15 / SIGNAL 20.
//
// Published weights are locked, so this ships DISABLED until Anthony signs
// off on the new split; flipping the flag is the versioned methodology
// change (the drawer weights block, methodology line, and dated note are all
// emitted by this module when it applies).
//
// Guard (guardrail #4): a stale aggregate (>48h) or a thin sample
// (scored < min_scored, default 30) falls back to the prior three-source
// composite and says so on the console — a thin sample never moves the
// published meter.
// ---------------------------------------------------------------------------

const STALE_MS = 48 * 60 * 60 * 1000;
const round1 = (n) => Math.round(n * 10) / 10;

async function fetchAggregate(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Mutates `data` (the parsed issue-data.json) in place when the blend applies.
 * Pure with respect to I/O — unit-testable with fixture aggregates.
 *
 * @returns {{ applied: boolean, reason?: string, blended?: number }}
 */
function applySignalBlend(data, aggregate, { now = Date.now() } = {}) {
  const cfg = data.signal_blend;
  if (!cfg || !cfg.enabled) return { applied: false, reason: 'disabled (signal_blend.enabled=false)' };

  const w = cfg.weights || {};
  const c = cfg.components || {};
  const wSum = (w.ifcn || 0) + (w.rsf || 0) + (w.newsguard || 0) + (w.signal || 0);
  if (Math.abs(wSum - 1) > 1e-9) return { applied: false, reason: `weights sum to ${wSum}, not 1` };
  for (const k of ['ifcn', 'rsf', 'newsguard']) {
    if (!(c[k] >= 0 && c[k] <= 100)) return { applied: false, reason: `component ${k} missing/out of range` };
  }

  if (!aggregate) return { applied: false, reason: 'aggregate unavailable' };
  const asOf = Date.parse(aggregate.asOf);
  if (!Number.isFinite(asOf)) return { applied: false, reason: 'aggregate has no asOf timestamp' };
  if (now - asOf > STALE_MS) {
    return { applied: false, reason: `aggregate stale (asOf ${aggregate.asOf}, >48h old)` };
  }
  const minScored = cfg.min_scored ?? 30;
  if (!(aggregate.scored >= minScored)) {
    return { applied: false, reason: `thin sample (scored ${aggregate.scored ?? 0} < ${minScored})` };
  }
  const signal = aggregate.meanIntegrity;
  if (!(signal >= 0 && signal <= 100)) return { applied: false, reason: 'meanIntegrity missing/out of range' };

  const blended = round1(w.ifcn * c.ifcn + w.rsf * c.rsf + w.newsguard * c.newsguard + w.signal * signal);
  const pctLabel = `${blended}%`;

  // Meter tile + arc + bar.
  const tile = data.tiles.find((t) => t.key === 'truth');
  if (!tile) return { applied: false, reason: 'truth tile not found' };
  tile.val = pctLabel;
  tile.barW = `${Math.round(blended)}%`;
  const arc = data.arcs.find((a) => a[0] === 'arcTruth');
  if (arc) arc[2] = Math.round(blended) / 100;

  // Ticker line.
  const ti = data.ticker.findIndex((t) => t.includes('INFORMATION INTEGRITY'));
  if (ti !== -1) data.ticker[ti] = `🎯 INFORMATION INTEGRITY: ${pctLabel} composite · now includes Signal`;

  // Drawer: current value stat, current threshold, WEIGHTS block, dated method note.
  const drawer = data.drawers.truth;
  const stat = drawer.stats?.find((s) => s.lbl === 'Verified Claim Rate');
  if (stat) {
    stat.val = pctLabel;
    stat.lbl = 'Composite Integrity';
  }
  const th = drawer.thresholds?.levels?.find((l) => l.current);
  if (th) th.val = pctLabel;
  drawer.weights = {
    final: blended,
    inputs: [
      { name: 'IFCN claim accuracy rate', weight: w.ifcn, score: c.ifcn, color: '#ff6ec7' },
      { name: 'RSF Press Freedom Index (inverted)', weight: w.rsf, score: c.rsf, color: '#8bbef0' },
      { name: 'NewsGuard credibility average', weight: w.newsguard, score: c.newsguard, color: '#ffd700' },
      { name: 'Signal Scanner (24h mean integrity)', weight: w.signal, score: round1(signal), color: '#5aabb0' },
    ],
  };
  drawer.method =
    `Experimental composite: IFCN claim accuracy rate (${Math.round(w.ifcn * 100)}%) · ` +
    `RSF Press Freedom Index inverted (${Math.round(w.rsf * 100)}%) · ` +
    `NewsGuard credibility average (${Math.round(w.newsguard * 100)}%) · ` +
    `Signal Scanner 24h mean headline integrity (${Math.round(w.signal * 100)}%), ` +
    `${aggregate.scored} headlines scored in the window. ` +
    `${cfg.note} Weights at anthonycharts.com/composites-v1.0.json`;

  return { applied: true, blended };
}

module.exports = { applySignalBlend, fetchAggregate, STALE_MS };
