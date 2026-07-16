# Work-Beads Agent Identity & Bead Traceability — Design

**Date:** 2026-07-15
**Status:** Approved via /goal (autonomous); supersedes decision D7 of the
2026-07-10 nibble agent-workflow port design (see §2).
**Scope:** canonical `work-beads` skill, agent-ops asset bundle, pipeline
prompts, knowledge entries.

## 1. Problem

Three operator asks, one theme — *when a human looks at the fleet's artifacts
(beads, branches, commits), ownership and provenance should be legible at a
glance*:

1. **Agent names.** Agents should carry unique, memorable ("funny") names so
   `bd list --status in_progress` reads like a roster, not a UUID dump. What
   other benefits fall out of naming agents?
2. **Bead IDs in commit messages** — at the very beginning, so it is easy to
   see which commits belong to which beads.
3. **Bead IDs at the end of branch names** — so open branches show what work
   is still in flight.

## 2. The D7 conflict (and why reversing part of it is safe)

The nibble port (2026-07-10, D7 — flagged and approved at the time) retired
Scaffold's old `bd-<id>/<desc>` + `[bd-<id>]` prefix convention: bead IDs live
**only** in commit/PR bodies as `Closes <id>`; branch names are `agent/<name>`;
commit subjects stay clean. The recorded rationale
(`content/knowledge/core/git-workflow-patterns.md`): one canonical,
machine-readable location so squash-merge, PR search, and `git log --grep`
never parse branch names.

This design keeps that machine contract intact and **adds** human-visible
layers on top:

- `Closes <id>` in the PR body remains the **canonical machine mapping** — the
  stale-claim reaper's PR guard and any future tooling keep reading it.
- Bead IDs in the PR title, commit subjects, and branch suffix are **redundant,
  human-first surfaces**. Tools may use them as *additional* signals (the
  reaper gets strictly more conservative — §6), but nothing depends on them
  alone.

So the reversal is additive: no consumer of the old convention breaks.

## 3. Decisions

| # | Decision |
|---|---|
| N1 | Ship a name generator (`scripts/agent-name.sh`) in the agent-ops git component: `agent-<adjective>-<noun>-<NN>` from curated funny wordlists + an ALWAYS-PRESENT two-digit suffix (`/dev/urandom` entropy, collision-checked, fail-closed when no unused name can be proven). The suffix is unconditional — 40×40 words alone leave a real birthday-collision chance for a fleet starting concurrently, before any claim is visible to the collision check; the suffix widens the space to ~160k. The skill's Step 0 uses it when present; self-invented names remain the fallback. *(Revised during review R2/R3: originally suffix-on-collision-only; also gained fail-closed exhaustion.)* |
| N2 | Commit subjects on the work branch AND the PR title begin `<bead-id>: `. The PR title is the load-bearing half: under `gh pr merge --squash` the PR title becomes the commit subject on main, so `git log --oneline` on main shows the bead per commit. PR body keeps `Closes <id>` (canonical). |
| N3 | Work branches become `agent/<name>/<bead-id>` via a new `--bead <id>` flag on `setup-agent-worktree.sh`. Worktree directory (`.worktrees/<name>`) and Beads actor (`agent-<name>`) are unchanged — the actor stays stable per agent across beads while each bead gets a unique branch. Without `--bead` the legacy `agent/<name>` behavior is preserved. |
| N4 | The stale-claim reaper's PR guard also matches `headRefName` (branch names now carry bead IDs). Additive only — it can only HOLD more, never reap more. |
| N5 | Pipeline prompts and knowledge entries that teach the D7 convention are swept to the new one; the workflow-audit prompt's D7 checks flip to assert the new convention. |
| N6 | Deferred (filed as future work, not built now): a `prepare-commit-msg` hook that auto-prepends the bead ID derived from the branch suffix; an agent-name column in the build-status dashboard; `scaffold observe` actor stamping. |

## 4. Why unique names matter beyond visibility (the operator's question)

Naming is not cosmetic here — **the name IS the lock key.** `bd update <id>
--claim` is a compare-and-set keyed on the Beads actor, and same-actor claims
are idempotent: two agents that converge on the same name silently get ZERO
collision protection (both "win" the claim). LLM agents told to "pick a
distinctive name" sample from the same distribution and DO converge (everyone
likes `agent-crimson-fox`). A generator with real entropy plus a collision
check is therefore a **safety upgrade**, not decoration.

The full benefit list:

1. **Claim safety** — unique actor = the atomic claim actually excludes peers
   (T1-ACTOR); generated entropy prevents convergent self-picks.
2. **Readable ownership** — `bd list --status in_progress` shows who holds
   what; the reaper report names the crashed agent; merge-slot holders are
   identifiable.
3. **Git archaeology** — the worktree-local git identity is already
   `agent-<name>`, so blame/`git log --author=agent-soggy-banjo` attribute
   lines to agents; when all branch commits share one author, GitHub's squash
   commit keeps that author, so agent attribution survives onto main.
4. **Cross-artifact correlation** — one name ties bead ↔ branch
   (`agent/<name>/<id>`) ↔ worktree (`.worktrees/<name>`) ↔ `.agent-env` ↔ PR ↔
   commits.
5. **Human communication** — "waffle-iron is stuck on proj-42" is sayable and
   memorable across a 12-agent fleet; hashes and PIDs are not.
6. **Resume/self-heal** — `bd list --status in_progress --assignee
   "$BEADS_ACTOR"` (already in the skill) only works because the name is stable
   and unique.

## 5. Component design

### 5.1 `scripts/agent-name.sh` (new agent-ops template)

- Wordlists baked into the script: ~40 adjectives × ~40 nouns, lowercase
  `[a-z]`, kid-safe, deliberately silly (`turbo`, `soggy`, `waffle`, `banjo`,
  `walrus`, `pickle`, …). Output: `agent-<adj>-<noun>-<NN>` — the two-digit
  suffix is unconditional (see revised N1) and the name fits the existing
  `^[a-z0-9][a-z0-9-]*$` grammar everywhere.
- Entropy from `/dev/urandom` (via `dd`+`od`), not `$RANDOM`.
- Collision check (all best-effort, feature-detected): in-progress assignees
  (`bd list --status in_progress --json` + jq), actors persisted in
  `.worktrees/*/.agent-env` (cwd, toplevel, AND the primary root via
  `--git-common-dir` so it works from inside a worktree; accepts the
  `export`-prefixed sourceable form), and local + remote-tracking `agent/*`
  branch name segments. On collision resample up to 10×, then walk every
  suffix of the last word pair, checking each; if NO unused name can be
  proven, FAIL CLOSED (exit 1) rather than emit a known collision.
- Prints the bare name (`agent-turbo-walrus`) to stdout; diagnostic chatter to
  stderr. `--short` prints without the `agent-` prefix (for worktree names).
- No arguments required; never mutates anything.

### 5.2 `setup-agent-worktree.sh --bead <id>`

- New optional flag on `create` (the default subcommand): branch becomes
  `agent/<name>/<bead-id>`; everything else (worktree dir, `.agent-env` actor,
  identity, installs) is unchanged.
- `<bead-id>` validated before any mutation:
  `^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$`, ≤ 40 chars, and not ending
  in `.lock` — dots are allowed between segments because Beads emits
  hierarchical child ids (`bd-a3f8.1`), while leading/trailing/consecutive
  dots and `.lock` endings would make an invalid git ref. *(Revised during
  review R1/R5: originally the dot-free worktree-name grammar.)*
- Existing-worktree refresh path: if `.worktrees/<name>` exists but is checked
  out on a different branch than the computed one, fail loudly with guidance
  (finish/teardown or `make prune-merged` first) — never silently rebind a live
  worktree to another bead's branch. Same-branch → normal refresh.
- Crash recovery: branch exists without a worktree → existing path re-attaches
  (works unchanged with the suffixed name).
- **Migration (pre-`--bead` projects):** git stores refs as paths, so a bare
  `refs/heads/agent/<name>` and a nested `agent/<name>/<bead-id>` cannot
  coexist (a directory/file ref conflict). The script detects a conflicting
  ancestor ref before creating the branch and fails with a clear
  "retire the bare `agent/<name>` first (`make prune-merged` / `git branch -D`)"
  instruction rather than a cryptic git lock error.
- **Identity:** the worktree's git `user.name`/`user.email` derive from the
  exported `BEADS_ACTOR` when present (so `git blame`/`git log --author` match
  the bead assignee), falling back to `agent-<name>` only when no actor is set.
- The stale "bead↔PR mapping lives in the PR body (branch names exclude bead
  IDs)" comment is rewritten to the new convention.

### 5.3 Skill changes (`content/agent-skills/work-beads/SKILL.md`, canonical)

- **Step 0 (identity):** prefer `export BEADS_ACTOR="$(scripts/agent-name.sh)"`
  when the script exists; fallback stays self-invented + distinctive. One line
  on why generated > self-picked (convergent-pick collision).
- **2.2 (worktree):** pass `--bead <id>`; `cd .worktrees/<name>` unchanged.
- **2.3 (build):** convention reversal — commit subjects start `<bead-id>: `;
  the draft PR title starts `<bead-id>: `; the PR body carries `Closes <id>`
  (canonical machine mapping, unchanged).
- **2.7 (merge):** note the squash subject comes from the PR title, which is
  why the title carries the ID.
- Derived per-platform copies regenerated (`generate-agent-skills.mjs`); the
  `.claude/` and `.agents/` copies stay byte-identical via the existing
  drift gate.

### 5.4 Reaper (`reap-stale-claims.sh`)

- `PR_LIST_CMD` gains `headRefName` in `--json`; the per-PR match blob becomes
  `title + " " + headRefName + " " + body`. A branch carrying the bead ID now
  protects the claim even if the PR body was hand-edited. Conservative-only.

### 5.5 Prompt + knowledge sweep (N5)

- `content/pipeline/environment/git-workflow.md`, `foundation/beads.md`,
  `build/multi-agent-start.md`, `build/multi-agent-resume.md`,
  `consolidation/workflow-audit.md`: replace "IDs never in branch names/commit
  subjects" teaching with the new convention (subject/title prefix + branch
  suffix + body `Closes <id>` canonical). workflow-audit's D7 sweep becomes a
  consistency check FOR the new convention (no doc still teaching the retired
  body-only rule, no doc teaching the pre-nibble `bd-<id>/<desc>` leading-path
  form either).
- Knowledge entries: `core/git-workflow-patterns.md`, `core/task-tracking.md`,
  `execution/task-claiming-strategy.md`, `execution/worktree-management.md` —
  same sweep, preserving the "body is canonical for machines" rationale.

## 6. Error handling

- Generator: `bd`/`jq` absent → skip that collision source, still emit a name
  (stderr note). `/dev/urandom` unreadable → fall back to `$RANDOM` seeded
  arithmetic (never fail to produce a name).
- `--bead` with an invalid ID → fatal before any mutation (same as the name
  validation today).
- Reaper: unchanged failure semantics (malformed PR JSON → `pr_ok=0` → HOLD;
  scan failure → INCONCLUSIVE exit 1).

## 7. Testing

- **bats** `tests/agent-ops-agent-name.bats` (new): output shape
  (`^agent-[a-z]+-[a-z]+([0-9]{2})?$`), collision retry (stub `bd` returning
  the would-be name via a fixed-entropy harness hook), bd-absent degradation,
  `--short` form.
- **bats** `tests/setup-agent-worktree.bats` (extend): `--bead` produces
  `agent/<name>/<id>` branch; invalid bead id rejected; existing worktree on a
  different branch → loud failure; legacy no-flag path unchanged.
- **bats** `tests/agent-ops-reap-stale-claims.bats` (extend): a PR whose
  `headRefName` ends in the bead ID (body without it) HOLDs the claim.
- **eval** `tests/evals/skill-triggers.bats` (extend): skill text teaches
  `agent-name.sh`, the `<bead-id>: ` subject/title prefix, `--bead`, and keeps
  `Closes <id>` as the body contract.
- **vitest** `src/core/agent-ops/install.test.ts` (extend): new template in
  `AGENT_OPS_FILE_MAP`, installed executable, manifest-hashed.

## 8. Future work (N6, not in this change)

- `prepare-commit-msg` hook template: derive the bead ID from the branch
  suffix and auto-prepend it when the subject lacks it — makes the convention
  self-enforcing for human committers. Deferred: generated projects have
  unknown hook stacks (husky, pre-commit, bd's own hooks); needs a
  non-clobbering install story.
- Build-status dashboard: agent-name column sourced from bead assignees.
- `scaffold observe event` claim/complete entries stamped with the actor name.
