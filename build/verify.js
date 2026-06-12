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

  console.log(failures === 0 ? '\nPASS — rendered output is visually identical.' : `\nFAIL — ${failures} difference(s).`);
  process.exit(failures === 0 ? 0 : 1);
}, 700);
