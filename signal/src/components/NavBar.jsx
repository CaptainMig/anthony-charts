import { ACCENT } from '../config.js';

const todayLabel = () =>
  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function NavBar({ articleCount, scanning, progress, onScan, onSettings }) {
  return (
    <nav className="sticky top-0 z-30 border-b-hair border-white/10 bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#e8e4dc]">
            Anthony Charts
            <span className="mx-2 text-white/30">·</span>
            <span style={{ color: ACCENT }}>Signal</span>
          </h1>
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-white/35 sm:inline">
            media integrity scanner
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-white/40 md:inline">
            {todayLabel()}
          </span>

          <span className="rounded-sm border-hair border-white/15 px-2.5 py-1 font-mono text-[11px] tabular-nums text-white/70">
            {articleCount} articles
          </span>

          <button
            type="button"
            onClick={onSettings}
            title="API key settings"
            className="rounded-sm border-hair border-white/15 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white/55 transition-colors hover:border-white/30 hover:text-white/80"
          >
            Key
          </button>

          <button
            type="button"
            onClick={onScan}
            disabled={scanning}
            className="rounded-sm px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {scanning ? `Scanning ${progress?.done ?? 0}/${progress?.total ?? 0}` : 'Refresh scan'}
          </button>
        </div>
      </div>

      {scanning && progress?.total > 0 && (
        <div className="h-[2px] w-full bg-white/5">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${(progress.done / progress.total) * 100}%`,
              backgroundColor: ACCENT,
            }}
          />
        </div>
      )}
    </nav>
  );
}
