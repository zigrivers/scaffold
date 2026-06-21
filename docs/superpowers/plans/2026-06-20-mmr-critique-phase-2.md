# MMR Critique — Phase 2 (Convergence + synthesis) Implementation Plan

> **For agentic workers:** Checkbox steps, TDD throughout. Builds on Phase 1 (#694, merged).

**Goal:** Make the multi-model nature pay off — surface genuine model **disagreement as first-class `split` items with the deciding crux (D2)**, and add an **editorial synthesis pass (D6)** that structures the splits and writes a cited recommendation. Reshape the critique output to the vision's layout: CONVERGENCE → DIVERGENCE → kind-grouped uniques → SYNTHESIS.

**Architecture:** The deterministic clustering (Phase 1) already yields consensus/majority/unique. Phase 2 adds **one LLM pass** that reads the reconciled items and returns `{ splits, synthesis }`. It is **editorial, not judicial** (D6): cites item ids only, invents no new opinions, never resolves a split (it states the crux). The pass is injectable (a `runner` fn) for testing, graceful (single-channel / `--no-synthesis` / dispatcher-unavailable → Phase-1 output), and its command is **hardcoded `claude -p`** (not project-config-overridable — same injection-safety rationale as the observability LLM dispatcher).

**Tech Stack:** TypeScript ESM, vitest, lint max-len 120.

## Global Constraints

- Additive + backward-compatible: Phase 1 output shape still valid; `splits`/`synthesis` are optional on `CritiqueReport`.
- Advisory: never gates, always exit 0.
- Synthesis never resolves a split or introduces an opinion absent from the items.
- `npm run check` + `make check-all` green.

---

### Task 1: Synthesis types

**Files:** Modify `packages/mmr/src/types/critique.ts`

**Produces:**
- `CritiqueSplitPosition { stance: string; item_ids: string[]; sources: string[] }`
- `CritiqueSplit { theme: string; positions: CritiqueSplitPosition[]; crux: string }`
- `CritiqueSynthesis { splits: CritiqueSplit[]; synthesis: string }`
- `CritiqueReport` gains optional `splits?: CritiqueSplit[]` and `synthesis?: string`.

- [ ] **Step 1:** Add interfaces (no test — type decls).

### Task 2: Shared envelope-unwrap helper (refactor)

**Files:** Create `packages/mmr/src/core/cli-envelope.ts`; modify `critique-parser.ts` to use it; `tests/core/cli-envelope.test.ts`

**Produces:** `extractModelJson(raw: string): unknown | null` — strip fences, extract first JSON object/array, unwrap CLI wrapper keys (`result`/`text`/`response`/…), return parsed value or null.

- [ ] **Step 1 (test):** unwraps claude `result`, grok `text`; returns null on non-JSON. (Move the existing parser-unwrap tests' intent here.)
- [ ] **Step 2:** Extract the WRAPPER_KEYS + extract logic from `critique-parser.ts` into `cli-envelope.ts`; have `critique-parser.ts` reuse it. Existing critique-parser tests stay green.

### Task 3: Synthesis prompt + parser

**Files:** Create `packages/mmr/templates/critique-synthesis-prompt.md`, `packages/mmr/src/core/critique-synthesis.ts`, `tests/core/critique-synthesis.test.ts`

**Produces:**
- `assembleSynthesisPrompt(items: ReconciledCritiqueItem[]): string`
- `parseSynthesisOutput(raw: string): CritiqueSynthesis`

- [ ] **Step 1 (test first):** prompt contains the item ids + the "cite ids, never pick a winner, state the crux" rules; parser parses `{splits:[{theme,positions:[{stance,item_ids,sources}],crux}],synthesis}` (incl. claude-envelope), tolerates missing fields, never throws (→ `{splits:[],synthesis:''}`).
- [ ] **Step 2:** Author the template (editorial-not-judicial framing); implement assemble (serialize items as compact JSON) + parse (reuse `extractModelJson`, validate). Green.

### Task 4: synthesizeCritique (injectable runner)

**Files:** Modify `packages/mmr/src/core/critique-synthesis.ts`; extend the test.

**Produces:** `synthesizeCritique(items, runner?: (prompt: string) => Promise<string>): Promise<CritiqueSynthesis>`

- [ ] **Step 1 (test first):** `< 2` items or no runner → `{splits:[],synthesis:''}` without calling the runner; with a fake runner returning canned JSON → parsed splits/synthesis; a runner that throws → graceful empty.
- [ ] **Step 2:** Implement (guard count + runner presence; assemble → run → parse; try/catch → empty). Green.

### Task 5: Reshape the text formatter

**Files:** Modify `packages/mmr/src/formatters/critique.ts`; extend `tests/formatters/critique.test.ts`

- [ ] **Step 1 (test first):** with `splits` + `synthesis` set, text output renders a `DIVERGENCE` section (theme, each position with sources, `crux:` line) and a `SYNTHESIS` section with the prose; uniques grouped by kind (ALTERNATIVES / CONSIDERATIONS / OPEN QUESTIONS); consensus/majority under CONVERGENCE. Json still round-trips incl. splits/synthesis.
- [ ] **Step 2:** Implement the reshaped layout; keep the no-splits path = Phase-1-style. Green.

### Task 6: Wire synthesis into the command

**Files:** Modify `packages/mmr/src/commands/critique.ts`; extend `tests/commands/critique.test.ts`

- [ ] **Step 1:** Add `--no-synthesis` (boolean) to the builder + args.
- [ ] **Step 2:** After `reconcileCritique`, unless `--no-synthesis` or `< 2` items: build a **real runner** that dispatches a `claude -p --output-format json` pass via `dispatchChannel` into the same job store under channel name `critique-synthesis` (skip gracefully if `claude` not installed/authed via `checkInstalled`/`checkAuth`), reads it back with `readRawOutput`, returns the raw string. Call `synthesizeCritique(items, runner)`; attach `splits`/`synthesis` to the report. Format + print. Exit 0.
- [ ] **Step 3 (test):** the existing dry-run test still passes; add a unit test that `--no-synthesis` path doesn't attach synthesis (using the fake-channel config). Green.

### Task 7: Docs + gates

- [ ] **Step 1:** Update the `mmr` skill + guide critique blurb to mention convergence/divergence + synthesis + `--no-synthesis`. Rebuild guides.
- [ ] **Step 2:** `npm run check` + `make check-all` green. Smoke-test a real 2-channel critique to confirm splits/synthesis render.
