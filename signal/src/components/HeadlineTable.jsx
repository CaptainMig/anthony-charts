import { useMemo, useRef, useState } from 'react';
import { DISPLAY_VERDICTS, VERDICT_COLORS, verdictLabel } from '../config.js';
import { ageLabel, ageMinutes } from '../lib/stats.js';

const ROW_HEIGHT = 44; // px — fixed so the virtual window math stays simple
const VIRTUALIZE_OVER = 100;
const OVERSCAN = 8;

// UNSCORED is a failure state, not a verdict — it filters like one but its
// rows are grey and carry no numbers.
const FILTERS = ['ALL', ...DISPLAY_VERDICTS, 'UNSCORED'];

// Column definitions: how to read the sort key from a row. Null scores
// (UNSCORED rows) sort below every real number. The verdict column is wider
// than the rest — UNVERIFIABLE plus the FT override marker needs the room.
const COLUMNS = [
  { key: 'verdict', label: 'Verdict', get: (h) => h.score.verdict, align: 'left', w: 'w-[140px]' },
  { key: 'headline', label: 'Headline', get: (h) => h.title.toLowerCase(), align: 'left', grow: true },
  { key: 'publication', label: 'Publication', get: (h) => h.publication.toLowerCase(), align: 'left' },
  { key: 'owner', label: 'Owner', get: (h) => h.owner.toLowerCase(), align: 'left' },
  { key: 'truth', label: 'Fidelity', get: (h) => h.score.truth ?? -1, align: 'right' },
  { key: 'sens', label: 'Sens', get: (h) => h.score.sens ?? -1, align: 'right' },
  { key: 'click', label: 'Clickbait', get: (h) => h.score.click ?? -1, align: 'right' },
  { key: 'age', label: 'Age', get: (h) => ageMinutes(h.pubDate), align: 'right' },
];

function VerdictPill({ verdict }) {
  const color = VERDICT_COLORS[verdict];
  return (
    <span
      className="inline-block rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}1f`, border: `0.5px solid ${color}55` }}
    >
      {verdictLabel(verdict)}
    </span>
  );
}

const SLAM_RED = '#f08080';

// Slam-journalism badge: solid for a core verb, muted outline for a watch verb.
function SlamBadge({ slam }) {
  const core = slam.tier === 'core';
  return (
    <span
      className="shrink-0 rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
      title={`Slam-journalism verb (${slam.tier}): "${slam.term}"`}
      style={
        core
          ? { color: SLAM_RED, backgroundColor: `${SLAM_RED}1f`, border: `0.5px solid ${SLAM_RED}66` }
          : { color: 'rgba(240,128,128,0.6)', border: '0.5px solid rgba(240,128,128,0.28)' }
      }
    >
      SLAM · {slam.term}
    </span>
  );
}

function ScoreCell({ value, invert = false }) {
  // UNSCORED rows carry no numbers — render an em dash, never a default score.
  if (value == null) {
    return <span className="font-mono text-white/25">—</span>;
  }
  const v = invert ? 11 - value : value;
  const color = v >= 7 ? '#6fd49a' : v >= 4 ? '#c8971f' : '#f08080';
  return (
    <span className="font-mono tabular-nums" style={{ color }}>
      {value}
    </span>
  );
}

export default function HeadlineTable({ headlines, isTrending, onOpen }) {
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'age', dir: 'asc' });
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(560);

  const filtered = useMemo(() => {
    const base =
      filter === 'ALL'
        ? headlines
        : filter === 'SLAM'
          ? headlines.filter((h) => h.slam?.matched)
          : headlines.filter((h) => h.score.verdict === filter);
    const col = COLUMNS.find((c) => c.key === sort.key);
    const dir = sort.dir === 'asc' ? 1 : -1;
    // Secondary sort always falls back to Publication then Owner for stability.
    return [...base].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      if (a.publication !== b.publication) return a.publication.localeCompare(b.publication);
      return a.owner.localeCompare(b.owner);
    });
  }, [headlines, filter, sort]);

  const counts = useMemo(() => {
    const c = { ALL: headlines.length, SLAM: 0, UNSCORED: 0 };
    for (const v of DISPLAY_VERDICTS) c[v] = 0;
    for (const h of headlines) {
      if (h.score.verdict in c) c[h.score.verdict]++;
      if (h.slam?.matched) c.SLAM++;
    }
    return c;
  }, [headlines]);

  function toggleSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  const virtualize = filtered.length > VIRTUALIZE_OVER;
  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIdx = virtualize ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const visibleCount = virtualize
    ? Math.min(filtered.length - startIdx, Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2)
    : filtered.length;
  const rows = filtered.slice(startIdx, startIdx + visibleCount);

  return (
    <section className="mx-auto max-w-[1400px] px-6 pb-16 pt-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          const color = f === 'ALL' ? '#5aabb0' : VERDICT_COLORS[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="rounded-sm border-hair px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{
                color: active ? '#0f0d0a' : color,
                backgroundColor: active ? color : 'transparent',
                borderColor: `${color}66`,
              }}
            >
              {f === 'ALL' ? 'All' : verdictLabel(f)} {counts[f] ?? 0}
            </button>
          );
        })}

        {/* Slam chip — orthogonal to verdicts: filters to slam-flagged rows. */}
        <button
          type="button"
          onClick={() => setFilter(filter === 'SLAM' ? 'ALL' : 'SLAM')}
          className="ml-1 rounded-sm border-hair px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
          style={{
            color: filter === 'SLAM' ? '#0f0d0a' : SLAM_RED,
            backgroundColor: filter === 'SLAM' ? SLAM_RED : 'transparent',
            borderColor: `${SLAM_RED}66`,
          }}
        >
          SLAM {counts.SLAM ?? 0}
        </button>
      </div>

      <div className="overflow-hidden rounded-sm border-hair border-white/10">
        {/* Header */}
        <div className="flex border-b-hair border-white/10 bg-white/[0.03] font-mono text-[10px] uppercase tracking-wider text-white/45">
          <div className="w-[3px] shrink-0" />
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleSort(col.key)}
              className={`flex items-center gap-1 px-3 py-2.5 hover:text-white/80 ${
                col.grow ? 'flex-1' : `${col.w || 'w-[110px]'} shrink-0`
              } ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}
            >
              <span>{col.label}</span>
              {sort.key === col.key && (
                <span className="text-teal">{sort.dir === 'asc' ? '▲' : '▼'}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center font-mono text-[11px] uppercase tracking-wider text-white/25">
            no headlines
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={(e) => {
              setScrollTop(e.currentTarget.scrollTop);
              setViewport(e.currentTarget.clientHeight);
            }}
            className="max-h-[560px] overflow-y-auto"
          >
            <div style={virtualize ? { height: totalHeight, position: 'relative' } : undefined}>
              <div
                style={
                  virtualize
                    ? { position: 'absolute', top: startIdx * ROW_HEIGHT, left: 0, right: 0 }
                    : undefined
                }
              >
                {rows.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center border-b-hair border-white/[0.06] hover:bg-white/[0.025]"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className="h-full w-[3px] shrink-0"
                      style={{ backgroundColor: VERDICT_COLORS[h.score.verdict] }}
                    />
                    <div
                      className="flex w-[140px] shrink-0 items-center gap-1.5 px-3"
                      title={
                        h.score.fulltext
                          ? `Full-text verdict — overrides the headline-only sweep verdict (${verdictLabel(h.sweepScore?.verdict || 'UNSCORED')}).${h.score.rationale ? ` ${h.score.rationale}` : ''}`
                          : h.score.rationale || undefined
                      }
                    >
                      <VerdictPill verdict={h.score.verdict} />
                      {h.score.fulltext && (
                        <span className="shrink-0 font-mono text-[8px] font-bold tracking-wider text-teal">
                          FT
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2 px-3" title={h.title}>
                      {(() => {
                        const trend = isTrending ? isTrending(h.title) : null;
                        return trend ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: '#c8971f' }}
                            title={`Trending on Google: ${trend}`}
                          />
                        ) : null;
                      })()}
                      <button
                        type="button"
                        onClick={() => onOpen?.(h)}
                        className="truncate text-left text-[13px] text-[#e8e4dc]/90 hover:text-teal hover:underline"
                        title={`${h.title} — open detail view`}
                      >
                        {h.title}
                      </button>
                      <a
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-mono text-[11px] text-white/30 hover:text-teal"
                        title="Open original article"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↗
                      </a>
                      {h.slam?.matched && <SlamBadge slam={h.slam} />}
                    </div>
                    <div className="w-[110px] shrink-0 truncate px-3 font-mono text-[11px] text-white/60">
                      {h.publication}
                    </div>
                    <div className="w-[110px] shrink-0 truncate px-3 font-mono text-[11px] text-white/40">
                      {h.owner}
                    </div>
                    <div className="w-[110px] shrink-0 px-3 text-right text-[12px]">
                      <ScoreCell value={h.score.truth} />
                    </div>
                    <div className="w-[110px] shrink-0 px-3 text-right text-[12px]">
                      <ScoreCell value={h.score.sens} invert />
                    </div>
                    <div className="w-[110px] shrink-0 px-3 text-right text-[12px]">
                      <ScoreCell value={h.score.click} invert />
                    </div>
                    <div className="w-[110px] shrink-0 px-3 text-right font-mono text-[11px] tabular-nums text-white/45">
                      {ageLabel(h.pubDate)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
