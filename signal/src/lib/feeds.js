// ---------------------------------------------------------------------------
// RSS ingestion via the free rss2json.com proxy.
// ---------------------------------------------------------------------------
import { FEEDS, HEADLINES_PER_FEED, MAX_ITEM_AGE_HOURS, MIN_HEADLINE_CHARS } from '../config.js';

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
const RATE_LIMIT_WAIT_MS = 30_000;
const MAX_ITEM_AGE_MS = MAX_ITEM_AGE_HOURS * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// First 60 chars of the normalized headline — the dedupe key per the spec.
export function dedupeKey(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// Strip residual HTML/entities that some feeds leave in their <title>.
function cleanTitle(raw) {
  if (!raw) return '';
  const txt = raw
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  return txt.replace(/\s+/g, ' ').trim();
}

/**
 * Freshness gate. 'fresh' = parseable date within MAX_ITEM_AGE_HOURS of scan
 * time; 'stale' = parseable but older; 'undated' = no parseable date (kept but
 * tagged — we don't assume fresh or stale). Stale items are dropped before
 * scoring so a frozen feed snapshot can't contaminate totals, aggregates, the
 * Briefing, or the scan history.
 */
export function classifyFreshness(pubDate, now = Date.now()) {
  if (!pubDate) return 'undated';
  const then = new Date(pubDate).getTime();
  if (!Number.isFinite(then)) return 'undated';
  return now - then > MAX_ITEM_AGE_MS ? 'stale' : 'fresh';
}

/**
 * Sanity filter. True when a cleaned "headline" is obviously not a headline:
 * still contains HTML markup (some feeds double-encode, so entity decoding can
 * resurrect literal <a href=...> fragments AFTER tag stripping — the Sky News
 * artifact), is empty once any residual tags are stripped, or is shorter than
 * MIN_HEADLINE_CHARS. Rejected items are counted in the status line and never
 * scored.
 */
export function isMalformedTitle(title) {
  const t = (title || '').trim();
  if (!t) return true;
  if (/<\s*a\b|href\s*=|<\//i.test(t)) return true; // anchor/href/closing-tag fragments
  if (/<[a-z!/][^>]*>/i.test(t)) return true; // any other residual tag
  if (t.replace(/<[^>]*>/g, '').trim().length < MIN_HEADLINE_CHARS) return true;
  return false;
}

/**
 * Fetch one feed through rss2json. Resolves to one of:
 *   { status: 'ok', items: [...] }
 *   { status: 'empty' }           — proxy returned no usable items
 *   { status: 'error', reason }   — network/proxy failure
 * Handles a single 429 by waiting 30s (signalled via onRateLimit) and retrying.
 */
async function fetchViaRss2json(feed, onRateLimit, attemptedRetry = false) {
  const url = `${RSS2JSON}?rss_url=${encodeURIComponent(feed.url)}&count=${HEADLINES_PER_FEED}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return { status: 'error', reason: err.message || 'network error' };
  }

  if (res.status === 429) {
    if (attemptedRetry) return { status: 'error', reason: 'rate limited' };
    onRateLimit?.();
    await sleep(RATE_LIMIT_WAIT_MS);
    return fetchViaRss2json(feed, onRateLimit, true);
  }

  if (!res.ok) return { status: 'error', reason: `HTTP ${res.status}` };

  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 'error', reason: 'bad JSON' };
  }

  if (data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) {
    return { status: 'empty' };
  }

  const items = data.items
    .slice(0, HEADLINES_PER_FEED)
    .map((it) => ({
      title: cleanTitle(it.title),
      link: it.link || '#',
      pubDate: it.pubDate || null,
      summary: cleanTitle(it.description || it.content || '').slice(0, 800),
    }))
    .filter((it) => it.title.length > 0);

  return items.length ? { status: 'ok', items } : { status: 'empty' };
}

// Fallback: fetch the feed through our own serverless proxy (/api/feed), which
// fetches + parses the RSS server-side, bypassing both CORS and rss2json's
// rate limits.
async function fetchViaServer(feed) {
  let res;
  try {
    res = await fetch(`/api/feed?url=${encodeURIComponent(feed.url)}`);
  } catch (err) {
    return { status: 'error', reason: err.message || 'proxy unreachable' };
  }
  if (!res.ok) return { status: 'error', reason: `proxy HTTP ${res.status}` };

  let data;
  try {
    data = await res.json();
  } catch {
    return { status: 'error', reason: 'proxy bad JSON' };
  }
  if (data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) {
    return { status: data.status === 'empty' ? 'empty' : 'error', reason: data.reason };
  }

  const items = data.items
    .slice(0, HEADLINES_PER_FEED)
    .map((it) => ({
      title: cleanTitle(it.title),
      link: it.link || '#',
      pubDate: it.pubDate || null,
      summary: cleanTitle(it.summary || '').slice(0, 800),
    }))
    .filter((it) => it.title.length > 0);

  return items.length ? { status: 'ok', items } : { status: 'empty' };
}

// Try rss2json first; if it doesn't yield headlines, fall back to our own
// server-side proxy before giving up.
async function fetchFeed(feed, onRateLimit) {
  const primary = await fetchViaRss2json(feed, onRateLimit);
  if (primary.status === 'ok') return primary;

  // rss2json didn't yield items — fall back to our own server-side proxy.
  console.log(
    `[signal] rss2json ${primary.status}${primary.reason ? ` (${primary.reason})` : ''} for ${feed.name} — trying /api/feed`
  );
  const fallback = await fetchViaServer(feed);
  if (fallback.status === 'ok') {
    console.log(`[signal] /api/feed recovered ${feed.name}`);
    return fallback;
  }
  console.warn(
    `[signal] both sources failed for ${feed.name} (${feed.url}) — rss2json: ${primary.reason || primary.status}, proxy: ${fallback.reason || fallback.status}`
  );

  // Neither produced items — report empty if either was merely empty, else
  // carry the proxy reason (more informative than the rss2json one).
  if (primary.status === 'empty' || fallback.status === 'empty') return { status: 'empty' };
  return { status: 'error', reason: fallback.reason || primary.reason || 'unknown' };
}

/**
 * Pull every configured feed in parallel, gate for freshness and sanity,
 * flatten, dedupe by headline text.
 *
 * @param {(info) => void} onRateLimit  called when a 429 triggers a 30s wait.
 * @returns {{ headlines, skipped, errored, staleFeeds, drops }}
 *   headlines  — deduped, fresh-or-undated, sane
 *                [{ id, title, link, pubDate, undated, publication, owner, key }]
 *   skipped    — feed names that came back empty
 *   errored    — [{ name, reason }] feeds that failed
 *   staleFeeds — [{ name, dropped }] feeds whose items ALL dropped as stale
 *                (a frozen/archived feed — surfaced, never silently vanished)
 *   drops      — [{ name, stale, malformed, kept, fetched }] per-feed counts,
 *                only for feeds that dropped at least one item
 */
export async function fetchAllFeeds({ onRateLimit, now = Date.now() } = {}) {
  const results = await Promise.all(
    FEEDS.map((feed) =>
      fetchFeed(feed, () => onRateLimit?.({ feed: feed.name })).then((r) => ({ feed, ...r }))
    )
  );

  const headlines = [];
  const skipped = [];
  const errored = [];
  const staleFeeds = [];
  const drops = [];
  const seen = new Set();
  let counter = 0;

  for (const r of results) {
    if (r.status === 'empty') {
      skipped.push(r.feed.name);
      continue;
    }
    if (r.status === 'error') {
      errored.push({ name: r.feed.name, reason: r.reason, url: r.feed.url });
      continue;
    }

    let stale = 0;
    let malformed = 0;
    let kept = 0;
    for (const item of r.items) {
      // Sanity filter first: a malformed "headline" is junk regardless of date.
      if (isMalformedTitle(item.title)) {
        malformed++;
        continue;
      }
      // Freshness gate: stale items are dropped before scoring; undated items
      // are kept but tagged so nothing downstream mistakes them for fresh.
      const freshness = classifyFreshness(item.pubDate, now);
      if (freshness === 'stale') {
        stale++;
        continue;
      }
      const key = dedupeKey(item.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      kept++;
      headlines.push({
        id: `h${counter++}`,
        title: item.title,
        link: item.link,
        pubDate: freshness === 'undated' ? null : item.pubDate,
        undated: freshness === 'undated',
        // Aggregator feeds (Google News) carry only a noisy snippet, not the
        // article body. Empty it so the scorer's empty-body branch fires
        // deterministically (Fidelity 5, VERIFIED unless a tease — never
        // MISLEADING) instead of judging headline-vs-snippet.
        summary: r.feed.thinBody ? '' : item.summary || '',
        publication: r.feed.name,
        owner: r.feed.owner,
        thinBody: !!r.feed.thinBody,
        key,
      });
    }

    if (stale > 0 || malformed > 0) {
      drops.push({ name: r.feed.name, stale, malformed, kept, fetched: r.items.length });
    }
    // Every item stale → the feed is serving a frozen snapshot. Report it as a
    // stale feed rather than letting the source silently disappear.
    if (kept === 0 && stale > 0) {
      staleFeeds.push({ name: r.feed.name, dropped: stale });
    }
  }

  return { headlines, skipped, errored, staleFeeds, drops };
}
