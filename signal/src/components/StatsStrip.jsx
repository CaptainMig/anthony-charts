import { ACCENT } from '../config.js';

// Color a 1-10 score: green high (good for truth), amber/red low. Inverted for
// sensationalism where high is bad.
function scoreColor(value, invert = false) {
  if (!value) return 'rgba(232,228,220,0.5)';
  const v = invert ? 11 - value : value;
  if (v >= 7) return '#6fd49a';
  if (v >= 4) return '#c8971f';
  return '#f08080';
}

function integrityColor(pct) {
  if (pct >= 60) return '#6fd49a';
  if (pct >= 35) return '#c8971f';
  return '#f08080';
}

// Slam Index: higher = more "slam journalism" framing = more concerning.
function slamColor(pct) {
  if (pct >= 25) return '#f08080';
  if (pct >= 10) return '#c8971f';
  return 'rgba(232,228,220,0.85)';
}

// A 95% bootstrap interval rendered small + muted, e.g. "(66–82%)".
function ciLabel(ci) {
  if (!ci) return null;
  return `(${Math.round(ci.lo)}–${Math.round(ci.hi)}%)`;
}

function Stat({ label, value, color, interval }) {
  return (
    <div className="flex flex-col gap-1 border-b-hair border-r-hair border-white/10 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className="font-display text-2xl font-semibold tabular-nums"
          style={{ color: color || '#e8e4dc' }}
        >
          {value}
        </span>
        {interval && (
          <span className="font-mono text-[11px] tabular-nums text-white/30">{interval}</span>
        )}
      </span>
    </div>
  );
}

export default function StatsStrip({ stats, integrityCI, slamCI }) {
  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-6">
      <div className="grid grid-cols-2 border-l-hair border-t-hair border-white/10 sm:grid-cols-3 lg:grid-cols-7">
        <Stat label="Total Headlines" value={stats.totalHeadlines} color={ACCENT} />
        <Stat label="Sources Active" value={stats.sourcesActive} color={ACCENT} />
        <Stat
          label="Avg Fidelity"
          value={stats.avgTruth ? stats.avgTruth.toFixed(1) : '—'}
          color={scoreColor(stats.avgTruth)}
        />
        <Stat
          label="Avg Sensationalism"
          value={stats.avgSens ? stats.avgSens.toFixed(1) : '—'}
          color={scoreColor(stats.avgSens, true)}
        />
        <Stat
          label="Avg Clickbait"
          value={stats.avgClick ? stats.avgClick.toFixed(1) : '—'}
          color={scoreColor(stats.avgClick, true)}
        />
        <Stat
          label="Integrity Score"
          value={`${stats.integrity}%`}
          color={integrityColor(stats.integrity)}
          interval={ciLabel(integrityCI)}
        />
        <Stat
          label="Slam Index"
          value={`${stats.slamIndex ?? 0}%`}
          color={slamColor(stats.slamIndex ?? 0)}
          interval={ciLabel(slamCI)}
        />
      </div>
    </section>
  );
}
