# MMR Critique — Phase 4 (Iterate + teach) Implementation Plan

> **For agentic workers:** Checkbox steps, TDD. Final phase; builds on Phases 1–3 (#694–#696, merged).

**Goal:** Close the loop. Add **session-based iterative refinement** with a bounded concern ledger (D7) and an opt-in **`--lenses` persona mode** (D5), then teach the whole surface (CLAUDE.md + skill + guide).

**Architecture:**
- *Iteration (D7):* a small dedicated `CritiqueSessionStore` (parallel to review's session store, not entangled) records each round's `{ round, artifact_source, items }`. On round N the **prior round's items** (only — bounded) are injected as a "previously raised — is each addressed?" ledger; the new round is appended after.
- *Lenses (D5):* `--lenses a,b,…` gives each channel a distinct persona preamble (cycled). This deliberately breaks prompt-identity, so when lenses are active the output **relabels** CONVERGENCE/agreement as "PERSPECTIVES" (we no longer claim independent *consensus*).

**Tech Stack:** TypeScript ESM, vitest, lint max-len 120.

## Global Constraints

- Additive + backward-compatible; no flags → Phases 1–3 behaviour unchanged.
- Advisory, exit 0. Repo-context independence (same context to all channels) preserved; only the lens preamble differs per channel, and only under `--lenses`.
- Bounded iteration: only the immediately-prior round's items enter the prompt.
- `npm run check` + `make check-all` green.

---

### Task 1: Critique session store

**Files:** Create `packages/mmr/src/core/critique-session.ts`, `tests/core/critique-session.test.ts`

**Produces:**
- `interface CritiqueRound { round: number; artifact_source: string; items: { id; kind; theme; observation }[] }`
- `class CritiqueSessionStore { constructor(root: string); load(id): CritiqueRound[]; append(id, round): void }`
- `resolveCritiqueSessionRoot(): string` (under `~/.mmr/critique-sessions`, reusing the home resolution)

- [ ] **Step 1 (test, temp root):** append two rounds → `load` returns both in order; an unknown id → `[]`; an invalid id throws; the store is created lazily.
- [ ] **Step 2:** Implement (atomic JSON write per `<id>.json`; reuse `isValidSessionId`). Green.

### Task 2: Prior-round ledger in the prompt

**Files:** Modify `packages/mmr/src/core/critique-prompt.ts`; extend `tests/core/critique-prompt.test.ts`

- [ ] **Step 1 (test):** `assembleCritiquePrompt({ artifact, priorRound })` adds a "Previously raised (round N)" layer that lists each prior item id + theme and instructs the model to judge whether the **revised** artifact addresses it; absent → unchanged.
- [ ] **Step 2:** Add optional `priorRound?: { round: number; items: {id;kind;theme;observation}[] }`; render the ledger layer before the artifact. Green.

### Task 3: Lens preamble

**Files:** Create `packages/mmr/src/core/critique-lenses.ts`, `tests/core/critique-lenses.test.ts`; modify `critique-prompt.ts`

**Produces:** `BUILTIN_LENSES: Record<string,string>` (skeptic, simplifier, user-advocate, pragmatist, security, scale) + `lensPreamble(name): string` (built-in description or a generic "adopt the lens of <name>") + `assignLenses(lenses: string[], channelCount): string[]` (cycle).

- [ ] **Step 1 (test):** `lensPreamble('skeptic')` mentions skepticism/risk; an unknown lens → a generic preamble naming it; `assignLenses(['a','b'],3)` → `['a','b','a']`.
- [ ] **Step 2:** Implement; add optional `lens?: string` to `assembleCritiquePromptOptions` → prepend the preamble as the first layer. Green.

### Task 4: Relabel output under lenses

**Files:** Modify `packages/mmr/src/types/critique.ts` (+`lenses?: string[]` on report), `packages/mmr/src/formatters/critique.ts`; extend the formatter test

- [ ] **Step 1 (test):** a report with `lenses` set renders `PERSPECTIVES` (not `CONVERGENCE`) and the items' tag reads `perspective` rather than the agreement tier; without `lenses`, unchanged.
- [ ] **Step 2:** Implement (a `lensed` boolean drives the header + tag wording). Green.

### Task 5: Wire `--session` + `--lenses` into the command

**Files:** Modify `packages/mmr/src/commands/critique.ts`; extend `tests/commands/critique.test.ts`

- [ ] **Step 1:** Builder: `--session <id>` (string) + `--lenses <list>` (array, split on comma). Args + report fields (`session_id`, `round`, `lenses`).
- [ ] **Step 2:** Load prior rounds when `--session`; pass the last round as `priorRound`; after reconcile, append the new round. With `--lenses`, assemble a **per-channel** prompt (base + that channel's lens) instead of the shared base, set `report.lenses`, and pass `lensed` to the formatter. Default (no flags) keeps the shared single-prompt path.
- [ ] **Step 3 (test):** dry-run with `--lenses skeptic,simplifier` shows distinct per-channel preambles; a `--session` round-2 dry-run (after a seeded round 1) shows the prior-round ledger. Green.

### Task 6: Teach + gates

- [ ] **Step 1:** `CLAUDE.md` — add `mmr critique` to the review section (peer to review; advisory; convergence/divergence/synthesis; `--context`/`--session`/`--lenses`). Update the `mmr` skill + guide with iteration + lenses.
- [ ] **Step 2:** `npm run check` + `make check-all` green. Smoke-test a 2-round `--session` critique + a `--lenses` run.
