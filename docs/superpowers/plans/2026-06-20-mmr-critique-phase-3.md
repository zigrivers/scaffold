# MMR Critique — Phase 3 (Repo-grounded critique) Implementation Plan

> **For agentic workers:** Checkbox steps, TDD. Builds on Phases 1–2 (#694, #695, merged).

**Goal:** `mmr critique … --context repo` — optionally ground the critique in the actual codebase so models judge fit against the real system (D3): **agent-supplied paths first**, a structural **skeleton fallback** when none given, **no embeddings**, an **identical context budget** across channels (independence), and a **"context used" disclosure** in the report.

**Architecture:** A new `critique-context` module builds a single context blob (deterministic, fs-only — no embeddings, no network). It is injected as one prompt layer **before** the artifact, identical for every channel. Path access is contained to the repo root. Default off (artifact-only).

**Tech Stack:** TypeScript ESM, vitest, lint max-len 120.

## Global Constraints

- Additive + backward-compatible; default `--context none` (Phase 1/2 behaviour unchanged).
- Security: only read files resolved **inside** `cwd`; reject path escapes; skip oversized/binary files; ignore `.git`/`node_modules`/`dist`/`build`.
- No embeddings, no network. Same context for all channels.
- `npm run check` + `make check-all` green.

---

### Task 1: Context types + report field

**Files:** Modify `packages/mmr/src/types/critique.ts`

- [ ] **Step 1:** Add `CritiqueReport.context_used?: string[]` (the repo files folded into the critique). No test (type decl).

### Task 2: `buildRepoContext`

**Files:** Create `packages/mmr/src/core/critique-context.ts`, `tests/core/critique-context.test.ts`

**Produces:**
- `interface RepoContext { context: string; used: string[] }`
- `buildRepoContext(opts: { cwd: string; explicitPaths?: string[]; artifact: string; budgetChars?: number }): RepoContext`

Selection priority (D3): explicit paths → else skeleton = key manifests (`package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `requirements.txt` — whichever exist) + `README.md` + up to 3 `docs/architecture/*.md` + files whose paths are referenced in the artifact text. Always prefix with a shallow repository tree (depth ≤ 3, ignoring `.git`/`node_modules`/`dist`/`build`, capped). Accumulate file blocks until `budgetChars` (default 40000). `used` lists every path included.

- [ ] **Step 1 (test first, temp dir):**
  - explicit paths → those files appear in `context`, listed in `used`, and a path that escapes `cwd` (`../secret`) is rejected (not read);
  - skeleton → `package.json` + `README.md` appear and are in `used`;
  - artifact referencing `src/app.ts` → that file is pulled in;
  - the budget caps total size (a tiny budget yields a truncation note, not unbounded output);
  - the tree block lists top-level entries and excludes `node_modules`.
- [ ] **Step 2:** Implement: `resolveInside(cwd, p)` containment guard (reuse the `path.relative` escape check pattern); shallow walk with the ignore set for the tree; manifest/README/architecture discovery; artifact path-token extraction (`/[\w./-]+\.\w+/g`, keep existing files); budget accumulation; skip files > 64KB or with NUL bytes. Green.

### Task 3: Inject context into the prompt

**Files:** Modify `packages/mmr/src/core/critique-prompt.ts`; extend `tests/core/critique-prompt.test.ts`

- [ ] **Step 1 (test first):** `assembleCritiquePrompt({ artifact, repoContext })` places a `## Repository context` layer **before** the artifact and includes the context text; absent `repoContext` → unchanged output.
- [ ] **Step 2:** Add optional `repoContext?: string` to `AssembleCritiquePromptOptions`; insert the layer before the artifact layer. Green.

### Task 4: Formatter disclosure

**Files:** Modify `packages/mmr/src/formatters/critique.ts`; extend `tests/formatters/critique.test.ts`

- [ ] **Step 1 (test first):** a report with `context_used` renders a `CONTEXT USED` line listing the files; absent → no such section. JSON still round-trips `context_used`.
- [ ] **Step 2:** Implement (a compact `CONTEXT USED` block before CHANNELS). Green.

### Task 5: Wire into the command

**Files:** Modify `packages/mmr/src/commands/critique.ts`; extend `tests/commands/critique.test.ts`

- [ ] **Step 1:** Builder: `--context <none|repo>` (default `none`) + `--context-paths <p...>` (array). Args updated.
- [ ] **Step 2:** When `--context repo` or `--context-paths` given: `buildRepoContext({ cwd, explicitPaths, artifact })`; pass `repoContext: ctx.context` into `assembleCritiquePrompt`; set `report.context_used = ctx.used`. Dry-run prints the grounded prompt. Identical context for every channel (assemble once).
- [ ] **Step 3 (test):** dry-run with `--context repo` in the fake-channel temp project shows the `## Repository context` layer + a manifest path; default (no flag) unchanged. Green.

### Task 6: Docs + gates

- [ ] **Step 1:** Update the `mmr` skill + guide critique blurb for `--context repo` / `--context-paths`. Rebuild guides.
- [ ] **Step 2:** `npm run check` + `make check-all` green. Smoke-test `mmr critique <doc> --context repo` on this repo.
