# Anthony Charts · Signal

**A media-integrity scanner that scores how faithfully a headline represents its own article — not whether the underlying event is true.**

Signal pulls live headlines from ~20 major US and international outlets, scores each one through a NERVA-derived rubric using Claude, and renders an atmosphere bar, per-publication scorecards, and a sortable headline table. It is an *audit layer*, not a newsroom: it doesn't produce news, it scores the framing of news that already exists.

Live: [anthony-signal.vercel.app](https://anthony-signal.vercel.app)

---

## The one idea that matters

**The article is the source of record. The world is not.**

Signal does **not** fact-check reality. The scoring model has a knowledge cutoff and no standing claim to ground truth, so asking it "is this event real?" produces exactly the wrong answer for breaking news — a genuinely true, genuinely important story gets marked *unverified* simply because the model has never heard of it. That's backwards for a media-integrity tool.

So Signal scores a narrower, answerable question: **does the headline faithfully represent the article it's attached to?** Each headline is scored against its own article body. A true event the model has never heard of comes back VERIFIED if the headline matches the story. A distorted headline on a real event comes back MISLEADING. Newness is never penalized.

This is the difference between **prediction** (claiming to know outcomes) and **provenance** (auditing the relationship between a claim and its source). Signal does the second.

---

## How scoring works

Every headline gets one **verdict** and three **scores** (0–10).

### Verdicts

| Verdict | Meaning |
|---|---|
| **VERIFIED** | The headline faithfully and fairly represents its article. No spin detected. |
| **CONTEXTUAL** | Accurate, but omits context the article itself supplies that would change how you read it. Not wrong — incomplete. |
| **CONTESTED** | The article presents the claim as disputed or attributed; the headline states it more flatly than the article warrants. |
| **UNVERIFIED** | The article itself flags the claim as developing, alleged, or anonymously sourced, and the headline drops that hedge. |
| **MISLEADING** | The headline distorts, omits, or exaggerates relative to its own article body. |

Note what these are scored *against*: the article, every time. "UNVERIFIED" never means "the model doesn't know about this." It means the article's own language hedges and the headline doesn't.

### Scores

- **Fidelity (0–10)** — how accurately the headline conveys the article's main claim. 10 = exact, no distortion. 0 = contradicts or invents.
- **Sensationalism (0–10)** — emotional inflation beyond what the article supports. 0 = flat and proportionate. 10 = maximally inflammatory.
- **Clickbait (0–10)** — curiosity-gap, withheld payoff, vague pronouns. 0 = fully informative. 10 = pure tease.

### Framing Integrity

**Framing Integrity** is the share of scanned headlines rated VERIFIED or CONTEXTUAL — the fraction of coverage that, by this rubric, fairly represents its own sourcing.

**Read it as "headline fidelity," not "trustworthiness of the news."** A VERIFIED badge means the headline matches its article. It does **not** mean Signal confirmed the underlying fact. An outlet whose headlines are perfectly faithful to its own slanted or propagandistic articles would score high. That's by design — Signal audits framing, and leaves the question of whether the article is *right* to the reader. The always-visible one-liner under the metric says exactly this, so the number can't be misread.

---

## Beyond the verdict

Two layers ride on top of the per-headline scores. Both describe the **current scan only** — there is no forecasting anywhere in Signal.

### The SLAM flag

A deterministic, transparent lexicon match — **not** an AI score. A fixed tiered list of conflict verbs ("slams", "blasts", "rips into"…) is matched against the headline text with word boundaries and literal guards (so "car slams into" and "fire guts building" don't trigger). Each flagged row shows the matched word; the **Slam Index** is the share of headlines with any match. It never changes a verdict — it's a separate, falsifiable signal you can audit by eye.

### Measurement uncertainty

The top metrics are point estimates from one ~125-headline sample, so Signal shows their **sampling uncertainty**, not just the number:

- **Bootstrap 95% confidence intervals** on Framing Integrity and the Slam Index (e.g. `74% (66–82%)`) — seeded, so the interval is reproducible for a given scan.
- A **permutation test** on the slam → sensationalism hypothesis: it states the observed gap, a p-value, and a plain-language verdict that **can come back negative** ("no significant difference this scan — the verb may be decoration"). With too few flagged headlines it says "not enough to test yet" rather than showing a misleading p. Always a single-scan result, never a standing conclusion.

---

## What Signal is not

- **Not a fact-checker.** VERIFIED ≠ confirmed-true. See above.
- **Not unbiased-by-fiat.** It doesn't claim neutrality; it claims to show its work. Every score has a one-line rationale on hover.
- **Not a forecaster.** Every number describes the current scan or a hypothesis test on it — never a future or projected value.
- **Not ground truth.** Scoring is fast AI editorial synthesis. It's imperfect. Use it as a signal, not a verdict.

---

## Architecture

- **Client** — React + Vite + Tailwind. Nav with live scan progress, atmosphere bar, seven-stat strip (including the Slam Index), clickable publication scorecards, a sortable/virtualized headline table, and a methodology panel.
- **Scoring proxy** (`api/score.js`) — scores one headline against its article body with `claude-sonnet-4-6`, `temperature: 0` for determinism. The Anthropic key is held server-side and **never reaches the browser**. CORS handling, per-IP rate limiting, and a `GET` health check returning `{ ok, hasKey }`.
- **Feed proxy** (`api/feed.js`) — server-side RSS/Atom fallback for feeds the browser/`rss2json` path drops (bypasses CORS and third-party rate limits, sends a real browser UA, follows redirects).
- **Feed recovery** — AP and Reuters discontinued their public RSS, so they're recovered through **Google News** aggregation (headline + thin snippet, routed through the empty-body path); Washington Post and others are direct feeds.
- **Determinism & resilience** — temperature 0, per-IP limit 200/min, client concurrency 3, exponential backoff with jitter (retries on 429/5xx/timeout, no retry on 401/403). Bootstrap/permutation use a seeded PRNG so intervals and p-values don't flicker.

### Dashboard hook

`src/lib/integrity.js` exports `getFramingIntegrity()` (also on `window.getFramingIntegrity`) returning the current session's Framing Integrity (0–100), so the main AnthonyCharts dashboard can read it without importing the bundle. *(Renamed from `getIntegrityScore` — consumers must update.)*

---

## Setup

```bash
cd signal
npm install
npm run dev
```

### Deploy (Vercel)

This project lives in the `signal/` subdirectory of the repo. Vercel must be pointed at it.

1. **Root Directory** = `signal`
2. **Production Branch** = `main`
3. Environment variable **`ANTHROPIC_API_KEY`** set for **Production + Preview**
4. Health check: open `/api/score` (GET) → should return `{"ok":true,"hasKey":true}`
   - HTML instead of JSON → Root Directory isn't `signal`
   - `hasKey:false` → the env var didn't take

A scan working correctly shows varied Fidelity scores (not a wall of identical fallback values), a low failed-score count, and the methodology panel describing Fidelity as headline-vs-article.

---

## Known limitations

- **Aggregated wires.** AP and Reuters come in via Google News rather than direct feeds, so they're scored on a headline plus a thin snippet — a weaker fidelity signal than direct-feed sources, disclosed in the methodology panel. Some origins still rate-limit or block; the status line under the nav names any feed that fails, with its reason.
- **Fast and imperfect.** Scoring is single-pass AI synthesis. Edge cases and satire can misfire.
- **Coverage ≠ completeness.** Signal scores the headlines it can pull on a given scan, not the full news cycle.

---

## Credits

NERVA is a decision-integrity framework developed by **Starpoint LLC** — it scores the quality of a decision (or here, a headline's fidelity to its source) *before* outcomes are known, on the principle of brake-with-provenance, not prediction.

Headlines remain © their respective publications. Signal stores no article content; it scores at scan time and discards.
