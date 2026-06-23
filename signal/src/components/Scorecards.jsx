import { useState } from 'react';
import { VERDICTS, VERDICT_COLORS } from '../config.js';

const round1 = (n) => Math.round(n * 10) / 10;

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

// One publication card — reused by both the flat and the grouped views.
function ScorecardCard({ card, active, onSelect }) {
  return (
    <button
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
        <Metric label="Fidelity" value={card.avgTruth} />
        <Metric label="Sens" value={card.avgSens} />
        <Metric label="Clickbait" value={card.avgClick} />
      </div>
    </button>
  );
}

// Cluster the per-publication cards by owner, with headline-weighted averages
// so an owner row reflects its outlets' real volume.
function clusterByOwner(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.owner)) map.set(c.owner, []);
    map.get(c.owner).push(c);
  }
  return [...map.entries()]
    .map(([owner, members]) => {
      const total = members.reduce((s, m) => s + m.count, 0);
      const wavg = (key) =>
        total ? members.reduce((s, m) => s + m[key] * m.count, 0) / total : 0;
      const distribution = VERDICTS.map((verdict) => {
        const count = members.reduce(
          (s, m) => s + (m.distribution.find((d) => d.verdict === verdict)?.count || 0),
          0
        );
        return { verdict, count, pct: total ? (count / total) * 100 : 0 };
      });
      return {
        owner,
        count: total,
        members: members.sort(
          (a, b) => b.count - a.count || a.publication.localeCompare(b.publication)
        ),
        avgTruth: round1(wavg('avgTruth')),
        avgSens: round1(wavg('avgSens')),
        avgClick: round1(wavg('avgClick')),
        distribution,
      };
    })
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

export default function Scorecards({ cards, selected, onSelect }) {
  const [byOwner, setByOwner] = useState(false);
  if (!cards.length) return null;

  const groups = byOwner ? clusterByOwner(cards) : null;

  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
          Publication Scorecards
        </h2>
        <button
          type="button"
          onClick={() => setByOwner((v) => !v)}
          className="rounded-sm border-hair px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
          style={{
            color: byOwner ? '#0f0d0a' : '#5aabb0',
            backgroundColor: byOwner ? '#5aabb0' : 'transparent',
            borderColor: '#5aabb066',
          }}
        >
          Group by owner
        </button>
      </div>

      {byOwner ? (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.owner}>
              {/* Owner-level summary row — averages across that owner's outlets. */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-hair border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold text-[#e8e4dc]">
                    {group.owner}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/35">
                    {group.members.length} outlet{group.members.length === 1 ? '' : 's'} ·{' '}
                    {group.count} headlines
                  </div>
                </div>
                <div className="w-40">
                  <MiniBar distribution={group.distribution} />
                </div>
                <div className="flex gap-8">
                  <Metric label="Avg Fidelity" value={group.avgTruth} />
                  <Metric label="Avg Sens" value={group.avgSens} />
                  <Metric label="Avg Clickbait" value={group.avgClick} />
                </div>
              </div>

              {/* The owner's outlets — same cards, so intra-owner variance shows. */}
              <div className="grid grid-cols-1 gap-px border-hair border-t-0 border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.members.map((card) => (
                  <ScorecardCard
                    key={card.publication}
                    card={card}
                    active={selected === card.publication}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px border-hair border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <ScorecardCard
              key={card.publication}
              card={card}
              active={selected === card.publication}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {selected && (
        <p className="mt-2 font-mono text-[11px] text-white/40">
          Filtering table to <span className="text-teal">{selected}</span> · click the card again to
          clear.
        </p>
      )}
    </section>
  );
}
