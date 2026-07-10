import { useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS, INTEGRITY_VERDICTS } from './config.js';
import { fetchAllFeeds } from './lib/feeds.js';
import { scoreHeadlines, isRealScore } from './lib/scoring.js';
import { atmosphere, scorecards, stripStats, integrityScore } from './lib/stats.js';
import { detectSlam, slamStats } from './lib/slam.js';
import { bootstrapCI } from './lib/bootstrap.js';
import { permutationTest } from './lib/permutation.js';
import { buildBriefing } from './lib/briefing.js';
import { fetchTrends, makeTrendingMatcher } from './lib/trends.js';
import { setFramingIntegrity } from './lib/integrity.js';
import { articleId, decodeShare, encodeShare } from './lib/article.js';
import { submitAggregate } from './lib/aggregate.js';
import ArticleDetail from './components/ArticleDetail.jsx';
import NavBar from './components/NavBar.jsx';
import AtmosphereBar from './components/AtmosphereBar.jsx';
import StatsStrip from './components/StatsStrip.jsx';
import Scorecards from './components/Scorecards.jsx';
import HeadlineTable from './components/HeadlineTable.jsx';
import MethodologyPanel from './components/MethodologyPanel.jsx';
import TrendsPanel from './components/TrendsPanel.jsx';
import TvRail from './components/TvRail.jsx';

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

// Resolve the article route from the current URL. Two entry shapes:
//   /article/:id?d=…   — internal navigation (pushState) and share links
//   /?article=:id&d=…  — hard loads, handed over by api/og.js after unfurlers
//                        read their per-article OG meta
// Returns { id, payload } or null.
function articleRoute() {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  const m = pathname.match(/^\/article\/([a-z0-9]+)$/i);
  const id = m ? m[1] : params.get('article');
  if (!id) return null;
  const d = params.get('d');
  return { id, payload: d ? decodeShare(d) : null };
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
  // Live TV rail — OFF by default. No iframe/video network exists until on.
  const [liveTv, setLiveTv] = useState(false);
  // Google Trends — display-only, fetched independently of scoring. null until
  // first fetch resolves; { status: 'ok'|'error', terms } thereafter.
  const [trends, setTrends] = useState(null);

  // Monotonic run id — lets an in-flight scan know it has been superseded.
  const runRef = useRef(0);

  // Article detail route — /article/:id. Kept in sync with the History API so
  // back/forward and shared links behave like real pages.
  const [route, setRoute] = useState(() => articleRoute());
  useEffect(() => {
    const onPop = () => setRoute(articleRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function openArticle(h) {
    const id = articleId(h.link);
    window.history.pushState({}, '', `/article/${id}?d=${encodeShare(h)}`);
    setRoute({ id, payload: null });
    window.scrollTo({ top: 0 });
  }

  function closeArticle() {
    window.history.pushState({}, '', '/');
    setRoute(null);
  }

  // Rows with a real model verdict. UNSCORED rows (scoring call failed) and
  // legacy failed-fallback rows from old cached scans render in the table but
  // are excluded from every aggregate — a default presented as a score is
  // exactly what Signal exists to catch.
  const realScored = useMemo(() => scored.filter((h) => isRealScore(h.score)), [scored]);

  // Keep the exported Framing Integrity value current as headlines stream in.
  useEffect(() => {
    setFramingIntegrity(integrityScore(realScored));
  }, [realScored]);

  // Fetch Google Trends once on mount — fully independent of scoring. fetchTrends
  // never throws and never retries, so a Trends outage can't touch a scan.
  useEffect(() => {
    let alive = true;
    fetchTrends().then((t) => {
      if (alive) setTrends(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Display-only matcher for the trending cross-reference dot on headline rows.
  const isTrending = useMemo(
    () => makeTrendingMatcher(trends?.status === 'ok' ? trends.terms : []),
    [trends]
  );

  async function runScan() {
    const myRun = ++runRef.current;
    setScanning(true);
    setSelectedPub(null);
    setProgress({ done: 0, total: 0 });

    // Refresh Trends in parallel — fire-and-forget, never awaited, so a slow or
    // broken Trends endpoint cannot delay or break the scan.
    fetchTrends().then(setTrends);

    const status = [];
    const { headlines, skipped, errored, staleFeeds, drops } = await fetchAllFeeds({
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
    // Feed hygiene — surface every dropped item honestly. A feed whose items
    // ALL dropped as stale is a frozen/archived feed, reported as such rather
    // than silently vanishing from the scan.
    const fullyStale = new Set(staleFeeds.map((f) => f.name));
    for (const f of staleFeeds) {
      status.push(`${f.name}: ${f.dropped} items dropped (stale feed — nothing newer than 48h)`);
    }
    for (const d of drops.filter((d) => !fullyStale.has(d.name))) {
      const parts = [];
      if (d.stale) parts.push(`${d.stale} stale >48h`);
      if (d.malformed) parts.push(`${d.malformed} malformed`);
      status.push(`${d.name}: ${d.stale + d.malformed} item(s) dropped (${parts.join(', ')})`);
    }

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

    // Retry pass: one more sweep over anything that came back UNSCORED
    // (upstream timeout/error). Successes replace their rows in place.
    const firstPassUnscored = collected.filter((h) => h.score.unscored);
    if (firstPassUnscored.length) {
      setMeta((m) => ({
        ...m,
        status: [...status, `retrying ${firstPassUnscored.length} unscored headline(s)…`],
      }));
      await scoreHeadlines(firstPassUnscored, {
        shouldStop: () => runRef.current !== myRun,
        onScored: (headline, score) => {
          if (runRef.current !== myRun || score.unscored) return;
          const i = collected.findIndex((h) => h.id === headline.id);
          if (i !== -1) collected[i] = { ...collected[i], score };
          setScored([...collected]);
        },
      });
      if (runRef.current !== myRun) return;
    }

    // Anything still UNSCORED after the retry pass stays visibly grey and out
    // of the averages — surfaced here instead of hidden in a default verdict.
    const unscoredCount = collected.filter((h) => h.score.unscored).length;
    const finalStatus =
      unscoredCount > 0
        ? [
            ...status,
            `${unscoredCount}/${collected.length} headline(s) UNSCORED after retry (scoring timeout/error) — shown grey, excluded from averages`,
          ]
        : status;
    setMeta({ fetchedCount, sourcesActive, status: finalStatus });

    // Publish this sweep's aggregate for the AnthonyCharts generator —
    // fire-and-forget, real scores from the last 24h only.
    submitAggregate(collected);

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
  // Aggregates (slam stats, uncertainty, briefing) only ever see rows with a
  // real verdict — UNSCORED rows appear in the table but never in the math.
  const realScoredSlam = useMemo(
    () => scoredSlam.filter((h) => isRealScore(h.score)),
    [scoredSlam]
  );
  const slam = useMemo(() => slamStats(realScoredSlam), [realScoredSlam]);

  // Uncertainty math is heavier (2000 bootstrap / 5000 permutation), so compute
  // it once on the FINAL scan — not on every per-headline tick while scanning.
  const uncertainty = useMemo(() => {
    if (scanning || realScoredSlam.length === 0) return null;
    const intVals = realScoredSlam.map((h) => (INTEGRITY_VERDICTS.includes(h.score.verdict) ? 1 : 0));
    const slamVals = realScoredSlam.map((h) => (h.slam.matched ? 1 : 0));
    const sensVals = realScoredSlam.map((h) => h.score.sens);
    return {
      integrityCI: bootstrapCI(intVals, meanPct),
      slamCI: bootstrapCI(slamVals, meanPct),
      perm: permutationTest(slamVals, sensVals),
    };
  }, [scanning, realScoredSlam]);

  // Derived views. Distribution, scorecards, and averages are computed over
  // really-scored rows only; the headline count stays the full row count.
  const distribution = useMemo(() => atmosphere(realScored), [realScored]);
  const cards = useMemo(() => scorecards(realScored), [realScored]);
  const stats = useMemo(
    () => ({
      ...stripStats(realScored, {
        totalHeadlines: scored.length,
        sourcesActive: meta.sourcesActive,
      }),
      slamIndex: slam.index,
    }),
    [realScored, scored.length, meta.sourcesActive, slam.index]
  );
  const tableRows = useMemo(
    () => (selectedPub ? scoredSlam.filter((h) => h.publication === selectedPub) : scoredSlam),
    [scoredSlam, selectedPub]
  );

  const briefDate = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    []
  );

  // Today's Briefing — assembled purely from the scan's own aggregates (no API,
  // no model). Numbers are taken from the same values the stat strip shows so
  // the two can never disagree. Declared after `stats` so it can read it.
  const briefing = useMemo(() => {
    if (scanning) return null; // assembles when the scan completes
    if (realScoredSlam.length === 0) return buildBriefing({ date: briefDate, n: 0 });

    const verdictCounts = {};
    const slamTally = {};
    for (const h of realScoredSlam) {
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
      // Count only really-scored rows — the briefing's integrity/tone numbers
      // are computed over these, so the headline count must match.
      n: realScoredSlam.length,
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
  }, [scanning, realScoredSlam, uncertainty, stats, slam.flaggedCount, briefDate]);

  const articleCount = meta.fetchedCount || scored.length;

  // Detail-route headline: prefer the live scan's row (fresh score, pubDate);
  // fall back to the share payload for devices that never ran a scan.
  const articleHeadline = useMemo(() => {
    if (!route) return null;
    const local = scored.find((h) => articleId(h.link) === route.id);
    return local || route.payload || null;
  }, [route, scored]);

  return (
    <div className="min-h-screen bg-ink">
      <NavBar
        articleCount={articleCount}
        scanning={scanning}
        progress={progress}
        onScan={runScan}
        onHelp={() => setShowHelp(true)}
        tvOn={liveTv}
        onToggleTv={() => setLiveTv((v) => !v)}
      />

      {route ? (
        articleHeadline ? (
          <ArticleDetail headline={articleHeadline} onBack={closeArticle} />
        ) : (
          <section className="mx-auto max-w-[900px] px-6 pb-20 pt-10">
            <button
              type="button"
              onClick={closeArticle}
              className="mb-4 font-mono text-[11px] uppercase tracking-wider text-teal hover:underline"
            >
              ← Back to scan
            </button>
            <p className="font-mono text-[12px] text-white/45">
              Article not found — it isn&apos;t in the current scan and this link carries no share
              payload. Run a scan or use the original share link.
            </p>
          </section>
        )
      ) : (
        <>
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

      <AtmosphereBar distribution={distribution} total={realScored.length} />
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

      <TrendsPanel trends={trends} />
      <HeadlineTable headlines={tableRows} isTrending={isTrending} onOpen={openArticle} />

      {scored.length === 0 && !scanning && (
        <div className="mx-auto max-w-[1400px] px-6 pb-20 text-center">
          <p className="font-mono text-[12px] text-white/40">
            Press <span className="text-teal">Refresh scan</span> to pull live headlines from 20 US
            news outlets and score them for media integrity.
          </p>
        </div>
      )}
        </>
      )}

      <footer className="border-t-hair border-white/10 px-6 py-6">
        <p className="mx-auto max-w-[1400px] font-mono text-[10px] text-white/30">
          Signal scores headline framing through a NERVA-derived rubric · scoring is editorial
          synthesis, not ground truth · headlines © their respective publications.
        </p>
      </footer>

      <MethodologyPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <TvRail open={liveTv} onClose={() => setLiveTv(false)} />
    </div>
  );
}
