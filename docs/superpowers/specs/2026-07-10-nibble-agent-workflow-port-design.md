# Nibble Agent-Workflow Port — Design

**Date:** 2026-07-10
**Status:** Approved (user-reviewed brainstorm, 2026-07-10)
**Scope:** What Scaffold generates for new (and re-synced existing) target projects. Scaffold's own repo process is out of scope except where the two share code.

## 1. Context and goal

The nibble project (`~/Developer/nibble`) iterated heavily on a parallel-agent development process: Beads-driven task flow, git-worktree isolation with recovery tooling, per-worktree Docker/OrbStack test environments with deterministic port allocation, multi-harness instruction files, and a `/work-beads` skill that owns the end-to-end ship loop. The hardening came from observed agent failures (agents stopping after opening a draft PR, orphaned Docker stacks, `bd bootstrap` database wipes, wedged primary checkouts, duplicate work, review divergence).

Scaffold already generates a substantial fraction of this for target projects (Beads init, a git-workflow doc + worktree script, plan→Beads materialization, `multi-agent-start` build loops with atomic claims and `bd merge-slot`). This design ports the rest of nibble's process into Scaffold's generation pipeline and resolves the places where the two disagree.

## 2. Decisions (user-approved)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Nibble vs Scaffold conflicts | **Synthesize best of both** — keep Scaffold's mechanisms nibble lacks (materialization, atomic claims, merge-slot); adopt nibble's battle-tested rules elsewhere |
| D2 | Loop ownership | **`/work-beads` becomes the loop**; `multi-agent-start`/`resume` slim to bootstrap prompts that hand off to it |
| D3 | Docker machinery delivery | **Ship template scripts** (no LLM transcription of shell logic) |
| D4 | CI policy for generated projects | **Local gates only; CI deferred** — no `.github/workflows/` generated; pre-commit + `make check` + MMR review are the gate; generated docs explain how/when to add CI at launch |
| D5 | Methodology floor | **Raise the mvp floor** — Beads, git-workflow, materialization, and `/work-beads` in every preset; per-worktree Docker staging and the full doc chain stay deep/custom |
| D6 | Script delivery mechanism | **CLI-installed asset bundle** — `scaffold agent-ops install`, versioned, placeholder-parameterized |
| D7 | Branch naming (flagged, approved) | **Nibble convention**: `<type>/<desc>` task branches, `agent/<name>` worktree branches, no bead IDs in branch names or commit subjects; IDs in commit/PR bodies. Scaffold's `bd-<id>/<desc>` + `[bd-<id>]` prefix convention is retired |
| D8 | Review gate (flagged, approved) | Generated projects call **`mmr review --pr <N> --sync --format json` directly** (not `scaffold run review-pr`), with 3-round cap and degraded-pass self-merge |

## 3. Architecture: three delivery layers

1. **`agent-ops` asset bundle** — generalized nibble scripts shipped as versioned template files inside Scaffold, copied into target projects by a new `scaffold agent-ops install` command. Deterministic; updatable via a version marker.
2. **`work-beads` skill** — the ship loop, authored once in `content/agent-skills/work-beads/SKILL.md`, fanned out through the existing skill machinery to every supported harness.
3. **Pipeline prompts + knowledge** — existing prompts updated (and one added) to orchestrate the installer and generate the project-specific docs around the fixed scripts; knowledge entries updated so injected guidance matches.

## 4. Component: `agent-ops` asset bundle

### 4.1 Location and delivery

- Templates live at `content/assets/agent-ops/` in the Scaffold repo (new directory), organized as `git/` and `staging/` component groups plus `make/` fragments.
- New CLI command: `scaffold agent-ops install [--component git|staging|all] [--check] [--force]`, implemented under `src/core/agent-ops/` + `src/cli/commands/agent-ops.ts`.
- Placeholder syntax reuses the skills-sync convention: `{{KEY}}` replaced from a resolved variable map. Values come from `.scaffold/agent-ops.yaml` (see 4.4); the git component needs only `project_name` (derivable from the repo directory/remote when the config is absent).
- Version marker `.scaffold/agent-ops-version` written on install; `--check` reports drift (stale version or locally modified files) without writing. Re-install refuses to overwrite locally modified files unless `--force`.
- Installed files land in the target project at `scripts/` (git component) and `scripts/ops/` (staging component). Makefile integration is a generated `agent-ops.mk` included from the project Makefile via a one-line managed `include` (append if missing), so re-installs never fight user Makefile edits.

### 4.2 Git/worktree component (all projects, every preset)

Generalized from nibble's `scripts/` (source paths listed in Appendix A):

| Script | Make target | Behavior |
|---|---|---|
| `setup-agent-worktree.sh` | — (direct) | Create/update `.worktrees/<name>` on branch `agent/<name>` tracking `origin/main`; ensure `.worktrees/` gitignored; set per-worktree git identity `agent-<name> <agent-<name>@<project>.local>`; **duplicate-work preflight scan** (tokenize `--task` title, whole-word-match against open + recent merged PR titles and `bd list --status in_progress`; warn, never block); `--preflight-only` mode; optional dependency install step running `worktree_setup_commands` from `.scaffold/agent-ops.yaml` |
| `cleanup-merged-branches.sh` | `make prune-merged` | Squash-aware merged-branch sweep (commit-ancestry OR merged-PR head SHA), worktree removal, staging-stack reclaim (when staging component installed), ending in a Triage report of what it did not clean. External worktrees opt-in only |
| `main-sync.sh` | `make main-sync` | Fetch + fast-forward `main` from anywhere; fail loudly on divergence |
| `doctor.sh` | `make doctor` / `make doctor-fix` | Primary-checkout-stays-on-main invariant: read-only diagnosis; `doctor-fix` repairs unattended-safe cases (hostage worktree holding main, detached primary), refuses ambiguous ones (primary on feature branch, mid-conflict, diverged main, dirty tree) |
| `beads-snapshot.sh` | `make beads-snapshot` | Export Beads issues to a git-ignored local JSONL restore copy — the anti-`bd bootstrap`-wipe safety net |

Scaffold's existing `scripts/setup-agent-worktree.sh` (its own dev tooling, which also seeds `.scaffold/identity.json` for build observability) and the generated-project template are reconciled: the template includes the observability identity seeding so `scaffold observe` works in target-project worktrees.

### 4.3 Staging component (conditional: containerized services; deep/custom presets)

Generalized from nibble's `scripts/ops/`:

| Script | Make target | Behavior |
|---|---|---|
| `staging-env.sh` | (sourced) | Deterministic slot from worktree path: `O = (cksum(path) % 254) + 1`; compose project `{{PROJECT_NAME}}-wt-<cksum>`; per-service host port `= band_base + O` with 1000-wide bands assigned from 20000 upward; private subnet `10.<O>.0.0/16`; browser-facing URLs derived from remapped ports; `STAGING_WT_OFFSET` collision escape hatch. Shared QA stack (fixed ports, named `{{PROJECT_NAME}}`) selectable only from the primary checkout; setting it from a worktree is forbidden and guarded |
| `staging-teardown.sh` | `make staging-down` / `make staging-prune` | Tear down own stack; `--reap` sweeps orphaned `-wt-*` stacks whose worktree no longer exists (never touches live siblings or the shared stack) |
| `docker-env.sh` | (sourced) | Single-engine pin: `orbstack` context default on macOS, `default` elsewhere, overridable in config |
| `docker-doctor.sh` | `make docker-doctor` | Show which engine hosts the project's containers; warn on split-brain |
| `tc-reap.sh` | `make tc-reap` | Remove leaked testcontainers from dead sessions (label-scoped, age-guarded) |

Also installed: `ops/compose/staging.env.example`. The **compose file itself stays prompt-generated** (project-specific by nature); the new `staging-environments` pipeline step generates it against the port variables `staging-env.sh` exports, and a lightweight preflight in `staging-env.sh` asserts the env file matches resolved ports.

### 4.4 Config: `.scaffold/agent-ops.yaml`

Generated by the pipeline (staging step; git-workflow step for the minimal form), consumed by the installer and the scripts:

```yaml
project_name: myapp            # compose project + identity domain token
critical_labels: []            # work-beads ranking tier 2 (e.g. [auth, payments]); empty by default
worktree_setup_commands: []    # run inside a fresh worktree, e.g. ["npm ci", "uv sync"]
docker:
  context: orbstack            # engine pin; "default" off-macOS
  services:                    # order assigns port bands: 20000, 21000, ...
    - name: postgres
      band: 20000
    - name: api
      band: 21000
  shared_stack:                # fixed ports for the primary-checkout QA stack
    postgres: 55432
    api: 8001
```

### 4.5 Dropped or generalized nibble-specifics

- **Four-engine rule, capital-affecting tier, here.now `site:` tails** → replaced by a generic, project-defined **"project invariants"** slot: the pipeline fills a short section in AGENTS.md/work-beads config from the PRD/tech-stack when the project declares cross-cutting invariants; empty by default. `critical_labels` covers the priority-ranking use.
- The **`docs:` bead-description tail** (which repo docs the work touches; `none` allowed) is kept — generic and load-bearing. The `site:` tail is omitted.
- `launchpad notify` calls are feature-detected (`command -v launchpad`) and skipped when absent.
- Nibble's `cli-pr-review.sh` / `await-pr-review.sh` fallbacks are not ported (MMR handles degraded review; CI polling is moot under D4).

## 5. Component: `/work-beads` skill

### 5.1 Authoring and fan-out

- Canonical source: `content/agent-skills/work-beads/SKILL.md` with a `<!-- lean:start -->…<!-- lean:end -->` region.
- Added to the `SKILLS` map in `scripts/generate-agent-skills.mjs` (emits `content/skills/work-beads/{SKILL.md, agents-block.md, cursor.mdc}`) and to `INSTALLABLE_SKILLS` in `src/core/skills/sync.ts` (auto-installs to `.claude/skills/` + `.agents/skills/`; existing Scaffold projects pick it up on next skill sync).
- The Cursor variant sets `alwaysApply: true` and inlines the loop contract — nibble's lesson that description-matching is unreliable and "agents repeatedly stopped after the draft PR."
- Uses the `{{INSTRUCTIONS_FILE}}` marker where it references the host instruction file.

### 5.2 Skill structure (generalized from nibble)

Sections, in order — content ports nibble's skill with the synthesis changes marked **[synth]**:

1. **Intro** — self-contained on purpose; concurrent agents, no memory of conventions.
2. **The loop contract** — pseudocode; "the bead is not done until the PR is MERGED and the bead is CLOSED"; standing authorization to run the whole loop without asking; the only mid-loop stops are a verified reproducing P0 or a named block.
3. **Invocation forms** — explicit IDs (topologically ordered, cycle-rejected), `N`, `N <label>`, bare (N=1).
4. **Step 0 — Orient** (read-only, from the primary checkout): `bd ready`, `bd stats`, `gh pr list --state open` (the live registry of what others are building), `git worktree list`, `make doctor` (heal with `make doctor-fix`). **[synth]** Also verifies tooling: `bd` present, agent-ops scripts installed (else instruct `scaffold agent-ops install`), and emits a `scaffold observe event` claim-phase entry when observability is present.
5. **Step 1 — Select** — ranking: priority → project-critical labels (`critical_labels`) → unblocking work → capability fit. Hard exclusions: beads in progress under another agent or covered by any open/draft PR; surface-conflicting beads (same module/migration sequence/shared code, per the generated git-workflow conflict rules); mandatory duplicate-work preflight (`setup-agent-worktree.sh --preflight-only --task "<title>"`).
6. **Step 2 — Per-bead loop** (strictly sequential; one open PR per agent):
   - 2.1 Claim: **[synth]** atomic `bd ready --claim` scoped by `--has-metadata-key plan_task_id` when a materialized plan exists, else `bd update <id> --status in_progress` — both from the primary checkout.
   - 2.2 Worktree: `setup-agent-worktree.sh <name>` (runs the configured `worktree_setup_commands` — skipping dependency install is a known `make check` breaker); `make staging-up` from the worktree if a live stack is needed (staging component only).
   - 2.3 Build: Superpowers discipline when available (brainstorm → plan → TDD), else failing-test-first; commit/push frequently on `agent/<name>`; **draft PR on first push — the draft is the visible claim [synth: kept alongside atomic claims]**; bead IDs in commit/PR bodies only (D7).
   - 2.4 Project invariants: check the generated invariants section (empty by default); **docs travel with the PR** — resolve the bead's `docs:` tail and update every stale doc in the same PR.
   - 2.5 Defer = bead, immediately: `bd create … --deps discovered-from:<id> -d "…; docs: <paths or none>"`.
   - 2.6 Verify: `make check` green on branch HEAD, personally observed ("subagent or reviewer claims don't count"). Docker-contention recovery: `make docker-doctor` → `make tc-reap` + `make staging-prune` → re-run isolated; never merge on a red Docker gate; never `docker system prune`.
   - 2.7 Review and merge (D8): `mmr review --pr <N> --sync --format json`; surface-scope contamination check (`gh pr diff <N> --name-only` + hunk walk); auth failures surfaced, never silently skipped; round budget — R1 fixes every real finding, R2+ fixes only P0/P1 and files beads for P2/P3, **hard cap 3 rounds, then complete the degraded-pass merge yourself** (file a bead per unresolved finding + map them in a PR comment). The one thing that still blocks: a verified, still-reproducing real P0 → file it, keep the PR open, post the reproduction, notify the user, end the batch. **[synth]** With 3+ concurrent agents, acquire `bd merge-slot` before merging. Then `gh pr merge --squash --delete-branch`; from primary: `make main-sync && make prune-merged`; `make staging-down` for the worktree stack.
   - 2.8 Close out: `bd close <id>` only after merge is verified; post-merge file fixes go in a micro follow-up PR, never edits to the primary checkout.
7. **Step 3 — Batch report** (required slots, each answered, `none` said out loud): Beads (`<id> → PR #<n> → merged | parked | skipped | not started`), Docs updated in-PR, Beads filed (open). `launchpad notify` when present and the batch was long.
8. **Red flags table** — nibble's temptation→reality list, minus here.now rows: committing in primary; starting bead k+1 before k merges; skipping the draft PR; **ending the turn after the draft PR with "next steps" (the #1 observed agent failure)**; leaving a TODO instead of a bead; merging on a red gate; chasing a clean review past the cap; leaving a staging stack running; `--no-verify` / plain `--force` / merge commits; closing a bead when the PR opens.

### 5.3 Relationship to build prompts

- `content/pipeline/build/multi-agent-start.md` / `multi-agent-resume.md` become **bootstrap prompts**: preflight (worktree check, `BEADS_ACTOR`, dependency install, test health), orchestrator-role materialization under the merge-slot lock (unchanged), then a single instruction: *follow the `/work-beads` skill for the loop* — the loop text is deleted from the prompts rather than duplicated.
- `single-agent-start.md` / `resume` keep a sequential variant: same contract, no worktree (branch directly), no merge-slot.
- `quick-task.md` / `new-enhancement.md` reference the loop contract for their ship phase instead of restating it.

## 6. Pipeline prompt and instruction-file changes

| File | Change |
|---|---|
| `content/pipeline/environment/git-workflow.md` | Remove `.github/workflows/ci.yml` from outputs and body (D4). Generated `docs/git-workflow.md` gains: local-gate quality model + "CI is deferred; how to add it at launch" section; conflict-prevention rules; primary-checkout invariant; crash recovery; cheat sheet. Instructs running `scaffold agent-ops install --component git` instead of writing the worktree script from prose. Branch/commit conventions switch to D7. Adds the PostToolUse `gh pr create` review-reminder hook to the generated `.claude/settings.json` (merge, don't clobber). Still generates `.github/pull_request_template.md` |
| `content/pipeline/environment/staging-environments.md` **(new)** | `phase: environment`, `order: 315` (320 is taken by design-system), `dependencies: [dev-env-setup]`, `conditional: if-needed` (containerized services detected from tech stack), `reads: [tech-stack]`, `knowledge-base: [per-worktree-environments]`. Writes `.scaffold/agent-ops.yaml` (service/band mapping), runs `scaffold agent-ops install --component staging`, generates `ops/compose/staging.yml` + `staging.env.example` + the staging section of `docs/dev-setup.md` (engine pin, staging-up-from-worktree-only, reaping discipline) |
| `content/pipeline/foundation/beads.md` | Adds generated `docs/beads-workflow.md`: defer=bead rule, `bd create` template with required `docs:` tail, close-only-after-merge, epics/dependency conventions, **bootstrap-trap warnings** (`bd bootstrap`/`bd init --force` never on a populated DB; `make beads-snapshot` before any reset; use `bd dolt`, not a standalone `dolt` CLI). Keeps `bd setup claude` marker-block ownership; commit-convention text updated per D7 |
| `content/pipeline/environment/dev-env-setup.md` | Key Commands table gains the agent-ops targets; marks each command **agent-safe** vs **ask-first** |
| `content/pipeline/environment/automated-pr-review.md` | Aligns to D8: direct `mmr review`, 3-round cap, degraded-pass self-merge policy, P0 stop condition |
| `content/pipeline/consolidation/claude-md-optimization.md` | Adopts nibble's instruction-file architecture: **AGENTS.md holds the binding "operations core"** (ship-loop summary, standing authorization, parallel-safety hard rules, `/work-beads` routing); CLAUDE.md holds navigation + Key Commands (agent-safe marking) + an **error-recovery table** (situation → first commands → then) and defers to AGENTS.md for the ops core; other harness files defer likewise. Shared managed preamble stays skill-managed |
| `content/pipeline/consolidation/workflow-audit.md` | New cross-doc checks: branch naming per D7 everywhere, no CI references (D4), agent-ops targets consistent across CLAUDE.md/git-workflow/dev-setup, work-beads routing present in all harness files |
| `content/pipeline/build/*` | Per 5.3 |
| `content/pipeline/planning/implementation-plan.md`, `finalization/materialize-plan-to-beads.md`, `finalization/implementation-playbook.md` | Sweep for D7 branch/commit references; playbook routes its execution loop to `/work-beads` |

## 7. Knowledge entries

| Entry | Change |
|---|---|
| `content/knowledge/core/per-worktree-environments.md` **(new)** | The pattern: deterministic port offsets, band allocation, subnet isolation, shared-stack protection, orphan reaping, single-engine pin, testcontainer hygiene |
| `content/knowledge/execution/worktree-management.md` | Add doctor/doctor-fix invariant, prune-merged triage, duplicate-work preflight |
| `content/knowledge/execution/multi-agent-coordination.md` | Draft-PR-as-visible-claim alongside atomic claims; one-open-PR-per-agent; merge-slot retained |
| `content/knowledge/core/git-workflow-patterns.md` | D7 naming; D4 CI-deferral stance; squash-aware cleanup |
| `content/knowledge/core/task-tracking.md` | Defer=bead, `docs:` tail, bootstrap trap, close-after-merge |
| `content/knowledge/core/claude-md-patterns.md` | AGENTS.md-ops-core architecture, agent-safe command marking, error-recovery tables |

All new/updated entries carry freshness frontmatter (`volatility`, `sources`, `last-reviewed`) and pass `make validate-knowledge`.

## 8. Methodology presets

- `mvp.yml`: `beads`, `git-workflow`, `materialize-plan-to-beads` flip to `enabled: true` (D5). `staging-environments` present but `enabled: false`. `ai-memory-setup` stays disabled.
- `deep.yml` / `custom-defaults.yml`: `staging-environments` enabled (conditional on Docker services).
- All overlays that enumerate environment-phase steps gain the new entry; `preset-exhaustiveness.bats` enforces completeness.
- `/work-beads` installs regardless of preset (it's a skill, not a step).
- CHANGELOG/README note the mvp behavior change and the retired `bd-<id>` conventions for existing projects.

## 9. Testing

- **Bundle scripts**: bats suites run the installed templates against sandbox git repos — port-offset determinism and collision bounds (`O ∈ 1..254`, band math), doctor/doctor-fix scenario matrix (hostage worktree, detached primary, refusal cases), squash-merge detection in prune, duplicate-preflight tokenization, snapshot round-trip. Docker-dependent behavior is tested behind a `command -v docker` guard with mocked `docker` where CI lacks an engine.
- **Installer**: vitest for placeholder resolution, config parsing/validation, version-marker/drift logic, Makefile-include idempotency; bats for the CLI surface.
- **Content**: `make validate` (frontmatter for the new step), `preset-exhaustiveness`, `pipeline-completeness`, `dependency-ordering`, `knowledge-injection`/`-quality`, `skill-triggers.bats` gains work-beads activation phrases, `agent-skills-check` covers the new fan-out, prompt-quality evals on every modified prompt.
- **Regression sweep**: grep-level eval asserting no remaining `bd-<id>/` branch or `[bd-<id>]` commit references anywhere in `content/` after D7.

## 10. Risks

- **Script generalization**: nibble's scripts embed uv/npm/FastAPI specifics; the templates must be service-agnostic with project-specific hooks injected at generation time. Mitigated by the bats sandbox suites.
- **Behavior change for existing projects**: skill sync will deliver `/work-beads` to projects whose docs still describe the old conventions; the skill's Step 0 tooling check plus `workflow-audit` re-runs are the reconciliation path. Documented in CHANGELOG.
- **mvp floor raise** makes `bd` a hard prerequisite for every preset; `beads.md`'s existing graceful-degrade path (Beads unavailable → markdown fallback) must be preserved and re-verified.

## Appendix A — Nibble source artifacts to consult during implementation

All under `/Users/kenallred/Developer/nibble`:

- `docs/git-workflow.md` (esp. §5 PR flow, §6 worktrees/staging, §8 crash recovery, §12 cheat sheet)
- `docs/beads-workflow.md` (esp. §1 defer rule, §2.1 bootstrap trap)
- `.claude/skills/work-beads/SKILL.md` (the loop; mirrored in `.agents/skills/`)
- `.cursor/rules/work-beads.mdc`, `worktree-naming.mdc`, `git-remote-cleanup.mdc`
- `scripts/setup-agent-worktree.sh`, `scripts/cleanup-merged-branches.sh`, `scripts/main-sync.sh`, `scripts/doctor.sh`
- `scripts/ops/staging-env.sh`, `staging-teardown.sh`, `docker-env.sh`, `docker-doctor.sh`, `tc-reap.sh`, `staging-compose-preflight.sh`
- `scripts/ops/beads-snapshot.sh`
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (instruction-file architecture), `.claude/settings.json` (PostToolUse review hook)
