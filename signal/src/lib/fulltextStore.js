// ---------------------------------------------------------------------------
// Persistent full-text verdict store — score once, cache, serve.
//
// The first time an article detail page extracts and full-text-scores an
// article, the verdict is written here (localStorage, keyed by the stable
// article id from lib/article.js). Every later view — and every scan-table
// render — serves the stored verdict directly: no re-extraction, no re-score.
//
// An article's text doesn't change after publication, so entries have no TTL;
// the store is only bounded by an LRU-style cap to keep localStorage sane.
// ---------------------------------------------------------------------------
import { STORAGE_KEYS } from '../config.js';
import { articleId } from './article.js';

// Generous cap — a full scan is ~200 headlines, and only opened articles are
// stored. Oldest entries (by scored-at time) are evicted past this.
const MAX_ENTRIES = 500;

// Map of articleId -> { at, score, chars }. Corrupt/missing storage reads as
// an empty store — the cache is an optimization, never a failure mode.
export function loadFulltextStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.fulltextVerdicts);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Stored entry for an article link, or null when it was never full-text scored.
export function getFulltext(link) {
  const entry = loadFulltextStore()[articleId(link)];
  return entry && entry.score ? entry : null;
}

/**
 * Persist a full-text verdict for an article link. Returns the updated map so
 * the caller (App state) can re-render without a second storage read.
 */
export function saveFulltext(link, { score, chars }) {
  const map = loadFulltextStore();
  map[articleId(link)] = { at: Date.now(), score, chars };

  // Evict oldest past the cap.
  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => (map[a].at || 0) - (map[b].at || 0))
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => delete map[id]);
  }

  try {
    localStorage.setItem(STORAGE_KEYS.fulltextVerdicts, JSON.stringify(map));
  } catch {
    /* localStorage full or unavailable — the in-memory map still serves this session */
  }
  return map;
}
