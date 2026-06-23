// ---------------------------------------------------------------------------
// "Slam journalism" flag — a deterministic lexicon match, NOT an AI score.
//
// Runs on the headline text after scoring. Fully transparent and falsifiable:
// the matched word is shown, and per scan we surface the Slam Index alongside
// avg sensationalism of flagged vs non-flagged headlines so the correlation
// (do "slam" verbs track higher sensationalism?) can be checked, not asserted.
// ---------------------------------------------------------------------------

// CORE — almost always a framing tell. A core match alone sets the flag.
const CORE = [
  'slams', 'slammed', 'blasts', 'blasted', 'rips into', 'ripped into', 'torches',
  'eviscerates', 'shreds', 'skewers', 'savages', 'unloads on', 'lashes out',
  'hits back', 'fires back', 'claps back', 'goes off on', 'tears into',
];

// WATCH — often literal. A watch match counts toward the index and renders as a
// muted badge, but must NOT, on its own, be treated as a hard flag.
const WATCH = ['owns', 'schools', 'guts', 'destroys', 'hammers', 'roasts', 'erupts', 'explodes', 'fumes'];

// Nouns that mark a literal use of "guts" (e.g. "fire guts building").
const BUILDING_NOUNS = new Set([
  'building', 'house', 'home', 'factory', 'store', 'hotel', 'tower', 'apartment',
  'warehouse', 'school', 'church', 'mall', 'complex', 'block', 'restaurant',
]);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = (terms, tier) =>
  terms.map((term) => ({ term, tier, re: new RegExp(`\\b${escape(term)}\\b`, 'i') }));

const CORE_RE = compile(CORE, 'core');
const WATCH_RE = compile(WATCH, 'watch');

// Suppress the common literal uses the word-boundary check can't catch alone.
function isLiteral(term, title, idx) {
  const t = term.toLowerCase();
  const after = (title.slice(idx + term.length).toLowerCase().match(/[a-z']+/g) || []);
  if ((t === 'slams' || t === 'slammed') && after[0] === 'into') return true; // car slams into
  if (t === 'guts' && after.slice(0, 3).some((w) => BUILDING_NOUNS.has(w))) return true; // fire guts (downtown) building
  return false;
}

/**
 * Detect a slam-journalism verb in a headline.
 * @returns {{ matched: boolean, term: string|null, tier: 'core'|'watch'|null }}
 */
export function detectSlam(title) {
  if (!title) return { matched: false, term: null, tier: null };
  for (const { term, tier, re } of [...CORE_RE, ...WATCH_RE]) {
    const m = re.exec(title);
    if (m && !isLiteral(term, title, m.index)) {
      return { matched: true, term: m[0].toLowerCase(), tier };
    }
  }
  return { matched: false, term: null, tier: null };
}

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Falsification numbers for a scan. `scored` items must already carry `.slam`
 * (from detectSlam) and `.score.sens`.
 */
export function slamStats(scored) {
  const flagged = scored.filter((h) => h.slam?.matched);
  const rest = scored.filter((h) => !h.slam?.matched);
  return {
    index: scored.length ? Math.round((flagged.length / scored.length) * 100) : 0,
    flaggedCount: flagged.length,
    avgSensFlagged: round1(avg(flagged.map((h) => h.score.sens))),
    avgSensRest: round1(avg(rest.map((h) => h.score.sens))),
  };
}
