// ---------------------------------------------------------------------------
// RSS ingestion via the free rss2json.com proxy.
// ---------------------------------------------------------------------------
import { FEEDS, HEADLINES_PER_FEED } from '../config.js';

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
const RATE_LIMIT_WAIT_MS = 30_000;

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
 * Fetch one feed through rss2json. Resolves to one of:
 *   { status: 'ok', items: [...] }
 *   { status: 'empty' }           — proxy returned no usable items
 *   { status: 'error', reason }   — network/proxy failure
 * Handles a single 429 by waiting 30s (signalled via onRateLimit) and retrying.
 */
async function fetchFeed(feed, onRateLimit, attemptedRetry = false) {
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
    return fetchFeed(feed, onRateLimit, true);
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
    }))
    .filter((it) => it.title.length > 0);

  return items.length ? { status: 'ok', items } : { status: 'empty' };
}

/**
 * Pull every configured feed in parallel, flatten, dedupe by headline text.
 *
 * @param {(info) => void} onRateLimit  called when a 429 triggers a 30s wait.
 * @returns {{ headlines, skipped, errored }}
 *   headlines — deduped [{ id, title, link, pubDate, publication, owner, key }]
 *   skipped   — feed names that came back empty
 *   errored   — [{ name, reason }] feeds that failed
 */
export async function fetchAllFeeds({ onRateLimit } = {}) {
  const results = await Promise.all(
    FEEDS.map((feed) =>
      fetchFeed(feed, () => onRateLimit?.({ feed: feed.name })).then((r) => ({ feed, ...r }))
    )
  );

  const headlines = [];
  const skipped = [];
  const errored = [];
  const seen = new Set();
  let counter = 0;

  for (const r of results) {
    if (r.status === 'empty') {
      skipped.push(r.feed.name);
      continue;
    }
    if (r.status === 'error') {
      errored.push({ name: r.feed.name, reason: r.reason });
      continue;
    }
    for (const item of r.items) {
      const key = dedupeKey(item.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      headlines.push({
        id: `h${counter++}`,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        publication: r.feed.name,
        owner: r.feed.owner,
        key,
      });
    }
  }

  return { headlines, skipped, errored };
}
