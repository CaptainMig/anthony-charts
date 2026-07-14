// ---------------------------------------------------------------------------
// Persistent full-text verdict store — score once, cache, serve.
//
// Two tiers. This device's localStorage (keyed by the stable article id from
// lib/article.js) is the fast layer: detail views and the scan table read it
// synchronously. The server store (api/verdicts.js) is the shared layer: it
// is written whenever a full-text verdict lands (detail view or the
// auto-escalation queue) and read back in batches, so an article is full-text
// scored once GLOBALLY — a verdict scored on any device serves every device.
// Both server calls fail soft: the local tier alone is always sufficient.
//
// An article's text doesn't change after publication, so entries have no TTL;
// the local store is only bounded by an LRU-style cap to keep localStorage sane.
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

function persistMap(map) {
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

/**
 * Persist a full-text verdict for an article link (local tier). Returns the
 * updated map so the caller (App state) can re-render without a second read.
 */
export function saveFulltext(link, { score, chars }) {
  const map = loadFulltextStore();
  map[articleId(link)] = { at: Date.now(), score, chars };
  return persistMap(map);
}

// --- Server tier -----------------------------------------------------------

/**
 * Batch-fetch server-persisted verdicts for a set of article links, merge any
 * hits into the local store, and return the merged map. Returns null when the
 * server is unreachable — callers treat that as "no new information".
 */
export async function fetchServerVerdicts(links) {
  const ids = [...new Set(links.map(articleId))];
  if (!ids.length) return loadFulltextStore();
  try {
    const r = await fetch('/api/verdicts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.ok || !data.verdicts) return null;
    const map = loadFulltextStore();
    let merged = false;
    for (const [id, entry] of Object.entries(data.verdicts)) {
      if (entry?.score?.verdict && !map[id]) {
        map[id] = entry;
        merged = true;
      }
    }
    return merged ? persistMap(map) : map;
  } catch {
    return null;
  }
}

// Fire-and-forget write to the server store — a failed push costs nothing
// (the verdict is already local; a later sweep's escalation can re-share it).
export function pushServerVerdict(link, { score, chars }) {
  return fetch('/api/verdicts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: articleId(link), score, chars }),
  }).catch(() => {
    /* best-effort */
  });
}
