# Anthony Charts · Signal

A media integrity scanner. Signal pulls live headlines from 20 major US news
outlets, scores each one individually through a NERVA-derived rubric using the
Claude API, and renders the results in a dark, data-dense dashboard with a live
atmosphere bar, publication scorecards, and a sortable headline table.

This is a standalone, fully client-side page intended to live at
`anthonycharts.com/signal`.

## Stack

- **React + Vite** — no backend, everything runs in the browser
- **Tailwind CSS** — design tokens match the AnthonyCharts system (Deep Ink
  `#0f0d0a`, Starpoint Teal `#5aabb0`, Fraunces / IBM Plex Sans / JetBrains Mono)
- **`@anthropic-ai/sdk`** with `claude-sonnet-4-6` — one API call per headline,
  scored through a concurrency-5 worker pool

## How it works

1. **Ingest.** `src/lib/feeds.js` pulls up to 10 headlines from each feed in
   `src/config.js` via the free `rss2json.com` proxy, in parallel, and
   deduplicates by the first 60 characters of the headline text. Empty feeds are
   skipped silently and noted in a status line under the nav; a `429` from the
   proxy triggers a 30-second auto-retry.
2. **Score.** `src/lib/scoring.js` runs a fixed pool of 5 concurrent Claude
   calls. Each call scores one headline and returns
   `{verdict, bias, truth, sens, click}`. A failed call retries once, then
   degrades to `UNVERIFIED` so the row still renders. The table, atmosphere bar,
   and stats update **live** as each batch finishes — you see value in seconds,
   not after the whole run.
3. **Display.** Atmosphere bar (hero), six-stat strip, per-publication
   scorecards (click to filter the table), and a sortable, virtualized headline
   table.

## Verdict rubric

| Verdict | Meaning |
| --- | --- |
| `VERIFIED` | factual, sourced, checkable claim, no spin, headline matches story |
| `CONTEXTUAL` | true but missing important context that changes meaning |
| `CONTESTED` | facts genuinely disputed, or editorially slanted but not false |
| `UNVERIFIED` | anonymous sources, speculation as fact, premature conclusions |
| `MISLEADING` | engineered to trigger reaction, distorts or omits facts for clicks |

The **Framing Integrity** metric is the percentage of scored headlines that are
`VERIFIED` or `CONTEXTUAL` — the share whose headline fairly represents its own
article. It is **not** a measure of whether the news is true: faithful framing
of slanted reporting still scores high.

## API key

Signal is fully client-side, so it needs an Anthropic API key supplied by the
user. The key is stored only in the browser's `localStorage` and sent only to
the Anthropic API. Press **Key** in the nav to set it; the first scan will
prompt for it if it isn't set.

## Future hook

`src/lib/integrity.js` exports `getFramingIntegrity()` returning the current
session's Framing Integrity (0–100). It's also attached to `window` so the main
AnthonyCharts dashboard can read it for the Framing Integrity meter without
importing the bundle. (Renamed from `getIntegrityScore` / `window.getIntegrityScore`
— the consumer must update to `window.getFramingIntegrity`.)

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

## Deploy

Configured for Vercel (`vercel.json`): framework `vite`, output `dist`, SPA
rewrite to `index.html`. Asset paths are relative, so the build works served at
the domain root or mounted under `/signal`.
