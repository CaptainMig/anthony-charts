# AnthonyCharts v18 — data-driven build (redesign)

The deployed page (`public/index.html`) is a **build artifact**. Every
value-bearing region is generated from data, so an issue update is a data
edit plus a build — never HTML surgery.

## Files

| File | Role |
|------|------|
| `data/issue-data.json` | **Single source of truth.** Composites, all 16 meter tiles, drawers (weights/method/share), sources, Signal × Trends config, signal_blend flag. |
| `public/data/scores-history.csv` | Append-only ledger of Edge/Goodness/Calm per issue — drives the trend chart series. Never rewrite rows. |
| `public/data/scores-history.json` | Append-only per-meter snapshot ledger — drives every sparkline and drawer HISTORY. The generator appends the current issue automatically (idempotent by issue id). |
| `build/template.html` | Static skeleton: head/SEO, design-system CSS, drawer + page JS, the acx trend-chart module, and `<!--BUILD:*-->` anchors the generator fills. |
| `build/build.js` | Reads the JSON + ledgers, appends the issue snapshot, renders every module (ticker, Signal × Trends, Balance, metric cards + sparklines, sources, weight chips, methodology, `window.AC_METERS`, `window.AC_TREND`), writes `public/index.html`. Every anchor asserts its match count. |
| `build/signal-blend.js` + `build/test-signal-blend.js` | Flagged Info Integrity × Signal blend and its guard tests (`node build/test-signal-blend.js`). |
| `build/verify.js` | Data-tracing proof: renders the generated page in jsdom and asserts every displayed value traces to the data, sparklines/history exist **only** where ≥3 real ledger points exist, the drawer works for all 18 meters, the SAMPLE DATA label honesty rule holds, and the trend series matches the CSV ledger. |

## Publishing an issue update

```bash
# 1. Edit the data — composites, affected tiles, drawers, and bump `issue`
#    ({ id, date, label }): the generator appends this issue's snapshot to
#    the metric ledger and stamps LAST UPDATED from it.
$EDITOR data/issue-data.json

# 2. Append the new row to the CSV ledger (append-only).
$EDITOR public/data/scores-history.csv

# 3. Regenerate + verify (jsdom via NODE_PATH or a local install).
node build/build.js
node build/verify.js
node build/test-signal-blend.js

# 4. Commit data + ledgers + generated page together.
```

## Honesty guardrails baked into the build

- Sparklines and drawer HISTORY render **only** from real recorded ledger
  points (≥3); otherwise the card ships without a curve and the drawer says
  how many points exist. No invented curves, ever.
- Signal × Trends shows a **SAMPLE DATA** label while
  `signal_trends.sample` is true; it only comes off when a real pipeline
  replaces the rows.
- `signal_blend` stays disabled until Anthony signs off (condition on
  record: flip to SIGNAL 10% only after 14 days of Signal fallback <10%);
  a stale (>48h) or thin (<30 scored) aggregate can never move the meter.
- `verify.js` fails the build if any of the above is violated.
