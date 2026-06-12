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
 * meta tags, methodology footer, chart NOW labels, the flicker target and
 * the banner) is regenerated from the JSON. Nothing else in the page is
 * touched. Each substitution asserts its match count, so a template change
 * that breaks an anchor fails loudly instead of silently skipping.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issue-data.json'), 'utf8'));
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

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
sub(/(<text x="836" y="56"[^>]*>)\d+(<\/text>)/, (m, a, b) => a + E + b, 1, 'chart-edge');
sub(/(<text x="836" y="123"[^>]*>)\d+(<\/text>)/, (m, a, b) => a + G + b, 1, 'chart-good');
sub(/getElementById\('edgeNum'\)\.textContent=\d+;/, () => `getElementById('edgeNum').textContent=${E};`, 1, 'flick-edge');
sub(/getElementById\('goodNum'\)\.textContent=\(\d+\+/, () => `getElementById('goodNum').textContent=(${G}+`, 1, 'flick-good');

// ── Banner ──
if (/['\\]/.test(data.banner.raw)) throw new Error('[build] banner contains a quote/backslash; escape it before inlining');
sub(/textContent='[^']*Day \d+[^']*?'\+ds/, () => `textContent='${data.banner.raw}'+ds`, 1, 'banner');

fs.writeFileSync(path.join(ROOT, 'public/index.html'), html);
console.log(`[build] wrote public/index.html (${html.length} bytes) from data/issue-data.json`);
