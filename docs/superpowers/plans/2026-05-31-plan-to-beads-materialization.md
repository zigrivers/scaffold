# Plan → Beads Materialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pipeline step (and build-phase preflight) that materializes `docs/implementation-plan.md` into Beads issues before the build phase, so Beads-enabled projects don't reach build with an empty tracker.

**Architecture:** This is a **meta-prompt pipeline** repo. The "implementation" is (1) a new conditional finalization meta-prompt `materialize-plan-to-beads.md` whose prose instructs an agent to run an idempotent 4-pass `bd` reconcile; (2) a prerequisite "Plan Output Contract" added to the planning prompts so plans carry stable task/container IDs the materializer joins on; (3) edits to the four build prompts (start/resume × single/multi-agent) to invoke the materializer and run a scoped claim loop with a completion check; (4) methodology-preset enablement + docs. There is **no runtime TypeScript logic** — the reconcile runs at agent-execution time via `bd`. Tests are bats assertions on frontmatter, required prose sections, required `bd` commands, and preset wiring.

**Tech Stack:** Markdown meta-prompts (`content/pipeline/`), YAML methodology presets (`content/methodology/`), bats-core tests (`tests/`), `make validate` / `make test` / `make check-all` gates. Beads CLI **v1.0.5** is the verified/min-supported target.

**Source of truth for prose:** `docs/superpowers/specs/2026-05-31-plan-to-beads-materialization-design.md` (the locked design spec). Authoring steps cite exact spec sections; the spec is NOT duplicated here. Each prose file gets a bats test that greps for the specific required strings proving the prose implements the cited spec sections.

---

## File Structure

**New files:**
- `content/pipeline/finalization/materialize-plan-to-beads.md` — the materializer meta-prompt (the 4-pass reconcile, methodology scaling, version guard, completion-signal contract).
- `tests/plan-output-contract.bats` — asserts the planning prompts require the Plan Output Contract.
- `tests/materialize-plan-to-beads.bats` — asserts the materializer prompt's frontmatter + required sections/commands.
- `tests/build-beads-materialize-integration.bats` — asserts the four build prompts gained the required Beads-integration blocks.
- `tests/methodology-materialize-enablement.bats` — asserts deep.yml enables and mvp.yml disables the step.

**Modified files:**
- `content/pipeline/planning/implementation-plan.md` — add the Plan Output Contract (stable IDs, per-task & per-container field blocks, referential integrity, canonical serialization).
- `content/pipeline/planning/implementation-plan-review.md` — validate the contract (IDs present/unique/stable; parent + `depends_on` refs resolve; acyclic; blocks parse).
- `content/pipeline/build/single-agent-start.md` — `beads_usable` gate → invoke `/scaffold:materialize-plan-to-beads` → scoped claim loop → completion check.
- `content/pipeline/build/multi-agent-start.md` — same + orchestrator-only lock + run-stamped completion signal.
- `content/pipeline/build/single-agent-resume.md` — same as single-start, plus resume own in-flight plan task first.
- `content/pipeline/build/multi-agent-resume.md` — same as multi-start, plus resume own task + worker waits on completion signal.
- `content/pipeline/foundation/beads.md` — one line noting the plan is materialized into Beads later.
- `content/methodology/deep.yml` — enable `materialize-plan-to-beads`.
- `content/methodology/mvp.yml` — list it disabled.
- `CHANGELOG.md` + pipeline reference — note the new step.

**Frontmatter facts (verified):** finalization phase order range is **1400–1499**; `conditional` only valid value is `"if-needed"`; the bash `make validate` requires only a non-empty `description`; richer field validation (name kebab-case, phase ∈ PHASES, order 0–1599, outputs non-empty unless `stateless: true`) is enforced by the Zod schema in `src/project/frontmatter.ts` and exercised by `npm test`. The materializer produces no tracked doc artifact, so it is modeled `stateless: true, outputs: []` (mirroring the build prompts).

---

## Phase 0: Baseline

### Task 0: Confirm clean baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm worktree + branch**

Run: `git -C /Users/kenallred/Developer/scaffold/.claude/worktrees/beads-plan-import-gap rev-parse --abbrev-ref HEAD`
Expected: a worktree branch (e.g. `worktree-beads-plan-import-gap`). All subsequent commands run from this worktree directory.

- [ ] **Step 2: Confirm gates pass before changes**

Run: `make validate && make test`
Expected: both PASS (0 failures). If anything fails pre-existing, report and stop before proceeding.

- [ ] **Step 3: Confirm Beads available for behavioral spot-checks**

Run: `bd version`
Expected: `bd version 1.0.5 ...` or newer. (Used only for optional manual spot-checks; the bats suite does not require `bd`.)

---

## Phase 1: Plan Output Contract (prerequisite)

The materializer needs stable join keys and a parseable plan. This phase adds the contract to the planning prompts and a test that the contract language is present. See spec §"Prerequisite: the Plan Output Contract".

### Task 1: Test the contract requirement in the planning prompts

**Files:**
- Create: `tests/plan-output-contract.bats`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bats

PLAN="content/pipeline/planning/implementation-plan.md"
REVIEW="content/pipeline/planning/implementation-plan-review.md"

@test "implementation-plan requires stable task IDs with a defined format" {
  run grep -qiE "stable.*task ID|task ID.*format|T-001" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "implementation-plan defines container (story/epic) IDs and canonical serialization" {
  run grep -qiE "plan_story_id|plan_epic_id|S-001|E-001" "$PLAN"
  [ "$status" -eq 0 ]
  run grep -qiE "canonical serialization|parseable block|fenced" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "implementation-plan requires referential integrity for parent and depends_on refs" {
  run grep -qiE "depends_on" "$PLAN"
  [ "$status" -eq 0 ]
  run grep -qiE "referential integrity|resolve to a declared|no dangling" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "review step validates IDs, dangling refs, and acyclicity" {
  run grep -qiE "unique.*stable|stable.*unique" "$REVIEW"
  [ "$status" -eq 0 ]
  run grep -qiE "dangling|resolve" "$REVIEW"
  [ "$status" -eq 0 ]
  run grep -qiE "acyclic|no cycle|DAG" "$REVIEW"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/plan-output-contract.bats`
Expected: FAIL (the contract language is not yet in the planning prompts).

- [ ] **Step 3: Add the Plan Output Contract to `implementation-plan.md`**

In `content/pipeline/planning/implementation-plan.md`, add a new section titled `## Plan Output Contract` (place it after `## Expected Outputs`, before `## Quality Criteria`). Author it to implement spec §"Prerequisite: the Plan Output Contract" items 1–6 verbatim in intent:
- Stable task IDs (`T-001`, monotonic, never reused, assigned fresh, preserved in update mode).
- Stable container IDs `S-001`/`E-001` (deep) → become `plan_story_id`/`plan_epic_id` join keys.
- Per-task field block: `id`, `title`, `priority`, `wave`, `risk`, `story`/`epic` parent IDs, `depends_on`, `acceptance_criteria` — in a fenced metadata block.
- Per-container field block (deep): `id`, `title`, `priority`, `wave`/`risk`, `description`/AC, optional `epic` parent for stories.
- A canonical serialization (per-item heading + fenced key/value block).
- Referential integrity: all `story`/`epic` parent refs **and** `depends_on` refs resolve to declared IDs; no dangling refs.

Preserve the file's existing Mode Detection + Update Mode Specifics blocks (do not move or delete them).

- [ ] **Step 4: Add contract validation to `implementation-plan-review.md`**

In `content/pipeline/planning/implementation-plan-review.md`, add a validation bullet/section requiring the review to check: every task and container has an ID; task/story/epic IDs are unique and stable across updates; all parent refs **and** `depends_on` refs resolve (no dangling refs); the dependency graph is **acyclic**; per-task and per-container blocks parse. Implement spec §"Files to Touch" review-step bullet.

- [ ] **Step 5: Run tests to verify they pass + frontmatter still valid**

Run: `bats tests/plan-output-contract.bats && make validate`
Expected: bats PASS; `make validate` PASS (frontmatter unchanged).

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/planning/implementation-plan.md content/pipeline/planning/implementation-plan-review.md tests/plan-output-contract.bats
git commit -m "feat(planning): add Plan Output Contract for Beads materialization

Require stable task/story/epic IDs, per-task and per-container field blocks,
canonical serialization, and referential-integrity + acyclicity validation so
the materializer has reliable join keys and parsing rules."
```

---

## Phase 2: The materializer meta-prompt

### Task 2: Frontmatter + skeleton for `materialize-plan-to-beads.md`

**Files:**
- Create: `content/pipeline/finalization/materialize-plan-to-beads.md`
- Create: `tests/materialize-plan-to-beads.bats`

- [ ] **Step 1: Write the failing frontmatter/structure test**

```bash
#!/usr/bin/env bats

F="content/pipeline/finalization/materialize-plan-to-beads.md"

@test "materializer file exists" {
  [ -f "$F" ]
}

@test "materializer has correct frontmatter" {
  run grep -qE "^name: materialize-plan-to-beads$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^phase: \"?finalization\"?$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^order: 144[0-9]$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^conditional: \"if-needed\"$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^stateless: true$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "implementation-playbook" "$F"; [ "$status" -eq 0 ]
}

@test "materializer has Mode Detection and Update Mode blocks" {
  run grep -qiE "## Mode Detection" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "## Update Mode" "$F"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/materialize-plan-to-beads.bats`
Expected: FAIL ("materializer file exists" fails — file absent).

- [ ] **Step 3: Create the file with this exact frontmatter + section skeleton**

Create `content/pipeline/finalization/materialize-plan-to-beads.md` starting with this exact frontmatter:

```markdown
---
name: materialize-plan-to-beads
description: Materialize the implementation plan into Beads issues before the build phase
summary: "When Beads is enabled, converts docs/implementation-plan.md into Beads issues — creating, updating, and reconciling tasks/stories/epics and their dependencies idempotently — so the build phase has a populated tracker to claim from."
phase: "finalization"
order: 1440
dependencies: [implementation-playbook]
outputs: []
conditional: "if-needed"
stateless: true
category: pipeline
knowledge-base: [task-tracking]
---
```

Then add these section headings as the skeleton (bodies authored in Task 3):
`## Purpose`, `## Inputs`, `## Expected Outputs`, `## Methodology Scaling`, `## Mode Detection`, `## Update Mode Specifics`, `## Instructions`, `## After This Step`.

- [ ] **Step 4: Run tests to verify they pass + validate**

Run: `bats tests/materialize-plan-to-beads.bats && make validate`
Expected: PASS (frontmatter/structure satisfied). Body-content tests come in Task 3.

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/finalization/materialize-plan-to-beads.md tests/materialize-plan-to-beads.bats
git commit -m "feat(finalization): scaffold materialize-plan-to-beads prompt (frontmatter + skeleton)"
```

### Task 3: Author the materializer body (the 4-pass reconcile)

**Files:**
- Modify: `content/pipeline/finalization/materialize-plan-to-beads.md`
- Modify: `tests/materialize-plan-to-beads.bats`

- [ ] **Step 1: Add the body-content assertions to the bats test**

Append to `tests/materialize-plan-to-beads.bats`:

```bash
@test "guards on beads_usable: .beads + bd>=1.0.5 + jq, never bare [ -d .beads ] && bd" {
  run grep -qE "beads_usable" "$F"; [ "$status" -eq 0 ]
  run grep -qE "1\.0\.5" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "command -v jq" "$F"; [ "$status" -eq 0 ]
}

@test "uses metadata join keys, --all --limit 0, and scoped queries (no --external-ref filter)" {
  run grep -qE "plan_task_id" "$F"; [ "$status" -eq 0 ]
  run grep -qE "--has-metadata-key" "$F"; [ "$status" -eq 0 ]
  run grep -qE "--all --limit 0" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd list --external-ref" "$F"; [ "$status" -ne 0 ]   # must NOT use the unsupported filter
}

@test "defines the four reconcile passes incl. duplicate guard and stale reconcile" {
  run grep -qiE "Pass 0a|duplicate guard" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "container upsert|Pass 0b" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "dependency reconcile|Pass 2" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "stale reconcile|Pass 3" "$F"; [ "$status" -eq 0 ]
}

@test "Retire convention orders label before close before unset" {
  run grep -qiE "Retire convention" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "label.*(then|→|before).*close" "$F"; [ "$status" -eq 0 ]
  run grep -qE "--unset-metadata" "$F"; [ "$status" -eq 0 ]
}

@test "tracks materializer-owned deps via plan_deps and uses --set-metadata" {
  run grep -qE "plan_deps" "$F"; [ "$status" -eq 0 ]
  run grep -qE "--set-metadata" "$F"; [ "$status" -eq 0 ]
}

@test "uses story/epic types directly (no types.custom probe) and bd dep cycles" {
  run grep -qE "\-t story|\-t epic" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dep cycles" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "types.custom" "$F"; [ "$status" -ne 0 ]   # story usable directly on v1.0.5
}

@test "emits a deterministic summary line and a run-stamped completion signal" {
  run grep -qiE "materialize:.*created" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "completion signal|materialized_at|run_id|run-stamped" "$F"; [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bats tests/materialize-plan-to-beads.bats`
Expected: the new body-content tests FAIL (body not yet authored); the Task-2 structure tests still PASS.

- [ ] **Step 3: Author the body**

Author the section bodies to implement these spec sections verbatim in intent (cite them inline as you write):
- `## Inputs` → `docs/implementation-plan.md` (required), `docs/implementation-playbook.md` (ordering/waves/context), `.beads/` (required).
- `## Methodology Scaling` → spec §"The Mapping (methodology-scaled)" incl. the **per-depth behavior** (mvp/1–3 flat+deps; depth 4 stories-no-epic; depth 5 epic→story→task), wave-biased priority, and "dependencies always materialized at every depth".
- `## Mode Detection` / `## Update Mode Specifics` → idempotent re-run; preserve started state; the one-way reconcile contract (spec §"Source-of-Truth Contract").
- `## Instructions` → the full algorithm:
  - `beads_usable` gate (spec §"Version gating & graceful degradation": `.beads/` + `bd ≥ 1.0.5` via macOS-portable compare + `jq`; degradation split — markdown only when `.beads/` absent, else fail closed).
  - The **Retire convention** (spec §"Idempotency & Reconcile Algorithm" preamble): `stale:*` label → close → `--unset-metadata <join-key>`, resumable.
  - **Pass 0a** duplicate guard (one-key invariant; canonical prefers `in_progress`, excludes `stale:*`; fail closed on ≥2 `in_progress`).
  - **Pass 0b** container upsert (bulk-fetch via `--has-metadata-key plan_epic_id`/`plan_story_id`; epics then stories; `--parent`; `-t epic`/`-t story` directly).
  - **Pass 1** task upsert (single bulk fetch + in-memory join; create with `--parent --metadata --external-ref --description`; update not-started incl. `--set-metadata wave/risk`; `in_progress` → `ac_warn_hash`-guarded `bd comment`; `closed` untouched).
  - **Pass 2** dependency reconcile (add for not-started; remove only `plan_deps`-owned edges absent from plan; rewrite `plan_deps' = (prior ∩ current) ∪ added`; `bd dep cycles`).
  - **Pass 3** stale reconcile (not-started removed → retire; `in_progress` removed → report; `closed`-completed → leave linked; `closed` with `stale:*` → finish unset).
  - The deterministic summary line.
  - The run-stamped materialization-complete signal (set on success, cleared before lock — spec §"Concurrency").
- `## After This Step` → tell the user the plan is materialized and point to `/scaffold:single-agent-start` (or multi-agent), matching the After-This-Step convention used by other prompts.

Keep all `bd` commands consistent with the spec's verified command surface (no `bd list --external-ref` filter; `--all --limit 0`; `--set-metadata`/`--unset-metadata`; `bd dep list <id> --direction down`).

- [ ] **Step 4: Run the full prompt test + frontmatter validation**

Run: `bats tests/materialize-plan-to-beads.bats && make validate`
Expected: all PASS.

- [ ] **Step 5: Optional behavioral spot-check (manual, throwaway repo)**

Run:
```bash
D=$(mktemp -d); ( cd "$D" && git init -q . && bd init >/dev/null 2>&1 \
  && bd create "t" -t task --metadata '{"plan_task_id":"T-1"}' --json >/dev/null \
  && bd list --all --limit 0 --has-metadata-key plan_task_id --json | jq 'length' ); rm -rf "$D"
```
Expected: prints `1` — confirms the join-key query shape the prompt relies on works against the installed `bd`.

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/finalization/materialize-plan-to-beads.md tests/materialize-plan-to-beads.bats
git commit -m "feat(finalization): author materialize-plan-to-beads 4-pass reconcile body"
```

---

## Phase 3: Build & resume prompt integration

All four build prompts gain a `beads_usable`-gated Beads Detection block that invokes `/scaffold:materialize-plan-to-beads` and runs a **scoped** claim loop with the completion check. See spec §"Build Preflight" and §"Files to Touch".

### Task 4: Test the build-prompt integration requirements

**Files:**
- Create: `tests/build-beads-materialize-integration.bats`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bats

STARTS=( content/pipeline/build/single-agent-start.md content/pipeline/build/multi-agent-start.md )
RESUMES=( content/pipeline/build/single-agent-resume.md content/pipeline/build/multi-agent-resume.md )
ALL=( "${STARTS[@]}" "${RESUMES[@]}" )
MULTI=( content/pipeline/build/multi-agent-start.md content/pipeline/build/multi-agent-resume.md )

@test "all build prompts invoke the canonical materializer (not a copied 4-pass)" {
  for f in "${ALL[@]}"; do
    run grep -qE "/scaffold:materialize-plan-to-beads" "$f"
    [ "$status" -eq 0 ] || { echo "missing materialize invocation in $f"; false; }
  done
}

@test "all build prompts use the scoped claim loop" {
  for f in "${ALL[@]}"; do
    run grep -qE "bd ready --claim --has-metadata-key plan_task_id" "$f"
    [ "$status" -eq 0 ] || { echo "missing scoped claim in $f"; false; }
  done
}

@test "all build prompts gate on beads_usable and define the completion check" {
  for f in "${ALL[@]}"; do
    run grep -qE "beads_usable" "$f"; [ "$status" -eq 0 ] || { echo "no beads_usable in $f"; false; }
    run grep -qiE "completion check|empty .*bd ready|all .*closed" "$f"; [ "$status" -eq 0 ] || { echo "no completion check in $f"; false; }
  done
}

@test "build prompts fail closed when .beads present but unusable (no markdown re-run)" {
  for f in "${ALL[@]}"; do
    run grep -qiE "fail closed|fail-closed" "$f"
    [ "$status" -eq 0 ] || { echo "no fail-closed rule in $f"; false; }
  done
}

@test "multi-agent prompts use orchestrator-only lock + run-stamped completion signal" {
  for f in "${MULTI[@]}"; do
    run grep -qiE "merge-slot" "$f"; [ "$status" -eq 0 ] || { echo "no merge-slot in $f"; false; }
    run grep -qiE "completion signal|run_id|run-stamped|materialized_at" "$f"; [ "$status" -eq 0 ] || { echo "no completion signal in $f"; false; }
  done
}

@test "resume prompts resume the actor's own in-flight plan task first (scoped)" {
  for f in "${RESUMES[@]}"; do
    run grep -qE "in_progress --assignee .* --has-metadata-key plan_task_id" "$f"
    [ "$status" -eq 0 ] || { echo "missing scoped own-task resume in $f"; false; }
  done
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/build-beads-materialize-integration.bats`
Expected: FAIL (build prompts not yet edited).

- [ ] **Step 3: Edit `single-agent-start.md`**

In `content/pipeline/build/single-agent-start.md`, replace the existing **### Beads Detection** block's logic with the spec §"Build Preflight" decision table behavior: gate on `beads_usable`; when usable + valid stable-ID contract → invoke `/scaffold:materialize-plan-to-beads`, then the scoped loop `bd ready --claim --has-metadata-key plan_task_id --json`; add the empty-ready **completion check** (all-closed = done; classify each remaining task advancing vs stalled; report stalled subset); markdown fallback only when `.beads/` absent; **fail closed** when `.beads/` present but unusable, on malformed contract, or mid-run failure. Also change the existing unscoped `bd ready --claim` references in this file to the scoped form.

- [ ] **Step 4: Edit `multi-agent-start.md`**

Apply the same as Step 3, PLUS the spec §"Concurrency (multi-agent)" requirements: orchestrator-only invocation, two distinct identities (per-process merge-slot holder vs. stable claim actor), real acquire+ownership-verify loop, `set -e`-safe (`|| true` + trap release), run-stamped completion signal set after success and cleared before the lock, workers block on that signal before claiming.

- [ ] **Step 5: Edit `single-agent-resume.md`**

Apply the same integration as Step 3, PLUS: before the claim loop, resume the actor's own in-flight **plan** task first with `bd list --status in_progress --assignee <actor> --has-metadata-key plan_task_id --json` (ignore non-plan in-progress work). Use the **stable** claim actor (not the per-process lock identity).

- [ ] **Step 6: Edit `multi-agent-resume.md`**

Apply Step 4 (multi-agent concurrency) AND Step 5 (resume own task first). Workers must wait on the run-stamped completion signal before their first claim.

- [ ] **Step 7: Run tests + frontmatter validation**

Run: `bats tests/build-beads-materialize-integration.bats && make validate`
Expected: all PASS.

- [ ] **Step 8: Verify After-This-Step cross-references still valid**

Run: `make eval`
Expected: PASS — `tests/evals/after-this-step-references.bats` confirms any `/scaffold:...` references (including the new `/scaffold:materialize-plan-to-beads`) resolve to real step names.

- [ ] **Step 9: Commit**

```bash
git add content/pipeline/build/single-agent-start.md content/pipeline/build/multi-agent-start.md content/pipeline/build/single-agent-resume.md content/pipeline/build/multi-agent-resume.md tests/build-beads-materialize-integration.bats
git commit -m "feat(build): invoke materializer + scoped claim + completion check in start/resume prompts

All four build prompts gate on beads_usable, invoke the canonical
/scaffold:materialize-plan-to-beads, run a plan_task_id-scoped claim loop with a
3-way completion check, and fail closed when .beads/ is present but unusable.
Multi-agent prompts add the orchestrator-only lock + run-stamped completion
signal; resume prompts resume the actor's own in-flight plan task first."
```

---

## Phase 4: Enablement, foundation note, docs

### Task 5: Enable the step in methodology presets

**Files:**
- Create: `tests/methodology-materialize-enablement.bats`
- Modify: `content/methodology/deep.yml`
- Modify: `content/methodology/mvp.yml`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bats

DEEP="content/methodology/deep.yml"
MVP="content/methodology/mvp.yml"

@test "deep.yml enables materialize-plan-to-beads as conditional if-needed" {
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: true, conditional: \"if-needed\" \}" "$DEEP"
  [ "$status" -eq 0 ]
}

@test "mvp.yml lists materialize-plan-to-beads disabled" {
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: false \}" "$MVP"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bats tests/methodology-materialize-enablement.bats`
Expected: FAIL (step not listed in presets).

- [ ] **Step 3: Add the step to `deep.yml`**

In `content/methodology/deep.yml`, under the `# Phase 14 — Finalization (finalization)` comment, after the `implementation-playbook: { enabled: true }` line, add:

```yaml
  materialize-plan-to-beads: { enabled: true, conditional: "if-needed" }
```

(Mirrors how `beads: { enabled: true, conditional: "if-needed" }` is listed — auto-enabled when Beads is in use.)

- [ ] **Step 4: Add the step to `mvp.yml`**

In `content/methodology/mvp.yml`, under `# Phase 14 — Finalization (finalization)`, after the `implementation-playbook: { enabled: true }` line, add:

```yaml
  materialize-plan-to-beads: { enabled: false }
```

(mvp disables Beads, so the materializer is off there too.)

- [ ] **Step 5: Run tests + the TypeScript preset/assembly suite**

Run: `bats tests/methodology-materialize-enablement.bats && npm test`
Expected: bats PASS; `npm test` (vitest) PASS — confirms `preset-loader.ts` parses the new entries (incl. the `conditional: "if-needed"` override) without error.

- [ ] **Step 6: Commit**

```bash
git add content/methodology/deep.yml content/methodology/mvp.yml tests/methodology-materialize-enablement.bats
git commit -m "feat(methodology): enable materialize-plan-to-beads in deep (if-needed), off in mvp"
```

### Task 6: Foundation note + docs + changelog

**Files:**
- Modify: `content/pipeline/foundation/beads.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the heads-up line to `beads.md`**

In `content/pipeline/foundation/beads.md`, in the `## Purpose` or `## Conditional Evaluation` area, add one sentence: that the implementation plan is materialized into Beads later (by `/scaffold:materialize-plan-to-beads` during finalization), so Beads is expected to start empty of plan tasks until then. Do not alter its frontmatter or the `bd setup`/marker-managed instructions.

- [ ] **Step 2: Add a CHANGELOG entry**

In `CHANGELOG.md`, under the current unreleased section, add a bullet:

```markdown
- Add `materialize-plan-to-beads` finalization step (and build-phase preflight)
  that converts `docs/implementation-plan.md` into Beads issues before build, so
  Beads-enabled projects no longer reach the build phase with an empty tracker.
  Requires a stable-ID Plan Output Contract (added to the planning step).
```

- [ ] **Step 3: Validate frontmatter unaffected**

Run: `make validate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/foundation/beads.md CHANGELOG.md
git commit -m "docs: note plan→Beads materialization in beads.md + CHANGELOG"
```

---

## Phase 5: Full verification

### Task 7: Run all gates

**Files:** none (verification only)

- [ ] **Step 1: Run the full bash gate**

Run: `make check`
Expected: PASS (lint + validate + test + eval).

- [ ] **Step 2: Run the full combined gate**

Run: `make check-all`
Expected: PASS (adds type-check, build, vitest, knowledge/reference/guide checks). Fix any failures before proceeding.

- [ ] **Step 3: Confirm the new step assembles into a deep pipeline**

Run: `npx scaffold prompt-pipeline 2>/dev/null | grep -i materialize || echo "check assembly wiring"`
Expected: the step appears in the pipeline reference for a Beads-enabled/deep config. If it does not appear, verify the `conditional: "if-needed"` auto-enable path in `src/cli/commands/next.ts` recognizes Beads usage the same way it does for `beads.md`; if a code touch is needed there, add it as a follow-up task mirroring the existing beads conditional evaluation, with a vitest case.

- [ ] **Step 4: Final commit (if Step 3 required a code touch)**

```bash
git add -A
git commit -m "feat: wire materialize-plan-to-beads conditional auto-enable for Beads projects"
```

---

## Notes on scope deferred to execution (from spec §"Open Implementation Concerns")

These are specified at the invariant level in the spec and must be proven by the bats/behavioral tests above, but their exact shell lives in the prompt prose (authored in Tasks 3–4), not as separate runtime code:

- The merge-slot acquire/verify/release loop and the run-stamped completion-signal handshake (Task 4 Steps 4 & 6).
- The completion-check transitive-blocker traversal with a depth/cycle bound (Task 4; reuse `bd dep cycles`).
- Retirement crash-safety / resumability via label-first ordering (Task 3).

If, during authoring, a behavioral edge case appears that the bats grep-tests can't meaningfully assert (e.g. a true concurrency race), note it in `tasks/lessons.md` and add a focused manual spot-check in a throwaway `bd init` repo rather than leaving it unverified.
