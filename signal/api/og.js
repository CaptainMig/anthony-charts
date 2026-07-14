// ---------------------------------------------------------------------------
// Per-article share card (Vercel function).
//
// /article/:id is rewritten here (see vercel.json) so link unfurlers — which
// never execute JS — see per-article OG meta: verdict, the three axis scores,
// and SIGNAL INTEGRITY n/100 in the title. Humans are immediately handed to
// the SPA (/?article=:id&d=…), which renders the detail page.
//
// The card's data rides in the same compact `d` payload the share buttons
// embed, so no server-side score store is needed. Upgrade path: swap the
// static og-signal.png for a @vercel/og-generated PNG with the score ring.
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodePayload(d) {
  try {
    const b64 = String(d).replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const x = JSON.parse(json);
    return x && typeof x.t === 'string' ? x : null;
  } catch {
    return null;
  }
}

// Display label for a verdict token — mirror of src/config.js VERDICT_LABELS
// (this function stays dependency-free; keep in sync).
function verdictLabel(v) {
  return v === 'UNVERIFIED' ? 'UNVERIFIABLE' : v;
}

// Same composite as src/lib/article.js articleIntegrity — keep in sync.
function integrity(x) {
  if (x.tr == null || x.s == null || x.c == null) return null;
  return Math.round(((x.tr + (10 - x.s) + (10 - x.c)) / 30) * 100);
}

export default function handler(req, res) {
  const { d = '' } = req.query || {};
  // The rewrite passes the path segment as ?id=…
  const id = (req.query?.id || '').toString().replace(/[^a-z0-9]/gi, '').slice(0, 16);
  const x = decodePayload(d);

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'anthony-signal.vercel.app'}`;
  const target = `${origin}/?article=${encodeURIComponent(id)}${d ? `&d=${encodeURIComponent(d)}` : ''}`;

  let title = 'Signal — Media Integrity Scanner';
  let desc = 'Scores how closely a headline matches its own article — not whether the news is true.';
  if (x) {
    const n = integrity(x);
    title = `${n != null ? `SIGNAL INTEGRITY ${n}/100 · ` : ''}${verdictLabel(x.v) || 'UNSCORED'} — ${x.t}`.slice(0, 200);
    desc = [
      x.p ? `${x.p}.` : '',
      x.tr != null ? `Fidelity ${x.tr}/10 · Sensationalism ${x.s}/10 · Clickbait ${x.c}/10.` : 'Not scored.',
      x.r ? ` ${x.r}` : '',
    ]
      .join(' ')
      .trim()
      .slice(0, 300);
  }

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Anthony Charts · Signal">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(origin)}/og-signal.png">
<meta property="og:url" content="${esc(origin)}/article/${esc(id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(origin)}/og-signal.png">
<meta name="robots" content="noindex">
<script>location.replace(${JSON.stringify(target)});</script>
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body>
<p>Opening <a href="${esc(target)}">Signal article view</a>…</p>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
  return res.status(200).send(html);
}
