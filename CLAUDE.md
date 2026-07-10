# CLAUDE.md

Guidance for Claude Code sessions working in this repository.

## Workflow: every task ends with a merged PR

A fix sitting on a branch is not done. For every task that changes the repo:

1. Develop on a feature branch.
2. Commit and push the branch.
3. Open a pull request into `main`.
4. Merge the pull request.

Do not end a task with work only pushed to a branch. If a task turns out to
require no change (e.g. the requested fix is already merged), report that
instead — never open an empty PR.

## Repository layout

- `signal/` — the AnthonyCharts app (Vite + React), deployed on Vercel from
  this directory. Serverless functions live in `signal/api/` (`feed.js`,
  `score.js`); feed fetching/filtering logic in `signal/src/lib/`.
- `build/`, `data/`, `public/` — static build artifacts and data snapshots.

## Deployment note

Production is a Vercel deployment of `signal/`. Merging to `main` does not
guarantee the fix is live — if production behavior looks stale after a merge,
check that a Vercel deployment succeeded for the merge commit.
