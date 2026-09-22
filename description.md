Found while working ZAIS-7, filed rather than fixed so it does not ride along on an unrelated change.

## What is wrong

`scripts/filmstrip.ts` — the instrument Eyes judges Basedball with — opens with:

```ts
import { chromium, type Browser, type Page } from 'playwright';
```

`playwright` is not in `package.json`. `devDependencies` is exactly four entries: `@types/node`, `@vitest/coverage-v8`, `typescript`, `vitest`. A clean `npm install` in a fresh checkout does not put it in `node_modules`, and `npx tsx scripts/filmstrip.ts` then either fails outright or silently pulls an unpinned Playwright plus a browser download on first run.

Confirmed in a fresh worktree on `agent/builder/zais-7`: after `npm install`, `node_modules/.bin` has no `playwright` and `require('playwright/package.json')` throws MODULE_NOT_FOUND.

## Why it matters more than a normal missing dep

This is the only tool in the repo that answers the question a green suite cannot: *can a person reach this, and does the picture match the number*. It has produced two verdict filmstrips on ZAIS-7 already, so it clearly runs on whatever machine Eyes is on — which is exactly the problem. It runs there because of something that is not written down. It is one machine away from being an instrument nobody can start, and the failure will land in the middle of a review rather than in a check.

`npm run check` cannot catch it either: `tsc --noEmit` covers `scripts/`, so the missing type declarations would normally surface — but they do not, because the import resolves against whatever is or is not installed at the time. A repo that builds green and has an unrunnable instrument is the shape of problem this project has paid for before.

## What done looks like

- `playwright` in `devDependencies`, pinned the way the other four are.
- Whatever browser-download step it needs named in the README beside how to run the filmstrip, or wired into a script, so "run the filmstrip" is one documented command rather than local knowledge.
- A fresh `git clone` + `npm install` + one command produces a filmstrip PNG. That is the check.

## Not in scope here

Nothing about what the filmstrip captures or the five scenarios it exercises. This is only about the tool being startable from a clean checkout.
