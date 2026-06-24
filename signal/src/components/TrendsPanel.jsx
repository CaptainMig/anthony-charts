import { useState } from 'react';

// Public Interest panel — a SEPARATE axis from the integrity panels. Styled
// distinctly (amber accent, no teal/verdict colors) so it reads as "search
// popularity," never as part of the scoring. Display only.
const AMBER = '#c8971f';

export default function TrendsPanel({ trends }) {
  const [open, setOpen] = useState(true);
  const ok = trends?.status === 'ok';

  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-8">
      <div className="rounded-sm border-hair" style={{ borderColor: `${AMBER}44` }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="flex items-center gap-2">
            <span
              className="font-mono text-[11px] uppercase tracking-[0.2em]"
              style={{ color: AMBER }}
            >
              Public Interest · Google Trends
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">
              separate axis — not scored
            </span>
          </span>
          <span className="font-mono text-sm text-white/40">{open ? '–' : '+'}</span>
        </button>

        {open && (
          <div className="border-t-hair px-4 py-3" style={{ borderColor: `${AMBER}22` }}>
            {ok ? (
              <ol className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                {trends.terms.map((t, i) => (
                  <li key={t.term} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-[#e8e4dc]/90">
                      <span className="mr-2 font-mono text-[10px] tabular-nums text-white/30">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {t.term}
                    </span>
                    {t.traffic && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/40">
                        {t.traffic}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-mono text-[12px] text-white/40">Public interest data unavailable.</p>
            )}

            <p className="mt-3 border-t-hair border-white/10 pt-2 font-mono text-[10px] text-white/30">
              Source: Google Trends (daily US). Search interest ≠ accuracy.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
