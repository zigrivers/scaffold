# Brownfield Adoption — Design

- **Status:** Approved-direction, spec under review
- **Date:** 2026-07-19
- **Scope decision (user):** Option 1 sequencing — Tier A (trust), then Tier C (ops last mile), then Tier B (brownfield-native pipeline), then Tier D (queue enhancements). All identified ideas are in scope.
- **Prior art analysis:** five-agent research pass over `src/`, `content/`, and external tooling (Renovate, Terraform, Nx, Biome, flutter doctor, Mergify, Graphite, Zuul, pytest-testmon, brew services). Findings summarized in §3.
- **Dogfood evidence:** rumble-pickleball adoption 2026-07-19 (PRs #108–#110 on zigrivers/rumble-pickleball).

## 1. Problem

Scaffold's brownfield support is two layers that never communicate:

1. **Code layer** — `scaffold adopt` pre-marks pipeline steps completed using an
   any-output-exists heuristic (`src/project/adopt.ts:139-159`): if *one* of a
   step's declared `outputs` paths exists, the step is marked done. No content
   check, no live tool check. Because the beads step lists `CLAUDE.md` among its
   outputs, any repo with a `CLAUDE.md` gets beads falsely marked complete.
2. **Prose layer** — all 99 pipeline steps carry `## Mode Detection` blocks with
   the *correct* live checks (`bd info`, `git remote get-url origin`,
   `.beads/embeddeddolt/`), but they only run when an agent executes the step —
   which adopt's false completions prevent.

Compounding facts, confirmed in source:

- A correct verification module exists and is unused: `src/state/completion.ts`
  requires **all** outputs present (`detectCompletion`) and can report a
  `conflict` status when state says completed but artifacts are missing
  (`checkCompletion`) — the exact beads scenario. Adopt bypasses it and also
  bypasses `StateManager.markCompleted` (writes `status:'completed'` directly).
- `init-mode: brownfield` is written to `state.json` and read by nothing in
  assembly, step selection, or knowledge injection. `scaffold adopt` hardcodes
  `methodology = 'deep'` (`adopt.ts:563`). The dashboard hardcodes
  `'greenfield'` when synthesizing service state (`dashboard.ts:206`).
- "Update mode" across the content is keyed to *scaffold's own prior output docs*
  (`docs/tech-stack.md` exists → update mode), i.e. it detects a **prior scaffold
  run**, not an existing codebase. A real brownfield repo (README, CONTRIBUTING,
  eslint config, CI workflow) runs nearly every step in FRESH greenfield mode.
- The shipped adopt heuristic contradicts the draft spec
  (`docs/architecture/domain-models/07-brownfield-adopt.md`), which requires
  all-outputs completion, artifact validation, and partial-match warnings.
- The ops tooling has a fully manual last mile (each item hit on rumble):
  the `make check` / `make check-affected` gate targets the mq daemon assumes
  are never installed (contract lives in
  `content/knowledge/core/test-impact-analysis.md`); hook registration into
  `.claude/settings.json` is a hand-run `jq` snippet
  (`content/pipeline/environment/git-workflow.md:213-251`); **no scheduler
  tooling exists** for the local-poller (prose says "cron/launchd"); the
  bootstrap-merge problem (first queue-installing PR can't ride the queue) is
  unaddressed; bd-guard fails open silently when `jq` is absent.
- Cascade risk: adopt false-completes beads → `.beads/` never created →
  git-workflow's `if [ -d .beads ]` hook registration silently no-ops → the
  bd-guard durability net is absent with no signal.

## 2. Goals / Non-goals

**Goals**

- G1: Adoption produces no side effects until explicitly approved, and its
  claims about step completion are verified against live state.
- G2: One `scaffold doctor` command verifies the whole installed surface by
  *executing* checks (not inspecting config presence) and offers safe fixes.
- G3: Installing the git-workflow / beads / local-CI stack into an existing
  project requires zero hand-authored plists, hook snippets, or gate targets.
- G4: The pipeline gains a true brownfield mode: steps codify what the code
  already answers and interview only for intent; a brownfield preset replaces
  the hardcoded `deep`.
- G5: The local merge queue gains the highest-value ideas from hosted queues
  (gate-result caching, conflict-aware batching, TIA, event-driven wake)
  while staying single-machine, free, and GitHub-Actions-free.

**Non-goals**

- No GitHub Actions dependency anywhere in the local-CI path (unchanged D4′
  split from the merge-throughput design stands).
- No change to the greenfield flow's step content semantics (adoption mode is
  additive; fresh/update modes keep their current meaning).
- No v1-migration overhaul (detection stays; deeper v1 artifact mapping stays
  out of scope).
- No multi-machine or hosted CI backends (Dagger hermetic gates: deferred).
- No automatic deletion or rewriting of a project's existing configs/docs —
  translation and mapping only (see D10).

## 3. Current-state evidence (abridged)

| Area | Finding | Source |
|---|---|---|
| adopt heuristic | ≥1 output exists ⇒ completed; partial vs full is cosmetic | `src/project/adopt.ts:139-159` |
| adopt state write | bypasses `markCompleted`; no `artifacts_verified` | `adopt.ts:101-161` |
| unused verifier | all-outputs + `conflict` detection exists | `src/state/completion.ts:19-83` |
| inert mode | `init-mode` written, never read in assembly/knowledge | grep `src/`; `knowledge-loader.ts` |
| update-mode trigger | step completed in state AND artifact exists | `src/core/assembly/update-mode.ts:24` |
| adopt precondition | requires existing `.scaffold/` (not first-touch) | `src/cli/middleware/project-root.ts:9-26` |
| gate targets | not installed by any component; daemon defaults assume them | `src/merge-queue/types.ts:71-74`; `agent-ops.mk.tmpl` |
| hook registration | manual jq deep-merge in content; jq absence = guard fails open | `git-workflow.md:213-251`; `bd-guard.sh.tmpl:28-31` |
| scheduler | no plist/timer generator exists; prose instruction only | `merge-throughput.md:123-124`; design spec §"envisioned" |
| bootstrap merge | unaddressed; only lever is `MQ_DIRECT_MERGE_OK=1` | `mq-guard.sh.tmpl:32` |
| brownfield preset | none; adopt hardcodes deep | `content/methodology/`; `adopt.ts:563` |
| genuinely brownfield-fit steps | github-setup, add-e2e-testing, ai-memory-setup, quality phase, review tools, quick-task | pipeline survey |

External patterns adopted by this design: Renovate's onboarding-PR activation
gate; Terraform's clean-plan completion criterion; OpenRewrite's dry-run patch;
Biome's migrate-the-incumbent; flutter/expo doctor's execute-don't-inspect +
diagnose/fix split; brew services' scheduler management; Mergify's n-ary batch
bisection; Graphite's tree-hash gate reuse; Zuul's speculative prefixes;
pytest-testmon's content-hash coverage map; AgenticFlict's agent-PR conflict
data (~28% conflict rate, steeply churn-correlated).

## 4. Design overview

Four tiers, shipped as four releases (§10). Tier A makes adoption honest and
observable; Tier C removes the manual ops last mile; Tier B makes the pipeline
content brownfield-native; Tier D upgrades the queue. Later tiers assume
earlier ones (doctor verifies what C installs; C's gate generation is extended
by B's ingestion; D's TIA hooks into C's gate scaffolding).

## 5. Decisions

- **D1 — adopt becomes propose-then-apply.** `scaffold adopt` renders an
  Adoption Plan and writes nothing (no state, no config) by default;
  `scaffold adopt --apply` executes the approved plan. Plan output: always
  stdout (human format or `--format json`); `--write [path]` persists the plan
  document (default `docs/adoption-plan.md`). Re-running re-renders against
  current reality (Renovate's re-render loop). **Drift detection is
  structural, not textual:** the plan carries a `plan_key` — a sha256 over the
  canonical JSON form of the **complete apply-action records**: sorted step
  slugs, each with its disposition, detect-check results, and
  disposition-specific payload (the mapping target path for a
  map-candidate, the exact file list and parameters for every ops action) —
  so no apply-relevant detail can change without changing the key. The key
  is embedded in both the JSON output and the written plan document.
  **The approved key is an input to apply:** `scaffold adopt --apply --plan
  <path>` (or `--plan-key <sha>`) re-renders against live reality *before
  any write* and aborts with a re-review prompt when the recomputed key
  differs (any disposition, detect result, or ops action changed). A bare
  `--apply` with neither flag renders fresh and requires interactive
  confirmation of the displayed plan; in non-interactive/auto mode a bare
  `--apply` is an error — automation must pass the key it approved.
  Prose/whitespace changes in the written markdown never affect the key. This is a breaking behavior change called out in the CHANGELOG as a
  defect fix (the prior silent behavior violated the draft brownfield spec).
- **D2 — adopt is first-touch.** `adopt` joins `ROOT_OPTIONAL_COMMANDS`; in a
  repo with no `.scaffold/`, plan mode works read-only and `--apply` performs
  init (detection → config.yml + state.json) before applying step statuses.
  **Initialization is itself an apply action:** the plan renders an
  `initialize` record containing the exact proposed `config.yml` payload
  (project type, typed config values, preset) and the initial state summary
  (init-mode, per-step statuses), in both human and JSON output, and that
  record's canonical form is part of the `plan_key` — apply can never write
  configuration the approved plan did not show. `adopt` subsumes the
  brownfield entry path; `init` remains the greenfield entry.
- **D3 — completion truth = all outputs + detect contract.** Adopt (and
  `scaffold status`/doctor) route through `src/state/completion.ts`:
  a step is `verified` only when **all** declared outputs exist AND its
  `detect:` contract (D4) passes. State-says-done-but-checks-fail surfaces as
  `conflict`, never silently. **State-field migration:** the boolean
  `artifacts_verified` (whose current semantics are the misnomer "declares
  outputs") is replaced by a `verification: verified | declared | unverified`
  enum plus a state schema-version bump. On first load of a pre-R1 state
  file, existing `artifacts_verified: true` entries migrate to `declared`
  (never `verified` — they were not disk-checked), `false`/absent migrates to
  `unverified`, and the legacy field is dropped on next save. `verified` is
  set only by a real D3 check. The migration is one-way, automatic, and
  called out in the R1 CHANGELOG (D16). Steps with empty `outputs` and no
  `detect:` block are reported `undetectable` in the plan rather than
  silently skipped. **Conflict resolution matrix:** conflicts come in two
  classes, and `conflict` overrides `completed` everywhere completion is
  consumed — a conflicted step is treated as *not completed* for pipeline
  selection, `next`, and mode resolution. (a) **State-claim conflict**: a
  state entry says `completed` but D3 checks fail. Apply reopens the step to
  `pending` / `verification: unverified` and appends a *reversal* audit
  record preserving the prior claim (who/when/what claimed completion).
  (b) **Artifact-only conflict**: no completion claim in state, but partial
  artifacts exist on disk (the beads case — `CLAUDE.md` present, `bd info`
  fails). There is no prior claim to reverse; apply records the step
  `pending` / `unverified` with a *partial-artifacts* audit record listing
  the artifacts found. Audit records append to the existing
  `.scaffold/decisions.jsonl` (already part of `.scaffold/` runtime state);
  record schema for both classes: `{ts, actor, event:
  "verification-reversal" | "partial-artifacts", step_slug, from_status,
  from_verification, to_status, to_verification, evidence, reason,
  plan_key}` — append-only, pure audit, no runtime readers.
  **Mode resolution follows verification state:** a step whose prior
  scaffold completion survives as `verified` or `declared` runs in *update*
  mode; a step with no surviving completion runs in *adoption* mode when
  `init-mode` is brownfield/v1-migration (once D11's content half ships in
  R3) and *fresh* mode otherwise — so a reopened false completion correctly
  enters adoption mode instead of being excluded by D11's
  not-previously-completed trigger.
- **D4 — `detect:` frontmatter contract.** Pipeline steps may declare a
  machine-readable detection block mirroring their Mode Detection prose:

  ```yaml
  detect:
    all:                      # every entry must pass (any: also supported)
      - path: .beads/         # fs existence (dir or file)
      - cmd: bd info          # exit 0 within timeout (default 10s)
  ```

  Constraints: `cmd` entries are fixed strings shipped in the package's
  pipeline files only — never read from project-local files (trust boundary);
  executed with cwd = project root, no shell interpolation of project data,
  per-cmd timeout, failures treated as not-detected (never fatal).
  `make validate` learns the schema. Initial rollout: the steps whose outputs
  include ubiquitous paths (beads, github-setup, git-workflow,
  merge-throughput, ai-memory-setup, add-e2e-testing, tdd, dev-env-setup);
  others keep pure output-existence (now all-outputs, per D3).
- **D5 — `scaffold doctor`.** New top-level command, aggregator pattern:
  sections = pipeline (D3 verification), beads (bd on PATH, version ≥ floor,
  `bd info` live, backup configured via `bd backup status --json`, guard
  installed **and registered and armed** — including the jq-missing fail-open),
  hooks (settings.json entries present + scripts executable), gate
  (layered per G2's execute-don't-inspect rule: `make -n` proves only that
  the targets *resolve* and is reported as exactly that, never as
  "healthy"; the real check runs the generated gate script in a bounded
  probe mode — `GATE_PROBE=1` performs dependency presence, runtime
  resolution (`node --version`, the functional `java -version` test), and
  test-runner startup without executing the suite; a full gate execution is
  available behind `doctor --deep` with a timeout), queue (daemon lock
  liveness, `.mq/PAUSED` state + owner), scheduler (job actually loaded via
  `launchctl print` / `systemctl --user status`, last-run heartbeat from logs).
  Read-only by default; `doctor --fix` applies only idempotent safe fixes
  and never resets state or deletes files. **Fix handlers are
  release-staged:** in R1, `--fix` ships only the fixes with no dependency
  on Tier C — delegating `bd doctor --fix` — while every other failure
  reports its remediation command read-only. The hook-re-registration and
  scheduler-reload fix handlers land in R2 as thin wrappers over the D8/D6
  primitives (never duplicated logic). **Capability probing:** every external
  subcommand the beads section relies on (`bd doctor`, `bd backup status
  --json` — both already prescribed by the shipped beads step,
  `content/pipeline/foundation/beads.md`, against the bd ≥ 1.1.0 floor) is
  probed first (`bd <sub> --help` exit 0); an absent capability reports
  "unsupported by installed bd <version>" as a warning with the upgrade
  remediation — never an error loop. The same probe-don't-assume rule applies
  to `gh`, `launchctl`/`systemctl`, and `jq`. Exit codes: 0 healthy,
  1 warnings, 2 errors. `--json` for automation. Existing checkers
  (`agent-ops check`, `make doctor`) remain and are delegated to, not
  duplicated.
- **D6 — `scaffold sched` scheduler manager** (brew-services model).
  R2 command surface: `scaffold sched install|uninstall|status <job>` and
  `scaffold sched list`. Start/stop/restart are deliberately NOT shipped in
  R2 — install/uninstall subsume them for interval jobs (restart =
  `uninstall && install`, which the install path's `bootout || true`
  idempotency makes safe), and a paused queue is already expressed via
  `.mq/PAUSED`, not scheduler state. First job: `post-merge-poller`. macOS: generate plist into `~/Library/LaunchAgents`
  with reverse-DNS label, absolute paths resolved at install time (node via
  stable fnm alias or `process.execPath`, keg-only openjdk prepended when the
  gate needs Java and `/usr/bin/java` is a stub, Homebrew bin), explicit
  `EnvironmentVariables.PATH`, `StandardOutPath`/`StandardErrorPath` under
  `.mq/logs/`; install = `launchctl bootout … || true` then `bootstrap`, then
  **verify with `launchctl print gui/$UID/<label>`** (file presence proves
  nothing). Linux: systemd user timer + service, `loginctl enable-linger`.
  `sched status` and doctor read the same heartbeat. Interval configurable
  (default 600s).
- **D7 — gate scaffolding as an explicit component.**
  `scaffold agent-ops install --component gate` generates
  `scripts/gate-check.sh` + `scripts/gate-check-affected.sh` and appends thin
  `check` / `check-affected` Makefile targets when absent. Generated logic is
  seeded from ingestion (D10-lite in Tier C: `package.json` scripts and
  existing CI workflow parsing) and satisfies the mq contract
  (`MQ_AFFECTED_BASE`, `.mq-failed-tests.txt`, `.mq/quarantine.txt` exclusion,
  force-full on infra-file changes). Baked-in hardening from the rumble
  lessons: self-contained (`[ -d node_modules ] || npm ci`), functional
  runtime fallbacks (`java -version` test, not `command -v`), and a prompted
  classification of environment-sensitive suites (visual regression → local
  `check-visual`, excluded from the queue gate), and a **`GATE_PROBE=1`
  mode** in the generated scripts — check prerequisites (deps, runtimes,
  test-runner startup) and exit without running the suite; this is the
  bounded execution probe doctor's gate section runs (D5). Manifest marks these files
  `seed: true`: `agent-ops check` reports them only if missing, never as
  drifted — they are project-owned after generation. Excluded from
  `--component all` (same opt-in posture as merge-queue/ci).
- **D8 — native hook registration (Claude Code scope in R2).**
  `scaffold hooks install` performs the `.claude/settings.json` deep-merge in
  TypeScript (idempotent, no jq): SessionStart (`bd prime`), PreToolUse
  (bd-guard, mq-guard), PostToolUse (`gh pr create` review reminder) — each
  added only when its prerequisite exists, with an explicit report line when a
  prerequisite is missing (no more silent `-d .beads` no-op). Scope is
  deliberately Claude Code only: `.claude/settings.json` is the only
  hook-registration surface in evidence (§3); other harnesses have no
  equivalent hook API today, so they keep the existing behavior — the command
  prints the `scripts/*-guard.sh --check` wiring guidance for AGENTS.md-based
  harnesses. A `--harness` flag is deferred (§12) until a second harness
  exposes a registration surface worth automating. The jq snippets in
  git-workflow.md / merge-throughput.md are replaced by "run `scaffold hooks
  install`" instructions; `doctor` verifies registration.
- **D9 — `scaffold mq bootstrap`.** One-shot guided first merge for the PR
  that installs the queue, ordered **arm-first** so a mid-sequence failure
  never strands a merged-but-unprotected repo: (1) preflight — verify
  `merge_queue:` config + gate targets resolve, run the full gate locally on
  the PR head; (2) arm everything that does not require the merge — hooks
  install (D8), optional `sched install` (D6); (3) the direct squash-merge
  under bootstrap semantics; (4) post-merge verify — daemon smoke-start and
  a closing doctor pass. **Journal schema and crash safety:** every bootstrap
  attempt gets a `bootstrap_id` (ULID) carried by all three event types,
  each of which also repeats the PR number and gated head SHA —
  `bootstrap_intent` (written *before* the merge), `bootstrap_merged`
  (adds the resulting merge commit SHA), `bootstrap_armed` (terminal
  success). Resume and doctor reconcile as a per-`bootstrap_id` state
  machine; an aborted attempt (e.g. head moved) is terminal for its id, and
  a retry opens a new id — so a stale attempt's events can never make an
  unfinished bootstrap appear armed. Immediately before
  merging, the PR head is revalidated against the intent's gated SHA; a
  moved head aborts back to preflight (never merges an ungated head). On any
  resume (re-run or `scaffold mq bootstrap --finish`), the command
  reconciles against **GitHub's authoritative PR state**: a
  `bootstrap_intent` with no `bootstrap_merged` event while GitHub reports
  the PR MERGED means the crash hit the window between the merge API call
  and the journal write — the merge is recorded retroactively, never
  re-attempted. Resume skips journaled stages and idempotently re-runs
  unfinished ones — a `bootstrap_merged`-without-`bootstrap_armed` state is
  exactly what `--finish` and the doctor both surface. Bootstrap merges are
  auditable in the journal and distinct from `MQ_DIRECT_MERGE_OK`
  emergencies. Guard messaging updated to point
  first-time installers at `mq bootstrap` instead of the env-var bypass.
- **D10 — existing-equivalent mapping + ingestion.** (a) `artifact_map` in
  `.scaffold/config.yml` maps a step to an existing project artifact
  (`coding-standards: CONTRIBUTING.md`), letting D3 verification accept the
  incumbent and letting steps treat it as their prior artifact in update
  mode. Adopt proposes mappings in the plan (never applies unapproved).
  (b) Ingestion framework (Tier B, generalizing Tier C's gate seeding):
  adoption-mode steps read incumbent configs (lint configs, CI workflows,
  test setups, existing docs) and translate them into scaffold's docs with
  provenance annotations, Biome-migrate style; what cannot translate is
  listed, not guessed.
- **D11 — adoption mode + live init-mode (preset ships early, in R1).**
  A third content mode alongside fresh/update. Trigger: `init-mode:
  brownfield` (or `v1-migration`) in state AND the step not previously
  completed by scaffold. Mechanics: assembly injects a global adoption-mode
  preamble (read the repo first; extract facts with evidence; interview only
  for intent gaps; never propose rewrites of working code) — plus per-step
  `## Adoption Mode Specifics` blocks added incrementally, starting with the
  ~18 steps where adoption behavior differs materially (foundation +
  environment phases, create-prd/create-vision, domain-modeling,
  system-architecture, security, dev-env-setup, design-system).
  **Split across releases:** `content/methodology/brownfield.yml` — a preset
  in the existing step-overrides format (enablement only:
  foundation/environment/quality-first; doc-chain middle
  (modeling→specification) and parity/validation audits disabled by default,
  opt-in via the plan) — ships in **R1**, because D1's plan must resolve the
  pipeline through it (§6.1) and adopt must stop hardcoding `deep`. The
  content mode itself (preamble, per-step blocks, knowledge sensitivity) is
  the R3 deliverable. **init-mode staging is explicit:** in R1, `init-mode`
  gains its first real read-sides — adopt uses it to select the `brownfield`
  preset, and the dashboard's hardcoded `'greenfield'` is fixed; the
  assembly/knowledge read-side lands in R3, and until then the field's
  effect on *prompt content* is nil — stated in the R1 CHANGELOG (D16) so
  nobody expects adoption-mode prompts before R3.
- **D12 — gate-result cache by tree hash.** The daemon caches green gate
  results; a batch whose cache key matches a green entry skips the gate run
  (journal event `gate_cached`). **The key covers every input that selects
  or scopes tests**, not just the tree: `(candidate tree hash, base tree
  hash — because affected-selection diffs against `MQ_AFFECTED_BASE`, gate
  command string, quarantine file hash, TIA map content hash when TIA is
  active)`. Full-gate results (the poller, `full_gate_command`) use the
  simpler `(tree hash, command, quarantine hash)` key since selection inputs
  don't apply. Red results are never cached. The post-merge poller uses the
  full-gate cache: if the full gate already passed on `origin/main`'s exact
  tree (e.g. the daemon's final pre-land run), record and skip. Cache lives
  in `.mq/gate-cache.json`, size-capped, prunable.
- **D13 — conflict-aware batching + overlap zones.** The daemon records each
  queued PR's changed-file set (from `gh pr diff --name-only`, cached in the
  journal). `composeBatch` partitions so PRs with overlapping files never
  share a batch (greedy, preserving the existing low-risk-first order).
  Optional `merge_queue.overlap_zones:` globs in `.scaffold/agent-ops.yaml`
  (migrations, auth, schema, e.g. rumble's `index.html` `RUMBLE:*` hot file):
  a PR touching a zone is never batched with any other PR and lands only
  solo-gated; configurable `overlap_zone_policy: solo | hold` where `hold`
  parks it in a `HELD_HUMAN` state until `scaffold mq release --pr <N>`.
  Default `solo` (no human bottleneck by default).
- **D14 — layered TIA with a coverage-map feedback loop.** Selection layers:
  (1) convention map + always-run smoke set + infra-change ⇒ full;
  (2) static import graph where a runner supports it (vitest `--changed`,
  jest `--findRelatedTests`); (3) per-test coverage map, testmon-style:
  the post-merge poller's green full runs record which files each test
  executed (V8/c8 coverage) into `.mq/tia/map.json` keyed by content hashes.
  Recording is **config-gated with a conservative default**
  (`tia.record: scheduled | always | off`, default `scheduled` — e.g. only
  the first poller pass of the day), because coverage instrumentation
  measurably slows the authoritative full-suite run; the poller logs
  instrumented-vs-plain durations so the cost stays visible in `mq stats`.
  New command `scaffold tia affected --base <ref>` emits the selected test
  list + a confidence verdict; the D7 gate script consumes it and falls back
  to the full suite when the map is stale (commit distance / hash-miss ratio
  thresholds) or confidence is low. The post-merge full-suite net remains
  authoritative — TIA only accelerates the pre-merge gate. Selected sets are
  ordered most-likely-to-fail-first (recent failures, churned files) to speed
  batch bisection.
- **D15 — event-driven wake.** The daemon watches `.mq/` journal appends via
  `fs.watch` (debounced) so enqueues are picked up immediately; interval
  polling remains as fallback. After a landing, the daemon directly triggers
  one post-merge poller pass (it knows main moved) — the scheduler (D6)
  remains the safety net for merges from other machines. No new external
  dependencies (watchman deferred).
- **D16 — release/versioning.** Four minor releases in tier order (nominally
  3.48–3.51); Tier D items are independently shippable and may split. The R1
  CHANGELOG carries three prominent entries: the D1 adopt behavior change
  ("breaking behavior fix", plus a one-release notice printed when `adopt`
  runs without `--apply`), the D3 state-field migration
  (`artifacts_verified` → `verification`, automatic and one-way), and the
  D11 staging note (`init-mode` drives preset selection from R1 but does not
  change prompt content until R3).

## 6. Tier A — trust and verification

### 6.1 Adoption Plan (D1, D2)

Plan pipeline: detect project mode/type (existing `detector.ts` + detectors) →
apply any `--include <step>` requests **before** resolution → resolve the
pipeline via the `brownfield` preset (ships in R1 for exactly this reason,
per D11) + project-type overlays, like `complete`/`reset` do (fix: adopt
currently scans the unresolved 99-step superset) → run D3 verification for
every step in the resolved pipeline → propose per-step disposition. Steps
the preset disables are not dropped silently: the plan renders them in a
separate **"disabled by preset (opt-in)"** section listing each with its
`--include <step>` flag; because includes are applied before resolution and
keying, an accepted include changes the `plan_key` and forces re-approval,
keeping the drift contract intact. Dispositions:

| Disposition | Meaning | Example |
|---|---|---|
| `done (verified)` | all outputs + detect pass | github-setup with live origin |
| `conflict` | state or partial artifacts disagree with live checks | beads: CLAUDE.md present, `bd info` fails |
| `map-candidate` *(R3 — ships with D10; absent from R1/R2 plans)* | incumbent artifact could satisfy the step (D10a) | CONTRIBUTING.md → coding-standards |
| `run` | valuable; will be executed. From R3 the row is annotated with the resolved mode (`run — adoption mode`); in R1/R2 the disposition is the unannotated `run`, because adoption-mode prompt assembly does not exist before R3 (D11) and the plan never claims a mode it cannot deliver | tech-stack |
| `skip-proposed` | low value for this repo; opt back in with `--include <step>` | domain-modeling on a small PWA |
| `undetectable` | no outputs, no detect block | review-only steps |

**Staged renderer scope:** in R1 the plan renders step dispositions + the
live verification verdict + the follow-up commands (`adopt --apply`,
`doctor`) only. The ops-actions preview (components to install, hooks,
scheduler, bootstrap-merge requirement, with the exact file list) is added in
R2 when the D6–D9 commands it previews exist; the `plan_key` (D1) covers the
ops-action list from R2 onward. `--apply` executes only what the rendered
plan showed, enforced via the `plan_key` comparison defined in D1. Apply ends
by running `scaffold doctor` and printing its verdict — Terraform's
"done = clean plan" criterion.

### 6.2 Detection contracts (D3, D4)

Schema addition in `src/types/frontmatter.ts` + validation in `make validate`.
`completion.ts` gains `runDetect(step)` and becomes the single verification
path used by adopt, status, and doctor. Unit surface: schema validation, cmd
timeout/failure semantics, all/any composition, conflict propagation into
state reporting.

### 6.3 Doctor (D5)

`src/cli/commands/doctor.ts` + `src/doctor/` check registry; each check
declares: section, run(), severity, remediation string, optional fix().
Checks are skipped (not failed) when their subsystem is not installed
(no queue configured ⇒ queue section reports "not configured", exit unaffected).

## 7. Tier C — ops last mile

- **Scheduler (D6):** `src/sched/` with platform backends (launchd, systemd).
  Job definitions carry: label, command (absolute), interval, log paths,
  environment. The rumble plist becomes the golden test fixture.
- **Gate component (D7):** templates under `content/assets/agent-ops/gate/`;
  ingestion-lite parser for `package.json` scripts + `.github/workflows/*.yml`
  (extract test/lint commands as gate candidates, presented for confirmation).
- **Hooks (D8):** `src/core/hooks/install.ts` (JSON deep-merge, idempotent,
  atomic write); content prompts updated to call the command; bats/vitest
  coverage for merge semantics with pre-existing user hooks.
- **Bootstrap (D9):** subcommand in `src/cli/commands/mq.ts`; journal event
  types `bootstrap_intent` / `bootstrap_merged` / `bootstrap_armed` (D9);
  mq-guard message updated.
- Content updates: git-workflow, merge-throughput, beads, dev-env-setup
  prompts drop the manual jq/cron instructions in favor of the new commands
  (Mode Detection blocks updated accordingly).

## 8. Tier B — brownfield-native pipeline

- **Adoption mode (D11, R3 half):** `update-mode.ts` grows a third resolution
  (`fresh | update | adoption`); assembly injects the adoption preamble from a
  new `content/modes/adoption.md`; per-step `## Adoption Mode Specifics`
  blocks authored for the initial ~18 steps (editing-guidelines pattern
  extended: the block sits after Update Mode Specifics). (The
  `brownfield.yml` preset itself ships in R1 — see D11/§6.1; R3 only *reads*
  it here.)
- **Knowledge sensitivity:** knowledge-loader may append brownfield-specific
  entries when `init-mode` is brownfield (new `content/knowledge/core/
  brownfield-adoption.md` entry; injected for adoption-mode steps).
- **Ingestion + artifact map (D10):** `artifact_map` schema in config;
  verification honors mapped artifacts; ingestion helpers shared with D7.

## 9. Tier D — queue enhancements

Each independently shippable, in suggested order:

1. **Gate cache (D12)** — smallest, immediate latency win; touches
   `daemon.ts` gate paths + poller.
2. **Event wake + poller kick (D15)** — `fs.watch` + direct poller trigger on
   landing; removes the median 30s poll latency and most redundant poller
   wakeups.
3. **Conflict-aware batching + overlap zones (D13)** — `batch.ts`
   partitioning + config + `HELD_HUMAN`/`mq release` when `hold` policy used.
4. **TIA loop (D14)** — `scaffold tia` command + coverage recording in the
   poller + gate-script consumption; largest item, benefits from D12's cache
   plumbing.

## 10. Release mapping & dependencies

| Release | Content | Depends on |
|---|---|---|
| R1 (Tier A) | D1–D5: adopt plan/apply, detect contracts, doctor, state migration, `brownfield.yml` preset + init-mode preset/dashboard read-sides (D11's R1 half) | — |
| R2 (Tier C) | D6–D9: sched, gate component, hooks, bootstrap; adopt plan gains the ops-actions preview section | R1 (doctor verifies installs; plan renderer extended) |
| R3 (Tier B) | D10 + D11's content half: adoption mode, mapping/ingestion, assembly/knowledge init-mode read-side | R1 (plan dispositions, preset), R2 (gate ingestion generalizes) |
| R4 (Tier D) | D12–D15 (splittable) | R2 (gate scripts consume TIA; sched runs poller) |

Each release: spec'd tasks in its own implementation plan
(`docs/superpowers/plans/2026-07-19-brownfield-*.md`, one per tier), PR-per-plan
on fresh branches off main, mandatory MMR review, scaffold release flow per
operations runbook.

## 11. Risks & mitigations

- **Adopt behavior change breaks scripts calling `adopt` for side effects.**
  Mitigation: D16 notice, CHANGELOG, `--apply` migration one-liner; JSON plan
  output for automation.
- **`detect:` cmd execution cost/hangs.** Timeouts, parallel execution,
  failures = not-detected; trust boundary limits to shipped content.
- **Doctor false alarms train users to ignore it** (brew-doctor lesson).
  Severity tiers; "not configured" ≠ warning; every failure carries a
  copy-pasteable remediation.
- **Scheduler platform variance** (fnm paths, stub java, linger, disabled
  jobs). Absolute-path resolution at install + post-install verification +
  doctor heartbeat; rumble plist as fixture; `bootout || true` idempotency.
- **Adoption-mode content sprawl** (99 steps). Global preamble carries the
  default behavior; per-step blocks only where behavior materially differs
  (~18 initially); eval-suite additions guard the block-placement convention.
- **TIA false exclusions.** Full-suite post-merge net stays authoritative;
  staleness/confidence fallback to full; quarantine asymmetry preserved.
- **TIA coverage-recording overhead degrades the safety net.** Always-on
  instrumentation can slow a full suite severely enough that users disable
  the post-merge net. Mitigation: `tia.record` defaults to `scheduled`
  (periodic, not per-run), instrumented-vs-plain durations are logged and
  surfaced in `mq stats`, and `off` is a first-class setting.
- **Overlap-zone `hold` starves PRs.** Default policy `solo`; `hold` is
  explicit opt-in; `mq status` surfaces held PRs prominently.
- **Gate cache staleness/poisoning.** Key includes gate command + quarantine
  hash; green-only; tree hash is exact-content addressing; cap + prune.

## 12. Deferred (explicitly out of scope)

- Watchman-backed triggers; Dagger/container hermetic gate backend
  (Earthly is shut down — Dagger is the live option if ever needed).
- `scaffold hooks install --harness <name>` multi-harness registration —
  deferred until a non-Claude harness ships a hook-registration surface;
  until then those harnesses keep the printed `--check` wiring guidance (D8).
- Stacked-PR / stack-aware queue semantics.
- ML-based predictive test selection (heuristic ordering only, per D14).
- Deep v1-migration artifact mapping (`V1_ARTIFACT_MAP` build-out).
- Auto-translation of existing GitHub Actions workflows into local gates
  beyond command extraction (full workflow semantics are a fidelity trap —
  the `act` lesson).
