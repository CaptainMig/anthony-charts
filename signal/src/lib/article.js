// ---------------------------------------------------------------------------
// Article detail helpers — stable ids, share payloads, per-article integrity.
//
// The detail route is /article/:id where id is a short hash of the article
// link (stable across scans, unlike the per-scan h0/h1… ids). Share links
// carry a compact base64url payload (`d`) with the headline + its score so a
// shared card renders on a device that has never run a scan.
// ---------------------------------------------------------------------------

// djb2 over the link, base36 — short, stable, collision-safe at our scale.
export function articleId(link) {
  let h = 5381;
  const s = String(link || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Per-article Signal Integrity, 0–100 — the share-card number. Composite of
 * the three scored axes: fidelity counts up, sensationalism and clickbait
 * count down. Null when the row is UNSCORED.
 */
export function articleIntegrity(score) {
  if (!score || score.truth == null) return null;
  const raw = (score.truth + (10 - score.sens) + (10 - score.click)) / 30;
  return Math.round(raw * 100);
}

const b64url = {
  encode(obj) {
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },
  decode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  },
};

// Compact share payload: enough to render the detail header + OG card
// anywhere, without a server-side score store.
export function encodeShare(headline) {
  const { score } = headline;
  return b64url.encode({
    t: headline.title,
    l: headline.link,
    p: headline.publication,
    o: headline.owner,
    v: score?.verdict ?? null,
    tr: score?.truth ?? null,
    s: score?.sens ?? null,
    c: score?.click ?? null,
    r: score?.rationale ?? '',
  });
}

export function decodeShare(d) {
  try {
    const x = b64url.decode(d);
    if (!x || typeof x.t !== 'string' || typeof x.l !== 'string') return null;
    return {
      id: articleId(x.l),
      title: x.t,
      link: x.l,
      publication: x.p || '',
      owner: x.o || '',
      pubDate: null,
      summary: '',
      score:
        x.v == null
          ? { verdict: 'UNSCORED', unscored: true, truth: null, sens: null, click: null, rationale: '' }
          : { verdict: x.v, truth: x.tr, sens: x.s, click: x.c, rationale: x.r || '' },
    };
  } catch {
    return null;
  }
}

// Absolute share URL for a headline (route + payload).
export function shareUrl(headline) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/article/${articleId(headline.link)}?d=${encodeShare(headline)}`;
}
