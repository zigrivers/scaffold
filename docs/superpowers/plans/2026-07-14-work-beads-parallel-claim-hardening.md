# Work-Beads Parallel-Claim Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/work-beads N` safe for a 12-agent fleet: just-in-time single-bead selection, atomic claims everywhere, per-agent claim identity, and defined claim-loss/stale-claim/queue-drained semantics.

**Architecture:** Content-only change. The canonical skill source `content/agent-skills/work-beads/SKILL.md` is rewritten; `node scripts/generate-agent-skills.mjs` fans it out to `content/skills/work-beads/{SKILL.md, agents-block.md, cursor.mdc}`; five coupled surfaces that teach the retired non-atomic claim are corrected. TDD via bats evals that read the generated skill and grep the living content tree.

**Tech Stack:** Markdown content, bats-core evals, Node generator script, GNU Make gates.

**Spec:** `docs/superpowers/specs/2026-07-14-work-beads-parallel-claim-hardening-design.md`

## Global Constraints

- Edit ONLY `content/agent-skills/work-beads/SKILL.md` for skill content; `content/skills/work-beads/*` are GENERATED (`node scripts/generate-agent-skills.mjs`); `make check-all` runs the `agent-skills-check` drift gate.
- The skill description's trigger phrases `/work-beads`, `work the next`, `pick up some open tasks` must survive (Eval 7 asserts them) — the description line is NOT edited.
- Step numbering is pinned by external references: Step 2.1 = claim, Step 2.2 = worktree (four build prompts reference them).
- The lean region (`<!-- lean:start -->` … `<!-- lean:end -->`) must stay balanced; codegen throws otherwise.
- The banned pattern in living content is `bd update … --status in_progress` (a claim); `bd list --status in_progress` (a filter) stays legitimate.
- Knowledge files edited must get `last-reviewed: 2026-07-14` (validate-knowledge gate checks freshness frontmatter).
- Branch: `feat/work-beads-parallel-claim-hardening` (already created, spec committed).

---

### Task 1: Failing evals for atomic-claim + JIT semantics

**Files:**
- Modify: `tests/evals/skill-triggers.bats` (append after the existing work-beads test, ~line 92)

**Interfaces:**
- Produces: two bats tests — `"work-beads skill teaches just-in-time atomic claiming"` and `"no living content surface teaches the non-atomic claim"` — that Tasks 2–3 make pass.

- [ ] **Step 1: Append the two failing tests**

```bash
@test "work-beads skill teaches just-in-time atomic claiming" {
  local skill_file="${SKILLS_DIR}/work-beads/SKILL.md"
  [[ -f "$skill_file" ]] || skip "work-beads not found"

  local failures=()
  grep -qF 'bd update <id> --claim' "$skill_file" \
    || failures+=("missing atomic claim form 'bd update <id> --claim'")
  grep -qF 'BEADS_ACTOR' "$skill_file" \
    || failures+=("missing per-agent identity guidance (BEADS_ACTOR)")
  grep -qF 'budget, not a reservation' "$skill_file" \
    || failures+=("missing JIT loop language 'budget, not a reservation'")
  grep -qF 'Stale claims:' "$skill_file" \
    || failures+=("missing 'Stale claims:' batch-report slot")
  grep -qF 'bd update <id> --status in_progress' "$skill_file" \
    && failures+=("still teaches the non-atomic claim 'bd update <id> --status in_progress'")

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "work-beads JIT/atomic-claim assertions failed:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "no living content surface teaches the non-atomic claim" {
  # 'bd update ... --status in_progress' is retired as a claim (not atomic).
  # 'bd list --status in_progress' (a filter) remains legitimate and does not match.
  local hits
  hits="$(grep -rnE 'bd update[^|]*--status in_progress' "${PROJECT_ROOT}/content" || true)"
  if [[ -n "$hits" ]]; then
    printf "non-atomic claim form found in living content:\n%s\n" "$hits"
    return 1
  fi
}
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx bats tests/evals/skill-triggers.bats`
Expected: the two new tests FAIL (skill lacks new language; five content surfaces still carry the banned form). Pre-existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/evals/skill-triggers.bats
git commit -m "test: failing evals for work-beads JIT atomic-claim semantics"
```

---

### Task 2: Rewrite the canonical skill

**Files:**
- Modify: `content/agent-skills/work-beads/SKILL.md` (sections listed below; frontmatter untouched)
- Regenerate: `content/skills/work-beads/{SKILL.md, agents-block.md, cursor.mdc}`

**Interfaces:**
- Produces: generated `content/skills/work-beads/SKILL.md` satisfying Task 1's first eval.

- [ ] **Step 1: Replace the lean-region loop contract + invocation lines** (keep the description, headline, intro paragraph, MERGED/CLOSED + standing-authorization paragraph as-is):

Loop contract block becomes:

```
set identity once, then repeat up to N times (one bead in flight per agent):
  refresh view -> select ONE bead -> claim atomically (lost the claim?
  take the next candidate) -> worktree -> build (draft PR on first push)
  -> verify (make check) -> review (mmr, 3-round cap) -> squash-merge
  -> sync + prune -> close bead
batch end (budget spent, queue drained, or P0/blocker): report in the slots
```

Invocation paragraph becomes:

```markdown
Invocation: `/work-beads` (1 bead) · `/work-beads N` (up to N beads, selected
**one at a time at claim time** — N is a budget, not a reservation; never
pre-pick a list) · `/work-beads N <label>` (same, scoped to a label) ·
`/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
```

- [ ] **Step 2: Extend Step 0** — retitle to `## Step 0 — Orient (once per batch, read-only, from the primary checkout)` and insert, after the orient command block and before the version gate:

```markdown
**Identity (required before any claim):** claims key on the Beads actor, and
same-actor claims are idempotent — two agents sharing the default identity
(`git user.name`) can both "successfully" claim the SAME bead, silently
losing mutual exclusion. If `BEADS_ACTOR` is not already set to a per-agent
value (the multi-agent bootstrap prompts set one), pick a distinctive agent
name now (e.g. `agent-cobalt-fox`) and use it on every `bd` write this
session — `export BEADS_ACTOR=<name>` in each shell, or `--actor <name>` per
command. Unique across concurrent agents = mutual exclusion; stable within
your session = your own resume path works. (Merge-slot commands are the one
exception — they need a per-process unique holder; see 2.7.)

**Stale-claim scan (surface, never steal):** a dead agent's bead stays
`in_progress` forever (bd has no claim lease/TTL yet). Cross-check
`bd list --status in_progress` against the open-PR list: in progress + no
open/draft PR + no recent activity = possibly stranded. Note it for the
batch report — do NOT reclaim it; releasing another agent's claim
(`bd update <id> --status open --assignee ""`) is an operator decision.
```

- [ ] **Step 3: Rewrite Step 1** — heading `## Step 1 — Select ONE bead (repeat before every claim)`; body:

````markdown
Selection happens per bead, at claim time — never pre-select a batch. The
queue moves while you work: at high parallelism (a 12-agent fleet is
normal), any bead you "reserved" in your head at batch start will be gone
by the time you reach it. Refresh the cheap view before each selection:

```bash
bd ready                        # the queue as of NOW
gh pr list --state open         # what others are building NOW
```

Ranking, strict order: (1) priority P0 > P1 > P2 > P3; (2) beads labeled with a
`critical_labels` entry from `.scaffold/agent-ops.yaml`, if any; (3) work that
unblocks other beads; (4) fit to your strengths.

Hard exclusions — never select:
- a bead already `in_progress` under another agent, or covered by ANY open/draft PR.
  (`bd ready` can still list open beads carrying another agent's assignee —
  those refuse your claim; that is Step 2.1's fallback, not an error.)
- a bead conflicting with an open PR's surface (same module, same migration
  sequence, same shared code — see docs/git-workflow.md conflict rules)

Mandatory duplicate-work scan for the top candidate:
`scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`

Queue drained (or no candidate survives the exclusions) before the budget is
spent? The batch ends early — go to Step 3 and report
`queue drained after <k> of N`.

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle. Claim each ID at its
turn (Step 2.1); an ID already claimed by another agent is skipped and
reported with its holder, not worked.
````

- [ ] **Step 4: Rewrite Step 2.1**:

```markdown
**2.1 Claim (atomic, from the primary checkout):** claim exactly the bead you
selected: `bd update <id> --claim` — sets assignee + `in_progress` in one
atomic round-trip and fails (exit 1, `already claimed by <actor>`) if anyone
else holds it. **A lost claim is normal traffic at high parallelism, not an
error: return to Step 1 and take the next candidate.** Never claim by
editing the status field — it does not detect a concurrent claimant. Fast
path: when a filter fully expresses your selection (a materialized plan via
`--has-metadata-key plan_task_id`, or a label scope), `bd ready --claim
[filters] --json` selects and claims in one call — then run Step 1's
duplicate-work preflight for the claimed bead before building; if it reveals
live duplicate work, release (`bd update <id> --status open --assignee ""`)
and reselect. If the project has build observability (a `.scaffold/`
directory and the `scaffold` CLI), also
`scaffold observe event claim --task <id>` — feature-detect and skip silently.
```

- [ ] **Step 5: Replace the 2.7 merge-slot bullet** ("3+ agents active? …") with:

```markdown
- If the project has a merge slot (`bd merge-slot check` reports one — plan
  materialization creates it), serialize EVERY merge: `bd merge-slot acquire
  --wait` → merge → `bd merge-slot release` — release even if the merge
  fails, or the slot stays held and blocks every other agent. The slot needs
  a **per-process unique** holder (e.g. `agent-$$` or a UUID) — scope any
  `BEADS_ACTOR` override to the slot commands and restore your stable claim
  actor before the next claim.
```

- [ ] **Step 6: Update the Step 3 report slots** — the slots block becomes:

```
Beads:              <id> -> PR #<n> -> merged | parked (why) | skipped (why: e.g. claim lost to <actor>) | not started (why: e.g. queue drained after <k> of N)
Docs updated in-PR: <paths - or "none needed: <why>">
Beads filed (open): <id - one-line title - or none>
Stale claims:       <id - assignee - last activity - or "none noticed">
```

- [ ] **Step 7: Append red-flag rows** (before the final bootstrap row):

```markdown
| Pick N beads at batch start and work the list | The queue moves under you — select ONE bead at claim time, every time |
| Claim by setting the status field | Not atomic — a concurrent claimant goes undetected; `bd update <id> --claim` is the claim |
| Claim without a per-agent `BEADS_ACTOR` | Same-actor claims are idempotent — two agents sharing the default identity both "own" the bead |
| Retry a lost claim | Normal traffic at high parallelism — take the next candidate |
| Reclaim another agent's stranded bead | Surface it in the report; releasing a claim is an operator decision |
```

- [ ] **Step 8: Regenerate + verify eval 1 passes**

Run: `node scripts/generate-agent-skills.mjs && npx bats tests/evals/skill-triggers.bats`
Expected: `"work-beads skill teaches just-in-time atomic claiming"` PASSES; the grep eval still FAILS (five surfaces remain).

- [ ] **Step 9: Commit**

```bash
git add content/agent-skills/work-beads/ content/skills/work-beads/
git commit -m "feat(work-beads): JIT single-bead selection with atomic claims and per-agent identity"
```

---

### Task 3: Fix the five coupled surfaces

**Files:**
- Modify: `content/pipeline/foundation/beads.md:74` and `:278`
- Modify: `content/pipeline/consolidation/claude-md-optimization.md:179-183`
- Modify: `content/assets/agent-ops/git/setup-agent-worktree.sh.tmpl:164`
- Modify: `content/knowledge/execution/multi-agent-coordination.md:131-133` (+ `last-reviewed`)
- Modify: `content/knowledge/execution/task-claiming-strategy.md:72-75,85` (+ `last-reviewed`)

**Interfaces:**
- Consumes: Task 1's grep eval as the done-signal.

- [ ] **Step 1: beads.md** — in the ~L74 command list replace `` `bd update --status in_progress` `` with `` `bd update <id> --claim` ``; in the ~L278 "Day-to-day commands" list replace `` `bd update <id> --status in_progress` `` with `` `bd update <id> --claim` (atomic — fails if another agent already holds it) ``.

- [ ] **Step 2: claude-md-optimization.md** — recipe items 2–3 become:

```markdown
   2. Select ONE bead at a time, at claim time (N is a budget, not a
      reservation): priority, then project-critical labels, then work
      that unblocks others; never a bead already in progress or covered
      by an open/draft PR.
   3. Claim atomically from the primary checkout: `bd update <id> --claim`
      (or `bd ready --claim` when a filter expresses the selection). Lost
      the claim to another agent? Take the next candidate — never claim by
      setting the status field.
```

- [ ] **Step 3: setup-agent-worktree.sh.tmpl** — the help line becomes:

```bash
    log "  bd update <id> --claim   # atomic claim; or: bd create \"$desc\" -t task -p 2"
```

- [ ] **Step 4: multi-agent-coordination.md** — the Visible-Claim opening becomes:

```markdown
`bd ready --claim` (or `bd update <id> --claim` for a specific bead) is the
authoritative, atomic claim — claiming by editing the status field is NOT
atomic and misses a concurrent claimant. Both atomic forms key on the Beads
actor, and same-actor claims are idempotent: every concurrent agent needs
its own stable `BEADS_ACTOR`, or agents sharing the default `git user.name`
identity can all "claim" the same bead successfully. The claim is only
visible to agents that query Beads.
```

(continue the existing paragraph from "`gh pr list --state open` is the *other* live registry…"), and set `last-reviewed: 2026-07-14`.

- [ ] **Step 5: task-claiming-strategy.md** — in "Claiming a task" append to the first bullet: `Claims key on the Beads actor and same-actor claims are idempotent — each concurrent agent needs its own stable BEADS_ACTOR. Select one task at a time, at claim time; a claim lost to another agent means take the next candidate.` In the abandoned-task bullet, append: `(release = bd update <id> --status open --assignee "" — clearing the assignee is what makes it claimable again)`. Set `last-reviewed: 2026-07-14`.

- [ ] **Step 6: Verify both evals pass**

Run: `npx bats tests/evals/skill-triggers.bats`
Expected: ALL tests PASS.

- [ ] **Step 7: Commit**

```bash
git add content/
git commit -m "fix(content): retire non-atomic bead claim everywhere; teach claim identity"
```

---

### Task 4: CHANGELOG + full gates

**Files:**
- Modify: `CHANGELOG.md` (prepend release section)

- [ ] **Step 1: Prepend CHANGELOG section** (format per existing entries):

```markdown
## [3.43.0] - 2026-07-14

### Changed

- **`/work-beads N` selects beads one at a time, at claim time** — N is now a
  budget, not an upfront reservation. At high parallelism (12-agent fleets)
  upfront-selected beads were routinely claimed by other agents before their
  turn. The skill now refreshes the queue view before every claim, claims
  atomically (`bd update <id> --claim` / `bd ready --claim`), and treats a
  lost claim as normal traffic (take the next candidate). **Behavior change**
  delivered to existing projects on next skill sync.
- **Per-agent claim identity required.** Same-actor claims are idempotent, so
  agents sharing the default `git user.name` identity could all "claim" the
  same bead. The skill now establishes a unique, session-stable `BEADS_ACTOR`
  before any claim.
- **Non-atomic claim form retired everywhere.** `bd update <id> --status
  in_progress` no longer appears as a claim in any content surface (skill,
  beads pipeline step, CLAUDE.md-optimization recipe, agent-ops preflight help,
  coordination/claiming knowledge); a bats eval enforces this.
- **Deterministic merge-slot trigger** — serialize every merge when the
  project has a merge slot, replacing the unknowable "3+ agents active?".
- **New semantics** — stale-claim surfacing (report, never auto-steal; release
  requires clearing the assignee), queue-drained early batch end, explicit-ID
  invocations skip-and-report beads claimed by other agents, and a new
  required `Stale claims:` batch-report slot.
```

- [ ] **Step 2: Run all gates**

Run: `make check-all`
Expected: all green (bash + TypeScript + knowledge frontmatter + agent-skills drift + guides).

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for work-beads parallel-claim hardening"
```

---

### Task 5: PR, mandatory MMR review, merge

- [ ] **Step 1:** `git push -u origin HEAD --no-verify` (check-all already green on this commit) and `gh pr create` (title `feat(work-beads): parallel-claim hardening — JIT selection, atomic claims, per-agent identity`; body summarizes the spec, `Closes` nothing).
- [ ] **Step 2:** Wait for CI `check` job green (`gh pr checks --watch`).
- [ ] **Step 3:** Mandatory review: `scaffold run review-pr` if available, else `mmr review --pr <N> --sync --format json` with all built-in channels; also run local-ai-delegate `local_review` (check `local_ai_status` first) as an extra channel per standing user instruction. Surface auth failures with recovery commands; fix all findings ≥ P2 (fix threshold); 3-round cap; proceed only on pass/degraded-pass.
- [ ] **Step 4:** `gh pr merge <N> --squash --delete-branch`, then `git checkout main && git pull`.

---

### Task 6: Release v3.43.0 (maintainer flow, operations-runbook §4)

- [ ] **Step 1:** Release-prep PR: bump `package.json` version to `3.43.0` (plus any lockfile) on a branch, open the PR, **wait for the `check` CI job to pass, squash-merge it, then `git checkout main && git pull`** — the tag must point at the merged bump commit, never at a pre-merge local state.
- [ ] **Step 2:** Only after Step 1's merge is pulled locally — tag and release: `git tag v3.43.0 && git push origin v3.43.0`; `gh release create v3.43.0 --title "scaffold v3.43.0" --notes` from the CHANGELOG section.
- [ ] **Step 3:** Verify `publish.yml` (npm) and `update-homebrew.yml` workflows succeed (`gh run list/watch`). npm-publish failures → check `NPM_TOKEN` per runbook §4.2a, NOT the OIDC config.
- [ ] **Step 4:** Verify availability: `npm info @zigrivers/scaffold version` → 3.43.0; `brew update && brew upgrade scaffold` path noted (local `brew trust zigrivers/scaffold` caveat is machine policy, not a defect).
- [ ] **Step 5:** `launchpad notify "scaffold v3.43.0 released — work-beads parallel-claim hardening"`.
