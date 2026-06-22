import { useMemo, useRef, useState } from 'react';
import { VERDICTS, VERDICT_COLORS } from '../config.js';
import { ageLabel, ageMinutes } from '../lib/stats.js';

const ROW_HEIGHT = 44; // px — fixed so the virtual window math stays simple
const VIRTUALIZE_OVER = 100;
const OVERSCAN = 8;

const FILTERS = ['ALL', ...VERDICTS];

// Column definitions: how to read the sort key from a row.
const COLUMNS = [
  { key: 'verdict', label: 'Verdict', get: (h) => h.score.verdict, align: 'left' },
  { key: 'headline', label: 'Headline', get: (h) => h.title.toLowerCase(), align: 'left', grow: true },
  { key: 'publication', label: 'Publication', get: (h) => h.publication.toLowerCase(), align: 'left' },
  { key: 'owner', label: 'Owner', get: (h) => h.owner.toLowerCase(), align: 'left' },
  { key: 'bias', label: 'Bias', get: (h) => h.score.bias, align: 'left' },
  { key: 'truth', label: 'Truth', get: (h) => h.score.truth, align: 'right' },
  { key: 'sens', label: 'Sens', get: (h) => h.score.sens, align: 'right' },
  { key: 'click', label: 'Clickbait', get: (h) => h.score.click, align: 'right' },
  { key: 'age', label: 'Age', get: (h) => ageMinutes(h.pubDate), align: 'right' },
];

function VerdictPill({ verdict }) {
  const color = VERDICT_COLORS[verdict];
  return (
    <span
      className="inline-block rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}1f`, border: `0.5px solid ${color}55` }}
    >
      {verdict}
    </span>
  );
}

function biasColor(bias) {
  if (bias === 'LEFT') return '#8bbef0';
  if (bias === 'RIGHT') return '#f08080';
  return 'rgba(232,228,220,0.6)';
}

function ScoreCell({ value, invert = false }) {
  const v = invert ? 11 - value : value;
  const color = v >= 7 ? '#6fd49a' : v >= 4 ? '#c8971f' : '#f08080';
  return (
    <span className="font-mono tabular-nums" style={{ color }}>
      {value}
    </span>
  );
}

export default function HeadlineTable({ headlines }) {
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'age', dir: 'asc' });
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(560);

  const filtered = useMemo(() => {
    const base = filter === 'ALL' ? headlines : headlines.filter((h) => h.score.verdict === filter);
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
    const c = { ALL: headlines.length };
    for (const v of VERDICTS) c[v] = 0;
    for (const h of headlines) c[h.score.verdict]++;
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
              {f === 'ALL' ? 'All' : f} {counts[f] ?? 0}
            </button>
          );
        })}
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
                col.grow ? 'flex-1' : 'w-[110px] shrink-0'
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
                    <div className="w-[110px] shrink-0 px-3">
                      <VerdictPill verdict={h.score.verdict} />
                    </div>
                    <div className="flex-1 truncate px-3" title={h.title}>
                      <a
                        href={h.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] text-[#e8e4dc]/90 hover:text-teal hover:underline"
                        title={h.title}
                      >
                        {h.title}
                      </a>
                    </div>
                    <div className="w-[110px] shrink-0 truncate px-3 font-mono text-[11px] text-white/60">
                      {h.publication}
                    </div>
                    <div className="w-[110px] shrink-0 truncate px-3 font-mono text-[11px] text-white/40">
                      {h.owner}
                    </div>
                    <div className="w-[110px] shrink-0 px-3 font-mono text-[11px]">
                      <span style={{ color: biasColor(h.score.bias) }}>{h.score.bias}</span>
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
