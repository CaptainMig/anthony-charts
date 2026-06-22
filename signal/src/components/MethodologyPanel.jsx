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
    label: 'Truth (1–10)',
    text: 'How factually grounded and checkable is the claim? 10 = fully verified fact. 1 = unfounded or unverifiable.',
  },
  {
    label: 'Sensationalism (1–10)',
    text: 'How emotionally charged is the language? 1 = flat and neutral. 10 = maximally inflammatory.',
  },
  {
    label: 'Clickbait (1–10)',
    text: 'Does the headline withhold information to force a click? 1 = tells you everything. 10 = pure curiosity gap.',
  },
  {
    label: 'Bias',
    text: "The political lean of the headline's framing, not the outlet. LEFT / CENTER / RIGHT based on word choice and emphasis.",
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

          <SectionHeader>Integrity Score</SectionHeader>
          <p className="text-[12.5px] leading-relaxed text-white/65">
            The Integrity Score at the top is the percentage of today&apos;s headlines rated VERIFIED
            or CONTEXTUAL — the fraction of coverage that, by this rubric, gives you an accurate
            picture of events. It feeds directly into the Anthony Charts Info Integrity meter on the
            main dashboard.
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
