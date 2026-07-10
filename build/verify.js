#!/usr/bin/env node
/*
 * v17 DOM-diff proof.
 *
 * Renders the reference page (the page as it was before generation) and the
 * freshly generated public/index.html in a real DOM (jsdom), runs their
 * scripts, normalizes the one volatile element (the live clock), then asserts
 * the rendered DOM is identical — first the page itself, then every drawer
 * opened in turn. Exits non-zero on any difference.
 *
 *   node build/verify.js [referenceFile]
 *
 * referenceFile defaults to build/template.html (the snapshot the generator
 * was built from), so a clean run proves the generator reproduces the page
 * exactly. Pass a different reference to see only the values you changed.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const refFile = process.argv[2] || path.join(__dirname, 'template.html');
const genFile = path.join(ROOT, 'public/index.html');

function render(file) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { runScripts: 'dangerously', url: 'https://anthonycharts.com/' });
  const w = dom.window;
  w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  w.scrollTo = () => {};
  w.dispatchEvent(new w.Event('load'));
  return dom;
}

// Blank the volatile live-clock nodes and reset the time-based animation
// styles (arc dashoffsets, bar widths) so neither wall-clock time nor the
// animation race between two separately-timed renders is compared.
function normalize(doc) {
  ['lastUpdated', 'liveDate'].forEach(id => {
    const el = doc.getElementById(id);
    if (el) el.textContent = '';
  });
  doc.querySelectorAll('path[id]').forEach(p => p.removeAttribute('style'));
  doc.querySelectorAll('.meter-bar-fill').forEach(b => b.setAttribute('style', 'width:0%'));
  // The trend chart module renders itself from window.AC_TREND, which the
  // generator intentionally replaces with the real ledger series — so its
  // generated DOM legitimately differs from the template's inline-fallback
  // render. Blank it here; the injected series is verified separately below.
  const trend = doc.getElementById('ac-trend');
  if (trend) trend.innerHTML = '';
  // Blank behavioural script source (the generator reformats the DD/ARCS
  // literals as JSON — same effect, different text). JSON-LD is kept and
  // compared since it is content. Drawer data and arc values are verified
  // separately below.
  doc.querySelectorAll('script').forEach(s => {
    if (!/application\/ld\+json/.test(s.getAttribute('type') || '') && !s.getAttribute('src')) s.textContent = '';
  });
  return doc.documentElement.outerHTML;
}

// Pull the ARCS table out of a page's raw source and parse it.
function arcsOf(file) {
  const m = fs.readFileSync(file, 'utf8').match(/const ARCS=(\[[\s\S]*?\]);/);
  return JSON.parse(JSON.stringify(eval(m[1])));
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return { i, a: a.slice(Math.max(0, i - 60), i + 60), b: b.slice(Math.max(0, i - 60), i + 60) };
}

const refDom = render(refFile);
const genDom = render(genFile);

let failures = 0;

setTimeout(() => {
  // 1) Whole-page DOM
  const ref = normalize(refDom.window.document);
  const gen = normalize(genDom.window.document);
  if (ref === gen) {
    console.log('✓ page DOM identical');
  } else {
    failures++;
    const d = firstDiff(ref, gen);
    console.log(`✗ page DOM differs at offset ${d.i}`);
    console.log('  reference: …' + d.a + '…');
    console.log('  generated: …' + d.b + '…');
  }

  // 2) Every drawer, opened. DD is a lexical const (not a window property),
  // so reach it through the window's own eval.
  const keys = genDom.window.eval('Object.keys(DD)');
  let drawerFails = 0;
  for (const key of keys) {
    try {
      refDom.window.openDrawer(key);
      genDom.window.openDrawer(key);
      const r = refDom.window.document.getElementById('drawer').innerHTML;
      const g = genDom.window.document.getElementById('drawer').innerHTML;
      if (r !== g) {
        drawerFails++;
        const d = firstDiff(r, g);
        console.log(`✗ drawer "${key}" differs at offset ${d.i}`);
        console.log('  reference: …' + d.a + '…');
        console.log('  generated: …' + d.b + '…');
      }
    } catch (e) {
      drawerFails++;
      console.log(`✗ drawer "${key}" threw: ${e.message}`);
    }
  }
  if (keys.length && drawerFails === 0) console.log(`✓ all ${keys.length} drawers render identical`);
  failures += drawerFails;

  // 3) Arc table values (drive the gauge fills; not in the visual DOM compare)
  const arcRef = JSON.stringify(arcsOf(refFile));
  const arcGen = JSON.stringify(arcsOf(genFile));
  if (arcRef === arcGen) {
    console.log('✓ arc table values identical');
  } else {
    failures++;
    console.log('✗ arc table differs\n  reference: ' + arcRef + '\n  generated: ' + arcGen);
  }

  // 4) Injected trend series: the generated page's chart config must start at
  //    the 2015 baseline, be strictly ascending in time, end on the ledger's
  //    last row, and carry a projection stitched to that row.
  try {
    const cfg = genDom.window.AC_TREND;
    const csv = fs.readFileSync(path.join(ROOT, 'public/data/scores-history.csv'), 'utf8').trim().split(/\r?\n/);
    const cols = csv[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const last = csv[csv.length - 1].split(',').map(s => s.replace(/^"|"$/g, '').trim());
    const lastEdge = parseFloat(last[cols.indexOf('world_on_edge')]);
    const lastGood = parseFloat(last[cols.indexOf('world_goodness')]);
    const H = cfg.historical;
    const problems = [];
    if (H[0][0] !== 2015) problems.push(`first row t=${H[0][0]}, expected 2015`);
    for (let i = 1; i < H.length; i++) if (H[i][0] <= H[i - 1][0]) problems.push(`t not ascending at index ${i}`);
    const end = H[H.length - 1];
    if (end[1] !== lastEdge || end[2] !== lastGood) problems.push(`endpoint ${end[1]}/${end[2]}, ledger says ${lastEdge}/${lastGood}`);
    if (JSON.stringify(cfg.projection[0]) !== JSON.stringify(end)) problems.push('projection not stitched to last historical row');
    if (!cfg.events || !cfg.events.length) problems.push('inline events were lost in the merge');
    if (!cfg.explainer || !cfg.explainer.desc) problems.push('inline explainer was lost in the merge');
    if (problems.length) {
      failures++;
      console.log('✗ trend series: ' + problems.join('; '));
    } else {
      console.log(`✓ trend series: ${H.length} rows, endpoint ${end[1]}/${end[2]} matches ledger, projection stitched`);
    }
  } catch (e) {
    failures++;
    console.log('✗ trend series check threw: ' + e.message);
  }

  console.log(failures === 0 ? '\nPASS — rendered output is visually identical.' : `\nFAIL — ${failures} difference(s).`);
  process.exit(failures === 0 ? 0 : 1);
}, 700);
