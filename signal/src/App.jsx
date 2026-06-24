import { useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS, INTEGRITY_VERDICTS } from './config.js';
import { fetchAllFeeds } from './lib/feeds.js';
import { scoreHeadlines } from './lib/scoring.js';
import { atmosphere, scorecards, stripStats, integrityScore } from './lib/stats.js';
import { detectSlam, slamStats } from './lib/slam.js';
import { bootstrapCI } from './lib/bootstrap.js';
import { permutationTest } from './lib/permutation.js';
import { buildBriefing } from './lib/briefing.js';
import { setFramingIntegrity } from './lib/integrity.js';
import NavBar from './components/NavBar.jsx';
import AtmosphereBar from './components/AtmosphereBar.jsx';
import StatsStrip from './components/StatsStrip.jsx';
import Scorecards from './components/Scorecards.jsx';
import HeadlineTable from './components/HeadlineTable.jsx';
import MethodologyPanel from './components/MethodologyPanel.jsx';

const meanPct = (arr) =>
  arr.length ? (100 * arr.reduce((s, x) => s + x, 0)) / arr.length : 0;

// Plain-language read of the permutation test for the CURRENT scan only.
function permVerdict(perm) {
  if (!perm) return '';
  if (perm.underpowered) {
    return `Only ${perm.n_flagged} flagged headline${perm.n_flagged === 1 ? '' : 's'} — not enough to test yet.`;
  }
  const gap = perm.observedDiff;
  const gapStr = `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} sensationalism`;
  const pStr = perm.p < 0.001 ? 'p < 0.001' : `p = ${perm.p.toFixed(2)}`;
  return perm.p < 0.05
    ? `Observed gap ${gapStr}. Slam-flagged headlines run hotter than chance (${pStr}). Hypothesis holds for this scan.`
    : `Observed gap ${gapStr}. No significant difference this scan (${pStr}). The verb may be decoration.`;
}

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastScan);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.scored)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const cached = loadCache();

  // Scored headlines: each is a feed headline with a `.score` attached.
  const [scored, setScored] = useState(cached?.scored || []);
  const [meta, setMeta] = useState(
    cached?.meta || { fetchedCount: 0, sourcesActive: 0, status: [] }
  );

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selectedPub, setSelectedPub] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Monotonic run id — lets an in-flight scan know it has been superseded.
  const runRef = useRef(0);

  // Keep the exported Framing Integrity value current as headlines stream in.
  useEffect(() => {
    setFramingIntegrity(integrityScore(scored));
  }, [scored]);

  async function runScan() {
    const myRun = ++runRef.current;
    setScanning(true);
    setSelectedPub(null);
    setProgress({ done: 0, total: 0 });

    const status = [];
    const { headlines, skipped, errored } = await fetchAllFeeds({
      onRateLimit: ({ feed }) => {
        if (runRef.current !== myRun) return;
        setMeta((m) => ({
          ...m,
          status: [...status, `Rate limited on ${feed} — retrying in 30s`],
        }));
      },
    });

    if (runRef.current !== myRun) return; // superseded by a newer scan

    if (skipped.length) status.push(`${skipped.length} feed(s) empty: ${skipped.join(', ')}`);
    if (errored.length)
      status.push(
        `${errored.length} feed(s) failed: ${errored
          .map((e) => `${e.name} (${e.reason || 'error'})`)
          .join(', ')}`
      );

    const sourcesActive = new Set(headlines.map((h) => h.publication)).size;
    const fetchedCount = headlines.length;
    setMeta({ fetchedCount, sourcesActive, status });
    setProgress({ done: 0, total: fetchedCount });

    // Fresh accumulator for this scan; replaces the previous (cached) results.
    const collected = [];
    setScored([]);

    await scoreHeadlines(headlines, {
      shouldStop: () => runRef.current !== myRun,
      onScored: (headline, score) => {
        if (runRef.current !== myRun) return;
        collected.push({ ...headline, score });
        setScored([...collected]);
        setProgress((p) => ({ ...p, done: collected.length }));
      },
    });

    if (runRef.current !== myRun) return;

    // If a large share of headlines fell back, the scoring proxy is failing —
    // surface it instead of silently showing a wall of UNVERIFIED.
    const failedCount = collected.filter((h) => h.score.failed).length;
    const finalStatus =
      failedCount > 0
        ? [
            ...status,
            `${failedCount}/${collected.length} headlines could not be scored — check the /api/score proxy and the ANTHROPIC_API_KEY env var in Vercel`,
          ]
        : status;
    setMeta({ fetchedCount, sourcesActive, status: finalStatus });

    setScanning(false);
    try {
      localStorage.setItem(
        STORAGE_KEYS.lastScan,
        JSON.stringify({
          at: Date.now(),
          scored: collected,
          meta: { fetchedCount, sourcesActive, status: finalStatus },
        })
      );
    } catch {
      /* localStorage may be full or unavailable — non-fatal */
    }
  }

  // The slam flag is deterministic on the headline text — derive it (handles
  // cached scans too) rather than storing it.
  const scoredSlam = useMemo(
    () => scored.map((h) => ({ ...h, slam: detectSlam(h.title) })),
    [scored]
  );
  const slam = useMemo(() => slamStats(scoredSlam), [scoredSlam]);

  // Uncertainty math is heavier (2000 bootstrap / 5000 permutation), so compute
  // it once on the FINAL scan — not on every per-headline tick while scanning.
  const uncertainty = useMemo(() => {
    if (scanning || scoredSlam.length === 0) return null;
    const intVals = scoredSlam.map((h) => (INTEGRITY_VERDICTS.includes(h.score.verdict) ? 1 : 0));
    const slamVals = scoredSlam.map((h) => (h.slam.matched ? 1 : 0));
    const sensVals = scoredSlam.map((h) => h.score.sens);
    return {
      integrityCI: bootstrapCI(intVals, meanPct),
      slamCI: bootstrapCI(slamVals, meanPct),
      perm: permutationTest(slamVals, sensVals),
    };
  }, [scanning, scoredSlam]);

  const briefDate = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    []
  );

  // Today's Briefing — assembled purely from the scan's own aggregates (no API,
  // no model). Numbers are taken from the same values the stat strip shows so
  // the two can never disagree.
  const briefing = useMemo(() => {
    if (scanning) return null; // assembles when the scan completes
    if (scoredSlam.length === 0) return buildBriefing({ date: briefDate, n: 0 });

    const verdictCounts = {};
    const slamTally = {};
    for (const h of scoredSlam) {
      verdictCounts[h.score.verdict] = (verdictCounts[h.score.verdict] || 0) + 1;
      if (h.slam.matched) slamTally[h.publication] = (slamTally[h.publication] || 0) + 1;
    }
    // The single outlet with the most slam hits (null on a tie or none).
    let topOutlet = null;
    let topCount = 0;
    let tie = false;
    for (const [pub, c] of Object.entries(slamTally)) {
      if (c > topCount) {
        topCount = c;
        topOutlet = pub;
        tie = false;
      } else if (c === topCount) {
        tie = true;
      }
    }
    if (tie || topCount === 0) topOutlet = null;

    return buildBriefing({
      date: briefDate,
      n: stats.totalHeadlines,
      sources: stats.sourcesActive,
      fi: stats.integrity,
      fiLo: uncertainty?.integrityCI.lo,
      fiHi: uncertainty?.integrityCI.hi,
      avgSens: stats.avgSens,
      avgClick: stats.avgClick,
      verdictCounts,
      slam: uncertainty
        ? {
            computed: true,
            flaggedCount: slam.flaggedCount,
            index: stats.slamIndex,
            lo: uncertainty.slamCI.lo,
            hi: uncertainty.slamCI.hi,
            topOutlet,
          }
        : null,
    });
  }, [scanning, scoredSlam, uncertainty, stats, slam.flaggedCount, briefDate]);

  // Derived views.
  const distribution = useMemo(() => atmosphere(scored), [scored]);
  const cards = useMemo(() => scorecards(scored), [scored]);
  const stats = useMemo(
    () => ({
      ...stripStats(scored, {
        totalHeadlines: scored.length,
        sourcesActive: meta.sourcesActive,
      }),
      slamIndex: slam.index,
    }),
    [scored, meta.sourcesActive, slam.index]
  );
  const tableRows = useMemo(
    () => (selectedPub ? scoredSlam.filter((h) => h.publication === selectedPub) : scoredSlam),
    [scoredSlam, selectedPub]
  );

  const articleCount = meta.fetchedCount || scored.length;

  return (
    <div className="min-h-screen bg-ink">
      <NavBar
        articleCount={articleCount}
        scanning={scanning}
        progress={progress}
        onScan={runScan}
        onHelp={() => setShowHelp(true)}
      />

      {(scanning || scored.length > 0 || meta.fetchedCount > 0) && (
        <section className="mx-auto max-w-[1400px] px-6 pt-6">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
            Today&apos;s Briefing
          </h2>
          <p className="max-w-3xl font-display text-[15px] leading-relaxed text-[#e8e4dc]/90">
            {scanning ? 'Brief assembles when the scan completes.' : briefing}
          </p>
          <p className="mt-1.5 font-mono text-[10px] tracking-wide text-white/30">
            Generated from this scan&apos;s aggregates — not written by AI.
          </p>
        </section>
      )}

      {meta.status.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-6 pt-3">
          <p className="font-mono text-[10px] leading-relaxed text-[#c8971f]/80">
            {meta.status.join(' · ')}
          </p>
        </div>
      )}

      <AtmosphereBar distribution={distribution} total={scored.length} />
      <StatsStrip
        stats={stats}
        integrityCI={uncertainty?.integrityCI}
        slamCI={uncertainty?.slamCI}
      />
      <Scorecards cards={cards} selected={selectedPub} onSelect={setSelectedPub} />

      {scored.length > 0 && (
        <div className="mx-auto max-w-[1400px] px-6 pt-6">
          <p className="font-mono text-[11px] tracking-wide text-white/45">
            <span className="text-[#f08080]">Slam Index {slam.index}%</span>
            <span className="mx-2 text-white/20">·</span>
            {slam.flaggedCount > 0 ? (
              <>
                avg sensationalism — flagged{' '}
                <span className="tabular-nums text-white/80">{slam.avgSensFlagged.toFixed(1)}</span> vs
                rest{' '}
                <span className="tabular-nums text-white/80">{slam.avgSensRest.toFixed(1)}</span>
                <span className="mx-2 text-white/20">·</span>
                <span className="text-white/35">{slam.flaggedCount} flagged</span>
              </>
            ) : (
              <span className="text-white/35">no slam-flagged headlines this scan</span>
            )}
          </p>
          {uncertainty && (
            <p className="mt-1.5 max-w-3xl font-mono text-[11px] leading-relaxed text-white/55">
              {permVerdict(uncertainty.perm)}
              <span className="text-white/30"> Single-scan result, not a standing conclusion.</span>
            </p>
          )}
        </div>
      )}

      <HeadlineTable headlines={tableRows} />

      {scored.length === 0 && !scanning && (
        <div className="mx-auto max-w-[1400px] px-6 pb-20 text-center">
          <p className="font-mono text-[12px] text-white/40">
            Press <span className="text-teal">Refresh scan</span> to pull live headlines from 20 US
            news outlets and score them for media integrity.
          </p>
        </div>
      )}

      <footer className="border-t-hair border-white/10 px-6 py-6">
        <p className="mx-auto max-w-[1400px] font-mono text-[10px] text-white/30">
          Signal scores headline framing through a NERVA-derived rubric · scoring is editorial
          synthesis, not ground truth · headlines © their respective publications.
        </p>
      </footer>

      <MethodologyPanel open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
