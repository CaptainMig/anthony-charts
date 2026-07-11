#!/usr/bin/env node
/*
 * AnthonyCharts v18 build-time generator (redesign).
 *
 * Single source of truth:  data/issue-data.json
 * Metric history ledger:   public/data/scores-history.json (append-only; this
 *                          generator appends the current issue's snapshot)
 * Trend series ledger:     public/data/scores-history.csv (append-only)
 * Static skeleton:         build/template.html (anchors: <!--BUILD:*--> and
 *                          window.AC_* = null;/*BUILD:*<slash>)
 * Output (deployed page):  public/index.html
 *
 * Publish an issue update: edit data/issue-data.json (+ append the CSV row),
 * run `node build/build.js`, then `node build/verify.js`.
 *
 * Every value-bearing region — ticker, Signal × Trends, Balance rings, the 16
 * metric cards + sparklines, trend chart series, Trusted Sources, weight
 * chips, methodology page, drawer data (window.AC_METERS), meta tags — is
 * generated from the JSON + ledgers. Each substitution asserts its match
 * count, so a broken anchor fails loudly instead of silently skipping.
 */
const fs = require('fs');
const path = require('path');
const { applySignalBlend, fetchAggregate } = require('./signal-blend.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/issue-data.json'), 'utf8'));
let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

// Replace `re` with `fn`, asserting it matched exactly `expected` times.
function sub(re, fn, expected, label) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const n = (html.match(g) || []).length;
  if (n !== expected) {
    throw new Error(`[build] ${label}: expected ${expected} match(es), found ${n}`);
  }
  html = html.replace(re, fn);
}
// Anchor comment replacement (exact string, must appear exactly once).
function fill(anchor, content, label) {
  const needle = `<!--BUILD:${anchor}-->`;
  const n = html.split(needle).length - 1;
  if (n !== 1) throw new Error(`[build] ${label || anchor}: anchor found ${n} times, expected 1`);
  html = html.replace(needle, content);
}
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Info Integrity × Signal blend (flagged; see signal-blend.js) ──
async function blendSignal() {
  if (!data.signal_blend || !data.signal_blend.enabled) {
    return { applied: false, reason: 'disabled (signal_blend.enabled=false)' };
  }
  const aggregate = await fetchAggregate(data.signal_blend.url);
  return applySignalBlend(data, aggregate);
}

/* ================================================================
   Presentation tables — layout facts (labels, groupings, tints,
   source shorthands) that do not change per issue. Values never
   live here; they all come from issue-data + the ledgers.
   ================================================================ */
const SECTIONS = [
  { title: 'EARTH PULSE', tint: '#5eb9ff', keys: ['temp', 'sea', 'arctic', 'co2'] },
  { title: 'SPACE', tint: '#c58bff', keys: ['planet', 'neo', 'alien', 'solar'] },
  { title: 'HUMAN SYSTEMS', tint: '#ff8f5c', keys: ['truth', 'supply', 'gini', 'mobility', 'conflict', 'peace'] },
  { title: 'BIOSPHERE', tint: '#22e58e', keys: ['species', 'conserve'] },
];
const CARD_META = {
  temp: { label: 'GLOBAL TEMP ANOMALY', src: 'COPERNICUS C3S' },
  sea: { label: 'SEA LEVEL RISE', src: 'NASA / NOAA' },
  arctic: { label: 'ARCTIC SEA ICE', src: 'NSIDC' },
  co2: { label: 'CO₂ CONCENTRATION', src: 'NOAA MAUNA LOA' },
  planet: { label: 'EXOPLANET DISCOVERY', src: 'NASA ARCHIVE' },
  neo: { label: 'NEO WATCH', src: 'NASA CNEOS' },
  alien: { label: 'TECHNOSIGNATURES', src: 'BL / SETI' },
  solar: { label: 'SOLAR ACTIVITY', src: 'NOAA SWPC' },
  truth: { label: 'INFO INTEGRITY', src: 'IFCN / RSF' },
  supply: { label: 'TRADE STRESS', src: 'FREIGHTOS / PMI' },
  gini: { label: 'WEALTH INEQUALITY', src: 'WID.WORLD' },
  mobility: { label: 'SOCIAL MOBILITY', src: 'WORLD BANK' },
  conflict: { label: 'CONFLICT DEATHS', src: 'ACLED' },
  peace: { label: 'PEACEKEEPING', src: 'UN DPPA' },
  species: { label: 'SPECIES THREATENED', src: 'IUCN RED LIST' },
  conserve: { label: 'CONSERVATION', src: 'UNEP-WCMC' },
};
const TONE = { 't-up': 'bad', 't-dn': 'good', 't-warn': 'neutral' };
const TONE_CSS = {
  bad: 'color:#ff5c8f;background:rgba(255,46,110,0.1);border-color:rgba(255,46,110,0.35);',
  good: 'color:#22e58e;background:rgba(34,229,142,0.08);border-color:rgba(34,229,142,0.3);',
  neutral: 'color:#8fa2cf;background:rgba(120,150,255,0.06);border-color:rgba(120,150,255,0.18);',
};
// The Calm Window has no meter drawer; its published formula is stated here
// once (same text as composites-v1.0.json).
const CALM_FORMULA = '· GPR SLOPE 40% · ACLED TREND 40% · VOLATILITY 20%';

const tileByKey = Object.fromEntries(data.tiles.map((t) => [t.key, t]));
const arcByTile = Object.fromEntries(data.tiles.map((t) => [t.key, (data.arcs.find((a) => a[0] === t.arcId) || [])[2]]));
const E = data.composite.edge.num;
const G = data.composite.good.num;
const C = Number(data.composite.calm_pct);
const arrowOf = (key) => ({ up: '↑', 'up-good': '↑', down: '↓', 'down-bad': '↓', stable: '→' }[data.drawers[key]?.trend?.dir] || '→');
const toneOf = (t) => TONE[Object.keys(TONE).find((k) => t.trendClass.includes(k))] || 'neutral';
const cadenceOf = (t) => {
  const m = String(t.cadence).match(/Updated\s+([a-z\s]+?)(\s*·|$)/i);
  const w = m ? m[1].trim().toLowerCase() : 'per issue';
  return ({ monthly: 'MONTHLY', weekly: 'WEEKLY', daily: 'DAILY', quarterly: 'QUARTERLY', annually: 'ANNUAL', 'as reported': 'AS REPORTED' }[w] || w.toUpperCase());
};

/* ================================================================
   Metric history ledger — append-only. The current issue's numeric
   snapshot is appended once (idempotent by issue id); existing
   entries are NEVER rewritten. Sparklines render only from these
   real recorded points (guardrail 5: no invented curves).
   ================================================================ */
function numFromDisplay(s) {
  if (s == null) return null;
  const str = String(s).trim();
  const g = str.match(/^G(\d)/i); // solar geomagnetic scale G1..G5
  if (g) return Number(g[1]);
  const m = str.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/(\d)(\.\d+)?K\b/i.test(str.replace(/,/g, ''))) v *= 1000;
  return v;
}

function updateHistoryLedger() {
  const p = path.join(ROOT, 'public/data/scores-history.json');
  const ledger = JSON.parse(fs.readFileSync(p, 'utf8'));
  const meters = {};
  meters.edge = { value: E, display: String(E), arc_pct: E / 100 };
  meters.good = { value: G, display: String(G), arc_pct: G / 100 };
  meters.calm = { value: C, display: `${C}%`, arc_pct: C / 100 };
  for (const t of data.tiles) {
    meters[t.key] = { value: numFromDisplay(t.val), display: t.val, arc_pct: arcByTile[t.key] ?? null };
  }
  if (!ledger.issues.some((i) => String(i.issue) === String(data.issue.id))) {
    ledger.issues.push({ date: data.issue.date, issue: String(data.issue.id), label: data.issue.label || '', type: 'standard', meters });
    fs.writeFileSync(p, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`[build] scores-history.json: appended Issue ${data.issue.id} snapshot (${ledger.issues.length} entries)`);
  }
  // Per-key numeric series, ledger order. Nulls (unparseable displays like
  // "REC. LOW") are skipped — a gap, never a made-up point.
  const series = {};
  for (const entry of ledger.issues) {
    for (const [k, m] of Object.entries(entry.meters || {})) {
      if (typeof m.value === 'number' && isFinite(m.value)) (series[k] = series[k] || []).push(m.value);
    }
  }
  return series;
}

// 90×28 card sparkline points (same mapping as the design prototype).
function sparkPoints(arr) {
  const min = Math.min(...arr), max = Math.max(...arr), range = max - min || 1;
  return arr.map((v, i) => ((i / (arr.length - 1)) * 86 + 2).toFixed(1) + ',' + (24 - ((v - min) / range) * 20).toFixed(1)).join(' ');
}

/* ================================================================
   Module builders
   ================================================================ */
function buildTicker() {
  const t = tileByKey;
  const tradeLevel = (v) => (v >= 75 ? 'HIGH' : v >= 50 ? 'ELEVATED' : 'NORMAL');
  const calmLevel = (v) => (v >= 65 ? 'HIGH' : v >= 35 ? 'MODERATE' : 'LOW');
  const items = [
    { dot: '#ff5c8f', label: 'ON EDGE', value: `${E} ${arrowOf('edge')}` },
    { dot: '#22e58e', label: 'GOODNESS', value: `${G} ${arrowOf('good')}` },
    { dot: '#ffb02e', label: 'TEMP ANOMALY', value: `${t.temp.val}C` },
    { dot: '#22e58e', label: 'CO₂', value: `${t.co2.val} PPM` },
    { dot: '#5eb9ff', label: 'ARCTIC ICE', value: t.arctic.val },
    { dot: '#c58bff', label: 'EXOPLANETS', value: t.planet.val },
    { dot: '#ffd75e', label: 'SOLAR', value: `${t.solar.val} WATCH` },
    { dot: '#ff5c8f', label: 'CONFLICT DEATHS', value: `${t.conflict.val} YTD` },
    { dot: '#5eb9ff', label: 'TRADE STRESS', value: `${t.supply.val} · ${tradeLevel(numFromDisplay(t.supply.val))}` },
    { dot: '#c58bff', label: 'CALM WINDOW', value: `${C}% · ${calmLevel(C)}` },
  ];
  const item = (k) =>
    `<div class="pg-tkitem"><span class="pg-dot" style="background:${k.dot};"></span>` +
    `<span class="pg-tklabel">${escHtml(k.label)}</span>` +
    `<span class="pg-tkval" style="color:${k.dot};">${escHtml(k.value)}</span></div>`;
  // duplicated once so the 0→-50% marquee loops seamlessly
  return items.concat(items).map(item).join('');
}

function buildSignal() {
  const cfg = data.signal_trends;
  if (!cfg || !cfg.enabled) return '';
  const scoreColor = (s) => (s >= 85 ? '#22e58e' : s >= 70 ? '#ffd75e' : '#ff5c8f');
  const rows = (cfg.rows || [])
    .map((r) => {
      const dot = r.match ? '#ffd75e' : 'rgba(120,150,255,0.25)';
      const glow = r.match ? 'box-shadow:0 0 8px #ffd75e;' : '';
      const vel = r.match ? '#ffd75e' : '#8fa2cf';
      return (
        `<div class="pg-sigrow">` +
        `<span class="pg-sigscore" style="color:${scoreColor(r.score)};">${r.score}</span>` +
        `<div class="pg-sighead"><span class="pg-sightitle">${escHtml(r.headline)}</span>` +
        `<span class="pg-sigmeta">${escHtml(r.source)} · ${escHtml(r.time)} · SIGNAL INTEGRITY ${r.score}/100</span></div>` +
        `<div class="pg-sigtrends"><span class="pg-sigvel"><span class="pg-dot" style="background:${dot};${glow}"></span>` +
        `<span class="pg-sigvelval" style="color:${vel};">${escHtml(r.trend)}</span></span>` +
        `<span class="pg-sigquery">"${escHtml(r.query)}" · 7-DAY</span></div></div>`
      );
    })
    .join('');
  // Guardrail 5: the SAMPLE DATA label stays until a real pipeline feeds rows.
  const srcNote = 'SOURCES: SIGNAL SCANNER · GOOGLE TRENDS (US)' + (cfg.sample ? ' · SAMPLE DATA' : '');
  return (
    `<div class="pg-wrap" style="margin-top:32px;">` +
    `<div class="pg-sechead"><span class="pg-seclabel">SIGNAL × TRENDS — FEATURED HEADLINES</span><span class="pg-hair"></span>` +
    `<span class="pg-secnote"><span class="pg-dot" style="background:#ffd75e;box-shadow:0 0 6px #ffd75e;"></span>MATCHED RISING GOOGLE TRENDS QUERY</span></div>` +
    `<div class="pg-panel pg-signal-panel">${rows}` +
    `<div class="pg-sigfoot"><span>SELECTION: SIGNAL INTEGRITY ≥ 70 · RANKED BY TRENDS VELOCITY</span><span>${srcNote}</span></div></div></div>`
  );
}

function ringCard(key, tint, tintSoft, value, status, statusCss, weightsLine) {
  const deg = (value / 100) * 270;
  return (
    `<div class="pg-idxcard" style="border:1px solid ${tintSoft};">` +
    `<span class="pg-idxlabel">${key === 'edge' ? 'WORLD ON EDGE INDEX' : 'WORLD GOODNESS INDEX'}</span>` +
    `<div class="pg-ring"><div class="pg-ringfill" style="background:conic-gradient(from 135deg, ${tint} 0deg ${deg.toFixed(1)}deg, ${tintSoft.replace('0.25', '0.14')} ${deg.toFixed(1)}deg 270deg, transparent 270deg 360deg);filter:drop-shadow(0 0 12px ${tintSoft.replace('0.25', '0.45')});"></div>` +
    `<div class="pg-ringcenter"><span class="pg-ringval" style="color:${key === 'edge' ? '#ff5c8f' : '#22e58e'};">${value}</span><span class="pg-ringof">/ 100</span></div></div>` +
    `<span class="pg-statuschip" style="${statusCss}">${escHtml(status)}</span>` +
    `<span class="pg-idxweights">${escHtml(weightsLine)}</span>` +
    `<button type="button" class="pg-idxlink" data-meter="${key}">FULL DETAIL + SHARE →</button></div>`
  );
}

function buildBalance() {
  const wLine = (key) => data.drawers[key].weights.inputs.map((i) => `${i.short || i.name} ${Math.round(i.weight * 100)}%`).join(' · ');
  const edgeStatus = /[↑↓→↗↘]/.test(data.composite.edge.status) ? data.composite.edge.status : `${data.composite.edge.status} · ${arrowOf('edge')}`;
  const goodStatus = /[↑↓→↗↘]/.test(data.composite.good.status) ? data.composite.good.status : `${data.composite.good.status} · ${arrowOf('good')}`;
  const net = G - E;
  const netStr = (net < 0 ? '−' : net > 0 ? '+' : '') + Math.abs(net);
  const dom = E > G ? ['TENSION DOMINANT', '#ff5c8f'] : G > E ? ['GOODNESS DOMINANT', '#22e58e'] : ['BALANCED', '#8fa2cf'];
  return (
    ringCard('edge', '#ff2e6e', 'rgba(255,46,110,0.25)', E, edgeStatus, TONE_CSS.bad, wLine('edge')) +
    `<div class="pg-net"><span class="pg-netlabel">NET BALANCE</span><span class="pg-netval">${netStr}</span>` +
    `<span class="pg-netdom" style="color:${dom[1]};">${dom[0]}</span>` +
    `<div class="pg-netbars"><div class="pg-netbar"><div style="width:${E}%;background:#ff2e6e;"></div></div>` +
    `<div class="pg-netbar"><div style="width:${G}%;background:#22e58e;"></div></div></div>` +
    `<span class="pg-netcap">EDGE ${E} · GOODNESS ${G}</span></div>` +
    ringCard('good', '#22e58e', 'rgba(34,229,142,0.25)', G, goodStatus, TONE_CSS.good, wLine('good'))
  );
}

function buildSections(series) {
  return SECTIONS.map((sec) => {
    const cards = sec.keys
      .map((key) => {
        const t = tileByKey[key];
        const meta = CARD_META[key];
        const hist = series[key] || [];
        // Sparkline only from ≥3 real ledger points — otherwise the card
        // ships without one (an invented curve would violate guardrail 5).
        const spark = hist.length >= 3
          ? `<svg class="pg-cardspark" viewBox="0 0 90 28"><polyline points="${sparkPoints(hist)}" fill="none" stroke="${sec.tint}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"></polyline></svg>`
          : '';
        const tone = toneOf(t);
        return (
          `<button type="button" class="pg-card" data-meter="${key}">` +
          `<div class="pg-cardtop"><span class="pg-cardlabel">${escHtml(meta.label)}</span><span class="pg-cardcad">${escHtml(cadenceOf(t))}</span></div>` +
          `<div class="pg-cardmid"><div class="pg-cardvalwrap"><span class="pg-cardval">${escHtml(t.val)}</span>` +
          `<span class="pg-cardsub">${escHtml(String(t.unit).toUpperCase())}</span></div>${spark}</div>` +
          `<div class="pg-cardbot"><span class="pg-tone" style="${TONE_CSS[tone]}">${escHtml(String(t.trend).toUpperCase())}</span>` +
          `<span class="pg-cardsrc">${escHtml(meta.src)}</span></div></button>`
        );
      })
      .join('');
    return (
      `<div style="margin-top:32px;">` +
      `<div class="pg-sechead"><span style="display:flex;align-items:center;gap:8px;">` +
      `<span class="pg-dot" style="background:${sec.tint};box-shadow:0 0 6px ${sec.tint};"></span>` +
      `<span class="pg-seclabel">${sec.title}</span></span><span class="pg-hair"></span></div>` +
      `<div class="pg-cards">${cards}</div></div>`
    );
  }).join('');
}

function buildSources() {
  return data.sources
    .map(
      (s) =>
        `<a class="pg-srccell" href="${escHtml(s.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="pg-srctop"><span class="pg-srcname">${escHtml(s.name)}</span><span class="pg-srccad">${escHtml(s.cadence)}</span></span>` +
        `<span class="pg-srcdesc">${escHtml(s.desc)}</span></a>`
    )
    .join('');
}

function weightsFormula(key) {
  return data.drawers[key].weights.inputs.map((i) => `· ${(i.short || i.name).toUpperCase()} ${Math.round(i.weight * 100)}%`).join(' ');
}
function buildChips() {
  const chips = [
    { name: `ON EDGE ${E}`, formula: weightsFormula('edge') },
    { name: `GOODNESS ${G}`, formula: weightsFormula('good') },
    { name: `CALM WINDOW ${C}%`, formula: CALM_FORMULA },
    { name: `TRADE STRESS ${tileByKey.supply.val}`, formula: weightsFormula('supply') },
    { name: `INFO INTEGRITY ${tileByKey.truth.val}`, formula: weightsFormula('truth') },
  ];
  return chips.map((c) => `<span class="pg-chip"><b>${escHtml(c.name)}</b> ${escHtml(c.formula)}</span>`).join('');
}

function buildMethod() {
  return Object.entries(data.drawers)
    .map(
      ([key, d]) =>
        `<div class="pg-mth-item"><span class="pg-mth-name">${escHtml(d.title).toUpperCase()}</span>` +
        `<span class="pg-mth-text">${escHtml(d.method)}</span></div>`
    )
    .join('');
}

function buildMeters(series) {
  const updated = new Date(data.issue.date + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
  const meters = {};
  const weightsOf = (key) => {
    const w = data.drawers[key]?.weights;
    if (!w || !w.inputs?.length) return undefined;
    return w.inputs.map((i) => ({ name: (i.short || i.name).toUpperCase(), pct: Math.round(i.weight * 100) }));
  };
  for (const sec of SECTIONS) {
    for (const key of sec.keys) {
      const t = tileByKey[key];
      meters[key] = {
        label: CARD_META[key].label,
        value: t.val,
        sub: String(t.unit).toUpperCase(),
        delta: String(t.trend).toUpperCase(),
        tone: toneOf(t),
        tint: sec.tint,
        source: CARD_META[key].src,
        cadence: cadenceOf(t),
        history: series[key] || [],
        weights: weightsOf(key),
        share: data.drawers[key]?.share || '',
      };
    }
  }
  meters.edge = {
    label: 'WORLD ON EDGE INDEX', value: String(E),
    sub: `COMPOSITE · 0–100 · ${data.drawers.edge.weights.inputs.length} FEEDS`,
    delta: data.composite.edge.status, tone: 'bad', tint: '#ff2e6e',
    source: 'COMPOSITE', cadence: 'PER ISSUE',
    history: series.edge || [], weights: weightsOf('edge'), share: data.drawers.edge.share || '',
  };
  meters.good = {
    label: 'WORLD GOODNESS INDEX', value: String(G),
    sub: `COMPOSITE · 0–100 · ${data.drawers.good.weights.inputs.length} FEEDS`,
    delta: data.composite.good.status, tone: 'good', tint: '#22e58e',
    source: 'COMPOSITE', cadence: 'PER ISSUE',
    history: series.good || [], weights: weightsOf('good'), share: data.drawers.good.share || '',
  };
  return { updated, meters };
}

/* ================================================================
   Trend chart series (window.AC_TREND) — unchanged from v17.1:
   pre-ledger traced approximation + every real row from the
   append-only CSV ledger.
   ================================================================ */
const TREND_BASELINE = [
  [2015.0, 42, 38], [2015.5, 48, 37], [2016.0, 46, 40], [2016.5, 52, 41],
  [2017.0, 50, 42], [2017.5, 49, 43], [2018.0, 54, 44], [2018.5, 55, 45],
  [2019.0, 56, 45], [2019.5, 58, 44], [2020.1, 72, 38], [2020.5, 66, 41],
  [2020.9, 63, 46], [2021.5, 60, 48], [2022.15, 76, 44], [2022.7, 73, 45],
  [2023.2, 75, 45], [2023.8, 82, 44], [2024.3, 80, 46], [2024.8, 81, 46],
  [2025.3, 84, 46], [2025.45, 86, 46], [2025.8, 86, 47],
];
function trendSeries() {
  const csv = fs.readFileSync(path.join(ROOT, 'public/data/scores-history.csv'), 'utf8').trim().split(/\r?\n/);
  const cols = csv[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const di = cols.indexOf('date'), ei = cols.indexOf('world_on_edge'), gi = cols.indexOf('world_goodness');
  if (di < 0 || ei < 0 || gi < 0) throw new Error('[build] scores-history.csv: date/world_on_edge/world_goodness columns not found');
  const decYear = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return y + ((m - 1) + (d - 1) / 31) / 12;
  };
  const lastBase = TREND_BASELINE[TREND_BASELINE.length - 1][0];
  const rows = csv.slice(1).map((line) => {
    const c = line.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    const t = decYear(c[di]), e = parseFloat(c[ei]), g = parseFloat(c[gi]);
    if (!isFinite(t) || !isFinite(e) || !isFinite(g)) throw new Error(`[build] scores-history.csv: bad row: ${line}`);
    return [Math.round(t * 1000) / 1000, e, g];
  }).filter((r) => r[0] > lastBase).sort((a, b) => a[0] - b[0]);
  if (!rows.length) throw new Error('[build] scores-history.csv: no ledger rows after the baseline series');
  return TREND_BASELINE.concat(rows);
}

/* ================================================================
   Main
   ================================================================ */
async function main() {
  const blend = await blendSignal();
  console.log(blend.applied
    ? `[build] Info Integrity blended with Signal: ${blend.blended}%`
    : `[build] Signal blend not applied — ${blend.reason}; keeping the three-source composite`);

  const series = updateHistoryLedger();

  // Head meta values (description + og + twitter) — same three anchors as v17.
  sub(/World On Edge: \d+\/100\. World Goodness: \d+\/100/g,
    () => `World On Edge: ${E}/100. World Goodness: ${G}/100`, 3, 'meta');

  fill('TICKER', buildTicker(), 'ticker');
  fill('SIGNAL', buildSignal(), 'signal-trends');
  fill('BALANCE', buildBalance(), 'balance');
  fill('SECTIONS', buildSections(series), 'metric-sections');
  fill('SRCCOUNT', `${data.sources.length} FEEDS · ALL PUBLIC`, 'source-count');
  fill('SOURCES', buildSources(), 'sources');
  fill('CHIPS2', buildChips(), 'chips-methodology');
  fill('CHIPS', buildChips(), 'chips-footer');
  fill('METHOD', buildMethod(), 'methodology');

  sub(/window\.AC_METERS = null;\/\*BUILD:AC_METERS\*\//,
    () => 'window.AC_METERS = ' + JSON.stringify(buildMeters(series)) + ';', 1, 'AC_METERS');
  sub(/window\.AC_TREND = null;\/\*BUILD:AC_TREND\*\//,
    () => 'window.AC_TREND = ' + JSON.stringify({ historical: trendSeries() }) + ';', 1, 'AC_TREND');

  if (/<!--BUILD:/.test(html)) throw new Error('[build] unfilled BUILD anchor remains');
  fs.writeFileSync(path.join(ROOT, 'public/index.html'), html);
  console.log(`[build] wrote public/index.html (${html.length} bytes) from data/issue-data.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
