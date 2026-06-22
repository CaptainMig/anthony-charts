// ---------------------------------------------------------------------------
// Server-side RSS/Atom proxy (Vercel function).
//
// Fallback for feeds that rss2json drops (rate limits, transient errors). The
// browser can't fetch these news domains directly — they don't send CORS
// headers — but a server function has no such restriction. Fetches the feed,
// parses it tolerantly, and returns { status, items }.
// ---------------------------------------------------------------------------
import { HEADLINES_PER_FEED } from '../src/config.js';

function decode(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#3[89];/g, (m) => (m === '&#38;' ? '&' : "'"))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}

// RSS uses <link>text</link>; Atom uses <link href="..."/>.
function linkOf(block) {
  const rss = decode(tag(block, 'link'));
  if (rss && /^https?:/i.test(rss)) return rss;
  const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : '#';
}

function parse(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks
    .map((b) => ({
      title: decode(tag(b, 'title')),
      link: linkOf(b),
      pubDate: decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated')) || null,
    }))
    .filter((it) => it.title.length > 5)
    .slice(0, HEADLINES_PER_FEED);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ status: 'error', reason: 'Missing or invalid url' });
  }

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignalBot/1.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!r.ok) return res.status(200).json({ status: 'error', reason: `HTTP ${r.status}` });
    const xml = await r.text();
    const items = parse(xml);
    return res.status(200).json(items.length ? { status: 'ok', items } : { status: 'empty' });
  } catch (e) {
    return res.status(200).json({ status: 'error', reason: e.message });
  }
}
