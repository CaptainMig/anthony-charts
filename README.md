# AnthonyCharts

**Live:** [anthonycharts.com](https://anthonycharts.com)

A verified news-intelligence dashboard tracking the state of the world through composite indices with published weights, paired-opposite framing, and an append-only scoring ledger. Built and maintained by [Anthony Migliazzo](https://www.linkedin.com/in/amigliazzo/) · Starpoint LLC.

## What it tracks

Three headline composites, updated by issue:

- **World on Edge** — geopolitical tension (GPR, active conflicts, global worry, conflict deaths, species pressure; weighted, weights published on-page)
- **World Goodness** — humanitarian aid, poverty trend, scientific breakthroughs, treaties, mobility, conservation
- **Calm Window** — the probability the current moment resolves toward de-escalation

Plus 16 monitored signals across climate (CO₂, temperature anomaly, sea level, Arctic ice), space (exoplanets, solar activity, near-Earth objects, technosignature watch), and society (inequality, mobility, conflict, peacekeeping, species, conservation, supply chains, information integrity).

## Methodology principles

1. **Published weights.** Every composite shows its inputs and weights on the page. No black box.
2. **Paired opposites.** Edge and Goodness are scored independently — the dashboard is structurally prevented from telling only one story.
3. **Append-only ledger.** `public/data/scores-history.csv` is the scoring record. Each issue appends one row with the composite values, deltas, and a written rationale. Prior rows are never edited or regenerated.
4. **Verified sources, stated freshness.** Values carry their as-of dates and sources (NOAA, Copernicus/C3S, NASA, EIA, GPR, ACLED). Anything that can't be verified at update time is labeled with its last verified date rather than estimated.

## Architecture

The deployed page is a **fully static, self-contained HTML file** — no runtime fetches, no client-side data dependencies. It is generated, not hand-edited:

```
data/issue-data.json   → canonical values for every tile, ticker item, drawer, and arc
build/build.js         → regenerates public/index.html from the data file
build/verify.js        → renders before/after in a real DOM (jsdom) and diffs the
                         full page, all 18 drawers, and the arc table — the build
                         is proven identical, not asserted
```

### Publishing an issue

```bash
# 1. Edit canonical values + authored prose
vim data/issue-data.json

# 2. Append the issue row to the ledger (never edit prior rows)
vim public/data/scores-history.csv

# 3. Regenerate and prove
node build/build.js
node build/verify.js   # must PASS

# 4. Commit — the generated index.html is committed, so git history
#    is an issue-by-issue record of exactly what the site said, and when
```

## Why it's built this way

The dashboard's subject is decision-quality under uncertainty, so the build holds itself to the same standard: every claim has provenance, every update leaves a record, and every build is verified against its specification rather than trusted. The same discipline underlies [NERVA](https://nerva-v10.vercel.app), the decision-integrity kernel developed alongside this project.

## Disclaimer

AnthonyCharts is an editorial synthesis of public data, not a forecasting service. Composite scores reflect the published methodology applied to verified inputs as of each issue date. Verify figures against primary sources before downstream use.

---

© Starpoint LLC · Index methodology and composite framework are original work; underlying data belongs to its cited sources.
