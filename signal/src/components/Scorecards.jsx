import { VERDICT_COLORS } from '../config.js';

function MiniBar({ distribution }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-[1px] bg-white/5">
      {distribution.map((seg) => (
        <div
          key={seg.verdict}
          style={{ width: `${seg.pct}%`, backgroundColor: VERDICT_COLORS[seg.verdict] }}
          title={`${seg.verdict}: ${seg.count}`}
        />
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-wider text-white/35">{label}</span>
      <span className="font-mono text-sm tabular-nums text-white/80">{value.toFixed(1)}</span>
    </div>
  );
}

export default function Scorecards({ cards, selected, onSelect }) {
  if (!cards.length) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-8">
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
        Publication Scorecards
      </h2>

      <div className="grid grid-cols-1 gap-px border-hair border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => {
          const active = selected === card.publication;
          return (
            <button
              key={card.publication}
              type="button"
              onClick={() => onSelect(active ? null : card.publication)}
              className={`flex flex-col gap-3 bg-ink p-4 text-left transition-colors hover:bg-white/[0.03] ${
                active ? 'ring-1 ring-inset ring-teal' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-base font-semibold text-[#e8e4dc]">
                    {card.publication}
                  </div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-wider text-white/35">
                    {card.owner}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/40">
                  {card.count}
                </span>
              </div>

              <MiniBar distribution={card.distribution} />

              <div className="flex justify-between">
                <Metric label="Truth" value={card.avgTruth} />
                <Metric label="Sens" value={card.avgSens} />
                <Metric label="Clickbait" value={card.avgClick} />
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="mt-2 font-mono text-[11px] text-white/40">
          Filtering table to <span className="text-teal">{selected}</span> · click the card again to
          clear.
        </p>
      )}
    </section>
  );
}
