import { useEffect, useState } from 'react';
import { VERDICT_COLORS, ACCENT } from '../config.js';
import { articleIntegrity, shareUrl } from '../lib/article.js';
import { ageLabel } from '../lib/stats.js';

// ---------------------------------------------------------------------------
// Article detail page (/article/:id).
//
// Three sections, each honest about its own failure mode:
//  1. Full-text verdict — /api/extract pulls the article body, /api/score in
//     fulltext mode judges headline-vs-body. Paywalled/stub pages show
//     "FULL TEXT UNAVAILABLE — HEADLINE-ONLY SCORE" instead of a fragment score.
//  2. Fact-check cross-reference — Google Fact Check Tools reviews, or a plain
//     "none found" / "lookup unavailable" state. Never faked.
//  3. Share — X / LinkedIn / copy, with the score payload embedded so the
//     unfurl card (api/og.js) can render without a server-side store.
// ---------------------------------------------------------------------------

function Pill({ verdict }) {
  const color = VERDICT_COLORS[verdict] || '#8d939e';
  return (
    <span
      className="inline-block rounded-[2px] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}1f`, border: `0.5px solid ${color}55` }}
    >
      {verdict}
    </span>
  );
}

function AxisRow({ label, value, invert = false }) {
  const shown = value == null ? '—' : value;
  const v = value == null ? null : invert ? 10 - value : value;
  const color =
    v == null ? 'rgba(232,228,220,0.35)' : v >= 7 ? '#6fd49a' : v >= 4 ? '#c8971f' : '#f08080';
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
        {label}
      </span>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        {value != null && (
          <div className="h-full rounded-full" style={{ width: `${value * 10}%`, backgroundColor: color }} />
        )}
      </div>
      <span className="font-mono text-[12px] tabular-nums" style={{ color }}>
        {shown}
      </span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
      {children}
    </h3>
  );
}

// Score ring for the per-article Signal Integrity number.
function Ring({ value }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : value / 100;
  const color = value == null ? '#8d939e' : value >= 70 ? '#6fd49a' : value >= 40 ? '#c8971f' : '#f08080';
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 84 84" className="h-24 w-24 -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-semibold tabular-nums" style={{ color }}>
          {value == null ? '—' : value}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-white/35">/100</span>
      </div>
    </div>
  );
}

export default function ArticleDetail({ headline, onBack }) {
  // Full-text scoring state: 'loading' | 'scored' | 'unavailable' | 'error'
  const [fulltext, setFulltext] = useState({ state: 'loading' });
  // Fact-check state: 'loading' | 'ok' | 'unavailable'
  const [factcheck, setFactcheck] = useState({ state: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setFulltext({ state: 'loading' });
    setFactcheck({ state: 'loading' });

    (async () => {
      try {
        const ex = await fetch(`/api/extract?url=${encodeURIComponent(headline.link)}`).then((r) => r.json());
        if (!alive) return;
        if (!ex.ok) {
          setFulltext({ state: 'unavailable', reason: ex.reason });
          return;
        }
        const sc = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headline: headline.title, article: ex.text, mode: 'fulltext' }),
        }).then((r) => r.json());
        if (!alive) return;
        if (!sc || sc.fallback || !sc.verdict) {
          setFulltext({ state: 'error', reason: sc?.reason || 'scoring failed' });
        } else {
          setFulltext({ state: 'scored', score: sc, chars: ex.chars });
        }
      } catch (e) {
        if (alive) setFulltext({ state: 'error', reason: e.message });
      }
    })();

    (async () => {
      try {
        const fc = await fetch(`/api/factcheck?q=${encodeURIComponent(headline.title.slice(0, 200))}`).then((r) => r.json());
        if (!alive) return;
        if (fc.ok) setFactcheck({ state: 'ok', reviews: fc.reviews });
        else setFactcheck({ state: 'unavailable', reason: fc.reason });
      } catch (e) {
        if (alive) setFactcheck({ state: 'unavailable', reason: e.message });
      }
    })();

    return () => {
      alive = false;
    };
  }, [headline.link, headline.title]);

  const headlineScore = headline.score;
  const displayScore = fulltext.state === 'scored' ? fulltext.score : headlineScore;
  const integrity = articleIntegrity(displayScore);
  const url = shareUrl({ ...headline, score: displayScore });
  const shareText = `${displayScore?.verdict || 'UNSCORED'} · SIGNAL INTEGRITY ${integrity ?? '—'}/100 — ${headline.title}`;

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="mx-auto max-w-[900px] px-6 pb-20 pt-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 font-mono text-[11px] uppercase tracking-wider text-teal hover:underline"
      >
        ← Back to scan
      </button>

      {/* Header: ring + headline + verdict */}
      <div className="flex flex-wrap items-start gap-6 border-b-hair border-white/10 pb-6">
        <Ring value={integrity} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill verdict={displayScore?.verdict || 'UNSCORED'} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/35">
              {fulltext.state === 'scored' ? 'full-text score' : 'headline-only score'}
            </span>
          </div>
          <h1 className="font-display text-[22px] font-semibold leading-snug text-[#e8e4dc]">
            {headline.title}
          </h1>
          <p className="mt-2 font-mono text-[11px] text-white/45">
            {headline.publication}
            {headline.owner ? ` · ${headline.owner}` : ''}
            {headline.pubDate ? ` · ${ageLabel(headline.pubDate)} ago` : ''}
            {' · '}
            <a href={headline.link} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
              original article ↗
            </a>
          </p>
        </div>
      </div>

      {/* Axes */}
      <div className="mt-6 flex flex-col gap-2.5">
        <AxisRow label="Fidelity" value={displayScore?.truth} />
        <AxisRow label="Sensationalism" value={displayScore?.sens} invert />
        <AxisRow label="Clickbait" value={displayScore?.click} invert />
      </div>

      {/* Full-text verdict */}
      <div className="mt-8">
        <SectionLabel>Full-text verdict</SectionLabel>
        {fulltext.state === 'loading' && (
          <p className="font-mono text-[11px] text-white/40">extracting and scoring full text…</p>
        )}
        {fulltext.state === 'scored' && (
          <div className="rounded-sm border-hair border-white/10 bg-white/[0.03] p-4">
            <p className="text-[14px] leading-relaxed text-[#e8e4dc]/90">{fulltext.score.rationale}</p>
            <p className="mt-2 font-mono text-[10px] text-white/30">
              scored against {fulltext.chars.toLocaleString()} extracted characters · headline-only sweep
              verdict was {headlineScore?.verdict || 'UNSCORED'}
            </p>
          </div>
        )}
        {fulltext.state === 'unavailable' && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#c8971f]">
            Full text unavailable{fulltext.reason ? ` (${fulltext.reason})` : ''} — headline-only score shown.
          </p>
        )}
        {fulltext.state === 'error' && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#c8971f]">
            Full-text scoring failed ({fulltext.reason}) — headline-only score shown.
          </p>
        )}
      </div>

      {/* Fact-check cross-reference */}
      <div className="mt-8">
        <SectionLabel>Fact-check cross-reference</SectionLabel>
        {factcheck.state === 'loading' && (
          <p className="font-mono text-[11px] text-white/40">querying fact-check registries…</p>
        )}
        {factcheck.state === 'ok' && factcheck.reviews.length === 0 && (
          <p className="font-mono text-[11px] text-white/45">
            No matching fact-checks found for this claim.
          </p>
        )}
        {factcheck.state === 'ok' && factcheck.reviews.length > 0 && (
          <ul className="flex flex-col gap-2">
            {factcheck.reviews.map((r, i) => (
              <li key={i} className="rounded-sm border-hair border-white/10 bg-white/[0.03] p-3">
                <p className="text-[13px] text-[#e8e4dc]/90">{r.claim}</p>
                <p className="mt-1 font-mono text-[11px] text-white/50">
                  <span className="text-[#c8971f]">{r.rating}</span> — {r.publisher}
                  {r.url && (
                    <>
                      {' · '}
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
                        review ↗
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        {factcheck.state === 'unavailable' && (
          <p className="font-mono text-[11px] text-white/45">
            {factcheck.reason === 'not configured'
              ? 'Fact-check lookup unavailable (no API key configured) — no coverage claimed.'
              : `Fact-check lookup unavailable (${factcheck.reason}).`}
          </p>
        )}
      </div>

      {/* Share */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Share</span>
        <a
          className="rounded-sm border-hair px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
          style={{ color: ACCENT, borderColor: `${ACCENT}66` }}
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          𝕏 Post
        </a>
        <a
          className="rounded-sm border-hair px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
          style={{ color: ACCENT, borderColor: `${ACCENT}66` }}
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          in LinkedIn
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-sm border-hair px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider"
          style={{ color: ACCENT, borderColor: `${ACCENT}66` }}
        >
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      </div>
    </section>
  );
}
