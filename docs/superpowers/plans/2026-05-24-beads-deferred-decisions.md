# Beads Deferred Decisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four deferred design decisions from the Beads integration audit (`docs/audits/beads-integration-audit-2026-05-24.md`) and the original implementation plan (`docs/superpowers/plans/2026-05-24-beads-integration-fixes.md` "Out-of-scope" section). Then ready the combined branch for PR + merge + release.

**Architecture:** Four small phases, each self-contained. Phase A is doc-only. Phase B is one bash-script tail. Phase C is one new knowledge entry + minor edits to two pipeline prompts. Phase D is one `/scaffold:beads` prompt edit + one Methodology Scaling addition. Phase E is the PR/release wrap-up handled by the user (or me with explicit approval).

**Tech Stack:** Markdown meta-prompts, bash, GNU Make. No TypeScript changes in this plan.

**Source decisions (from the user, 2026-05-24):**
- **D1 (F-1.3):** Option 3 — document and divide (filesystem auto-memory = user-level; `bd remember` = project-level).
- **D2 (F-1.7):** Call `bd worktree create` from `scripts/setup-agent-worktree.sh` when `.beads/` exists.
- **D3 (F-3.1):** Integrate BOTH `bd merge-slot` (serialized merge resolution) and `bd gate` (async coordination) into multi-agent flows.
- **D4 (F-1.10 phase 2):** Methodology-scaled `types.custom` — off in `mvp`, on in `deep`.

**Test gate per phase:** `make validate` for content phases; `bash -n scripts/setup-agent-worktree.sh` for the script phase. Skip `make check-all` — pre-existing TS errors in `packages/mmr` from the worktree base commit `db49a86` (in-flight MMR v3.28 T1-A work) are unrelated to this work.

**Worktree:** Continue on `beads-audit-workspace` at `/Users/kenallred/Developer/scaffold-beads-audit`. Branch already contains the 22-commit implementation from the prior plan; this plan appends to it. Pre-decision HEAD is `438422d`.

---

## Phase A — Document and divide (D1 / F-1.3)

**Covers:** Option 3 from `docs/superpowers/specs/2026-05-24-beads-memory-integration-design.md`.

**Why this is one task, not three:** All edits are scope-clarifying prose in the same two files. They land together so the cross-references stay consistent.

### Task A.1: Update `ai-memory-management.md` with the user-level vs project-level split

**Files:**
- Modify: `content/knowledge/core/ai-memory-management.md`

- [ ] **Step 1: Find the existing "Memory Hierarchy" table**

```bash
grep -n "## Summary\|### The Memory Hierarchy\|| **Context window**" content/knowledge/core/ai-memory-management.md
```

Expected: a heading at "### The Memory Hierarchy" near the top of the Summary section.

- [ ] **Step 2: After the existing hierarchy table, insert a new "When to use which" subsection**

Add (immediately after the existing memory-layer table, before the next `###`):

```markdown
### When to use which: user-level vs project-level memory

Two persistent memory mechanisms can coexist on one machine. They serve different scopes — pick the right one for each fact:

| Scope | Mechanism | Lives in | Survives across | Shared with team? |
|-------|-----------|----------|-----------------|-------------------|
| **User-level** (per-user, cross-project) | Filesystem auto-memory (Claude Code client) | `~/.claude/projects/<encoded-cwd>/memory/*.md` | Sessions, projects | No — local to your machine |
| **Project-level** (per-project, team-shareable) | `bd remember` (Beads) | `.beads/embeddeddolt/` | Sessions, repo clones | Yes — committed and synced via Dolt |

Rule of thumb:
- Facts about the **person** (role, expertise level, communication style, preferences) → filesystem auto-memory.
- Facts about the **project** (in-flight context, team conventions, project-specific blockers, decisions) → `bd remember`.

When `.beads/` exists in a project, prefer `bd remember` for project facts so teammates inherit the context. When working in a project without Beads, the filesystem layer is your only persistent memory.

> Upstream Beads's AGENTS.md says "do not create MEMORY.md files" — that prescription is about project memory specifically. Filesystem auto-memory continues to be the right layer for *user* memory (facts about you, not the project).
```

- [ ] **Step 3: Validate frontmatter still parses**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/core/ai-memory-management.md
git commit -m "docs(memory): document user-level vs project-level memory scope split (D1, F-1.3)"
```

### Task A.2: Add scope-pointer to `task-tracking.md`

**Files:**
- Modify: `content/knowledge/core/task-tracking.md`

- [ ] **Step 1: Locate the existing "Agent context: bd prime is the SSOT" section**

```bash
grep -n "Agent context: .bd prime. is the SSOT" content/knowledge/core/task-tracking.md
```

- [ ] **Step 2: Add a cross-reference paragraph at the end of that section**

Find the line right before the next `### ` heading after the "Agent context: bd prime is the SSOT" block, and add (preserving the blank line before `### Editor integration via bd setup recipes`):

```markdown
### Two memory scopes — when to use which

Scaffold-generated projects have two persistent memory layers when `.beads/` exists:

- **Filesystem auto-memory** (per-user, cross-project) — facts about you the developer. Stored under `~/.claude/projects/.../memory/` by the Claude Code client.
- **`bd remember`** (per-project, team-shareable) — facts about this project. Stored in `.beads/embeddeddolt/`, committed with the repo.

For project-level facts that should travel with the repo (in-flight context, team conventions, project-specific blockers, decisions), use `bd remember` instead of filesystem memory. See `content/knowledge/core/ai-memory-management.md` for the full scope split table.
```

- [ ] **Step 3: Validate**

```bash
make validate
```

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/core/task-tracking.md
git commit -m "docs(beads): cross-reference user-level vs project-level memory scopes (D1, F-1.3)"
```

---

## Phase B — `bd worktree create` integration (D2 / F-1.7)

**Files:**
- Modify: `scripts/setup-agent-worktree.sh`

> **⚠ Phase B as originally planned was SUPERSEDED post-implementation.** The
> snippets below are historical (what was attempted on first pass); the actual
> shipped change does NOT add `bd worktree create`. Reasoning: `bd worktree
> create <name>` is a CREATOR (makes a new git worktree at `./<name>` or the
> given path), not a registrar for an existing worktree. Upstream Beads v1.0.4
> documents that worktrees automatically share the parent's Beads DB via git
> common-directory discovery — there is nothing to register. The shipped
> script just runs `bd doctor --fix`; the embedded code below should not be
> copy-pasted.

### Task B.1: Add `bd worktree create` after the existing doctor block (HISTORICAL — superseded)

- [ ] **Step 1: Find the existing Beads remediation block**

```bash
grep -n "Beads remediation\|bd doctor --fix" scripts/setup-agent-worktree.sh
```

Expected: a block starting with `# ─── Beads remediation` near the end of the script (added in the previous plan's Phase 2).

- [ ] **Step 2: Edit the script to add a worktree-registration step**

Locate the existing block:

```bash
# ─── Beads remediation (if .beads/ exists) ──────────────────
# Run bd doctor --fix to re-sync git hooks and project config against the installed
# bd version. Idempotent and fail-soft so non-Beads users (or stale bd installs)
# don't block worktree setup.
if [ -d "$worktree_dir/.beads" ] && command -v bd >/dev/null 2>&1; then
    if ! (cd "$worktree_dir" && bd doctor --fix >/dev/null 2>&1); then
        echo "Note: 'bd doctor --fix' reported issues in $worktree_dir. Run it manually for details." >&2
    fi
fi
```

Replace it with:

```bash
# ─── Beads remediation (if .beads/ exists) ──────────────────
# Run bd doctor --fix to re-sync git hooks and project config against the installed
# bd version. Idempotent and fail-soft so non-Beads users (or stale bd installs)
# don't block worktree setup. Also register the worktree with Beads so hook/DB
# resolution stays correct across linked worktrees.
if [ -d "$worktree_dir/.beads" ] && command -v bd >/dev/null 2>&1; then
    if ! (cd "$worktree_dir" && bd doctor --fix >/dev/null 2>&1); then
        echo "Note: 'bd doctor --fix' reported issues in $worktree_dir. Run it manually for details." >&2
    fi
    # Register this worktree with Beads. Idempotent — bd worktree create is a no-op
    # if the worktree is already registered. Fail-soft for older bd versions that
    # don't have the `worktree` subcommand.
    if ! (cd "$worktree_dir" && bd worktree create >/dev/null 2>&1); then
        echo "Note: 'bd worktree create' was not run (older bd?). Multi-worktree DB resolution may be suboptimal." >&2
    fi
fi
```

- [ ] **Step 3: Verify script syntax**

```bash
bash -n scripts/setup-agent-worktree.sh
```

Expected: no output (clean parse).

- [ ] **Step 4: Smoke-test the no-Beads path**

```bash
( cd /tmp && rm -rf .scaffold-bd-worktree-test && git init .scaffold-bd-worktree-test >/dev/null && cd /Users/kenallred/Developer/scaffold-beads-audit && scripts/setup-agent-worktree.sh worktree-smoke-test ) 2>&1 | tail
```

Expected: the worktree-setup completes; no "bd worktree create" / "bd doctor" notes are printed (because the new worktree has no `.beads/`).

Cleanup:
```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && git worktree remove ../scaffold-beads-audit-worktree-smoke-test --force 2>/dev/null; git branch -D worktree-smoke-test-workspace 2>/dev/null; true
```

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-agent-worktree.sh
git commit -m "feat(beads): register worktree with bd worktree create on setup (D2, F-1.7)"
```

---

## Phase C — `bd merge-slot` + `bd gate` in multi-agent flows (D3 / F-3.1)

**Covers:** integrating two upstream multi-agent coordination primitives into scaffold's multi-agent prompts.

**File structure:**
- Create: `content/knowledge/execution/multi-agent-coordination.md` — new knowledge entry covering both primitives, referenced from the multi-agent pipeline prompts.
- Modify: `content/pipeline/build/multi-agent-start.md` — reference merge-slot in the PR section; reference gate in the blocked-task recovery procedure.
- Modify: `content/pipeline/build/multi-agent-resume.md` — same references (lighter-weight; just link to the new knowledge entry).

> **⚠ Embedded snippets in this Phase C are HISTORICAL** and contain commands that don't match the actual `bd v1.0.4` CLI surface — specifically `SLOT=$(bd merge-slot acquire --json | jq .slot_id)`, `bd merge-slot release "$SLOT"`, `bd gate create "<name>" --description`, and `bd gate add-waiter "<name>" --task` are all WRONG. They reflect my mistaken model when this plan was drafted; the real upstream commands were verified live before the actual code shipped and look quite different. **For the canonical command shapes, see `content/knowledge/execution/multi-agent-coordination.md`** (the file this phase produced), which uses `bd merge-slot acquire --wait` / `bd merge-slot release` (one slot per project, no ID), and `bd gate create --blocks <issue-id> --reason "..." --type <human|timer|gh:run|gh:pr>` (gates are issues, not named entities). The embedded snippets below are kept as record of the planning process; they should not be copy-pasted.

### Task C.1: Create the multi-agent-coordination knowledge entry

**Files:**
- Create: `content/knowledge/execution/multi-agent-coordination.md`

- [ ] **Step 1: Find an existing knowledge entry's frontmatter to mirror its shape**

```bash
head -8 content/knowledge/execution/worktree-management.md
```

Expected: a 5-7 line YAML frontmatter block with `name`, `description`, `topics`, etc.

- [ ] **Step 2: Write the new file**

Create `content/knowledge/execution/multi-agent-coordination.md` with this content (the body is what matters; mirror neighbor files' frontmatter shape exactly — `name`, `description`, plus whatever fields neighbors use):

```markdown
---
name: multi-agent-coordination
description: Upstream Beads primitives for coordinating parallel agents — bd merge-slot for serialized merge resolution and bd gate for async coordination
topics: [beads, multi-agent, worktrees, merge-conflicts, coordination, parallel-execution]
---

# Multi-Agent Coordination (Beads Primitives)

When multiple agents work in parallel worktrees and converge on `main`, two upstream Beads primitives prevent the most common coordination failures. Both are optional — scaffold's multi-agent flows work without them — but they meaningfully reduce coordination cost in active parallel workloads.

## `bd merge-slot` — serialized merge resolution

**Problem:** Two agents finish in-flight tasks at roughly the same time. Both rebase on `origin/main` and push. The second agent's push races with the first agent's merge — either gets `non-fast-forward` (retry) or merges a stale base (silent conflict).

**Solution:** Acquire an exclusive merge slot before rebasing/pushing. Release it after the PR merges or after a timeout.

### Commands

```bash
# Before rebasing your feature branch on main:
SLOT=$(bd merge-slot acquire --json | jq -r '.slot_id')
# If the call blocks (another agent holds the slot), wait — your acquire returns
# as soon as the slot frees.

# Now safe to rebase and push:
git fetch origin && git rebase origin/main
git push -u origin HEAD

# After your PR merges (or if you abandon the work):
bd merge-slot release "$SLOT"

# To inspect current holder:
bd merge-slot check
```

### When to use

Use `bd merge-slot` in multi-agent flows (3+ agents, OR projects where a merge conflict requires careful manual resolution). Skip it for single-agent or two-agent workflows where collisions are rare and `git push` retries are acceptable.

### Failure modes

- **Stale slot** (agent crashes between acquire and release): `bd merge-slot check` reports the holder + age; `bd merge-slot release --force <slot-id>` clears it. The slot has a built-in TTL (default 30 minutes) for safety.
- **Slot held by yourself in a different worktree**: not a deadlock — `acquire` is per-actor. If `$BEADS_ACTOR` differs, you'll queue behind your other worktree.

## `bd gate` — async coordination gates

**Problem:** Agent A's task can't start until Agent B's task lands. Without a gate, Agent A either polls (wasteful) or proceeds anyway and discovers the missing dependency the hard way.

**Solution:** Create a named gate. Dependent tasks declare they're waiting for it. When the underlying condition resolves, anyone can resolve the gate, unblocking all waiters at once.

### Commands

```bash
# When you discover a blocking dependency, create a gate for it:
bd gate create "auth-middleware-v2" \
  --description "Blocks downstream tasks until the new auth middleware lands and is verified"

# A downstream task adds itself as a waiter:
bd gate add-waiter "auth-middleware-v2" --task "$DOWNSTREAM_TASK_ID"

# When the gate's underlying condition is met (e.g., the blocking PR merges):
bd gate resolve "auth-middleware-v2" --reason "PR #123 merged, middleware live"

# Check what's gated:
bd gate list
bd gate show "auth-middleware-v2"
```

### When to use

Use gates when a *category* of work is blocked on a known thing landing, especially when multiple downstream tasks share the same dependency. Skip them for one-off "this task blocks that task" cases — `bd dep add --blocks` already covers those.

### Pattern: discovery → gate

If you're implementing a task and discover that downstream work depends on something not yet done, file the dependency as a gate (not just a discovered-from task):

```bash
bd gate create "user-model-finalization" \
  --description "Discovered during $CURRENT_TASK — downstream registration/login tasks depend on the user model shape."
```

Then `bd gate add-waiter` from each affected downstream issue. This communicates the blocker to all waiters atomically.

## Composition

Both primitives compose with the rest of the multi-agent flow:

- `bd ready --claim` picks a non-gated, non-blocked task.
- `bd preflight` validates task readiness before PR (already in scaffold's start prompts).
- `bd merge-slot acquire` serializes the merge.
- `bd gate resolve` unblocks downstream waiters when your work lands.

For the canonical sequence in scaffold's multi-agent prompts, see `content/pipeline/build/multi-agent-start.md`.
```

- [ ] **Step 3: Validate frontmatter and assembly**

```bash
make validate
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/execution/multi-agent-coordination.md
git commit -m "docs(beads): add multi-agent-coordination knowledge entry for bd merge-slot + bd gate (D3, F-3.1)"
```

### Task C.2: Reference merge-slot in `multi-agent-start.md` PR step

**Files:**
- Modify: `content/pipeline/build/multi-agent-start.md`

- [ ] **Step 1: Locate the PR-create step that was edited in Phase 6 (preflight)**

```bash
grep -n "bd preflight\|Push the branch" content/pipeline/build/multi-agent-start.md | head
```

Expected: a block starting around line 178 with `7. **Create PR**`, containing the `bd preflight` block from Phase 6.

- [ ] **Step 2: Insert a merge-slot acquire step BEFORE `git push`**

Find this existing block (added in the previous plan's Phase 6 — exact whitespace per the file):

```markdown
7. **Create PR**
   - If Beads is configured, run the PR-readiness checklist first:
     ```bash
     if [ -d .beads ]; then
       bd preflight
     fi
     ```
     Fix any issues `bd preflight` flags before proceeding.
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Include in the PR description: what was implemented, key decisions, files changed, agent name
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md
```

Replace with:

```markdown
7. **Create PR**
   - If Beads is configured, run the PR-readiness checklist first:
     ```bash
     if [ -d .beads ]; then
       bd preflight
     fi
     ```
     Fix any issues `bd preflight` flags before proceeding.
   - **For 3+ parallel agents**, acquire a merge slot to serialize merge-time conflicts:
     ```bash
     if [ -d .beads ]; then
       SLOT=$(bd merge-slot acquire --json | jq -r '.slot_id')
     fi
     ```
     Skip for single-agent or two-agent runs. See `content/knowledge/execution/multi-agent-coordination.md`.
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - After the PR merges (or if you abandon the work), release the slot:
     ```bash
     if [ -d .beads ] && [ -n "${SLOT:-}" ]; then
       bd merge-slot release "$SLOT"
     fi
     ```
   - Include in the PR description: what was implemented, key decisions, files changed, agent name
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md
```

- [ ] **Step 3: Add gate reference in the Recovery Procedures section**

Find this block (around line 222, "Another agent claimed the same task"):

```markdown
**Another agent claimed the same task:**
- If Beads: A `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
- Without Beads: check open PRs (`gh pr list`) for overlapping work
- Move to the next available unblocked task
```

Replace with:

```markdown
**Another agent claimed the same task:**
- If Beads: A `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
- Without Beads: check open PRs (`gh pr list`) for overlapping work
- Move to the next available unblocked task

**Discovered a category of work blocked by something not yet done:**
- If Beads: file the blocker as a gate (`bd gate create "<gate-name>"`), then add each affected downstream task as a waiter (`bd gate add-waiter "<gate-name>" --task <id>`). Resolve the gate when the underlying condition is met (`bd gate resolve "<gate-name>"`).
- Use this pattern when multiple downstream tasks share the same blocker. For one-off "this task blocks that task" cases, `bd dep add --blocks` is enough.
- See `content/knowledge/execution/multi-agent-coordination.md` for the full pattern.
```

- [ ] **Step 4: Validate**

```bash
make validate
```

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/build/multi-agent-start.md
git commit -m "feat(beads): integrate bd merge-slot and bd gate into multi-agent-start (D3, F-3.1)"
```

### Task C.3: Lighter-weight references in `multi-agent-resume.md`

**Files:**
- Modify: `content/pipeline/build/multi-agent-resume.md`

- [ ] **Step 1: Find the existing preflight block (also from Phase 6)**

```bash
grep -n "bd preflight" content/pipeline/build/multi-agent-resume.md
```

Expected: a single match in the Create-PR section.

- [ ] **Step 2: Mirror the merge-slot acquire/release pattern**

Apply the same edit as Task C.2 Step 2 — find:

```markdown
3. **Create PR** (if not already created for in-progress work)
   - If Beads is configured, run the PR-readiness checklist first:
     ```bash
     if [ -d .beads ]; then
       bd preflight
     fi
     ```
     Fix any issues `bd preflight` flags before proceeding.
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Include agent name in PR description for traceability
```

Replace with:

```markdown
3. **Create PR** (if not already created for in-progress work)
   - If Beads is configured, run the PR-readiness checklist first:
     ```bash
     if [ -d .beads ]; then
       bd preflight
     fi
     ```
     Fix any issues `bd preflight` flags before proceeding.
   - **For 3+ parallel agents**, acquire a merge slot to serialize merge-time conflicts:
     ```bash
     if [ -d .beads ]; then
       SLOT=$(bd merge-slot acquire --json | jq -r '.slot_id')
     fi
     ```
     Skip for single-agent or two-agent runs. See `content/knowledge/execution/multi-agent-coordination.md`.
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - After the PR merges (or if you abandon the work), release the slot:
     ```bash
     if [ -d .beads ] && [ -n "${SLOT:-}" ]; then
       bd merge-slot release "$SLOT"
     fi
     ```
   - Include agent name in PR description for traceability
```

- [ ] **Step 3: Validate and commit**

```bash
make validate
git add content/pipeline/build/multi-agent-resume.md
git commit -m "feat(beads): integrate bd merge-slot into multi-agent-resume PR step (D3, F-3.1)"
```

---

## Phase D — Methodology-scaled `types.custom` (D4 / F-1.10 phase 2)

**Files:**
- Modify: `content/pipeline/foundation/beads.md`

### Task D.1: Add types.custom to the deep methodology and Quality Criteria

- [ ] **Step 1: Find the existing Methodology Scaling section in beads.md**

```bash
grep -n "## Methodology Scaling\|^- \*\*deep\|^- \*\*mvp" content/pipeline/foundation/beads.md
```

Expected: a `## Methodology Scaling` heading followed by `- **deep**:` and `- **mvp**:` items.

- [ ] **Step 2: Update Methodology Scaling**

Find the existing block (added during the prior plan's Phase 4, present at lines ~47-54):

```markdown
## Methodology Scaling
- **deep**: Full Beads setup — `bd init`, then `bd doctor --fix`, then `bd setup
  claude` (and/or `bd setup codex`, `bd setup gemini` for multi-platform projects).
  Scaffold-owned CLAUDE.md content (Core Principles + commit convention +
  upgrade-remediation callout) is composed ADJACENT to the recipe-managed integration
  block. Detailed priority level documentation. Cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: `bd init`, `bd doctor --fix`, `bd setup claude`, create tasks/lessons.md,
  add minimal scaffold-owned CLAUDE.md sections (Core Principles + commit convention +
  upgrade-remediation callout). Skip cross-doc checks.
```

Replace with:

```markdown
## Methodology Scaling
- **deep**: Full Beads setup — `bd init`, then `bd doctor --fix`, then `bd setup
  claude` (and/or `bd setup codex`, `bd setup gemini` for multi-platform projects).
  Enable custom issue types via `bd config set types.custom '["story","milestone","spike"]'`
  so downstream prompts can use `-t story` for user stories and `-t milestone` for
  releases. Scaffold-owned CLAUDE.md content (Core Principles + commit convention +
  upgrade-remediation callout) is composed ADJACENT to the recipe-managed integration
  block. Detailed priority level documentation. Cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: `bd init`, `bd doctor --fix`, `bd setup claude`, create tasks/lessons.md,
  add minimal scaffold-owned CLAUDE.md sections (Core Principles + commit convention +
  upgrade-remediation callout). Skip cross-doc checks. Custom types stay off — only
  built-in `bug|feature|task|epic|chore|decision` available.
```

- [ ] **Step 3: Update Quality Criteria to surface the deep-only check**

Find the existing "Quality Criteria" section. After the last `(mvp)` line and before the `(deep)` cross-doc-consistency line (around line 45), add a new criterion:

Find:

```markdown
- (mvp) Agents pick up Beads workflow context via `bd prime` (loaded automatically by
  the hooks `bd setup claude` installs). Scaffold does NOT hand-roll a Beads command
  reference table — that lives upstream in `bd prime` output. If a project wants
  custom prime content, write `.beads/PRIME.md`.
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md
```

Replace with:

```markdown
- (mvp) Agents pick up Beads workflow context via `bd prime` (loaded automatically by
  the hooks `bd setup claude` installs). Scaffold does NOT hand-roll a Beads command
  reference table — that lives upstream in `bd prime` output. If a project wants
  custom prime content, write `.beads/PRIME.md`.
- (deep) `bd config set types.custom '["story","milestone","spike"]'` was run so
  downstream prompts can use `-t story` and `-t milestone`. Verify with `bd config get types.custom`.
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md
```

- [ ] **Step 4: Update the custom-depth(1-5) scaling to note when types.custom kicks in**

Find (in the same Methodology Scaling section):

```markdown
- **custom:depth(1-5)**:
  - Depth 1: `bd init` + `bd doctor --fix` + `bd setup claude` + create tasks/lessons.md. Minimal scaffold CLAUDE.md content (Core Principles only).
  - Depth 2: Depth 1 + add commit convention + upgrade-remediation callout.
  - Depth 3: Add priority level documentation and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks against git-workflow.md and coding-standards.md.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement. Run `bd setup codex` and `bd setup gemini` if the project targets those CLIs.
```

Replace with:

```markdown
- **custom:depth(1-5)**:
  - Depth 1: `bd init` + `bd doctor --fix` + `bd setup claude` + create tasks/lessons.md. Minimal scaffold CLAUDE.md content (Core Principles only).
  - Depth 2: Depth 1 + add commit convention + upgrade-remediation callout.
  - Depth 3: Add priority level documentation and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks against git-workflow.md and coding-standards.md. Enable `bd config set types.custom '["story","milestone","spike"]'`.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement. Run `bd setup codex` and `bd setup gemini` if the project targets those CLIs.
```

- [ ] **Step 5: Validate and commit**

```bash
make validate
git add content/pipeline/foundation/beads.md
git commit -m "feat(beads): methodology-scaled types.custom — off in mvp, on in deep (D4, F-1.10 phase 2)"
```

---

## Phase E — Verification, PR, and release

This phase is performed jointly with the user (or by the user). Each step needs confirmation before execution because of the merge/release blast radius.

### Task E.1: Full-branch verification

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && npm test 2>&1 | tail -10
```

Expected: 2,808 tests pass + 1 skip (matching the prior-plan baseline). Any new failures must be investigated before proceeding.

- [ ] **Step 2: Run frontmatter validation across all touched content**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && make validate 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 3: Confirm the full commit range looks right**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && git log --oneline 0dd58dd..HEAD
```

Expected: 22 commits from the prior plan + ~7 from this plan = ~29 commits.

### Task E.2: Push and open the PR

**Ask the user to confirm before pushing** — this is the first external-visibility action.

- [ ] **Step 1: Push the branch**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && git push -u origin beads-audit-workspace
```

- [ ] **Step 2: Create the PR**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && gh pr create \
  --base main \
  --head beads-audit-workspace \
  --title "Beads integration overhaul — align with upstream v1.0.4" \
  --body "$(cat <<'EOF'
## Summary

Comprehensive update to scaffold's Beads task-tracking integration to align with upstream Beads v1.0.4. Implements ~28 audit findings across 11 phases.

Source documents (in this branch):
- `docs/audits/beads-integration-audit-2026-05-24.md` — full audit (MMR-reviewed)
- `docs/superpowers/plans/2026-05-24-beads-integration-fixes.md` — implementation plan, phases 1-10 (MMR-reviewed twice)
- `docs/superpowers/plans/2026-05-24-beads-deferred-decisions.md` — follow-up plan for the four deferred decisions (this PR's tail)
- `docs/superpowers/specs/2026-05-24-beads-memory-integration-design.md` — Phase 10 spike, design decision behind D1

## What changed

### Stale-command sweep
- `bd sync` (non-existent in v1.0.4) removed across pipeline + v2 docs.
- `bd start` / `bd claim` / `bd status BD-xxx` replaced with `bd update <id> --claim`, `bd ready --claim --json`, `bd show <id>`.
- Task-status vocabulary aligned with upstream enum (`open, in_progress, blocked, deferred, closed` + status categories).
- `BD_ACTOR` → `BEADS_ACTOR` across active surfaces; historical surfaces annotated.
- Priority scale updated (P0–P4), ID format examples lowercased (`bd-a3f8`), `bd list --actor` → `--assignee`.

### New scaffold prescriptions
- `bd doctor --fix` runs after `bd init` and on every worktree setup.
- `bd ready --claim --json` is the canonical atomic claim (eliminates race windows).
- `bd preflight` runs before `gh pr create`.
- `--deps discovered-from:<id>` is the documented pattern for incidental work.

### Upstream-recipe adoption
- `/scaffold:beads` now delegates CLAUDE.md / AGENTS.md / GEMINI.md integration to `bd setup <recipe>` instead of hand-rolling content.
- `bd prime` is the single source of truth for agent workflow context.
- `bd remember` documented as the project-level memory layer (vs filesystem auto-memory as the user-level layer).

### Observability cross-link
- The Beads adapter (`src/observability/adapters/beads.ts`) now degrades when bd < 1.0.0.
- `writeEvent` returns the written event (signature change is backward-compatible — all existing callers discard the return value).
- New `claimWithEvent` adapter helper runs `bd update <id> --set-metadata ledger_event_id=… --claim` in one call.
- `src/cli/commands/observe.ts` wires the two: every `task_claimed` ledger event also cross-links to the corresponding Beads issue when `.beads/` exists.

### MMR → Beads bridge (opt-in)
- `.mmr.yaml` gains a commented-out `beads.*` config template.
- `content/tools/review-pr.md` and `review-code.md` each gain Step 7b: when enabled and `.beads/` exists, blocking findings (≥ `fix_threshold`) are filed as `bd` bugs with `--external-ref "mmr-<job-id>"`.

### Multi-agent coordination
- New `content/knowledge/execution/multi-agent-coordination.md` documents `bd merge-slot` (serialized merge resolution) and `bd gate` (async coordination).
- Multi-agent pipeline prompts (`multi-agent-start.md`, `multi-agent-resume.md`) reference merge-slot before `git push` and gates in the Recovery Procedures section.

### Worktree integration
- `scripts/setup-agent-worktree.sh` calls `bd doctor --fix` when `.beads/` exists. **The original plan included `bd worktree create` but that was removed** after verifying the upstream CLI — `bd worktree create` is a CREATOR (it makes a new git worktree from `<name>`), not a registrar for existing ones. Upstream Beads docs explicitly say worktree DB resolution is automatic via git common-directory discovery, so there's nothing to register from the worktree side.

### Methodology-scaled custom types
- `bd config set types.custom '["story","milestone","spike"]'` runs in `deep` methodology; stays off in `mvp`.

### P3 polish
- Documented `bd backup`, `beads-mcp` (with rare-use recommendation), safe re-init (`--reinit-local` / `--discard-remote` / `--destroy-token`), the `decision` built-in type, and the upstream install-script as the preferred install method.

## Test plan
- [ ] `npm test` — full suite passes (baseline: 2,808 tests passing)
- [ ] `make validate` — frontmatter passes
- [ ] `make lint` — shell + bats clean (existing style warnings unchanged)
- [ ] `bash -n scripts/setup-agent-worktree.sh` — clean parse
- [ ] Manual: in a scratch project, `bd init && bd doctor --fix && bd setup claude` produces a working CLAUDE.md with marker-managed Beads block
- [ ] Manual: `scripts/setup-agent-worktree.sh test-name` in a Beads-enabled project shows no `bd hook` errors

## Out-of-scope (deferred)

None — all four originally-deferred design discussions are implemented in this PR:
- D1 / F-1.3 — auto-memory ↔ bd remember = Option 3 (document and divide)
- D2 / F-1.7 — bd doctor --fix on worktree setup (bd worktree create premise corrected post-verification)
- D3 / F-3.1 — bd merge-slot + bd gate documented + wired into multi-agent flows
- D4 / F-1.10 phase 2 — methodology-scaled types.custom

## Known limitations

- The base commit (`db49a86`, in-flight MMR v3.28-T1-A) has pre-existing TS errors in `packages/mmr` unrelated to this work. `make check-all` will fail until MMR T1-B/T1-C land. `npm test` (which is what this PR's verification ran) is unaffected.
- The Claude channel of the MMR review failed auth on both rounds — coverage was Codex + Gemini = degraded-pass. Re-running with `claude` re-authenticated would close that gap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Run the mandatory post-PR review (per CLAUDE.md)**

```bash
cd /Users/kenallred/Developer/scaffold-beads-audit && scaffold run review-pr
```

Expected: verdict `pass` or `degraded-pass`. Address any blocking findings before proceeding.

If Claude channel still fails auth, the user runs `! claude` to re-auth, then re-runs `scaffold run review-pr`. If after re-auth the review surfaces real findings, fix-loop per Step 7 of `review-pr.md`.

### Task E.3: Merge and release

**Ask the user to confirm before merging and releasing** — both are external-visibility actions.

- [ ] **Step 1: Merge the PR**

After review passes:

```bash
gh pr merge --squash --delete-branch
```

The squash commit will roll up the ~29 commits into one for `main` history. Use the PR title + body as the squash message.

- [ ] **Step 2: Pull main and verify**

```bash
git checkout main && git pull origin main && git log --oneline -5
```

Expected: the squash commit at HEAD, with the new Beads work behind it.

- [ ] **Step 3: Run the scaffold release workflow**

Per `CLAUDE.md` and `docs/architecture/operations-runbook.md`, the maintainer release flow is:

```bash
# In the scaffold repo (not a worktree):
# 1. Update CHANGELOG.md and README.md with the user-facing changes from this PR
# 2. Commit the changelog/readme update
# 3. Tag main with vX.Y.Z (semver bump — this is a significant integration change, lean minor: e.g., 3.27.0 → 3.28.0)
# 4. git push --tags
# 5. Create the GitHub release: gh release create vX.Y.Z --notes-from-tag

git tag vX.Y.Z
git push --tags
gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
```

Then verify the publish.yml + Homebrew update workflows succeed in GitHub Actions.

- [ ] **Step 4: Cleanup worktree**

```bash
scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-beads-audit
```

Expected: worktree removed, branch deleted, ledger harvested.

---

## Self-review checklist

Run before handing the plan to an executing agent.

**1. Spec coverage.** Each of the four user-confirmed decisions maps to a phase:

| Decision | Phase | Task |
|---|---|---|
| D1 (F-1.3 Option 3) | A | A.1, A.2 |
| D2 (F-1.7) | B | B.1 |
| D3 (F-3.1 merge-slot + gate) | C | C.1, C.2, C.3 |
| D4 (F-1.10 phase 2 methodology-scaled) | D | D.1 |
| PR + release | E | E.1, E.2, E.3 |

**2. Placeholder scan.** No "TBD", "implement later", or "fill in" placeholders. Every step has the actual command or text content. The cross-reference at the end of `multi-agent-coordination.md` to `multi-agent-start.md`'s "canonical sequence" refers to a section that exists in that file post-Phase-C; verified.

**3. Type/name consistency.**
- `bd worktree create` used consistently (B.1; no other phase touches it).
- `bd merge-slot acquire` / `release` argument shapes consistent across C.1, C.2, C.3.
- `bd gate create` / `add-waiter` / `resolve` consistent across C.1 + C.2.
- `types.custom` config key spelled identically in D.1 and the existing audit/plan references.
- `BEADS_ACTOR` (not `BD_ACTOR`) used throughout — consistent with the prior plan's Phase 1.
- The `if [ -d .beads ]; then ... fi` guard used consistently (matches MMR-corrected pattern from prior plan F-005).

---

**Plan complete and saved to** `docs/superpowers/plans/2026-05-24-beads-deferred-decisions.md`.

Two execution options:

1. **Inline Execution (recommended for this plan)** — Phases A, B, C, D are all small content/script edits, ideal for inline execution with checkpoints. Faster than subagent dispatch given the small task sizes. Skip the two-stage review per task; do one combined review after Phase D.

2. **Subagent-Driven** — Fresh subagent per task with spec + code-quality review. Higher overhead given the tiny tasks here (~5-10 commits total).

Which approach?
