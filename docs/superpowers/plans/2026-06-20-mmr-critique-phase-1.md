# MMR Critique — Phase 1 (Core one-shot critique) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. TDD throughout — failing test first, then minimal code.

**Goal:** Ship `mmr critique <artifact>` — a one-shot, multi-model design/brainstorm critique that fans an artifact out to the existing channels, clusters items by cross-model agreement, and prints an advisory report (no gate, always exit 0).

**Architecture:** Approach B from the vision — a parallel `critique` pipeline that reuses the *shared primitives* (`JobStore`, `dispatchChannel`/`dispatchHttpChannel`, auth checks, `stripMarkdownFences`, stable-id shingle/Jaccard) but its own prompt, parser, reconciler, output, and command. `review.ts` is untouched.

**Tech Stack:** TypeScript (ESM, NodeNext), yargs, vitest. Lint max-len 120.

## Global Constraints

- Backward compatibility: `mmr review` and all existing types/behaviour unchanged. Additive only.
- Advisory: critique never gates. The command always exits 0 (except usage errors like a missing input file).
- No severity (D1). Cluster + sort by **agreement tier** (consensus → majority → unique).
- Reuse, don't fork: dispatch/auth/job-store come from existing modules.
- `npm run check` (lint + tsc + vitest) green; repo `make check-all` green.

---

### Task 1: Critique types

**Files:** Create `packages/mmr/src/types/critique.ts`

**Produces:**
- `CritiqueKind = 'concern' | 'alternative' | 'consideration' | 'open-question'`
- `CritiqueItem { kind; theme; observation; recommendation? }`
- `CritiqueAgreement = 'consensus' | 'majority' | 'unique'`
- `ReconciledCritiqueItem extends CritiqueItem { id; sources: string[]; agreement; observation_shingle? }` (shingle of the `observation`, named to match its source field)
- `CritiqueChannelResult { status: ChannelStatus; item_count: number; summary?: string; recovery? }`
- `CritiqueReport { kind: 'design-critique'; artifact_source; items: ReconciledCritiqueItem[]; per_channel; summary; metadata }`

- [ ] **Step 1:** Write `critique.ts` with the interfaces above (no tests — pure type decls).

### Task 2: Critique prompt template + assembler

**Files:** Create `packages/mmr/templates/critique-prompt.md`, `packages/mmr/src/core/critique-prompt.ts`, `tests/core/critique-prompt.test.ts`

**Produces:** `assembleCritiquePrompt({ artifact, focus?, promptWrapper? }): string`

- [ ] **Step 1 (test first):** assert the assembled prompt contains the template framing (e.g. "design critique", "alternative"), the artifact body wrapped in a fence, and the focus block when provided; and that `{{prompt}}` wrapper is applied.
- [ ] **Step 2:** Author `critique-prompt.md` — instruct each model: act as a senior architect giving a DESIGN critique (not code review); surface `concern` (risks), `alternative` (other approaches), `consideration` (tradeoffs, no clear direction), `open-question` (unknowns); for each give `theme`, `observation`, optional `recommendation`; output **strict JSON** `{ "items": [{kind,theme,observation,recommendation}], "summary": "" }`; no severity, no pass/fail.
- [ ] **Step 3:** Implement `assembleCritiquePrompt` mirroring `assemblePrompt` layering (template → focus → artifact-last → wrapper). Run tests green.

### Task 3: Critique parser

**Files:** Create `packages/mmr/src/core/critique-parser.ts`, `tests/core/critique-parser.test.ts`

**Produces:** `parseCritiqueOutput(raw: string): { items: CritiqueItem[]; summary: string }`

- [ ] **Step 1 (test first):** raw JSON (with markdown fences + prose around it) → items parsed; invalid kind coerced to `consideration`; missing fields tolerated; non-JSON → empty items + a diagnostic summary (never throws).
- [ ] **Step 2:** Implement reusing `stripMarkdownFences` + `extractJson` from `parser.ts`; validate each item (kind ∈ set else `consideration`; theme/observation strings; recommendation optional). Green.

### Task 4: Critique reconciler (cross-model clustering)

**Files:** Create `packages/mmr/src/core/critique-reconciler.ts`, `tests/core/critique-reconciler.test.ts`

**Produces:** `reconcileCritique(channelItems: Record<string, CritiqueItem[]>): ReconciledCritiqueItem[]`

- [ ] **Step 1 (test first):**
  - two channels raising a near-identical observation → 1 item, `sources.length === 2`, `agreement: 'consensus'` (same kind) or `'majority'` (different kind);
  - a single-channel item → `agreement: 'unique'`;
  - output sorted consensus → majority → unique, then kind order, then theme;
  - deterministic ids `C-001…`.
- [ ] **Step 2:** Implement: flatten with source; cluster by `jaccardSimilarity(descriptionShingle(a.observation), …) >= 0.4` (reuse `stable-id.ts`); group agreement = ≥2 sources same-kind → consensus, ≥2 mixed-kind → majority, else unique; representative = longest observation; sort + assign ids. Green.

### Task 5: Critique input resolution

**Files:** Create `packages/mmr/src/core/critique-input.ts`, `tests/core/critique-input.test.ts`

**Produces:** `resolveCritiqueInput(input: string | undefined): { artifact: string; source: string }`

- [ ] **Step 1 (test first):** a temp file path → its contents + source=path; `-` → reads fd 0 (mock); missing/empty input → throws a clear usage error.
- [ ] **Step 2:** Implement (file read; `-` → `fs.readFileSync(0, 'utf-8')` — encoding required so stdin returns a string, not a Buffer; empty → Error). Green.

### Task 6: Critique formatters (text + json)

**Files:** Create `packages/mmr/src/formatters/critique.ts`, `tests/formatters/critique.test.ts`

**Produces:** `formatCritiqueText(report): string`, `formatCritiqueJson(report): string`

- [ ] **Step 1 (test first):** text output groups by agreement (CONVERGENCE for consensus/majority, then unique items by kind), shows `[kind · agreement]` tags + sources, a SUMMARY, and a "no gate / advisory" marker; json round-trips the report object.
- [ ] **Step 2:** Implement. Green. (Phase 2 adds the split/crux + synthesis layout; Phase 1 = grouped advisory list.)

### Task 7: The `mmr critique` command

**Files:** Create `packages/mmr/src/commands/critique.ts`, `tests/commands/critique.test.ts`

**Produces:** `critiqueCommand` (yargs module)

- [ ] **Step 1 (test first — dry-run):** `--dry-run` with a temp artifact prints the assembled prompt + the configured channels, **never spawns a subprocess** (not even install/auth probes), exits 0.
- [ ] **Step 2:** Implement the handler: resolve input → classify trust + load config under the same trust policy as review (honor working-tree `.mmr.yaml` only from a trusted ref / `--trust-project-config`) → `resolveDispatchChannels` → assemble the critique prompt → **if `--dry-run`, print the critique prompt per channel (via a local `applyWrapper`, NOT review's `buildChannelPrompt`) and return — before any auth subprocess** → per-channel install/auth (reuse `checkInstalled`/`checkAuth`, redact recovery) → if no channel passes auth, emit an empty advisory report and **exit 0** (no gate) → else create `JobStore` job → dispatch valid channels (mirror review's parallel/serial loop with `dispatchChannel`/`dispatchHttpChannel`) → read raw outputs (`JSON.parse(store.loadChannelOutput(...))` to undo the store's `JSON.stringify`, guarded by try/catch), `parseCritiqueOutput` (which also unwraps the per-CLI envelopes), `reconcileCritique`, build `CritiqueReport` → format + print → **exit 0**.
- [ ] **Step 3:** Builder options: positional `[input]`, `--focus`, `--channels`, `--timeout`, `--format text|json` (default **text**, independent of `config.defaults.format`), `--dry-run`, `--config-base-ref`, `--trust-project-config`. Green.

### Task 8: Register the command + manifest + drift

**Files:** Modify `packages/mmr/src/cli.ts`, `packages/mmr/src/core/manifest.ts`; update `tests/core/manifest-drift.test.ts` expectations implicitly.

- [ ] **Step 1:** Import + `.command(critiqueCommand)`; add `'critique'` to `REGISTERED_TOP_LEVEL`.
- [ ] **Step 2:** Add a `critique` entry to `COMMAND_MANIFEST` (`writes:false`, example `mmr critique design.md`). Run the manifest-drift test → green.

### Task 9: Gate + docs note

- [ ] **Step 1:** `cd packages/mmr && npm run check` green (lint + tsc + vitest).
- [ ] **Step 2:** `make check-all` green at repo root.
- [ ] **Step 3:** Brief mention in the `mmr` skill + reference guide that `mmr critique` exists (one line; full docs land in Phase 4). Rebuild guides; commit.
