# Beads Integration Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring scaffold's Beads integration current with upstream Beads v1.0.4 — fix stale CLI commands, deprecated env vars, mismatched status vocabulary, missing remediation guidance, and surface high-value upstream features (`bd prime`, `bd setup` recipes, atomic `--claim`, `bd preflight`, `discovered-from`).

**Architecture:** Most fixes are surgical edits to existing pipeline/knowledge/tool meta-prompts under `content/`. Three changes touch TypeScript (`src/observability/adapters/beads.ts` for min-version check, and a new MMR→Beads bridge under `content/tools/review-pr.md` + adapter helper). One change touches `scripts/setup-agent-worktree.sh`. Each phase below is one PR.

**Tech Stack:** Markdown meta-prompts (scaffold's pipeline DSL), TypeScript (Node 20+, vitest), bash, GNU Make, MMR CLI.

**Source audit:** `docs/audits/beads-integration-audit-2026-05-24.md` (this worktree). All `F-X.Y` references below resolve to that document.

**Test gate after every phase:** `make check-all` (bash + TypeScript). For TypeScript phases also `npm test -- src/observability/adapters/beads.test.ts`.

> **MMR Review Round 2 (2026-05-24):** Codex + Gemini reviewed this plan; **Claude channel auth_failed both runs** (degraded-pass, 2/3 channels). All 6 P1 + 3 P2 findings have been folded back into the affected tasks. Look for `> *MMR-corrected:* …` callouts inline. Net effect:
>
> - **Phase 1 / Task 1.4 (F-001)** — `BD_ACTOR` rename scope expanded to 4 additional active docs; historical surfaces annotated instead of renamed; verification grep tightened.
> - **Phase 2 / Task 2.3 (F-003)** — Redirected from root `CLAUDE.md` (scaffold itself doesn't use Beads) to `content/pipeline/foundation/beads.md` (the downstream-CLAUDE.md template).
> - **Phase 3 / Task 3.1 (F-004)** — Added Step 0 to update the existing `'true'`-shimmed availability test before introducing the version parser.
> - **Phase 3 / Task 3.2 (F-008)** — Simplified `const [major] = [Number(m[1])]` → `const major = Number(m[1])`.
> - **Phase 6 / Task 6.2 (F-005)** — Replaced `[ -d .beads ] && bd preflight` with `if [ -d .beads ]; then bd preflight; fi` (preserves exit 0 under `set -e`).
> - **Phase 7 / Task 7.1 (F-006)** — Rewrote the jq/shell loop: `--argjson` for numeric threshold, severity rank conversion, `while IFS= read -r` to avoid word-splitting JSON objects, jq `.[0:120]` for UTF-8-safe truncation.
> - **Phase 8 / Tasks 8.1-8.3 (F-007, F-009)** — Restructured. Original single task couldn't work (`writeEvent` returns void). Now: (8.1) refactor `writeEvent` to return the written event; (8.2) add `claimWithEvent` helper; (8.3) wire them together in `src/cli/commands/observe.ts` (the verified emit point) + CLI integration test.
> - **Phase 1 / Task 1.1 / Step 3 (F-010)** — Distinguished prose vs code-block treatment for the three `bd sync` occurrences in `12-mixin-injection.md`.

---

## Phase 1 — Stale-command sweep (P1)

**Covers:** F-2.1 (`bd sync`), F-2.2 (`bd start`/`bd claim`), F-2.3 (`bd status BD-xxx`), F-2.4 (status vocabulary), F-2.5 (`BD_ACTOR`→`BEADS_ACTOR`), F-2.6 (P0–P4 scale), F-2.7 (ID format examples), F-2.8 (`bd list --actor`→`--assignee`).

**Why bundled:** All are surface-level content edits to the same set of meta-prompts; consolidating limits review burden and keeps the diff legible. No code, no behavior change to assembled prompts beyond accuracy.

**Branch:** `fix/beads-stale-commands`

### Task 1.1: Fix `bd sync` (F-2.1)

**Files:**
- Modify: `content/pipeline/build/single-agent-start.md:107`
- Modify: `content/pipeline/build/single-agent-resume.md:101,190`
- Modify: `content/pipeline/build/multi-agent-start.md:125,213`
- Modify: `content/pipeline/build/multi-agent-resume.md:118,222`
- Modify: `docs/v2/domain-models/04-abstract-task-verbs.md:787,1298,1335` (the `sync` verb abstraction)
- Modify: `docs/v2/domain-models/12-mixin-injection.md:1140,1513,1621`
- Modify: `docs/architecture/data/secondary-formats.md:708,716,724`

- [ ] **Step 1: Replace `bd close <id> && bd sync` in pipeline files**

In all four files (`single-agent-start.md`, `single-agent-resume.md`, `multi-agent-start.md`, `multi-agent-resume.md`), find every occurrence of:

```
bd close <id> && bd sync
```

Replace with:

```
bd close <id>
```

Run: `grep -rn "bd close <id> && bd sync" content/pipeline/build/`
Expected after edit: no matches.

- [ ] **Step 2: Replace standalone `bd sync` conflict-detection paragraphs**

Pattern locations:
- `content/pipeline/build/single-agent-resume.md:190` — currently `If Beads: \`bd sync\` will show updated task states`
- `content/pipeline/build/multi-agent-start.md:213` — currently `If Beads: \`bd sync\` will reveal the conflict — pick a different task`
- `content/pipeline/build/multi-agent-resume.md:222` — currently `If Beads: \`bd sync\` will show updated task states`

Replace each with:

```
If Beads: a `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
```

- [ ] **Step 3: Update the v2 `sync` verb template**

Open `docs/v2/domain-models/04-abstract-task-verbs.md:787` (and the templated occurrences at lines 1298 and 1335). The verb mapping table renders `sync` → `bd sync`. Replace with `bd dolt push` (the closest real upstream verb — pushes accumulated Dolt commits to remote if configured; no-op otherwise). Update the surrounding prose to call out that this is a no-op when no remote is configured.

Edit `docs/v2/domain-models/12-mixin-injection.md`:
- Line **1140** is **prose** ("Then run `bd sync` to persist the change."). Replace with: "Then run `bd dolt push` (no-op if no Dolt remote is configured) to persist the change." Keep it as prose.
- Lines **1513** and **1621** are inside example **code blocks**. Replace `bd sync` with `bd dolt push` and add a trailing `# no-op if no Dolt remote configured` comment after each.

Edit `docs/architecture/data/secondary-formats.md` at lines 708, 716, 724 — same treatment.

- [ ] **Step 4: Annotate historical specs**

Files: `docs/superpowers/specs/2026-04-02-beads-contributor-surface-cleanup-design.md:77`, `docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md:107`.

Do NOT rewrite these specs (they're historical record). Add a one-line note at the very top of each spec under the existing frontmatter/heading:

```
> **2026-05-24 note:** `bd sync` is referenced in this spec but is not a real upstream command in Beads v1.0.4. See `docs/audits/beads-integration-audit-2026-05-24.md` F-2.1.
```

- [ ] **Step 5: Verify no stragglers**

Run: `grep -rn "bd sync" content/ docs/ scripts/ src/ 2>/dev/null | grep -v archive | grep -v audits | grep -v "specs/"`

Expected: no output (every active reference fixed; specs annotated separately).

- [ ] **Step 6: Run validation**

Run: `make check-all`
Expected: PASS (no frontmatter or test regressions).

- [ ] **Step 7: Commit**

```bash
git add content/pipeline/build/ docs/v2/domain-models/ docs/architecture/data/secondary-formats.md docs/superpowers/specs/2026-04-02-beads-contributor-surface-cleanup-design.md docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md
git commit -m "fix(beads): remove non-existent bd sync command (F-2.1)"
```

### Task 1.2: Fix `bd start`, `bd claim`, `bd status BD-xxx` (F-2.2, F-2.3)

**Files:**
- Modify: `content/knowledge/core/task-tracking.md:81-82,111`
- Modify: `content/knowledge/execution/task-claiming-strategy.md` (search-and-replace `bd claim` references)

- [ ] **Step 1: Replace the task-tracking command table entries**

In `content/knowledge/core/task-tracking.md:81-82`:

Old:
```
| `bd status BD-xxx` | Check task state | Before picking up work |
| `bd start BD-xxx` | Mark task in-progress | Beginning work on a task |
```

New:
```
| `bd show <id>` | Inspect full task (alias `bd view`) | Before picking up work |
| `bd update <id> --claim` | Atomically claim (assigns to you + sets `in_progress`) | Beginning work on a task |
| `bd ready --claim --json` | Find and claim first ready task in one call | Picking next task with no preference |
```

- [ ] **Step 2: Fix the workflow narration at line 111**

Old:
```
4. Run `bd start BD-xxx` to claim the task
```

New:
```
4. Run `bd update <id> --claim` to atomically claim the task (or skip step 2-3 and just `bd ready --claim --json`)
```

- [ ] **Step 3: Fix `task-claiming-strategy.md`**

Open `content/knowledge/execution/task-claiming-strategy.md`. Find every occurrence of `bd claim` (with or without args). Replace with one of:
- `bd update <id> --claim` (when an ID is in scope)
- `bd ready --claim --json` (when picking the first available)

Run: `grep -n "bd claim" content/knowledge/execution/task-claiming-strategy.md`
Expected after edit: no matches except possibly inside a backticked reference to the `--claim` flag itself.

- [ ] **Step 4: Validate and commit**

```bash
make check-all
git add content/knowledge/core/task-tracking.md content/knowledge/execution/task-claiming-strategy.md
git commit -m "fix(beads): replace non-existent bd start/claim/status with bd update --claim and bd show (F-2.2, F-2.3)"
```

### Task 1.3: Align task-status vocabulary (F-2.4)

**Files:**
- Modify: `content/knowledge/core/task-tracking.md:37-50` (state machine), `:189-190` (example list)

- [ ] **Step 1: Replace the state machine documentation**

Old block (lines ~37-50):
```
Track task status through a simple state machine:

ready → in-progress → review → done

- **ready** — All dependencies met, can start immediately
- **in-progress** — Agent is actively working on it
- (etc.)
```

New block:
```
Beads tracks task status through this state machine (upstream v1.0.4 enum):

`open → in_progress → closed` (happy path)
            ↓
        `blocked` | `deferred` (off-path)

- **open** — Not started.
- **in_progress** — Atomically claimed via `bd update <id> --claim` or `bd ready --claim`.
- **blocked** — Dependency unresolved (set automatically when a `blocks:` dep exists on an open issue).
- **deferred** — Hidden from `bd ready` until `--defer` date passes.
- **closed** — Completed (via `bd close <id>`). Reopen with `bd reopen <id>`.
- **pinned** / **hooked** — Special states; rarely set manually.

Beads also exposes a *status category* dimension (`active | wip | done | frozen`) for higher-level grouping. Use `bd state <id>` to query, `bd statuses` to list valid statuses.

> Scaffold previously documented `ready → in-progress → review → done` — none of those (except via `ready` as a *query*) are upstream statuses. The `review` state, if needed, can be added per-project via `bd config set types.custom_statuses '[{"name":"review","category":"wip"}]'`.
```

- [ ] **Step 2: Fix the example task list (lines ~189-190)**

Old:
```
- [ ] BD-12: User registration endpoint (in-progress)
- [ ] BD-13: Login endpoint (ready)
```

New (use lowercase hash-style IDs per F-2.7 and corrected statuses):
```
- [ ] bd-a3f8: User registration endpoint (in_progress)
- [ ] bd-a3f9: Login endpoint (open, ready to pick up)
```

- [ ] **Step 3: Validate and commit**

```bash
make check-all
git add content/knowledge/core/task-tracking.md
git commit -m "fix(beads): align task status vocabulary with upstream enum (F-2.4)"
```

### Task 1.4: Rename `BD_ACTOR` → `BEADS_ACTOR` (F-2.5)

**Active surfaces (rename):**
- Modify: `content/pipeline/environment/git-workflow.md:41`
- Modify: `content/pipeline/build/multi-agent-start.md:93`
- Modify: `content/pipeline/build/multi-agent-resume.md:88`
- Modify: `content/knowledge/execution/worktree-management.md:182-187`
- Modify: `docs/v2/domain-models/12-mixin-injection.md` (active v2 design doc)
- Modify: `docs/architecture/domain-models/10-claude-md-management.md`
- Modify: `docs/architecture/domain-models/11-decision-log.md`
- Modify: `docs/architecture/data/decisions-jsonl-schema.md`

**Historical/archived surfaces (annotate only — do not rename):**
- `docs/prd-v1.md` (explicitly v1-archived in name)
- `docs/architecture/reference/prd-v1.md`
- `docs/superpowers/specs/2026-04-02-beads-contributor-surface-cleanup-design.md`
- `docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md`
- `docs/validation/agent-ergonomics-audit.md`

- [ ] **Step 1: Search-and-replace in active surfaces**

For each *active* file in the list above, replace every occurrence of `BD_ACTOR` with `BEADS_ACTOR`. In `worktree-management.md` the canonical setup block needs both the env var name updated AND a one-line back-compat note added:

In `content/knowledge/execution/worktree-management.md:182-187`:

Old:
```
### BD_ACTOR Environment Variable

When using Beads for task tracking, set `BD_ACTOR` per agent for attribution:

export BD_ACTOR="agent-1"
```

New:
```
### BEADS_ACTOR Environment Variable

When using Beads for task tracking, set `BEADS_ACTOR` per agent for attribution:

export BEADS_ACTOR="agent-1"

> Older Beads versions (<v1.0.0) used `BD_ACTOR`. It's still accepted as a deprecated alias — if you see it in legacy scripts, rename when you next edit.
```

- [ ] **Step 2: Annotate historical surfaces (do not rename)**

For each historical/archived file in the list above, add (just below the existing frontmatter or top-of-file heading) the note:

```
> **2026-05-24 note:** `BD_ACTOR` references in this document are retained as historical record. The current Beads env var is `BEADS_ACTOR` (since v1.0.0). See `docs/audits/beads-integration-audit-2026-05-24.md` F-2.5.
```

- [ ] **Step 3: Verify the right scope changed**

Run: `grep -rn "BD_ACTOR" content/ docs/v2/ docs/architecture/ scripts/ src/ 2>/dev/null | grep -v audits | grep -v plans/`
Expected: zero matches (every active reference renamed).

Run: `grep -rln "BD_ACTOR" docs/prd-v1.md docs/architecture/reference/prd-v1.md docs/superpowers/specs/ docs/validation/`
Expected: same file list as before (annotated, not renamed).

- [ ] **Step 4: Validate and commit**

```bash
make check-all
git add content/ docs/
git commit -m "fix(beads): rename BD_ACTOR to BEADS_ACTOR across active surfaces; annotate historical (F-2.5)"
```

> *MMR-corrected (Codex P1):* the original task scoped only 4 files; verification grep would have failed because additional active docs reference `BD_ACTOR`. Scope expanded; historical surfaces explicitly excluded with annotation instead.

### Task 1.5: Fix priority scale and ID format examples (F-2.6, F-2.7, F-2.8)

**Files:**
- Modify: `content/pipeline/build/quick-task.md:155-159`
- Modify: `content/pipeline/build/multi-agent-resume.md:117`
- Modify: `content/knowledge/core/task-tracking.md` (ID format examples)
- Modify: `content/pipeline/environment/git-workflow.md` (commit prefix examples)

- [ ] **Step 1: Add P4 to the priority table (F-2.6)**

In `content/pipeline/build/quick-task.md:155-159`, after the existing `P3` row, add:

```
- **P4** — Backlog / future-consideration (lowest priority; effectively deferred)
```

- [ ] **Step 2: Fix `bd list --actor` → `--assignee` (F-2.8)**

In `content/pipeline/build/multi-agent-resume.md:117`:

Old:
```
bd list --actor $ARGUMENTS
```

New:
```
bd list --assignee $ARGUMENTS
```

- [ ] **Step 3: Update ID format examples (F-2.7)**

In `content/knowledge/core/task-tracking.md`, find every example using `BD-<number>` (e.g., `BD-42`, `BD-12`, `BD-13`). Replace with hash-style lowercase examples: `bd-a3f8`, `bd-a3f9`. Add a one-line note where ID format is first introduced:

```
> IDs are hash-based and lowercase (e.g., `bd-a3f8`). The `bd-` prefix is configurable at `bd init` time. Hierarchical IDs for epic children: `bd-a3f8.1`, `bd-a3f8.1.1`.
```

In `content/pipeline/environment/git-workflow.md`, the commit-prefix example `[BD-<id>]` should be updated to match (lowercase): `[bd-<id>]`. Update both the example template and any sample commit messages in that file.

Run: `grep -rn "BD-[0-9]" content/ 2>/dev/null | grep -v audits`
Expected: only documentation context references; example IDs use `bd-<hash>` format.

- [ ] **Step 4: Validate and commit**

```bash
make check-all
git add content/
git commit -m "fix(beads): correct priority scale, ID format examples, and bd list filter (F-2.6, F-2.7, F-2.8)"
```

### Task 1.6: Push branch and open PR

- [ ] **Step 1: Push and create PR**

```bash
git push -u origin fix/beads-stale-commands
gh pr create --title "fix(beads): stale-command sweep (P1 corrections from audit F-2.1–F-2.8)" --body "$(cat <<'EOF'
## Summary

- Removes `bd sync` (non-existent in upstream Beads v1.0.4) across pipeline + v2 docs.
- Replaces `bd start`, `bd claim`, `bd status BD-xxx` with `bd update <id> --claim`, `bd ready --claim --json`, and `bd show <id>`.
- Aligns task-status vocabulary with upstream enum (`open, in_progress, blocked, deferred, closed` + status categories).
- Renames `BD_ACTOR` → `BEADS_ACTOR` (deprecated alias annotated).
- Adds `P4` to priority scale documentation.
- Replaces `bd list --actor` with `--assignee`.
- Updates ID format examples to hash-style lowercase (`bd-a3f8`).

Source: `docs/audits/beads-integration-audit-2026-05-24.md` (Findings F-2.1 through F-2.8).

## Test plan
- [ ] `make check-all` passes
- [ ] `grep -rn "bd sync" content/ docs/` returns no active references
- [ ] `grep -rn "BD_ACTOR" content/` returns only the deprecation-note line
EOF
)"
```

- [ ] **Step 2: Run review-pr after PR creation**

Per CLAUDE.md mandatory post-PR review:
```bash
scaffold run review-pr
```
Address blocking findings before moving to Phase 2.

---

## Phase 2 — `bd doctor --fix` remediation step (P1)

**Covers:** F-1.6 + F-5.5 (observed hook breakage; no scaffold-shipped guidance to recover from `bd` upgrades).

**Why standalone PR:** Touches `scripts/` + the `/scaffold:beads` step + a CLAUDE.md callout — three different surfaces, but tightly themed.

**Branch:** `feat/beads-doctor-fix-step`

### Task 2.1: Add doctor step to /scaffold:beads pipeline

**Files:**
- Modify: `content/pipeline/foundation/beads.md`

- [ ] **Step 1: Add `bd doctor --fix` after `bd init`**

Open `content/pipeline/foundation/beads.md`. The current step prescribes `bd init` then writes `tasks/lessons.md` and edits CLAUDE.md. Add a new substep immediately after `bd init`:

```markdown
### After `bd init`: re-sync hooks and config

Run `bd doctor --fix` to reconcile git hooks, schemas, and conventions with the installed Beads version. This is idempotent and the canonical recovery path if the user later upgrades `bd` — re-running it migrates stale hooks (e.g., older `bd hook <name>` shims to current `bd hooks run <name>`).

```bash
bd doctor --fix
```

If hooks need to be (re-)installed from scratch (e.g., the project added Beads after the repo was cloned), also run:

```bash
bd hooks install
```
```

- [ ] **Step 2: Validate prompt assembly**

Run: `make validate`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add content/pipeline/foundation/beads.md
git commit -m "feat(beads): prescribe bd doctor --fix after bd init (F-1.6)"
```

### Task 2.2: Add conditional doctor step to setup-agent-worktree.sh

**Files:**
- Modify: `scripts/setup-agent-worktree.sh`

- [ ] **Step 1: Append a Beads-aware tail**

Open `scripts/setup-agent-worktree.sh`. After the existing identity.json write (currently ends around line 75), append:

```bash

# ─── Beads remediation (if .beads/ exists) ──────────────────
if [ -d "$worktree_dir/.beads" ] && command -v bd >/dev/null 2>&1; then
    # Sync hooks/config against current bd version; idempotent.
    # Fail-soft so non-Beads users (or stale bd installs) don't block worktree setup.
    if ! (cd "$worktree_dir" && bd doctor --fix >/dev/null 2>&1); then
        echo "Note: 'bd doctor --fix' reported issues in $worktree_dir. Run it manually for details." >&2
    fi
fi
```

- [ ] **Step 2: Test it doesn't break the no-Beads case**

Run: `bash -n scripts/setup-agent-worktree.sh` (syntax check)
Expected: no errors.

Run a synthetic invocation in a throwaway dir to ensure the tail is exit-safe:
```bash
( cd /tmp && rm -rf .scaffold-bd-test && git init .scaffold-bd-test >/dev/null && cd .scaffold-bd-test && scripts/setup-agent-worktree.sh dummy-test ) 2>&1 | tail
```
Expected: script completes without the no-`.beads` path triggering the tail.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-agent-worktree.sh
git commit -m "feat(beads): run bd doctor --fix on worktree setup when .beads/ exists (F-1.6, F-5.5)"
```

### Task 2.3: Add upgrade-remediation callout to the generated CLAUDE.md template

**Files:**
- Modify: `content/pipeline/foundation/beads.md` (the prompt that generates downstream CLAUDE.md Beads content) — **NOT** root `CLAUDE.md`.

**Rationale:** Scaffold itself does not use Beads for repo task tracking — root `CLAUDE.md` has zero Beads references and gaining one would contradict scaffold's own AGENTS.md. The right place for an "after-bd-upgrade run `bd doctor --fix`" reminder is the downstream-project CLAUDE.md, which is sourced from `content/pipeline/foundation/beads.md` (already edited in Task 2.1 of this phase).

- [ ] **Step 1: Add the callout to the foundation prompt**

Open `content/pipeline/foundation/beads.md`. Inside the section that the prompt instructs to be inserted into the downstream project's CLAUDE.md (the same section Task 2.1 edited), add:

```markdown
> **After upgrading `bd`:** run `bd doctor --fix` to re-sync git hooks and project config. This fixes errors like `unknown command "hook" for "bd"` from stale post-checkout/post-merge hook shims left over from earlier Beads versions.
```

If Task 2.1 already added this line as part of the doctor-step section, this task is a no-op — verify by running `grep "After upgrading" content/pipeline/foundation/beads.md`. If the line is missing, add it.

- [ ] **Step 2: Verify scaffold's own CLAUDE.md is untouched**

Run: `git status CLAUDE.md`
Expected: no changes — Task 2.3 must not modify scaffold's own CLAUDE.md.

- [ ] **Step 3: Commit and push PR**

```bash
git add content/pipeline/foundation/beads.md
git commit -m "docs(beads): generated-CLAUDE.md callout for bd doctor --fix after bd upgrade (F-5.5)"
git push -u origin feat/beads-doctor-fix-step
gh pr create --title "feat(beads): prescribe bd doctor --fix everywhere bd is initialized" --body "$(cat <<'EOF'
## Summary

- `/scaffold:beads` pipeline step now runs `bd doctor --fix` after `bd init`.
- `scripts/setup-agent-worktree.sh` runs `bd doctor --fix` when entering a worktree with `.beads/`.
- The downstream-CLAUDE.md template (sourced from `content/pipeline/foundation/beads.md`) gains a one-line callout pointing at the same remediation. **Scaffold's own root CLAUDE.md is intentionally untouched** — scaffold doesn't use Beads.

Motivation: half-migrated git hooks (e.g. `bd hook` singular vs upstream `bd hooks run`) are silently broken on upgrade with no scaffold-prescribed recovery. Audit F-1.6, F-5.5.

## Test plan
- [ ] `make check-all` passes
- [ ] `bash -n scripts/setup-agent-worktree.sh` passes
- [ ] Synthetic no-`.beads` worktree setup still works
- [ ] `git diff main..HEAD -- CLAUDE.md` is empty (scaffold's own CLAUDE.md untouched)
EOF
)"
scaffold run review-pr
```

---

## Phase 3 — Beads adapter min-version check (P1, TDD)

**Covers:** F-5.1 (no version pinning; adapter currently treats `bd --version` as a boolean availability probe and ignores the version string).

**Branch:** `feat/beads-adapter-version-check`

### Task 3.1: Add a failing test for min-version degradation (and update the existing availability test)

**Files:**
- Modify: `src/observability/adapters/beads.test.ts`

- [ ] **Step 0: Update the existing "available" test to emit a version string**

The current test at line ~23-27 uses `bdBin: 'true'`, which exits 0 but emits no stdout. Once the parser lands, that test will degrade — fix it preemptively.

Old:
```typescript
  it('probe returns available when .beads/ + bd both exist', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: 'true' })
    expect(s.status).toBe('available')
  })
```

New:
```typescript
  it('probe returns available when .beads/ + bd both exist', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const shim = join(dir, 'fake-bd.sh')
    writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.0.4"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: shim })
    expect(s.status).toBe('available')
  })
```

- [ ] **Step 1: Append a new test case**

Open `src/observability/adapters/beads.test.ts`. After the existing three tests (`probe returns unavailable…`, `degraded when…`, `available when…`), add:

```typescript
  it('probe returns degraded when bd is too old (below v1.0.0)', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    // Use a shim that prints an old version string
    const oldBd = join(dir, 'fake-bd.sh')
    writeFileSync(oldBd, '#!/usr/bin/env bash\necho "bd version 0.62.0"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: oldBd })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/version/)
  })

  it('probe returns available when bd is v1.0.0 or newer', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const newBd = join(dir, 'fake-bd.sh')
    writeFileSync(newBd, '#!/usr/bin/env bash\necho "bd version 1.0.4 (Homebrew)"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: newBd })
    expect(s.status).toBe('available')
  })
```

Also add `writeFileSync` to the existing `node:fs` import line at the top:

Old:
```typescript
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
```

New:
```typescript
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/observability/adapters/beads.test.ts`
Expected: FAIL — the `too old` test fails because the adapter currently returns `available` without parsing the version.

### Task 3.2: Implement version parsing in the adapter

**Files:**
- Modify: `src/observability/adapters/beads.ts`

- [ ] **Step 1: Add a version parser and gate**

Replace the body of `probe` so it parses `bd --version` output, extracts a semver-shaped triple, and downgrades to `degraded` when the major is 0:

Old (`src/observability/adapters/beads.ts:19-34`):
```typescript
  async probe(cwd: string, opts: BeadsAdapterOpts = {}): Promise<AdapterStatus> {
    try {
      await access(join(cwd, '.beads'))
    } catch {
      return { status: 'unavailable', reason: '.beads directory not found (project chose markdown-only tracking)' }
    }
    const bin = opts.bdBin ?? 'bd'
    try {
      await execFile(bin, ['--version'], { cwd })
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'degraded', reason: 'bd binary not installed' }
      return { status: 'degraded', reason: 'bd probe failed' }
    }
  },
```

New:
```typescript
  async probe(cwd: string, opts: BeadsAdapterOpts = {}): Promise<AdapterStatus> {
    try {
      await access(join(cwd, '.beads'))
    } catch {
      return { status: 'unavailable', reason: '.beads directory not found (project chose markdown-only tracking)' }
    }
    const bin = opts.bdBin ?? 'bd'
    let stdout: string
    try {
      ;({ stdout } = await execFile(bin, ['--version'], { cwd }))
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'degraded', reason: 'bd binary not installed' }
      return { status: 'degraded', reason: 'bd probe failed' }
    }
    const m = stdout.match(/(\d+)\.(\d+)\.(\d+)/)
    if (!m) return { status: 'degraded', reason: `bd version could not be parsed from: ${stdout.trim()}` }
    const major = Number(m[1])
    if (major < 1) {
      return { status: 'degraded', reason: `bd version ${m[0]} is below the supported minimum (1.0.0). Run 'brew upgrade beads' or your equivalent.` }
    }
    return { status: 'available' }
  },
```

> *MMR-corrected:* Step 0 now updates the pre-existing `'true'`-shimmed test so it doesn't break under the new parser (Codex F-004). Destructuring simplified per Gemini F-008.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- src/observability/adapters/beads.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 3: Run full TypeScript checks**

Run: `make check-all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/observability/adapters/beads.ts src/observability/adapters/beads.test.ts
git commit -m "feat(observability/beads): degrade adapter when bd <1.0.0 (F-5.1)"
```

### Task 3.3: Push and review

- [ ] **Step 1: Push and PR**

```bash
git push -u origin feat/beads-adapter-version-check
gh pr create --title "feat(observability/beads): min-version gate (>=1.0.0)" --body "$(cat <<'EOF'
## Summary

- The Beads adapter now parses `bd --version` and degrades to `degraded` when the major version is 0.
- Old bd installs (pre-v1.0.0 — pre-Dolt) lack many commands scaffold prescribes and would silently misbehave; this surfaces the issue at probe time with an actionable upgrade hint.

Source: audit F-5.1.

## Test plan
- [ ] `npm test -- src/observability/adapters/beads.test.ts` (5 tests, 0 failures)
- [ ] `make check-all`
EOF
)"
scaffold run review-pr
```

---

## Phase 4 — Adopt `bd prime` + `bd setup` recipe (P2)

**Covers:** F-1.1 (`bd prime` as SSOT), F-1.2 (use `bd setup` recipe instead of hand-rolled CLAUDE.md edits).

**Why standalone:** This is the largest single change in the audit — it refactors `/scaffold:beads` to delegate context injection to upstream rather than reimplementing it. Needs careful before/after diff review.

**Branch:** `feat/beads-prime-and-setup-recipe`

### Task 4.1: Replace hand-rolled CLAUDE.md editing with `bd setup`

**Files:**
- Modify: `content/pipeline/foundation/beads.md`

- [ ] **Step 1: Read the current implementation**

```bash
cat content/pipeline/foundation/beads.md
```

Identify the block that hand-edits CLAUDE.md to add a Beads command reference + Core Principles section.

- [ ] **Step 2: Replace with `bd setup` + `bd onboard`**

Replace the CLAUDE.md-editing block with:

```markdown
### Install editor integration via upstream recipes

Beads ships built-in setup recipes that write the integration block into CLAUDE.md (or AGENTS.md / GEMINI.md / `.cursor/rules/`) for you, using a marker-managed format that survives re-runs.

For Claude Code (default for scaffold-generated projects):

```bash
bd setup claude
```

The `claude` recipe installs the `minimal` profile by default — a small CLAUDE.md section plus SessionStart/PreCompact hooks that load `bd prime --hook-json`. This means agents get the canonical Beads workflow context (commands, recent activity, memories) injected automatically, scoped per-session, without scaffold maintaining a separate command reference.

If the project also targets Codex or Gemini CLI:

```bash
bd setup codex     # writes .agents/skills/beads/SKILL.md + AGENTS.md section
bd setup gemini    # writes GEMINI.md section + hooks (minimal profile)
```

Use `bd setup --list` to see all recipes, `bd setup <recipe> --check` to verify, and `bd setup <recipe> --remove` to uninstall cleanly.

### Add a project-local memory pointer (optional)

If you want to override the default `bd prime` output for this project, create `.beads/PRIME.md` with the project-specific context you want injected. Otherwise the defaults will do.
```

- [ ] **Step 3: Remove the obsolete hand-rolled command reference table**

In the same file, delete any block that listed `bd` commands directly (Core Principles + command table) — that content now lives in `bd prime` output and the recipe-managed CLAUDE.md section. Keep scaffold-specific guidance (e.g., scaffold's commit-message conventions if they're scaffold-owned, not Beads-owned).

- [ ] **Step 4: Validate**

```bash
make check-all
```

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/foundation/beads.md
git commit -m "feat(beads): delegate CLAUDE.md integration to bd setup recipe (F-1.1, F-1.2)"
```

### Task 4.2: Document `bd prime` and `bd onboard` in knowledge

**Files:**
- Modify: `content/knowledge/core/task-tracking.md`

- [ ] **Step 1: Add a section near the top**

Open `content/knowledge/core/task-tracking.md`. After the existing intro (before the state-machine block), add:

```markdown
## Agent context: `bd prime` is the SSOT

Beads ships `bd prime` as the single source of truth for workflow context injected into agent sessions. The default output is ~1-2k tokens and includes:
- Current ready/in-progress task counts
- The next 1-2 ready tasks with full descriptions
- Recent activity (last few closed/updated)
- Persistent memories set via `bd remember`

Variants:
- `bd prime` — full default
- `bd prime --memories-only` — just persistent memories (very small)
- `bd prime --full` — extended context (use sparingly; ~5k tokens)
- `bd prime --hook-json` — Claude Code SessionStart hook envelope

Override the default output by writing `.beads/PRIME.md` (Markdown, free-form). The `bd setup claude` / `bd setup gemini` recipes wire `bd prime --hook-json` into SessionStart hooks for you — you don't typically invoke it by hand.

`bd onboard` emits a one-line snippet you can paste into any agent context file to remind it about `bd prime`.
```

- [ ] **Step 2: Validate and commit**

```bash
make check-all
git add content/knowledge/core/task-tracking.md
git commit -m "docs(beads): document bd prime + bd onboard as agent context SSOT (F-1.1)"
```

### Task 4.3: Push and PR

- [ ] **Step 1:**

```bash
git push -u origin feat/beads-prime-and-setup-recipe
gh pr create --title "feat(beads): adopt bd setup recipes + bd prime SSOT for agent context" --body "$(cat <<'EOF'
## Summary

- `/scaffold:beads` now delegates CLAUDE.md/AGENTS.md/GEMINI.md integration to upstream `bd setup <recipe>` — marker-managed, idempotent, survives re-runs.
- Hand-rolled command reference table removed (it now lives in `bd prime` output).
- Knowledge entry for `task-tracking` documents `bd prime` and `bd onboard` as the canonical agent-context injection.

Source: audit F-1.1, F-1.2.

## Test plan
- [ ] `make check-all` passes
- [ ] In a fresh scratch dir, run `bd init && bd setup claude` and confirm CLAUDE.md ends up with a marker block + hooks (manual smoke test)
EOF
)"
scaffold run review-pr
```

---

## Phase 5 — Atomic `--claim` and `export.auto` (P2)

**Covers:** F-1.9 (atomic `bd ready --claim --json`), F-5.3 (explicit `export.auto`).

**Branch:** `feat/beads-atomic-claim-and-export`

### Task 5.1: Switch `bd ready` to atomic `--claim --json` in start prompts

**Files:**
- Modify: `content/pipeline/build/single-agent-start.md`
- Modify: `content/pipeline/build/multi-agent-start.md`
- Modify: `content/pipeline/build/single-agent-resume.md`
- Modify: `content/pipeline/build/multi-agent-resume.md`

- [ ] **Step 1: Update single-agent-start.md**

Find the `bd ready` call (around line 104) and the surrounding pick-task logic. Replace:

Old (rough pattern):
```
Run `bd ready` to see available tasks.
Pick the highest-priority one with no blockers.
Claim it by editing the task...
```

New:
```
Atomically claim the first ready task:

```bash
TASK=$(bd ready --claim --json | jq -r '.id')
echo "Claimed: $TASK"
```

This sets `assignee=$BEADS_ACTOR` and `status=in_progress` in a single round-trip — no race window vs other agents. If you need a specific task by ID instead, use `bd update <id> --claim`.
```

- [ ] **Step 2: Mirror the change in multi-agent-start.md**

Same pattern — the multi-agent version should additionally verify `$BEADS_ACTOR` is set before claiming:

```bash
[ -n "${BEADS_ACTOR:-}" ] || { echo "BEADS_ACTOR must be set per agent"; exit 1; }
TASK=$(bd ready --claim --json | jq -r '.id')
echo "Claimed: $TASK as $BEADS_ACTOR"
```

- [ ] **Step 3: Update resume prompts**

In `single-agent-resume.md` and `multi-agent-resume.md`, after reconciling merged PRs, the prompt should offer `bd ready --claim --json` as the way to pick the next task (currently uses non-atomic `bd ready`).

- [ ] **Step 4: Validate and commit**

```bash
make check-all
git add content/pipeline/build/
git commit -m "feat(beads): use atomic bd ready --claim --json to prevent race windows (F-1.9)"
```

### Task 5.2: Make `export.auto` explicit and drop JSONL fallback

**Files:**
- Modify: `content/pipeline/foundation/beads.md`
- Modify: `content/tools/release.md`
- Modify: `content/tools/version-bump.md`

- [ ] **Step 1: Set `export.auto` explicitly after `bd init`**

In `content/pipeline/foundation/beads.md`, after the `bd init` and `bd doctor --fix` block (added in Phase 2), add:

```markdown
### Enable auto-export to JSONL (recommended for release workflows)

Beads can mirror its database to `.beads/issues.jsonl` so other tools and CI can read task state without invoking `bd`. As of v1.0.4-Unreleased this is opt-in:

```bash
bd config set export.auto true
bd config set export.git-add true
```

With `git-add true`, the JSONL is auto-staged on each refresh so commits include the latest task state.
```

- [ ] **Step 2: Drop the JSONL fallback in release.md and version-bump.md**

In `content/tools/release.md`, find the block that says something like "if `bd list` fails, parse `.beads/issues.jsonl`". Replace the fallback with a single canonical path:

```bash
bd list --status closed --json
```

Document that if `bd` is unavailable, the release/version-bump step proceeds without an autogenerated closed-tasks section (manual changelog entry expected).

Same change for `content/tools/version-bump.md`.

- [ ] **Step 3: Validate and commit**

```bash
make check-all
git add content/pipeline/foundation/beads.md content/tools/release.md content/tools/version-bump.md
git commit -m "feat(beads): explicit export.auto + bd list --json as canonical query (F-5.3)"
```

### Task 5.3: Push and PR

- [ ] **Step 1:**

```bash
git push -u origin feat/beads-atomic-claim-and-export
gh pr create --title "feat(beads): atomic claim + explicit export.auto" --body "$(cat <<'EOF'
## Summary

- All `bd ready` invocations in pipeline-build prompts now use `bd ready --claim --json` for atomic find-and-claim (prevents race windows in multi-agent runs).
- `/scaffold:beads` explicitly enables `export.auto` and `export.git-add` (upstream flipped these to opt-in in v1.0.4-Unreleased).
- Release/version-bump tools drop the brittle JSONL-parsing fallback; the canonical query is now `bd list --status closed --json`.

Source: audit F-1.9, F-5.3.

## Test plan
- [ ] `make check-all` passes
- [ ] Manual: `bd ready --claim --json` in a scratch project actually returns the claimed task as JSON
EOF
)"
scaffold run review-pr
```

---

## Phase 6 — `discovered-from` + `bd preflight` (P2)

**Covers:** F-1.4 (discovered-from), F-1.5 (preflight).

**Branch:** `feat/beads-discovered-and-preflight`

### Task 6.1: Document `discovered-from` in quick-task and claiming-strategy

**Files:**
- Modify: `content/pipeline/build/quick-task.md`
- Modify: `content/knowledge/execution/task-claiming-strategy.md`

- [ ] **Step 1: Add a "logging incidental discoveries" section to quick-task.md**

In `content/pipeline/build/quick-task.md`, after the create-task example block (around line 201), add:

```markdown
### Logging work discovered while doing another task

If you spot a bug or follow-up task while implementing the current task, log it with the `discovered-from` dependency type — Beads tracks the lineage without making the new task block the current one:

```bash
bd create "fix(parser): handle empty input edge case" \
  --type bug -p 2 \
  --deps discovered-from:$CURRENT_TASK_ID
```

This is the canonical pattern for incidental discoveries. The new task appears in `bd ready` normally; `discovered-from` is just metadata for traceability.
```

- [ ] **Step 2: Mirror in task-claiming-strategy.md**

Add a brief reference in `content/knowledge/execution/task-claiming-strategy.md` under a new "Discovered work" subsection pointing to the same pattern.

- [ ] **Step 3: Validate and commit**

```bash
make check-all
git add content/pipeline/build/quick-task.md content/knowledge/execution/task-claiming-strategy.md
git commit -m "feat(beads): document discovered-from for incidental work (F-1.4)"
```

### Task 6.2: Add `bd preflight` before `gh pr create`

**Files:**
- Modify: `content/pipeline/build/single-agent-start.md`
- Modify: `content/pipeline/build/multi-agent-start.md`
- Modify: `content/pipeline/build/single-agent-resume.md`
- Modify: `content/pipeline/build/multi-agent-resume.md`

- [ ] **Step 1: Insert preflight before each `gh pr create`**

In each of the four files, find the `gh pr create` invocation. Immediately before it, insert (conditional on `.beads/`):

```markdown
If Beads is initialized for this project, run the PR-readiness checklist before opening the PR:

```bash
if [ -d .beads ]; then
  bd preflight
fi
```

(Do **not** use `[ -d .beads ] && bd preflight` — that returns exit-1 when `.beads/` is absent and breaks any caller running under `set -e`.)

Fix any issues `bd preflight` flags before continuing.
```

> *MMR-corrected (Codex F-005):* original used `[ -d .beads ] && bd preflight`, which fails closed when `.beads` doesn't exist.

- [ ] **Step 2: Validate and commit**

```bash
make check-all
git add content/pipeline/build/
git commit -m "feat(beads): add bd preflight before gh pr create (F-1.5)"
```

### Task 6.3: Push and PR

- [ ] **Step 1:**

```bash
git push -u origin feat/beads-discovered-and-preflight
gh pr create --title "feat(beads): discovered-from logging + bd preflight gate" --body "$(cat <<'EOF'
## Summary

- Pipeline prompts now document `--deps discovered-from:<id>` for incidental discoveries.
- All four start/resume prompts run `bd preflight` (conditional on `.beads/`) before `gh pr create`.

Source: audit F-1.4, F-1.5.

## Test plan
- [ ] `make check-all` passes
EOF
)"
scaffold run review-pr
```

---

## Phase 7 — MMR → Beads bridge (P2, opt-in)

**Covers:** F-4.1 (review findings create Beads tasks).

**Branch:** `feat/mmr-beads-bridge`

### Task 7.1: Document the opt-in flag in .mmr.yaml schema

**Files:**
- Modify: `.mmr.yaml` (root)
- Modify: `content/tools/review-pr.md`

- [ ] **Step 1: Add an opt-in key to .mmr.yaml**

Open `.mmr.yaml`. Add (commented-out, so it's discoverable but inert):

```yaml
# beads:
#   create_issues_from_blocking_findings: false  # if true and .beads/ exists, blocking findings are filed as bd issues
#   fix_threshold: P2                            # severity at-or-above to file (default matches results.fix_threshold)
#   default_type: bug                            # bd create -t <type>
#   default_priority: 2
```

- [ ] **Step 2: Add a Step 8 to content/tools/review-pr.md**

After the existing review steps in `content/tools/review-pr.md`, add:

```markdown
### Step 8 — File blocking findings as Beads tasks (opt-in)

If `.mmr.yaml` has `beads.create_issues_from_blocking_findings: true` AND `.beads/` exists, file each blocking finding as a Beads bug. Use `--arg` to pass the threshold into jq, numeric severity ranks (P0=0 highest), `while IFS= read -r` to stream JSON objects safely (avoiding word-splitting on spaces inside strings), and jq's substring operator for safe UTF-8 truncation:

```bash
if [ -d .beads ] && command -v bd >/dev/null 2>&1; then
  # Map P0..P4 to numeric ranks so jq can compare numerically.
  threshold_rank=$(case "$FIX_THRESHOLD" in P0) echo 0;; P1) echo 1;; P2) echo 2;; P3) echo 3;; *) echo 4;; esac)

  while IFS= read -r finding; do
    title=$(jq -r '.description | .[0:120]' <<<"$finding")
    severity=$(jq -r '.severity' <<<"$finding")
    pnum="${severity#P}"   # P2 -> 2
    description=$(jq -r '.description + "\n\nSuggestion: " + .suggestion + "\n\nLocation: " + .location' <<<"$finding")

    bd create "$title" \
      --type bug \
      -p "$pnum" \
      --description "$description" \
      --external-ref "mmr-$JOB_ID" \
      --deps "discovered-from:${SOURCE_BD_ID:-unknown}"
  done < <(jq -c --argjson maxRank "$threshold_rank" '
    .results.channels[].findings[]
    | (.severity | sub("^P";"") | tonumber) as $rank
    | select($rank <= $maxRank)
  ' "$REVIEW_JSON")
fi
```

Notes on the rewrite:
- `--argjson maxRank "$threshold_rank"` passes a number, not a string, so the comparison is numeric.
- `(.severity | sub("^P";"") | tonumber)` extracts the integer rank from `"P2"`-style strings.
- `while IFS= read -r finding; do … done < <(jq -c …)` streams one JSON object per line; the leading `IFS=` and `-r` keep the line intact.
- `.description | .[0:120]` uses jq's substring operator, which is UTF-8-safe (unlike `head -c 120` which can split a multi-byte codepoint).
- The whole block is gated by `[ -d .beads ] && command -v bd` so it no-ops cleanly on projects without Beads.

Use `--external-ref` to link back to the MMR job, and `--deps discovered-from` to chain the new task to whatever current task triggered the review.

> *MMR-corrected:* Codex F-006 (jq quoting/word-split/lexicographic compare) and Gemini (UTF-8 truncation) findings both addressed in the rewrite.
```

Mirror the same block in `content/tools/review-code.md`.

- [ ] **Step 3: Validate and commit**

```bash
make check-all
git add .mmr.yaml content/tools/review-pr.md content/tools/review-code.md
git commit -m "feat(mmr): opt-in flow to file MMR blocking findings as Beads tasks (F-4.1)"
```

### Task 7.2: Push and PR

- [ ] **Step 1:**

```bash
git push -u origin feat/mmr-beads-bridge
gh pr create --title "feat(mmr): bridge blocking findings to Beads tasks (opt-in)" --body "$(cat <<'EOF'
## Summary

- New opt-in `beads.*` config block in `.mmr.yaml` (commented-out template).
- `review-pr` and `review-code` tool prompts gain Step 8: when enabled and `.beads/` exists, blocking findings become `bd` bug issues with `external-ref` pointing back to the MMR job.

Source: audit F-4.1.

## Test plan
- [ ] `make check-all` passes
- [ ] Manual: enable the flag in a scratch project, run an MMR review that returns blocking findings, confirm `bd list` shows them
EOF
)"
scaffold run review-pr
```

---

## Phase 8 — Observability ledger ↔ Beads cross-linking (P2)

**Covers:** F-4.2 (cross-link ledger events and Beads issues via `ledger_event_id` metadata).

**Branch:** `feat/observability-beads-crosslink`

**Design (corrected post-MMR):** `writeEvent(worktreeRoot, input): Promise<void>` currently generates `event_id` internally via `ulid()` and returns nothing — so a caller has no way to obtain the ID to feed into a Beads metadata write. To make the cross-link work this phase needs three changes in order:

1. Change `writeEvent` to **return the written event** (`Promise<WrittenEvent>`), where `WrittenEvent` includes the generated `event_id`. Existing call sites discard the return value freely — TS compilation is unaffected. Existing tests need a trivial update only if they assert the return type.
2. Add `beadsAdapter.claimWithEvent(cwd, { id, eventId }, opts)` that runs `bd update <id> --set-metadata ledger_event_id=<eventId> --claim`.
3. Wire the two together in `src/cli/commands/observe.ts` (the CLI entry point that emits `task_claimed` events) — capture the returned event_id from `writeEvent` and call `claimWithEvent` after.

### Task 8.1: Make `writeEvent` return the event

**Files:**
- Modify: `src/observability/engine/ledger-writer.ts`
- Modify: `src/observability/engine/ledger-writer.test.ts`
- Modify: any other test that asserts on `writeEvent`'s return type (run `grep -rln "writeEvent" src/observability/` to enumerate)

- [ ] **Step 1: Update the ledger-writer signature**

Open `src/observability/engine/ledger-writer.ts`. The current signature is:

```typescript
export async function writeEvent(worktreeRoot: string, input: WriteEventInput): Promise<void> {
```

Change the return type to `Promise<WrittenEvent>` where `WrittenEvent` is the full record about to be written (the `candidate` object the function already constructs internally). At the end of the function, `return candidate` (or whatever the final shape is named — read the file to confirm).

Export the `WrittenEvent` type (or its existing analog) so callers can import it.

- [ ] **Step 2: Update tests for the new return value**

Most existing call sites at `src/observability/engine/api.test.ts`, `harvester.test.ts`, `ledger-writer.test.ts`, `synthesizer.test.ts` discard the return value. Only ones that need updating are those that previously expected `undefined` from `writeEvent` and now get an object. Run:

```bash
npm test -- src/observability/engine/
```

Address only the failing assertions; do not add new tests in this task (Task 8.2 will).

- [ ] **Step 3: Commit**

```bash
make check-all
git add src/observability/engine/ledger-writer.ts src/observability/engine/
git commit -m "refactor(observability): writeEvent returns the written event (preparing for Beads cross-link)"
```

### Task 8.2: Add the `claimWithEvent` helper

**Files:**
- Modify: `src/observability/adapters/beads.ts`
- Modify: `src/observability/adapters/beads.test.ts`

- [ ] **Step 1: Add a failing test for a new `claimWithEvent` helper**

In `beads.test.ts`, append:

```typescript
  it('claimWithEvent invokes bd update with the right metadata + claim flags', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    // Record bd invocations to a temp file via shim
    const log = join(dir, 'bd-invocations.log')
    const shim = join(dir, 'fake-bd.sh')
    writeFileSync(shim, `#!/usr/bin/env bash
echo "bd version 1.0.4" # for probe
if [ "$1" = "update" ]; then echo "$@" >> "${log}"; fi
`, { mode: 0o755 })
    const ok = await beadsAdapter.claimWithEvent(dir, { id: 'bd-a1b2', eventId: 'evt-xyz' }, { bdBin: shim })
    expect(ok).toBe(true)
    const logged = readFileSync(log, 'utf-8')
    expect(logged).toMatch(/update bd-a1b2/)
    expect(logged).toMatch(/--set-metadata ledger_event_id=evt-xyz/)
    expect(logged).toMatch(/--claim/)
  })
```

Add `readFileSync` to the import:
```typescript
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
```

Run: `npm test -- src/observability/adapters/beads.test.ts`
Expected: FAIL — `claimWithEvent` is not defined.

- [ ] **Step 2: Implement the helper**

In `src/observability/adapters/beads.ts`, extend the adapter:

```typescript
export const beadsAdapter: BaseAdapter & {
  probe(cwd: string, opts?: BeadsAdapterOpts): Promise<AdapterStatus>
  listTasks(cwd: string, opts?: BeadsAdapterOpts): Promise<unknown[]>
  claimWithEvent(cwd: string, args: { id: string; eventId: string }, opts?: BeadsAdapterOpts): Promise<boolean>
} = {
  // ... existing probe and listTasks ...

  async claimWithEvent(
    cwd: string,
    args: { id: string; eventId: string },
    opts: BeadsAdapterOpts = {},
  ): Promise<boolean> {
    const probe = await beadsAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return false
    try {
      await execFile(
        opts.bdBin ?? 'bd',
        ['update', args.id, '--set-metadata', `ledger_event_id=${args.eventId}`, '--claim'],
        { cwd },
      )
      return true
    } catch {
      return false
    }
  },
}
```

Run: `npm test -- src/observability/adapters/beads.test.ts`
Expected: PASS.

- [ ] **Step 3: Validate and commit (helper only — wiring follows in 8.3)**

```bash
make check-all
git add src/observability/adapters/beads.ts src/observability/adapters/beads.test.ts
git commit -m "feat(observability/beads): claimWithEvent helper sets ledger_event_id metadata (F-4.2)"
```

### Task 8.3: Wire `claimWithEvent` into the CLI `task_claimed` emitter

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts` (add integration test)

- [ ] **Step 1: Locate the `task_claimed` emit point**

```bash
grep -n "task_claimed" src/cli/commands/observe.ts
```

Expected: a call to `writeEvent(…, { type: 'task_claimed', task_id, … })`.

- [ ] **Step 2: Capture the returned event and call `claimWithEvent`**

After the `writeEvent` call (now returning the event per Task 8.1), add:

```typescript
const written = await writeEvent(worktreeRoot, { type: 'task_claimed', task_id, branch, payload })

// Cross-link to Beads if available (fail-soft — no error if Beads isn't initialized)
await beadsAdapter.claimWithEvent(worktreeRoot, {
  id: task_id,
  eventId: written.event_id,
})
```

Import `beadsAdapter` at the top of the file:

```typescript
import { beadsAdapter } from '../../observability/adapters/beads.js'
```

- [ ] **Step 3: Add a CLI integration test**

In `src/cli/commands/observe.test.ts`, add a test that emits a `task_claimed` event in a tmpdir with `.beads/` + a fake bd shim, then asserts the shim was called with `--set-metadata ledger_event_id=<id> --claim`. Pattern:

```typescript
it('observe task-claimed cross-links to Beads when available', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'observe-cli-'))
  mkdirSync(join(dir, '.beads'), { recursive: true })
  const log = join(dir, 'bd-invocations.log')
  const shim = join(dir, 'fake-bd.sh')
  writeFileSync(shim, `#!/usr/bin/env bash
echo "bd version 1.0.4"
[ "$1" = "update" ] && echo "$@" >> "${log}"
`, { mode: 0o755 })

  // Drive the observe command (use whatever existing helper the tests use)
  await runObserveEvent({ cwd: dir, type: 'task_claimed', task_id: 'bd-aaaa', branch: 'main' }, { bdBin: shim })

  const logged = readFileSync(log, 'utf-8')
  expect(logged).toMatch(/update bd-aaaa/)
  expect(logged).toMatch(/--set-metadata ledger_event_id=[0-9A-Z]+/)  // ULID
  expect(logged).toMatch(/--claim/)
})
```

(Adapt `runObserveEvent` to whatever helper the existing `observe.test.ts` uses to drive a CLI command; if the test currently invokes the command via `commander`, mirror that pattern.)

- [ ] **Step 4: Validate and commit**

```bash
make check-all
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts
git commit -m "feat(observability): wire task_claimed events to bd claimWithEvent (F-4.2)"
```

> *MMR-corrected:* Codex F-007 (writeEvent returns void) drove the Task 8.1 refactor; Gemini F-009 (correct wiring target is `src/cli/commands/observe.ts`) drove Task 8.3.

### Task 8.4: Push and PR

- [ ] **Step 1:**

```bash
git push -u origin feat/observability-beads-crosslink
gh pr create --title "feat(observability): cross-link Beads issues with ledger event IDs" --body "$(cat <<'EOF'
## Summary

- `writeEvent` now returns the written event (including the generated `event_id`); preparatory refactor with no behavior change.
- New `beadsAdapter.claimWithEvent({ id, eventId })` helper runs `bd update <id> --set-metadata ledger_event_id=<eventId> --claim` in one call.
- `src/cli/commands/observe.ts` wires the two: when a `task_claimed` event is emitted, the corresponding Beads issue (if any) gets `ledger_event_id` metadata and is atomically claimed.

Source: audit F-4.2 (post-MMR-correction recommendation).

## Test plan
- [ ] `npm test -- src/observability/engine/` (existing tests still pass after writeEvent signature change)
- [ ] `npm test -- src/observability/adapters/beads.test.ts` (claimWithEvent test passes)
- [ ] `npm test -- src/cli/commands/observe.test.ts` (CLI integration test passes)
- [ ] `make check-all`
EOF
)"
scaffold run review-pr
```

---

## Phase 9 — P3 polish (single PR)

**Covers:** F-1.10 phase 1 (`bd create -t decision`), F-3.2 (`bd backup` callout), F-1.8 (MCP server callout), F-5.2 (install-script option), F-5.4 (`--reinit-local`/`--discard-remote` re-init guidance).

**Branch:** `docs/beads-polish`

### Task 9.1: Use `-t decision` in PRD/decision-logging flows

**Files:**
- Modify: `content/pipeline/build/new-enhancement.md`
- Modify: relevant decision-logging knowledge entries (search `git grep -l "decision" content/knowledge/`)

- [ ] **Step 1: Update `new-enhancement.md` to suggest `-t decision` for ADRs**

Where the prompt currently creates tasks generically, add a paragraph:

```markdown
For architectural decisions (ADRs), use `bd create -t decision`. This is a built-in type as of v0.62.0 and shows up distinctly in `bd list --type decision`.
```

- [ ] **Step 2: Mention `story` and `milestone` as opt-in custom types**

In `content/knowledge/core/task-tracking.md`, add (after the state-machine block):

```markdown
### Optional: enable custom types

`bd create -t` supports `bug`, `feature`, `task`, `epic`, `chore`, `decision` out of the box. To use `story`, `milestone`, or `spike`, enable them via project config:

```bash
bd config set types.custom '["story", "milestone", "spike"]'
```

After that, `bd create -t story "US-XXX: …"` works as expected.
```

### Task 9.2: Add three small callouts to task-tracking knowledge

**Files:**
- Modify: `content/knowledge/core/task-tracking.md`

- [ ] **Step 1: Add `bd backup` callout (F-3.2)**

After the state-machine block, add:

```markdown
### Production option: off-site backup

Beads can push a versioned mirror to filesystem, S3, GCS, Azure Blob, or DoltHub:

```bash
bd backup init s3://my-bucket/beads-backup/
bd backup sync     # push current DB
bd backup restore  # bring it back if needed
```

Worth setting up for any project where task state matters beyond the developer's laptop.
```

- [ ] **Step 2: Add MCP server callout (F-1.8)**

Add:

```markdown
### When to use the MCP server (rarely)

Beads ships a Python MCP server (`beads-mcp`) for clients that don't have shell access — e.g., Claude Desktop, some IDE plugins. Install:

```bash
uv tool install beads-mcp   # or: pip install beads-mcp
```

For Claude Code, Cursor, Windsurf, and any agent with shell access, **CLI + hooks is preferred** — it's ~1-2k tokens of context (via `bd prime`) vs 10-50k for the MCP tool schemas. Only reach for `beads-mcp` when shell access isn't available.
```

- [ ] **Step 3: Add re-init safety callout (F-5.4)**

Add:

```markdown
### Safe re-initialization

If you need to re-init a Beads database (e.g., migrating to a fresh prefix, recovering from corruption), use the explicit flags rather than `--force`:

- `bd init --reinit-local` — bypass the local-exists guard
- `bd init --discard-remote` — explicitly authorize discarding remote Dolt history
- `bd init --destroy-token DESTROY-<prefix>` — required in non-interactive mode for destructive re-init

Stable exit codes: `10` (remote divergence), `11` (local exists), `12` (destroy-token missing). The legacy `--force` flag still works but is deprecated.
```

### Task 9.3: Update install instructions (F-5.2)

**Files:**
- Modify: `content/tools/prompt-pipeline.md:30`

- [ ] **Step 1: Add the install-script option**

Old:
```
| Install Beads | `npm install -g @beads/bd` or `brew install beads` **(optional)** |
```

New:
```
| Install Beads | `curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh \| bash` (recommended) or `brew install beads` or `npm install -g @beads/bd` **(optional)** |
```

### Task 9.4: Validate, commit, push, PR

- [ ] **Step 1:**

```bash
make check-all
git add content/ docs/
git commit -m "docs(beads): P3 polish — built-in decision type, backup, MCP, re-init safety, install options (F-1.10/3.2/1.8/5.4/5.2)"
git push -u origin docs/beads-polish
gh pr create --title "docs(beads): P3 polish from audit" --body "$(cat <<'EOF'
## Summary

- `bd create -t decision` mentioned in new-enhancement (built-in type since v0.62.0).
- `task-tracking.md` gains opt-in `types.custom` paragraph for `story`/`milestone`/`spike`.
- `bd backup` callout added for production projects.
- `beads-mcp` callout added (with the explicit recommendation to prefer CLI + hooks when shell access exists).
- Safe re-init guidance documents `--reinit-local`, `--discard-remote`, `--destroy-token`, and exit codes 10/11/12.
- Install instructions add the upstream install-script as the primary option.

Source: audit F-1.10, F-3.2, F-1.8, F-5.4, F-5.2.

## Test plan
- [ ] `make check-all` passes
EOF
)"
scaffold run review-pr
```

---

## Phase 10 — `bd remember` spike (investigation, no PR by default)

**Covers:** F-1.3 (auto-memory ↔ `bd remember`). Downgraded P1→P2 post-MMR. This is a time-boxed investigation.

**No branch yet — produces a design doc.**

### Task 10.1: Time-box a 4-hour spike

- [ ] **Step 1: Pick a representative scaffold-generated project**

Use any existing scaffold-generated project (or generate a fresh one with `scaffold new …`). Ensure `bd init` has been run.

- [ ] **Step 2: Inventory what the auto-memory system writes**

Read `~/.claude/projects/-Users-kenallred-Developer-<project>/memory/` (or the equivalent path). Capture every file and what kind of content each holds (user, feedback, project, reference per scaffold's CLAUDE.md auto-memory taxonomy).

- [ ] **Step 3: Prototype routing to `bd remember`**

Pick the simplest memory category (e.g., `feedback`). Write a script that takes the memory's `name`/`description`/body and emits:

```bash
bd remember "$(cat memory.md)" --key "feedback-$NAME"
```

Verify `bd recall feedback-$NAME` and `bd memories` show it. Verify `bd prime` includes it in output.

- [ ] **Step 4: Identify the architectural decision**

Three viable options to evaluate:
1. **Replace** — when `.beads/` exists, all memory writes go through `bd remember`; no filesystem `memory/` dir at all. Pro: single source of truth. Con: memory becomes per-project rather than per-user (each project's `.beads/` has its own memories).
2. **Mirror** — write to both; reads come from filesystem (cached) with `bd recall` as a fallback. Pro: per-user persistence survives. Con: dual-write complexity.
3. **Document and divide** — leave both systems running but document the split: filesystem memories are *user* memories (per-user, cross-project), `bd remember` is *project* memories (per-project, shared with team).

- [ ] **Step 5: Write the design doc**

Create `docs/superpowers/specs/2026-05-XX-beads-memory-integration-design.md` capturing the spike outputs, the three options, the recommended choice, and any open questions. Do not implement yet — bring the doc to the user for a go/no-go.

---

## Out-of-scope (deferred design discussions)

These items from the audit are *not* in this plan — they require alignment before any implementation:

| Audit ref | Topic | Reason deferred |
|---|---|---|
| F-1.7 | `bd worktree` integration | Architectural — affects how scaffold's worktree script and Beads cooperate. Needs design discussion. |
| F-3.1 | `bd gate`/`merge-slot`/`swarm`/`molecule` | Each is a substantial integration. Pick one to spike first. |
| F-1.10 phase 2 | `types.custom` default vs opt-in | Decide whether `/scaffold:beads` should opt in for the user or document as enhancement. |

---

## Self-review checklist (per writing-plans skill)

Run this before handing the plan to the executing agent.

**1. Spec coverage.** Cross-reference every finding in the audit against the phases above.

| Audit finding | Phase / Task |
|---|---|
| F-1.1 (`bd prime`) | Phase 4, Task 4.2 |
| F-1.2 (`bd setup` recipe) | Phase 4, Task 4.1 |
| F-1.3 (memory spike) | Phase 10 |
| F-1.4 (`discovered-from`) | Phase 6, Task 6.1 |
| F-1.5 (`bd preflight`) | Phase 6, Task 6.2 |
| F-1.6 (doctor --fix) | Phase 2, Tasks 2.1–2.3 |
| F-1.7 (`bd worktree`) | Out-of-scope |
| F-1.8 (MCP callout) | Phase 9, Task 9.2 |
| F-1.9 (atomic --claim) | Phase 5, Task 5.1 |
| F-1.10 phase 1 (decision type) | Phase 9, Task 9.1 |
| F-1.10 phase 2 (types.custom) | Out-of-scope |
| F-2.1 (`bd sync`) | Phase 1, Task 1.1 |
| F-2.2 (`bd start`/`claim`) | Phase 1, Task 1.2 |
| F-2.3 (`bd status BD-xxx`) | Phase 1, Task 1.2 |
| F-2.4 (status vocab) | Phase 1, Task 1.3 |
| F-2.5 (`BD_ACTOR`) | Phase 1, Task 1.4 |
| F-2.6 (P0–P4) | Phase 1, Task 1.5 |
| F-2.7 (ID format) | Phase 1, Task 1.5 |
| F-2.8 (`--actor` vs `--assignee`) | Phase 1, Task 1.5 |
| F-3.1 (gate/merge-slot/swarm) | Out-of-scope |
| F-3.2 (`bd backup`) | Phase 9, Task 9.2 |
| F-4.1 (MMR→Beads bridge) | Phase 7 |
| F-4.2 (ledger crosslink) | Phase 8 |
| F-4.3 (merged into F-1.3) | Phase 10 |
| F-5.1 (min-version check) | Phase 3 |
| F-5.2 (install script) | Phase 9, Task 9.3 |
| F-5.3 (`export.auto`) | Phase 5, Task 5.2 |
| F-5.4 (re-init guidance) | Phase 9, Task 9.2 |
| F-5.5 (half-migrated hooks) | Phase 2 (evidence; same fix as F-1.6) |

Every audit finding is mapped.

**2. Placeholder scan.** Searched for "TBD", "TODO", "implement later", "Add appropriate error handling" — none in the plan body. (Phase 10 contains "do not implement yet — bring the doc to the user", which is the intended terminal state of an investigation phase, not a placeholder.)

**3. Type / name consistency.**
- `BEADS_ACTOR` used consistently (deprecated `BD_ACTOR` only appears in the migration note).
- `claimWithEvent` named the same in Phase 8 test (step 1) and implementation (step 2).
- `bd ready --claim --json` and `bd update <id> --claim` flag form consistent across phases.
- `ledger_event_id` metadata key spelled the same in Phase 8 test and audit recommendation.

---

**Plan complete and saved to** `docs/superpowers/plans/2026-05-24-beads-integration-fixes.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best for this plan because phases 1–9 are independent (different branches, different PRs) and easily parallelized.

2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints. Slower but keeps all decisions in one context.

Which approach?
