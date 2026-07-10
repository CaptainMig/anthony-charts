#!/usr/bin/env node
/*
 * AnthonyCharts v17 build-time generator.
 *
 * Single source of truth:  data/issue-data.json
 * Static skeleton (CSS/layout/SVG): build/template.html
 * Output (deployed page): public/index.html
 *
 * To publish an issue update: edit data/issue-data.json, then run:
 *     node build/build.js
 *     node build/verify.js     # proves the rendered DOM only changed where intended
 *
 * Every value-bearing region (hero, meter tiles, ticker, drawers, arcs,
 * meta tags, methodology footer, the trend chart series, the flicker target
 * and the banner) is regenerated from the JSON (plus, for the trend chart,
 * the append-only ledger public/data/scores-history.csv). Nothing else in
 * the page is touched. Each substitution asserts its match count, so a template change
 * that breaks an anchor fails loudly instead of silently skipping.
 */
const fs = require('fs');
const path = require('path');
const { applySignalBlend, fetchAggregate } = require('./signal-blend.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issue-data.json'), 'utf8'));
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

// ── Info Integrity × Signal blend (Task 4 plumbing; flag in issue-data) ──
// Runs BEFORE the substitutions so an applied blend flows through the normal
// tile/ticker/drawer/arc regeneration. Behind signal_blend.enabled (weights
// are locked until the new split is signed off); a stale (>48h) or thin
// (<min_scored) aggregate falls back to the three-source composite and logs
// why — a thin sample never moves the published meter.
async function blendSignal() {
  if (!data.signal_blend || !data.signal_blend.enabled) {
    return { applied: false, reason: 'disabled (signal_blend.enabled=false)' };
  }
  const aggregate = await fetchAggregate(data.signal_blend.url);
  return applySignalBlend(data, aggregate);
}

// Replace `re` with `fn`, asserting it matched exactly `expected` times.
function sub(re, fn, expected, label) {
  // Count real matches with a global clone (plain .match() also returns capture
  // groups for non-global regexes, which would miscount).
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const n = (html.match(g) || []).length;
  if (n !== expected) {
    throw new Error(`[build] ${label}: expected ${expected} match(es), found ${n}`);
  }
  html = html.replace(re, fn);
}

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  const blend = await blendSignal();
  console.log(blend.applied
    ? `[build] Info Integrity blended with Signal: ${blend.blended}%`
    : `[build] Signal blend not applied — ${blend.reason}; keeping the three-source composite`);

  // ── Meter tiles (regenerated per card, anchored by drawer key) ──
  function card(t) {
    return `<div class="meter-card" onclick="openDrawer('${t.key}')">`
      + `<div class="meter-top"><div><div class="meter-name">${t.name}</div>`
      + `<div class="meter-cadence">${t.cadence}</div></div>`
      + `<span class="meter-icon">${t.icon}</span></div>`
      + `<div class="arc-zone"><svg class="arc-svg" viewBox="0 0 140 85" width="155">`
      + `<path class="arc-bg-t" stroke-width="10" d="M 16 78 A 54 54 0 0 1 124 78"/>`
      + `<path class="${t.arcClass}" id="${t.arcId}" stroke-width="10" d="M 16 78 A 54 54 0 0 1 124 78" stroke-dasharray="170" stroke-dashoffset="170"/>`
      + `</svg></div>`
      + `<div class="meter-bottom"><div><div class="${t.valClass}"${t.valStyle ? ` style="${t.valStyle}"` : ''}>${t.val}</div>`
      + `<div class="meter-unit">${t.unit}</div></div>`
      + `<div class="${t.trendClass}"${t.trendStyle ? ` style="${t.trendStyle}"` : ''}>${t.trend}</div></div>`
      + `<div class="meter-bar-bg"><div class="${t.barClass}" style="width:0%" data-w="${t.barW}"></div></div>`
      + `</div>`;
  }
  data.tiles.forEach(t => {
    const re = new RegExp(`<div class="meter-card" onclick="openDrawer\\('${t.key}'\\)">[\\s\\S]*?data-w="[^"]*"></div></div></div>`);
    sub(re, () => card(t), 1, `tile:${t.key}`);
  });

  // ── Hero cards (regenerated, value/status/desc from composite) ──
  const HERO = {
    edge: { mlabel: 'World On Edge Index', emoji: '😰', numId: 'edgeNum', numCls: 'big-num-edge', statCls: 'big-status-edge', arcCls: 'a-edge', arcId: 'hEdgeArc' },
    good: { mlabel: 'World Goodness Index', emoji: '💚', numId: 'goodNum', numCls: 'big-num-good', statCls: 'big-status-good', arcCls: 'a-good', arcId: 'hGoodArc' },
  };
  function hero(side) {
    const c = data.composite[side], h = HERO[side];
    return `<div class="hero-card hero-card-${side}" onclick="openDrawer('${side}')">`
      + `<div class="hero-mlabel">${h.mlabel}</div><span class="hero-emoji">${h.emoji}</span>`
      + `<svg viewBox="0 0 200 120" width="210" style="overflow:visible;">`
      + `<path class="arc-bg-t" stroke-width="13" d="M 20 110 A 80 80 0 0 1 180 110"/>`
      + `<path class="arc-fill-t ${h.arcCls}" id="${h.arcId}" stroke-width="13" d="M 20 110 A 80 80 0 0 1 180 110" stroke-dasharray="251" stroke-dashoffset="251"/>`
      + `</svg>`
      + `<div class="big-num ${h.numCls}" id="${h.numId}">${c.num}</div>`
      + `<div class="big-status ${h.statCls}">${c.status}</div>`
      + `<div class="hero-desc">${c.desc}</div>`
      + `<div class="click-hint">↑ Click for full detail + share</div></div>`;
  }
  sub(/<div class="hero-card hero-card-edge"[\s\S]*?↑ Click for full detail \+ share<\/div><\/div>/, () => hero('edge'), 1, 'hero-edge');
  sub(/<div class="hero-card hero-card-good"[\s\S]*?↑ Click for full detail \+ share<\/div><\/div>/, () => hero('good'), 1, 'hero-good');

  // ── Ticker (regenerated from the ticker array) ──
  sub(/<div class="ticker-inner" id="tickerInner">[\s\S]*?<\/div><\/div>/,
    () => '<div class="ticker-inner" id="tickerInner">'
      + data.ticker.map(t => `<div class="ticker-item">${t}</div>`).join('')
      + '</div>',
    1, 'ticker');

  // ── Drawer data + arc table (regenerated as JS literals) ──
  sub(/const DD = \{[\s\S]*?\n\};/, () => 'const DD = ' + JSON.stringify(data.drawers) + ';', 1, 'DD');
  sub(/const ARCS=\[[\s\S]*?\];/, () => 'const ARCS=' + JSON.stringify(data.arcs) + ';', 1, 'ARCS');

  // ── Scalars derived from the canonical composite values ──
  const E = data.composite.edge.num;
  const G = data.composite.good.num;
  const C = data.composite.calm_pct;
  const TR = data.composite.trade_footer;

  sub(/World On Edge: \d+\/100\. World Goodness: \d+\/100/g, () => `World On Edge: ${E}/100. World Goodness: ${G}/100`, 3, 'meta');
  sub(/World On Edge \(\d+\)/, () => `World On Edge (${E})`, 1, 'mth-edge');
  sub(/World Goodness \(\d+\)/, () => `World Goodness (${G})`, 1, 'mth-good');
  sub(/Calm Window \(\d+%\)/, () => `Calm Window (${C}%)`, 1, 'mth-calm');
  sub(/Trade Stress \(\d+\)/, () => `Trade Stress (${TR})`, 1, 'mth-trade');
  // ── 10-year trend chart (window.AC_TREND injected before the module script) ──
  // The pre-ledger shape (Jan 2015 → late 2025) is the traced approximation from
  // the redesign prototype; every point from Issue 1 onward comes from the
  // append-only ledger public/data/scores-history.csv. The chart module keeps its
  // inline events/explainer/options and re-stitches the projection to the last
  // real row, so only `historical` is emitted here.
  const TREND_BASELINE = [
    [2015.0, 42, 38], [2015.5, 48, 37], [2016.0, 46, 40], [2016.5, 52, 41],
    [2017.0, 50, 42], [2017.5, 49, 43], [2018.0, 54, 44], [2018.5, 55, 45],
    [2019.0, 56, 45], [2019.5, 58, 44], [2020.1, 72, 38], [2020.5, 66, 41],
    [2020.9, 63, 46], [2021.5, 60, 48], [2022.15, 76, 44], [2022.7, 73, 45],
    [2023.2, 75, 45], [2023.8, 82, 44], [2024.3, 80, 46], [2024.8, 81, 46],
    [2025.3, 84, 46], [2025.45, 86, 46], [2025.8, 86, 47],
  ];
  function trendSeries() {
    const csv = fs.readFileSync(path.join(ROOT, 'public/data/scores-history.csv'), 'utf8')
      .trim().split(/\r?\n/);
    const cols = csv[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const di = cols.indexOf('date'), ei = cols.indexOf('world_on_edge'), gi = cols.indexOf('world_goodness');
    if (di < 0 || ei < 0 || gi < 0) throw new Error('[build] scores-history.csv: date/world_on_edge/world_goodness columns not found');
    // Decimal year, matching the chart module's own date mapping.
    const decYear = iso => {
      const [y, m, d] = iso.split('-').map(Number);
      return y + ((m - 1) + (d - 1) / 31) / 12;
    };
    const lastBase = TREND_BASELINE[TREND_BASELINE.length - 1][0];
    const rows = csv.slice(1).map(line => {
      const c = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
      const t = decYear(c[di]), e = parseFloat(c[ei]), g = parseFloat(c[gi]);
      if (!isFinite(t) || !isFinite(e) || !isFinite(g)) throw new Error(`[build] scores-history.csv: bad row: ${line}`);
      return [Math.round(t * 1000) / 1000, e, g];
    }).filter(r => r[0] > lastBase).sort((a, b) => a[0] - b[0]);
    if (!rows.length) throw new Error('[build] scores-history.csv: no ledger rows after the baseline series');
    return TREND_BASELINE.concat(rows);
  }
  sub(/window\.AC_TREND = null;\/\*BUILD:AC_TREND\*\//,
    () => 'window.AC_TREND = ' + JSON.stringify({ historical: trendSeries() }) + ';',
    1, 'AC_TREND');
  sub(/getElementById\('edgeNum'\)\.textContent=\d+;/, () => `getElementById('edgeNum').textContent=${E};`, 1, 'flick-edge');
  sub(/getElementById\('goodNum'\)\.textContent=\(\d+\+/, () => `getElementById('goodNum').textContent=(${G}+`, 1, 'flick-good');

  // ── Banner ──
  if (/['\\]/.test(data.banner.raw)) throw new Error('[build] banner contains a quote/backslash; escape it before inlining');
  sub(/textContent='[^']*Day \d+[^']*?'\+ds/, () => `textContent='${data.banner.raw}'+ds`, 1, 'banner');

  // Methodology page line — rewritten only when the blend actually applied
  // (unblended builds keep the locked three-source weights verbatim).
  if (blend.applied) {
    const bw = data.signal_blend.weights;
    sub(/Info Integrity \([\d.]+%\):<\/strong> IFCN \d+% · RSF \d+% · NewsGuard \d+%/,
      () => `Info Integrity (${blend.blended}%):</strong> IFCN ${Math.round(bw.ifcn * 100)}% · `
        + `RSF ${Math.round(bw.rsf * 100)}% · NewsGuard ${Math.round(bw.newsguard * 100)}% · `
        + `Signal ${Math.round(bw.signal * 100)}%<br><em>${data.signal_blend.note}</em>`,
      1, 'mth-truth');
  }

  fs.writeFileSync(path.join(ROOT, 'public/index.html'), html);
  console.log(`[build] wrote public/index.html (${html.length} bytes) from data/issue-data.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
