#!/usr/bin/env node
/*
 * v18 verification — data-tracing proof for the redesigned page.
 *
 * The v17 verifier diffed the template's own render against the generated
 * page; the v18 template is a skeleton with anchors, so instead this renders
 * the GENERATED page in a real DOM (jsdom) and proves every value-bearing
 * region traces to data/issue-data.json + the ledgers:
 *
 *   1. ticker derives from tiles/composite and loops seamlessly (2× items)
 *   2. Balance rings/net/bars/weights derive from composite + drawer weights
 *   3. all 16 metric cards show their tile values; sparklines exist ONLY for
 *      metrics with ≥3 real ledger points (guardrail 5)
 *   4. drawer opens for every meter with value, weights, share, history rules
 *   5. Signal × Trends carries the SAMPLE DATA label while sample=true
 *   6. weight chips match the drawers' locked weights (incl. Info Integrity,
 *      so a signal-blend flip flows through automatically)
 *   7. injected trend series: baseline start, ascending, ledger endpoint,
 *      stitched projection, events/explainer intact
 *   8. no old-layout remnants (theme toggle, arc gauges, event bubbles)
 *
 *     node build/verify.js        (needs jsdom via NODE_PATH or node_modules)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issue-data.json'), 'utf8'));
const pageSrc = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log('✓ ' + name);
  else {
    failures++;
    console.log('✗ ' + name + (detail ? ` — ${detail}` : ''));
  }
}

const dom = new JSDOM(pageSrc, { runScripts: 'dangerously', url: 'https://anthonycharts.com/' });
const w = dom.window;
w.scrollTo = () => {};
w.dispatchEvent(new w.Event('load'));

setTimeout(() => {
  const doc = w.document;
  const E = data.composite.edge.num, G = data.composite.good.num, C = Number(data.composite.calm_pct);

  // 1. ticker
  const tk = [...doc.querySelectorAll('.pg-tkitem')];
  check('ticker present and duplicated for seamless loop', tk.length === 20, `items ${tk.length}`);
  const tkText = tk.map((n) => n.textContent).join(' ');
  check('ticker carries composite + tile values', tkText.includes(`ON EDGE${E}`) || tkText.includes(String(E)), '');
  const t = Object.fromEntries(data.tiles.map((x) => [x.key, x]));
  check('ticker CO₂/temp/trade/calm values trace to data',
    tkText.includes(t.co2.val) && tkText.includes(t.temp.val) && tkText.includes(t.supply.val) && tkText.includes(`${C}%`));

  // 2. Balance
  const ringVals = [...doc.querySelectorAll('.pg-ringval')].map((n) => n.textContent);
  check('balance rings show composite values', ringVals.join(',') === `${E},${G}`, ringVals.join(','));
  const net = G - E;
  const netStr = (net < 0 ? '−' : net > 0 ? '+' : '') + Math.abs(net);
  check('net balance computed from indices', doc.querySelector('.pg-netval')?.textContent === netStr, doc.querySelector('.pg-netval')?.textContent);
  check('net bars widths = index values', pageSrc.includes(`width:${E}%;background:#ff2e6e`) && pageSrc.includes(`width:${G}%;background:#22e58e`));
  const wline = doc.querySelectorAll('.pg-idxweights')[0]?.textContent || '';
  const edgeW = data.drawers.edge.weights.inputs;
  check('edge weights line from drawer weights', edgeW.every((i) => wline.includes(`${i.short} ${Math.round(i.weight * 100)}%`)), wline);

  // 3. metric cards + sparkline honesty
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/scores-history.json'), 'utf8'));
  const series = {};
  for (const entry of ledger.issues) {
    for (const [k, m] of Object.entries(entry.meters || {})) {
      if (typeof m.value === 'number' && isFinite(m.value)) (series[k] = series[k] || []).push(m.value);
    }
  }
  const cards = [...doc.querySelectorAll('.pg-card')];
  check('16 metric cards render', cards.length === 16, String(cards.length));
  let cardFails = 0;
  for (const tile of data.tiles) {
    const card = cards.find((c) => c.getAttribute('data-meter') === tile.key);
    if (!card) { cardFails++; console.log(`  ✗ card missing: ${tile.key}`); continue; }
    if (!card.textContent.includes(tile.val)) { cardFails++; console.log(`  ✗ ${tile.key}: value ${tile.val} not shown`); }
    const hasSpark = !!card.querySelector('polyline');
    const shouldSpark = (series[tile.key] || []).length >= 3;
    if (hasSpark !== shouldSpark) { cardFails++; console.log(`  ✗ ${tile.key}: sparkline=${hasSpark}, real points=${(series[tile.key] || []).length}`); }
  }
  check('every card shows its tile value; sparklines only from ≥3 real ledger points', cardFails === 0, `${cardFails} problem(s)`);

  // 4. drawer, for every meter + both indices
  const M = w.AC_METERS;
  check('AC_METERS injected with updated date', !!M && !!M.updated && Object.keys(M.meters).length === 18, M && M.updated);
  let drawerFails = 0;
  for (const key of Object.keys(M.meters)) {
    try {
      w.pgOpenDrawer(key);
      const open = !doc.getElementById('dwr').hidden;
      const val = doc.getElementById('dwr-value').textContent;
      const histLine = !doc.getElementById('dwr-histsvg').hidden;
      const histPts = (M.meters[key].history || []).length;
      const shareHref = doc.getElementById('dwr-x-share').href;
      if (!open || val !== M.meters[key].value) { drawerFails++; console.log(`  ✗ drawer ${key}: open=${open} val=${val}`); }
      if (histLine !== histPts >= 3) { drawerFails++; console.log(`  ✗ drawer ${key}: history curve=${histLine} with ${histPts} real points`); }
      if (M.meters[key].share && !decodeURIComponent(shareHref).includes(M.meters[key].share.slice(0, 20))) {
        drawerFails++; console.log(`  ✗ drawer ${key}: share text not wired`);
      }
      w.pgCloseDrawer();
    } catch (e) {
      drawerFails++; console.log(`  ✗ drawer ${key} threw: ${e.message}`);
    }
  }
  check('drawer opens for all 18 meters with value/history-rule/share', drawerFails === 0, `${drawerFails} problem(s)`);
  const wRows = (() => { w.pgOpenDrawer('truth'); const n = doc.querySelectorAll('.dwr-wrow').length; w.pgCloseDrawer(); return n; })();
  check('Info Integrity drawer shows locked weights block', wRows === data.drawers.truth.weights.inputs.length, String(wRows));

  // 5. Signal × Trends honesty label + click-through contract
  const sig = doc.querySelector('.pg-signal-panel');
  if (data.signal_trends?.enabled) {
    const rows = data.signal_trends.rows;
    check('Signal × Trends renders its rows', !!sig && doc.querySelectorAll('.pg-sigrow').length === rows.length);
    check('SAMPLE DATA label present while sample=true',
      data.signal_trends.sample ? sig.textContent.includes('SAMPLE DATA') : !sig.textContent.includes('SAMPLE DATA'));
    // Headlines/rings link ONLY when the row carries a real destination —
    // a sample row must never link to a made-up article.
    const linked = doc.querySelectorAll('.pg-siglink').length;
    const ringLinks = [...doc.querySelectorAll('.pg-sigrow > a')].length;
    check('headline links match rows with a real `link`', linked === rows.filter((r) => r.link).length, `${linked} anchors`);
    check('score-ring links match rows with a real `signalUrl`', ringLinks === rows.filter((r) => r.signalUrl).length, `${ringLinks} anchors`);
    const srcLink = doc.querySelector('.pg-sigsrclink');
    check('SIGNAL SCANNER in footer links to anthony-signal',
      !!srcLink && srcLink.href === 'https://anthony-signal.vercel.app/' && srcLink.target === '_blank');
  } else {
    check('Signal × Trends hidden when disabled', !sig);
  }
  // Signal appears in Trusted Sources and the feed count derives from data
  const srcCells = [...doc.querySelectorAll('.pg-srccell')];
  check('Signal Scanner listed in Trusted Sources',
    srcCells.some((c) => c.textContent.includes('Signal Scanner') && c.href === 'https://anthony-signal.vercel.app/'));
  check('source count derives from data',
    [...doc.querySelectorAll('.pg-secnote')].some((n) => n.textContent.includes(`${data.sources.length} FEEDS`)));

  // 6. weight chips trace to drawer weights (both footer + methodology page)
  const chips = [...doc.querySelectorAll('.pg-chip')].map((n) => n.textContent);
  const truthFormula = data.drawers.truth.weights.inputs.map((i) => `· ${(i.short || i.name).toUpperCase()} ${Math.round(i.weight * 100)}%`).join(' ');
  check('chips rendered twice (footer + methodology)', chips.length === 10, String(chips.length));
  check('Info Integrity chip matches locked drawer weights', chips.some((c) => c.includes('INFO INTEGRITY') && c.includes(truthFormula)), truthFormula);

  // 7. trend series (same contract as v17.1)
  try {
    const cfg = w.AC_TREND;
    const csv = fs.readFileSync(path.join(ROOT, 'public/data/scores-history.csv'), 'utf8').trim().split(/\r?\n/);
    const cols = csv[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
    const last = csv[csv.length - 1].split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    const lastEdge = parseFloat(last[cols.indexOf('world_on_edge')]);
    const lastGood = parseFloat(last[cols.indexOf('world_goodness')]);
    const H = cfg.historical;
    const problems = [];
    if (H[0][0] !== 2015) problems.push(`first row t=${H[0][0]}`);
    for (let i = 1; i < H.length; i++) if (H[i][0] <= H[i - 1][0]) problems.push(`t not ascending @${i}`);
    const end = H[H.length - 1];
    if (end[1] !== lastEdge || end[2] !== lastGood) problems.push(`endpoint ${end[1]}/${end[2]} vs ledger ${lastEdge}/${lastGood}`);
    if (JSON.stringify(cfg.projection[0]) !== JSON.stringify(end)) problems.push('projection not stitched');
    if (!cfg.events?.length || !cfg.explainer?.desc) problems.push('events/explainer lost');
    check(`trend series: ${H.length} rows, ledger endpoint, stitched projection`, problems.length === 0, problems.join('; '));
  } catch (e) {
    check('trend series check', false, e.message);
  }

  // 8. old layout fully gone
  check('no old-layout remnants (toggle/arcs/bubbles/fonts)',
    !/toggleMode|arc-fill-t|evt-bubble|Orbitron|body\.neon|cartoon/.test(pageSrc));

  console.log(failures === 0 ? '\nPASS — every rendered value traces to the data.' : `\nFAIL — ${failures} problem(s).`);
  process.exit(failures === 0 ? 0 : 1);
}, 700);
