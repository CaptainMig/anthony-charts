import { useEffect } from 'react';
import { VERDICT_COLORS } from '../config.js';

const VERDICT_ROWS = [
  {
    verdict: 'VERIFIED',
    text: 'The headline makes a factual, sourced claim that can be checked. The framing matches what the story actually says. No spin detected.',
  },
  {
    verdict: 'CONTEXTUAL',
    text: 'The headline is true, but missing context that would meaningfully change how you read it. Not wrong — incomplete.',
  },
  {
    verdict: 'CONTESTED',
    text: 'The facts in this headline are genuinely disputed, or the framing reflects a clear editorial lean. Could be accurate, could be selective.',
  },
  {
    verdict: 'UNVERIFIED',
    text: 'The claim relies on anonymous sources, speculation presented as fact, or a conclusion drawn before the evidence is in.',
  },
  {
    verdict: 'MISLEADING',
    text: 'The headline is engineered to trigger a reaction. It distorts, omits, or exaggerates facts in a way that serves outrage over accuracy.',
  },
];

const SCORE_ROWS = [
  {
    label: 'Fidelity (0–10)',
    text: "How accurately the headline conveys its own article's main claim. 10 = exact, no distortion. 0 = contradicts or invents. Signal judges the headline against the article it links to — not whether the event is true in the world.",
  },
  {
    label: 'Sensationalism (0–10)',
    text: 'How emotionally charged is the language, beyond what the article supports? 0 = flat and proportionate. 10 = maximally inflammatory.',
  },
  {
    label: 'Clickbait (0–10)',
    text: 'Does the headline withhold information to force a click? 0 = tells you everything. 10 = pure curiosity gap.',
  },
];

function SectionHeader({ children }) {
  return (
    <h3 className="mb-3 mt-7 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
      {children}
    </h3>
  );
}

export default function MethodologyPanel({ open, onClose }) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Overlay — click outside to close */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="How Signal works"
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l-hair transition-transform duration-300 ease-out sm:w-[420px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: '#1a1712', borderLeftColor: '#5aabb0' }}
      >
        <div className="flex items-start justify-between gap-4 border-b-hair border-white/10 px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#e8e4dc]">How Signal works</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-sm px-2 py-1 font-mono text-lg leading-none text-white/40 hover:text-white/80"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[13px] leading-relaxed text-white/65">
            Signal pulls live headlines from 20 major US news outlets every time you scan, then
            scores each one individually using Claude AI through a framework called NERVA. Here&apos;s
            what every score means.
          </p>

          <SectionHeader>Verdicts</SectionHeader>
          <div className="flex flex-col gap-4">
            {VERDICT_ROWS.map((row) => (
              <div key={row.verdict} className="flex gap-3">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: VERDICT_COLORS[row.verdict] }}
                />
                <div>
                  <div
                    className="font-mono text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: VERDICT_COLORS[row.verdict] }}
                  >
                    {row.verdict}
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">{row.text}</p>
                </div>
              </div>
            ))}
          </div>

          <SectionHeader>Scores</SectionHeader>
          <div className="flex flex-col gap-4">
            {SCORE_ROWS.map((row) => (
              <div key={row.label}>
                <div className="font-mono text-[11px] uppercase tracking-wider text-teal">
                  {row.label}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">{row.text}</p>
              </div>
            ))}
          </div>

          <SectionHeader>Framing Integrity</SectionHeader>
          <p className="text-[12.5px] leading-relaxed text-white/65">
            Framing Integrity is the percentage of today&apos;s headlines rated VERIFIED or
            CONTEXTUAL — the share that fairly represent their own article. It feeds the Framing
            Integrity meter on the Anthony Charts dashboard.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/65">
            <span style={{ color: '#c8971f' }}>Read it carefully:</span> a high score means
            headlines match their articles. It does <span className="text-white/85">not</span> mean
            the underlying reporting is accurate or unbiased. An outlet whose headlines faithfully
            frame slanted or propagandistic articles still scores high — Signal audits the
            headline-to-article relationship, not whether the news itself is true.
          </p>

          <SectionHeader>Sources &amp; the SLAM flag</SectionHeader>
          <p className="text-[12.5px] leading-relaxed text-white/60">
            AP and Reuters discontinued their public RSS feeds, so they are recovered via Google
            News aggregation and scored on the headline plus a limited snippet — not the full
            article. Their fidelity signal is therefore weaker than direct-feed sources; the
            framing-integrity number reflects that honestly rather than hiding the gap. The
            Financial Times is paywall-limited and scored the same way — headline plus snippet, a
            weaker fidelity signal than full-text sources.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/60">
            The <span style={{ color: '#f08080' }}>SLAM</span> badge is a transparent lexicon match,
            not an AI score: a fixed list of conflict verbs (&quot;slams&quot;, &quot;blasts&quot;,
            &quot;rips into&quot;…) flagged on the headline text. It never changes a verdict. The{' '}
            <span className="font-mono">Slam Index</span> is the share of headlines with any match,
            shown next to the average sensationalism of flagged vs unflagged headlines so you can
            check the correlation yourself.
          </p>

          <p className="mt-8 border-t-hair border-white/10 pt-4 text-[10px] leading-relaxed text-white/30">
            Signal scores reflect AI editorial synthesis, not ground truth. Scoring is fast and
            imperfect. Use it as a signal, not a verdict. Headlines remain © their respective
            publications. NERVA is a decision-integrity framework developed by Starpoint LLC.
          </p>
        </div>
      </aside>
    </>
  );
}
