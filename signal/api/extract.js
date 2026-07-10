// ---------------------------------------------------------------------------
// Server-side article text extraction (Vercel function).
//
// Fetches an article URL with the same UA/proxy discipline as api/feed.js and
// strips it to readable text for full-text scoring. Deliberately light — no
// headless browser, no readability dependency: drop script/style/nav chrome,
// prefer <article>/<main> content, then join paragraph text.
//
// Respects paywalls/robots honestly: when extraction yields a stub the client
// shows "FULL TEXT UNAVAILABLE — HEADLINE-ONLY SCORE" instead of scoring a
// fragment. This function never fabricates content.
// ---------------------------------------------------------------------------

// Below this many characters the result is a stub (cookie wall, teaser,
// paywall shell) and must not be scored as the article body.
const MIN_TEXT_CHARS = 400;
const MAX_TEXT_CHARS = 12_000;

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // url -> { at, payload }

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// HTML -> readable text. Order matters: kill non-content subtrees first, then
// narrow to the most article-like container, then keep paragraph-level text.
export function extractText(html) {
  let s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|figure|figcaption|button)\b[\s\S]*?<\/\1>/gi, ' ');

  // Prefer the semantic article container when present.
  const container =
    s.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ||
    s.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ||
    s;

  // Paragraph-level text only — skips menus, related-links lists, and chrome.
  const paras = [...container.matchAll(/<(p|h1|h2|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 40); // drop crumbs: bylines, timestamps, buttons

  const text = paras.join('\n\n').slice(0, MAX_TEXT_CHARS);
  const title = decodeEntities(
    (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();

  return { text, title };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, reason: 'Missing or invalid url' });
  }

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return res.status(200).json(hit.payload);
  }

  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!r.ok) return res.status(200).json({ ok: false, reason: `HTTP ${r.status}` });

    const html = await r.text();
    const { text, title } = extractText(html);
    if (text.length < MIN_TEXT_CHARS) {
      // Stub — likely paywall/consent wall. Honest failure, never a fragment.
      return res.status(200).json({ ok: false, reason: 'stub', chars: text.length });
    }

    const payload = { ok: true, title, text, chars: text.length };
    cache.set(url, { at: Date.now(), payload });
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return res.status(200).json(payload);
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return res.status(200).json({ ok: false, reason: timeout ? 'timeout' : e.message });
  }
}
