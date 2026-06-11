# AnthonyCharts v17 — data-driven build

The deployed page (`public/index.html`) is now a **build artifact**. Every
value-bearing region is generated from one file, so an issue update is a
data edit plus a build — not forty string edits scattered across the HTML.

## Files

| File | Role |
|------|------|
| `data/issue-data.json` | **Single source of truth.** Hero/composite values, every meter tile, the ticker, all 18 drawers, the arc table, banner, and methodology values. |
| `build/template.html` | Static skeleton (CSS, layout, SVG, scripts). No issue-specific values matter here — the generator overwrites every value-bearing region. |
| `build/build.js` | Reads the JSON + template, writes `public/index.html`. Each substitution asserts its match count, so a broken anchor fails loudly. |
| `build/verify.js` | Renders the previous page and the generated page in a real DOM (jsdom) and proves they are **visually identical** — whole page, every drawer opened, and the arc table. |
| `public/index.html` | Generated output. Committed so Vercel serves it directly (no build step in the deploy). |
| `public/data/scores-history.csv` | The append-only ledger of composite scores. Unchanged by this refactor. |

## Publishing an issue update

```bash
# 1. Edit the data — typically composite.edge/good/calm, the affected tiles,
#    the matching ticker lines, and the drawers you researched.
$EDITOR data/issue-data.json

# 2. Append the new row to the ledger (append-only — never rewrite old rows).
$EDITOR public/data/scores-history.csv

# 3. Regenerate the page.
node build/build.js

# 4. Prove only what you intended changed. Pass the PRE-edit page as the
#    reference (e.g. the committed one) to see a focused diff:
git show HEAD:public/index.html > /tmp/prev.html
node build/verify.js /tmp/prev.html

# 5. Commit data + generated page together.
```

Run with `NODE_PATH` pointing at a jsdom install, or add jsdom as a dev
dependency (`npm i -D jsdom`).

## What derives from what

- The canonical composite values (`composite.edge.num`, `good.num`,
  `calm_pct`, `trade_footer`) drive the hero numbers, the three SEO/social
  meta tags, the methodology footer, the chart NOW labels, and the
  flicker target. Change the number once; it propagates everywhere.
- Meter tiles, ticker lines, the arc table, and drawer prose are authored
  arrays/objects in the same `data/issue-data.json`. Drawer text is free
  prose (sources, narrative), so it is edited directly rather than derived.

## Guardrail

`build.js` throws if any anchor matches an unexpected number of times, and
`verify.js` exits non-zero on any rendered-DOM difference. Together they
catch the class of bug that recurred through Issues 1–5: a value updated in
one place but stale in another.
