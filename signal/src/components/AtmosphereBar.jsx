import { useState } from 'react';
import { VERDICT_COLORS, verdictLabel } from '../config.js';

// The hero element: a full-width 56px stacked bar showing the live distribution
// of all five verdicts. Segment widths animate as scoring progresses.
export default function AtmosphereBar({ distribution, total }) {
  const [hover, setHover] = useState(null);

  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
          Atmosphere
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-white/40">
          {total} scored
        </span>
      </div>

      <div className="relative h-[56px] w-full overflow-hidden rounded-sm border-hair border-white/10 bg-white/[0.02]">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-wider text-white/25">
            awaiting scan
          </div>
        ) : (
          <div className="flex h-full w-full">
            {distribution.map((seg) => (
              <div
                key={seg.verdict}
                className="h-full transition-[width] duration-500 ease-out"
                style={{ width: `${seg.pct}%`, backgroundColor: VERDICT_COLORS[seg.verdict] }}
                onMouseEnter={() => setHover(seg.verdict)}
                onMouseLeave={() => setHover(null)}
                title={`${verdictLabel(seg.verdict)}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
              />
            ))}
          </div>
        )}

        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink/90 px-3 py-1.5 font-mono text-[11px] text-white/90 ring-1 ring-white/15">
            {(() => {
              const seg = distribution.find((d) => d.verdict === hover);
              return `${verdictLabel(hover)} — ${seg.count} · ${seg.pct.toFixed(1)}%`;
            })()}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {distribution.map((seg) => (
          <div key={seg.verdict} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-[1px]"
              style={{ backgroundColor: VERDICT_COLORS[seg.verdict] }}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
              {verdictLabel(seg.verdict)}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-white/35">
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
