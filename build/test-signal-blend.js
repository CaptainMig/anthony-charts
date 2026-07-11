#!/usr/bin/env node
/*
 * Task 4 guard proof: the Info Integrity × Signal blend applies only when
 * the flag is on AND the aggregate is fresh (<48h) AND the sample is big
 * enough (scored >= min_scored). Everything else falls back to the prior
 * three-source composite untouched.
 *
 *     node build/test-signal-blend.js
 */
const fs = require('fs');
const path = require('path');
const { applySignalBlend } = require('./signal-blend.js');

const ROOT = path.join(__dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issue-data.json'), 'utf8'));
const loadEnabled = () => {
  const d = load();
  d.signal_blend.enabled = true;
  return d;
};

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log('✓ ' + name);
  else {
    failures++;
    console.log('✗ ' + name + (detail ? ` — ${detail}` : ''));
  }
}

const NOW = Date.parse('2026-07-10T12:00:00Z');
const fresh = {
  asOf: '2026-07-10T09:00:00Z',
  windowHours: 24,
  scored: 96,
  total: 120,
  meanIntegrity: 71.4,
  medianIntegrity: 73,
};

// 1. Committed flag state is OFF: even a perfect aggregate is a no-op.
{
  const d = load();
  const r = applySignalBlend(d, fresh, { now: NOW });
  check('committed flag is disabled → not applied', !r.applied && /disabled/.test(r.reason), r.reason);
  check('flag actually committed false', load().signal_blend.enabled === false);
}

// 2. Enabled + fresh + big sample: applied, every derived region moves.
{
  const d = loadEnabled();
  const before = load();
  const r = applySignalBlend(d, fresh, { now: NOW });
  const c = before.signal_blend.components;
  const w = before.signal_blend.weights;
  const expected =
    Math.round((w.ifcn * c.ifcn + w.rsf * c.rsf + w.newsguard * c.newsguard + w.signal * fresh.meanIntegrity) * 10) / 10;
  check('fresh + big sample → applied', r.applied === true, r.reason);
  check(`blended value = ${expected}`, r.blended === expected, String(r.blended));
  const tile = d.tiles.find((t) => t.key === 'truth');
  check('meter tile updated', tile.val === `${expected}%`, tile.val);
  check('arc updated', d.arcs.find((a) => a[0] === 'arcTruth')[2] === Math.round(expected) / 100);
  check('ticker updated', d.ticker.some((t) => t.includes(`${expected}%`)));
  const wts = d.drawers.truth.weights;
  check(
    `drawer WEIGHTS block: 4 inputs, SIGNAL at ${Math.round(w.signal * 100)}%`,
    wts && wts.inputs.length === 4 && /SIGNAL/i.test(wts.inputs[3].name) && wts.inputs[3].weight === w.signal && wts.final === expected
  );
  const wSum = wts.inputs.reduce((s, i) => s + i.weight, 0);
  check('blended weights sum to 100%', Math.abs(wSum - 1) < 1e-9, String(wSum));
  check('drawer method carries the dated methodology note', d.drawers.truth.method.includes('JUL 2026'));
  check('composites untouched by the blend', JSON.stringify(d.composite) === JSON.stringify(before.composite));
}

// 3. Stale aggregate (>48h): rejected, data untouched.
{
  const d = loadEnabled();
  const r = applySignalBlend(d, { ...fresh, asOf: '2026-07-07T09:00:00Z' }, { now: NOW });
  check('stale (>48h) → falls back to three-source composite', !r.applied && /stale/.test(r.reason), r.reason);
  const pristine = loadEnabled();
  check('stale rejection leaves data untouched', JSON.stringify(d) === JSON.stringify(pristine));
}

// 4. Thin sample (scored < min_scored): rejected.
{
  const r = applySignalBlend(loadEnabled(), { ...fresh, scored: 12 }, { now: NOW });
  check('thin sample (<30) → falls back', !r.applied && /thin/.test(r.reason), r.reason);
}

// 5. Missing aggregate / the committed static seed: rejected.
{
  check('null aggregate (endpoint down) → falls back', !applySignalBlend(loadEnabled(), null, { now: NOW }).applied);
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'signal/public/aggregate.json'), 'utf8'));
  const r = applySignalBlend(loadEnabled(), seed, { now: NOW });
  check('committed aggregate.json seed trips the guard', !r.applied, r.reason);
}

// 6. v18: the weight chips and drawer render straight from drawers.truth.weights,
//    so an applied blend needs no template anchor — prove the shape the
//    renderer consumes ({short|name, weight}) is intact after a blend.
{
  const d = loadEnabled();
  applySignalBlend(d, fresh, { now: NOW });
  const ok = d.drawers.truth.weights.inputs.every((i) => (i.short || i.name) && typeof i.weight === 'number');
  check('blended inputs carry the {short|name, weight} shape the page renders from', ok);
}

console.log(failures === 0 ? '\nPASS — blend guard behaves.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
