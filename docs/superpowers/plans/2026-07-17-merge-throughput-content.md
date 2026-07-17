# Merge-Throughput Content Layer Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the merge queue and cheap gate into what scaffold *generates*: pipeline prompts (D4′ replaces CI-deferral, `make check-affected` contract, D6 workspace layout, new `merge-throughput` step at order 335), the work-beads ship loop (enqueue replaces merge-slot), and knowledge entries — per spec §4, §6–§8 of `docs/superpowers/specs/2026-07-17-merge-throughput-design.md`.

**Architecture:** Content edits are TDD'd via a new content-assertion bats file (house pattern: `tests/git-workflow-guardrail-content.bats`) plus `make validate` and the preset vitest suites. The work-beads skill edits go to the canonical source (`content/agent-skills/work-beads/SKILL.md`) and are fanned out by `scripts/generate-agent-skills.mjs` (drift-gated). Depends on Plans 1–2 (the `scaffold mq` CLI and the `merge-queue`/`ci` components must exist for the prompts' instructions to be true).

**Tech Stack:** Markdown meta-prompts with zod-validated frontmatter, YAML presets, bats-core content tests, two bash spike scripts.

## Global Constraints

- **Frontmatter schema** (`src/project/frontmatter.ts` zod): `name` = filename stem (kebab-case, `^[a-z][a-z0-9-]*$`), `phase` must be one of the 16 PHASES slugs (`environment` exists — no PHASES change), `order` in the phase band (`environment` = 300–399), non-empty `outputs`.
- **Every document-creating prompt keeps Mode Detection + Update Mode Specifics blocks** positioned after the opening paragraph (Purpose/Inputs/Outputs/Quality Criteria/Methodology Scaling) and before the first content section — mirror `staging-environments.md`'s layout exactly for the new step.
- **Quality Criteria lines are tagged** `(mvp)`/`(deep)`/`(depth N+)`; Methodology Scaling defines deep, mvp, and custom:depth(1–5).
- **A new step must be enumerated in EVERY preset** (`content/methodology/mvp.yml`, `deep.yml`, `custom-defaults.yml`) — unknown step keys are hard errors, known-but-absent emits `presetMissingStep` warnings.
- **Skill edits go to `content/agent-skills/work-beads/SKILL.md` ONLY**; `content/skills/work-beads/*` is generated (`node scripts/generate-agent-skills.mjs`; `--check` is the drift gate).
- **Knowledge entries** need frontmatter (name, description, topics, volatility, last-reviewed, version-pin, sources with url+hash+retrieved) and dual-channel bodies (`## Summary` + `## Deep Guidance`); gated by `make validate-knowledge` and `scripts/check-reference-citations`.
- **Cross-doc consistency is load-bearing**: the ship-loop contract lives in work-beads SKILL, `git-workflow.md`, `claude-md-optimization.md`, and `multi-agent-coordination.md` — every task that changes one lists the mirrors it must keep consistent; `consolidation/workflow-audit.md` audits this.
- **CLAUDE.md doc counts** ("90 meta-prompt files … 16 phases", "278 domain expertise entries in 20 categories") must be bumped when the step/entry land (91, 279).
- Repo gates: `make validate && make test` per content task; `make check-all` before the final commit. Commit per task; do not push mid-plan.
- Branch: continue on `merge-throughput-design`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/spikes/turbo-worktree-cache-spike.sh` + results doc | Spike 2: Turborepo cache under concurrent worktree writers |
| `scripts/spikes/testmon-seed-spike.sh` + results doc | Spike 3: warm `.testmondata` seeding + rebase churn |
| `tests/merge-throughput-content.bats` | Content assertions for every prompt/skill/knowledge edit below |
| `content/knowledge/core/test-impact-analysis.md` | NEW knowledge entry: per-stack affected-testing recipes + safety rules |
| `content/pipeline/foundation/tdd.md` | Gate definitions gain `check-affected` + quarantine + post-merge net |
| `content/pipeline/foundation/project-structure.md` | D6: small-workspace default layout for TS |
| `content/pipeline/environment/dev-env-setup.md` | Makefile contract grows `check-affected` (+ its env/file contract) |
| `content/pipeline/environment/git-workflow.md` | D4′ text, mq merge procedure, mq-guard registration |
| `content/pipeline/environment/merge-throughput.md` | NEW conditional step (order 335): components, runner, docs/merge-queue.md |
| `content/agent-skills/work-beads/SKILL.md` | Steps 2.6/2.7/2.8: enqueue flow with merge-slot fallback |
| `content/pipeline/consolidation/claude-md-optimization.md` + `content/pipeline/finalization/implementation-playbook.md` | Ship-loop mirrors updated |
| `content/knowledge/core/git-workflow-patterns.md`, `content/knowledge/execution/multi-agent-coordination.md`, `content/knowledge/core/testing-strategy.md` | Knowledge mirrors updated |
| `content/methodology/{mvp,deep,custom-defaults}.yml` | New step enumerated |

---

### Task 1: Spike 2 — Turborepo cache under concurrent worktree writers

**Files:**
- Create: `scripts/spikes/turbo-worktree-cache-spike.sh`
- Create: `docs/superpowers/spikes/2026-07-17-turbo-worktree-cache.md`

**Interfaces:**
- Consumes: `node`/`npm` on the dev machine (network for `npm install turbo`).
- Produces: a recorded verdict consumed by Task 4 (knowledge entry) and Task 6 (project-structure): SAFE → turbo worktree-shared cache is the documented default; UNSAFE → the entry documents per-worktree caches + the ducktors remote-cache container as the sharing mechanism instead.

- [ ] **Step 1: Write the spike script**

```bash
#!/usr/bin/env bash
# Spike 2 (spec §10): is Turborepo's automatic git-worktree cache sharing safe
# under concurrent writers? Builds a scratch pnpm-less npm workspace with turbo,
# creates 4 linked worktrees, runs 8 concurrent cached `turbo run test`
# invocations, then asserts (a) no run failed, (b) a follow-up run is a FULL
# TURBO cache hit, (c) the cache dir holds no zero-byte/corrupt tarballs.
set -euo pipefail

command -v node >/dev/null 2>&1 || { echo "node required" >&2; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM
cd "$WORK"

git init -q -b main repo
cd repo
git config user.name spike
git config user.email spike@test.invalid

cat > package.json <<'EOF'
{
  "name": "turbo-spike",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": { "turbo": "^2" },
  "packageManager": "npm@10.0.0"
}
EOF
cat > turbo.json <<'EOF'
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "test": { "inputs": ["src/**"], "outputs": [] }
  }
}
EOF
for p in alpha beta gamma; do
  mkdir -p "packages/$p/src"
  cat > "packages/$p/package.json" <<EOF
{ "name": "$p", "version": "0.0.0", "scripts": { "test": "node src/test.js" } }
EOF
  cat > "packages/$p/src/test.js" <<'EOF'
let n = 0
for (let i = 0; i < 5e6; i++) n += i
console.log('ok', n)
EOF
done
npm install --silent
printf 'node_modules\n.turbo\n' > .gitignore
git add -A && git commit -qm base

for i in 1 2 3 4; do
  git worktree add -q "../wt$i" -b "agent/w$i" main
  # linked worktrees need their own node_modules for the turbo binary
  cp -R node_modules "../wt$i/node_modules"
done

echo "running 8 concurrent turbo test invocations across 4 worktrees…"
pids=()
for i in 1 2 3 4; do
  (cd "../wt$i" && npx turbo run test >"../wt$i.log" 2>&1) & pids+=($!)
  (cd "../wt$i" && npx turbo run test >"../wt$i-b.log" 2>&1) & pids+=($!)
done
fail=0
for pid in "${pids[@]}"; do wait "$pid" || fail=1; done
[ "$fail" -eq 0 ] || { echo "VERDICT: UNSAFE — a concurrent run failed (see $WORK/wt*.log)"; exit 1; }

# follow-up run in a fresh worktree must be a full cache hit
git worktree add -q ../wt5 -b agent/w5 main
cp -R node_modules ../wt5/node_modules
OUT="$(cd ../wt5 && npx turbo run test 2>&1)"
echo "$OUT" | grep -q 'FULL TURBO' || { echo "VERDICT: UNSAFE — no cross-worktree cache hit"; echo "$OUT"; exit 1; }

# corrupt artifact scan in the shared cache
if find .turbo/cache -type f -size 0 2>/dev/null | grep -q .; then
  echo "VERDICT: UNSAFE — zero-byte cache artifacts found"
  exit 1
fi
echo "VERDICT: SAFE — concurrent writers + cross-worktree FULL TURBO hit, no corrupt artifacts"
```

- [ ] **Step 2: Lint + run**

Run: `shellcheck scripts/spikes/turbo-worktree-cache-spike.sh && bash scripts/spikes/turbo-worktree-cache-spike.sh`
Expected: `VERDICT: SAFE …` (exit 0). On UNSAFE: record it and Tasks 4/6 use the per-worktree-cache wording (each task carries both wordings).

- [ ] **Step 3: Record results**

Write `docs/superpowers/spikes/2026-07-17-turbo-worktree-cache.md`: verdict line, turbo version (`npx turbo --version` from the scratch repo before it is cleaned, or rerun `npm view turbo version`), date, consumed-by pointers (Plan 3 Tasks 4 and 6).

- [ ] **Step 4: Commit**

```bash
git add scripts/spikes/turbo-worktree-cache-spike.sh docs/superpowers/spikes/2026-07-17-turbo-worktree-cache.md
git commit -m "spike: turborepo worktree cache concurrency (spec spike 2)"
```

### Task 2: Spike 3 — pytest-testmon warm-DB seeding + rebase churn

**Files:**
- Create: `scripts/spikes/testmon-seed-spike.sh`
- Create: `docs/superpowers/spikes/2026-07-17-testmon-seed.md`

**Interfaces:**
- Consumes: `python3` with `venv` module (network for `pip install pytest pytest-testmon`).
- Produces: verdict consumed by Task 4: SEEDING WORKS → knowledge entry documents the warm-DB copy in worktree setup; DEGRADED → entry documents cold-start per worktree with the first full run as the seed.

- [ ] **Step 1: Write the spike script**

```bash
#!/usr/bin/env bash
# Spike 3 (spec §10): does copying a warmed .testmondata into a fresh checkout
# give correct affected-selection, and does history rewriting (rebase-like
# churn) degrade gracefully (fall back to running more, never crash)?
set -euo pipefail

command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM
cd "$WORK"

python3 -m venv venv
./venv/bin/pip install --quiet pytest pytest-testmon

mkdir -p proj/src proj/tests
cat > proj/src/mod_a.py <<'EOF'
def add(a, b):
    return a + b
EOF
cat > proj/src/mod_b.py <<'EOF'
def mul(a, b):
    return a * b
EOF
cat > proj/tests/test_a.py <<'EOF'
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from mod_a import add
def test_add():
    assert add(1, 2) == 3
EOF
cat > proj/tests/test_b.py <<'EOF'
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from mod_b import mul
def test_mul():
    assert mul(2, 3) == 6
EOF

cd proj
# Warm the DB (full run)
../venv/bin/python -m pytest --testmon -q | tail -1

# "Worktree": copy of the project including the warmed .testmondata
cd ..
cp -R proj wt1
# Touch only mod_a in the worktree
cat > wt1/src/mod_a.py <<'EOF'
def add(a, b):
    return int(a) + int(b)
EOF
OUT="$(cd wt1 && ../venv/bin/python -m pytest --testmon -q 2>&1 | tail -3)"
echo "$OUT"
echo "$OUT" | grep -q '1 passed' || { echo "VERDICT: DEGRADED — seeded selection did not narrow to the affected test"; exit 1; }

# Rebase churn: replace file content wholesale (simulates history rewrite)
cp proj/src/mod_a.py wt1/src/mod_a.py
cat > wt1/src/mod_b.py <<'EOF'
def mul(a, b):
    return (a * b) + 0
EOF
OUT2="$(cd wt1 && ../venv/bin/python -m pytest --testmon -q 2>&1 | tail -3)"
echo "$OUT2"
echo "$OUT2" | grep -qE '(1 passed|2 passed)' || { echo "VERDICT: DEGRADED — post-churn run failed"; exit 1; }
echo "VERDICT: SEEDING WORKS — warm-DB copy narrows selection; churn degrades to re-running, never crashing"
```

- [ ] **Step 2: Lint + run**

Run: `shellcheck scripts/spikes/testmon-seed-spike.sh && bash scripts/spikes/testmon-seed-spike.sh`
Expected: `VERDICT: SEEDING WORKS …`. On DEGRADED, Task 4 uses the cold-start wording.

- [ ] **Step 3: Record results + commit**

Write `docs/superpowers/spikes/2026-07-17-testmon-seed.md` (verdict, pytest-testmon version from `./venv/bin/pip show pytest-testmon`, date, consumed-by: Plan 3 Task 4; also cite the worktree-setup hook: `setup-agent-worktree.sh`'s `worktree_setup_commands` is where the copy goes in generated projects).

```bash
git add scripts/spikes/testmon-seed-spike.sh docs/superpowers/spikes/2026-07-17-testmon-seed.md
git commit -m "spike: testmon warm-DB seeding + churn degradation (spec spike 3)"
```

### Task 3: Content-assertion bats file (the failing tests for Tasks 4–11)

**Files:**
- Create: `tests/merge-throughput-content.bats`

**Interfaces:**
- Produces: the executable spec for every content edit in this plan. Tasks 4–11 each turn a subset green; the whole file passes by Task 11.

- [ ] **Step 1: Write the bats file (all failing now — that is the point)**

```bash
#!/usr/bin/env bats
# tests/merge-throughput-content.bats — content contract for the merge-throughput
# generation layer (spec 2026-07-17-merge-throughput-design.md, Plan 3).

ROOT="$BATS_TEST_DIRNAME/.."

# --- Task 4: knowledge entry ---
@test "test-impact-analysis knowledge entry exists with dual-channel body" {
  F="$ROOT/content/knowledge/core/test-impact-analysis.md"
  [ -f "$F" ]
  grep -q '^name: test-impact-analysis$' "$F"
  grep -q '^## Summary$' "$F"
  grep -q '^## Deep Guidance$' "$F"
  grep -q 'check-affected' "$F"
  grep -q 'forceRerunTriggers' "$F"
  grep -q 'testmon' "$F"
  grep -q 'MQ_AFFECTED_BASE' "$F"
}

# --- Task 5: tdd.md ---
@test "tdd step defines the two-gate contract" {
  F="$ROOT/content/pipeline/foundation/tdd.md"
  grep -q 'make check-affected' "$F"
  grep -q 'quarantine' "$F"
  grep -q 'post-merge' "$F"
  grep -q 'test-impact-analysis' "$F"   # knowledge-base wiring
}

# --- Task 6: project-structure.md ---
@test "project-structure step carries the workspace-package default (D6)" {
  F="$ROOT/content/pipeline/foundation/project-structure.md"
  grep -qE '3.5 (workspace )?packages|workspace packages' "$F"
  grep -q 'affected' "$F"
}

# --- Task 7: dev-env-setup.md ---
@test "dev-env-setup requires check-affected in the Makefile contract" {
  F="$ROOT/content/pipeline/environment/dev-env-setup.md"
  grep -q 'check-affected' "$F"
  grep -q 'MQ_AFFECTED_BASE' "$F"
  grep -q '.mq-failed-tests.txt' "$F"
}

# --- Task 8: git-workflow.md (D4' + mq) ---
@test "git-workflow drops the CI-deferred framing for D4-prime" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  ! grep -q 'CI deferred' "$F"
  grep -q 'post-merge' "$F"
  grep -q 'self-hosted' "$F"
  grep -q 'local-poller' "$F"
}

@test "git-workflow routes merges through the queue" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  grep -q 'mq enqueue' "$F"
  grep -q 'mq-guard' "$F"
  ! grep -q 'bd merge-slot acquire --wait' "$F"
}

# --- Task 9: merge-throughput step ---
@test "merge-throughput step exists with correct frontmatter" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  [ -f "$F" ]
  grep -q '^name: merge-throughput$' "$F"
  grep -q '^phase: "environment"$' "$F"
  grep -q '^order: 335$' "$F"
  grep -q '^conditional: "if-needed"$' "$F"
  grep -q '## Mode Detection' "$F"
  grep -q '## Update Mode Specifics' "$F"
  grep -q 'docs/merge-queue.md' "$F"
  grep -q 'gate_executor' "$F"
  grep -q 'setup-gh-runner' "$F"
}

@test "merge-throughput step is enumerated in every preset" {
  grep -q 'merge-throughput:' "$ROOT/content/methodology/mvp.yml"
  grep -q 'merge-throughput:' "$ROOT/content/methodology/deep.yml"
  grep -q 'merge-throughput:' "$ROOT/content/methodology/custom-defaults.yml"
}

# --- Task 10: work-beads skill ---
@test "work-beads ship loop enqueues instead of merging when mq is installed" {
  F="$ROOT/content/agent-skills/work-beads/SKILL.md"
  grep -q 'make mq-enqueue' "$F"
  grep -q 'merge-slot' "$F"   # the fallback branch must survive
  grep -q 'check-affected' "$F"
}

@test "generated work-beads skills are in sync with the canonical source" {
  run node "$ROOT/scripts/generate-agent-skills.mjs" --check
  [ "$status" -eq 0 ]
}

# --- Task 11: mirrors ---
@test "claude-md-optimization ship-loop condensation enqueues" {
  grep -q 'mq-enqueue\|mq enqueue' "$ROOT/content/pipeline/consolidation/claude-md-optimization.md"
}

@test "knowledge mirrors describe the queue and keep merge-slot as fallback" {
  grep -q 'merge queue' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  grep -q 'fallback' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  ! grep -q 'CI is deliberately deferred' "$ROOT/content/knowledge/core/git-workflow-patterns.md"
}
```

- [ ] **Step 2: Run to verify the expected failures**

Run: `bats tests/merge-throughput-content.bats`
Expected: 12 of 13 FAIL (only the generate-agent-skills `--check` drift test passes today). This file is the scoreboard for the rest of the plan.

- [ ] **Step 3: Commit**

```bash
git add tests/merge-throughput-content.bats
git commit -m "test: content contract for the merge-throughput generation layer"
```

### Task 4: Knowledge entry `core/test-impact-analysis.md`

**Files:**
- Create: `content/knowledge/core/test-impact-analysis.md`

**Interfaces:**
- Consumes: Spike 1–3 verdicts (adjust the two marked sentences if a spike reported the degraded outcome).
- Produces: the per-stack recipe source referenced by `tdd.md` and `dev-env-setup.md` `knowledge-base:` lists (Tasks 5, 7).

- [ ] **Step 1: Write the entry**

```markdown
---
name: test-impact-analysis
description: >-
  Affected-only testing (test-impact analysis) for the merge gate: per-stack
  selection mechanisms, force-full-run triggers, cross-worktree result caching,
  and the post-merge safety net that keeps a cheap gate honest
topics:
  - testing
  - test-impact-analysis
  - affected-tests
  - caching
  - merge-queue
  - monorepo
volatility: volatile
last-reviewed: 2026-07-17
version-pin: null
sources:
  - url: https://vitest.dev/guide/cli
    anchor: '#changed'
    hash: <computed at implementation — see step 2>
    retrieved: 2026-07-17
  - url: https://turborepo.com/docs/reference/run
    anchor: '#--affected'
    hash: <computed at implementation — see step 2>
    retrieved: 2026-07-17
  - url: https://testmon.org/
    anchor: null
    hash: <computed at implementation — see step 2>
    retrieved: 2026-07-17
---

# Test-Impact Analysis (the cheap merge gate)

## Summary

The merge gate runs only the tests a diff can affect (`make check-affected`,
2–5 min); the full suite (`make check`) runs post-merge and nightly as the
safety net. Selection mechanism by stack: Vitest `--changed <base>` +
`forceRerunTriggers` (single-package TS), Turborepo `--affected` with declared
task `inputs` (multi-package TS — its cache is shared across git worktrees
automatically), pytest-testmon (Python — coverage-DB selection that survives
dynamic imports), moon (polyglot). Non-negotiables: e2e never runs in the
merge gate (tagged smoke subset at most); lockfiles, gate/tool config, shared
test utils, global setup, env files, and DB migrations always force a FULL
run; caches are accelerators, never truth — the post-merge run is uncached.
Quarantined flaky tests (`.mq/quarantine.txt`) are excluded from the gate and
still run post-merge.

## Deep Guidance

### The contract `make check-affected` must satisfy

- Selects tests affected relative to `${MQ_AFFECTED_BASE:-origin/main}` (the
  merge-queue daemon exports `MQ_AFFECTED_BASE`; default it for direct use).
- Falls back to the FULL `make check` when it cannot classify the change —
  any touched path matching the force-full list below, or the selector
  erroring, downgrades to full. Failing closed is what keeps a cheap gate
  trustworthy.
- On failure, MAY write failing test ids (one per line) to
  `.mq-failed-tests.txt` in the working directory — the merge queue reruns
  exactly those once to detect flakes; honoring `MQ_RETRY_TESTS` (comma-joined
  ids) on the rerun makes the retry cheap, ignoring it and rerunning the whole
  selection is also correct.
- Excludes test ids listed in `.mq/quarantine.txt` (one per line) when the
  file exists; the post-merge full run does NOT exclude them.

### Force-full-run triggers (every stack)

Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`),
the test runner / build tool / TIA tool config itself, shared test utilities
and fixtures (`src/test-utils/**`, `conftest.py`), global setup files, `.env*`,
`migrations/**`, and CI/workflow files.

### TS, single package — Vitest

`check-affected` runs `vitest run --changed "$BASE"`. Template
`forceRerunTriggers` so config-class changes escalate to a full suite:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    forceRerunTriggers: [
      '**/package-lock.json', '**/pnpm-lock.yaml', '**/vitest.config.*',
      '**/vite.config.*', '**/playwright.config.*', 'src/test-utils/**',
      '**/.env*', 'migrations/**',
    ],
  },
})
```

Known blind spots (why the post-merge net exists): non-literal dynamic
imports, env-driven behavior, data/asset files, snapshot inputs.

### TS, workspace (3–5 packages) — Turborepo

`check-affected` runs `npx turbo run test --affected` (with
`TURBO_SCM_BASE="$BASE"`). Declare `inputs` per task; leave `cacheDir` unset —
linked git worktrees then share the primary checkout's cache automatically, so
one agent's green result is another worktree's instant cache hit at the same
content hash. <!-- Spike 2 SAFE wording; if Spike 2 said UNSAFE replace this
sentence with: set a per-worktree cacheDir and share results through a
localhost ducktors/turborepo-remote-cache container instead. -->
Keep the graph honest with TypeScript project references (`tsc -b`) and
dependency-cruiser boundary rules (no cross-package deep imports, no cycles).

### Python — pytest-testmon

`check-affected` runs `pytest --testmon`; the wrapper forces plain full
`pytest` when any force-full trigger matched. Testmon's coverage DB
(`.testmondata`) is per-checkout and needs a warm seed: copy a warmed DB into
new worktrees via `worktree_setup_commands` (the agent-ops worktree setup
hook). <!-- Spike 3 wording; if Spike 3 said DEGRADED replace with: let each
worktree's first run be its (full) seed. --> Blind to static/data files (SQL,
templates, JSON fixtures) — cover those via the force-full list.

### Polyglot — moon

One task graph caches vitest, pytest, go test, cargo, and bats uniformly
(`toolchain: system` for anything). Declare explicit `inputs` per task
(default greedy `**/*` under-invalidates nothing but over-runs). Go's native
test cache stays enabled regardless — it is content-keyed and per-user.

### e2e and the gate

Playwright/e2e has no credible impact story: run a tagged smoke subset in the
gate at most; full e2e belongs post-merge/nightly.

### Before selecting less, make the suite faster

Profile once before tuning selection: worker/pool counts, moving e2e out of
`check`, splitting slow integration suites behind tags. 13k tests in 21
minutes often compresses 2–4× with zero selection risk.
```

- [ ] **Step 2: Compute the source hashes**

For each `sources[].url`, follow the existing citation convention (see any
entry, e.g. `core/git-workflow-patterns.md`, and `scripts/check-reference-citations`): fetch the page and record `sha256:<hex>`:

```bash
curl -fsSL https://vitest.dev/guide/cli | shasum -a 256
curl -fsSL https://turborepo.com/docs/reference/run | shasum -a 256
curl -fsSL https://testmon.org/ | shasum -a 256
```

Replace the three `<computed at implementation — see step 2>` values with `sha256:<hex>`. If `make validate-knowledge` or `scripts/check-reference-citations` computes/expects a different normalization, follow the tool — it is the authority.

- [ ] **Step 3: Validate + run the content test**

Run: `make validate-knowledge && bats tests/merge-throughput-content.bats -f "test-impact-analysis"`
Expected: validation green; the Task-4 bats test passes.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/core/test-impact-analysis.md
git commit -m "feat(knowledge): test-impact-analysis entry — cheap-gate recipes per stack"
```

### Task 5: `foundation/tdd.md` — the two-gate contract

**Files:**
- Modify: `content/pipeline/foundation/tdd.md`

- [ ] **Step 1: Edit frontmatter knowledge-base**

Change `knowledge-base: [testing-strategy]` → `knowledge-base: [testing-strategy, test-impact-analysis]`.

- [ ] **Step 2: Extend Quality Criteria**

After the line `- (mvp) Quality gates defined: list of commands to run before merge, with expected pass criteria for each` insert:

```markdown
- (mvp) Two-gate contract defined: `make check-affected` (fast, selection-based —
  the merge gate; falls back to full `make check` when it cannot classify a
  change) and `make check` (full, authoritative — post-merge and nightly, always
  uncached). Force-full-run triggers listed explicitly (lockfiles, tool config,
  shared test utils, global setup, env files, migrations)
- (mvp) e2e excluded from the merge gate (tagged smoke subset at most); full e2e
  runs post-merge/nightly
- (deep) Flake policy documented: quarantine list location (`.mq/quarantine.txt`),
  quarantined tests excluded from the merge gate but still run post-merge, with a
  fix-SLA convention
```

- [ ] **Step 3: Extend Methodology Scaling**

In the `**deep**` line, after `CI integration.` append: `Affected-test selection mechanism chosen per stack (see the test-impact-analysis knowledge entry) with declared inputs and force-full triggers.` In the `**mvp**` line, append: `Defines check-affected alongside check.`

- [ ] **Step 4: Validate + test + commit**

Run: `make validate && bats tests/merge-throughput-content.bats -f "tdd step"`
Expected: PASS.

```bash
git add content/pipeline/foundation/tdd.md
git commit -m "feat(pipeline): tdd step defines the two-gate (affected/full) contract"
```

### Task 6: `foundation/project-structure.md` — D6 workspace default

**Files:**
- Modify: `content/pipeline/foundation/project-structure.md`

- [ ] **Step 1: Extend Quality Criteria**

After `- (mvp) Module organization strategy chosen and justified (feature-based, layer-based, or hybrid)` insert:

```markdown
- (mvp) For TypeScript/Node projects: default to a small workspace of 3–5
  packages (e.g. `app`/`core`/`ui`) rather than a single blob — package
  boundaries are what make affected-test selection accurate and cacheable, and
  layout is cheap at day one but expensive to retrofit. Single-package is the
  documented exception (tiny scope, no parallel agents), not the default
- (deep) Boundary enforcement wired: TypeScript project references synced to the
  workspace graph and dependency-cruiser rules (no cross-package deep imports,
  no circular dependencies) — these keep graph-based test selection honest
```

- [ ] **Step 2: Extend Purpose**

Append one sentence to the Purpose paragraph: `The layout also serves the merge-throughput architecture: package boundaries drive affected-test selection (see the test-impact-analysis knowledge entry via tdd-standards).`

- [ ] **Step 3: Validate + test + commit**

Run: `make validate && bats tests/merge-throughput-content.bats -f "project-structure"`
Expected: PASS.

```bash
git add content/pipeline/foundation/project-structure.md
git commit -m "feat(pipeline): project-structure defaults TS projects to a small workspace (D6)"
```

### Task 7: `environment/dev-env-setup.md` — Makefile contract

**Files:**
- Modify: `content/pipeline/environment/dev-env-setup.md`

- [ ] **Step 1: Edit frontmatter knowledge-base**

Add `test-impact-analysis` to the step's `knowledge-base:` list.

- [ ] **Step 2: Extend the Makefile minimum**

Find the Quality Criteria line `- (mvp) Makefile/package.json includes at minimum: dev, test, lint targets` and change it to:

```markdown
- (mvp) Makefile/package.json includes at minimum: dev, test, lint, check,
  check-affected targets
- (mvp) `check-affected` honors the merge-queue contract: selects tests
  affected relative to `${MQ_AFFECTED_BASE:-origin/main}`; falls back to full
  `make check` when it cannot classify the change; excludes ids listed in
  `.mq/quarantine.txt`; on failure MAY write failing test ids to
  `.mq-failed-tests.txt` and SHOULD honor `MQ_RETRY_TESTS` on reruns (recipes
  per stack: test-impact-analysis knowledge entry)
```

- [ ] **Step 3: Add the Key Commands rows**

In the section that builds CLAUDE.md's Key Commands table (around the existing `make dev` row at ~line 109), add:

```markdown
| `make check-affected` | Fast merge gate: tests affected vs origin/main (falls back to full check) | Agent-safe |
| `make check` | Full authoritative gate (post-merge / nightly / when unsure) | Agent-safe |
```

- [ ] **Step 4: Validate + test + commit**

Run: `make validate && bats tests/merge-throughput-content.bats -f "dev-env-setup"`
Expected: PASS.

```bash
git add content/pipeline/environment/dev-env-setup.md
git commit -m "feat(pipeline): dev-env-setup requires the check-affected contract"
```

### Task 8: `environment/git-workflow.md` — D4′ + queue merge procedure

**Files:**
- Modify: `content/pipeline/environment/git-workflow.md`

This is the load-bearing rewrite. Four regions change; everything else stays.

- [ ] **Step 1: Frontmatter + Purpose**

- `summary:` — replace the final sentence (`CI is deliberately deferred to launch; the quality gate is local (pre-commit + make check + MMR review).`) with: `The merge gate is local and fast (pre-commit + make check-affected + MMR review, serialized through the scaffold mq merge queue); post-merge and nightly full-suite CI runs from day one on a $0 self-hosted runner (or a local poller).`
- Purpose paragraph — replace `and the local quality gate (pre-commit hooks + \`make check\` + agent self-review + \`mmr review\`) that stands in for CI until a launch target is chosen and automated CI is deliberately wired up.` with `and the two-layer quality architecture: a fast local merge gate (pre-commit hooks + \`make check-affected\` + agent self-review + \`mmr review\`) whose merges are serialized and batch-tested by the scaffold mq merge queue, plus day-one post-merge/nightly full-suite CI on a self-hosted runner (D4′ — see the merge-throughput step, order 335).`

- [ ] **Step 2: Rewrite generated-doc section 5 (Quality gates)**

Replace the entire numbered item 5 (`5. **Quality gates (CI deferred)** — … until then, this document is the gate.`) with:

```markdown
5. **Quality gates (two layers, D4′)** — the merge gate is local and fast:
   pre-commit hooks + `make check-affected` + agent self-review + `mmr
   review`, executed against the batch by the merge-queue daemon (below).
   The full `make check` runs post-merge on every landing and nightly —
   uncached — via `.github/workflows/post-merge.yml`/`nightly.yml` on a
   self-hosted runner ($0 Actions minutes; register with
   `scripts/ops/setup-gh-runner.sh`), or via the local poller
   (`make post-merge-watch`, cron/launchd) when
   `merge_queue.gate_executor: local-poller`. When post-merge goes red the
   queue pauses (`.mq/PAUSED`): fix forward or revert per docs/merge-queue.md,
   then remove the pause file. Note: on free-plan private repos GitHub offers
   no branch protection — the queue is enforced by convention + the mq-guard
   hook; GitHub Pro adds server-side protection if ever wanted.
```

- [ ] **Step 3: Rewrite generated-doc section 6 steps 6–7 (the queue)**

In item 6 (the 8-step PR workflow), replace the text from `-> (6) watch local gates` through `releasing after the merge` with:

```markdown
   -> (6) confirm the fast gate green on the branch HEAD (`make
   check-affected`; run full `make check` instead when you touched gate
   config, shared test utils, or anything in the force-full list) ->
   (7) **enqueue, never merge directly**: `make mq-enqueue PR=<N>` (or
   `scaffold mq enqueue --pr <N>`) and MOVE ON to the next task — the
   merge-queue daemon batch-tests the PR against latest `main` with peers,
   lands it on green (closing the bead), or ejects it with the failing log
   as a PR comment and reopens the bead for any agent to fix. Direct `gh pr
   merge` is blocked by the mq-guard hook; queue state: `scaffold mq
   status`. Fallback when the merge-queue component is not installed:
   serialize via `bd merge-slot` per the multi-agent-coordination knowledge
   entry
```

Also update item 12 (cheat sheet) to end with `make mq-enqueue PR=<N>` + `make main-sync && make prune-merged` instead of `gh pr merge --squash --delete-branch`.

- [ ] **Step 4: Add the mq-guard registration instruction**

After the bd-guard registration block (instruction 3, ending `…carry the prose rule.`), add:

```markdown
4. **Register the merge-queue guard** (only when the merge-queue component is
   installed — skip when `scripts/mq-guard.sh` is absent). Same merge
   discipline as bd-guard — never overwrite `.claude/settings.json`:
   ```bash
   if [ -x scripts/mq-guard.sh ]; then
     mkdir -p .claude
     [ -f .claude/settings.json ] || printf '{}\n' > .claude/settings.json
     if ! grep -q 'mq-guard.sh' .claude/settings.json; then
       tmp=$(mktemp)
       jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/mq-guard.sh"}]}])' \
         .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
     fi
   fi
   ```
   Other harnesses use `scripts/mq-guard.sh --check "<command>"`; the AGENTS.md
   operations core (claude-md-optimization) carries the prose rule ("enqueue,
   never `gh pr merge`").
```

- [ ] **Step 5: Update-mode conflict rule**

In `## Update Mode Specifics` → `**Conflict resolution**`, replace the sentence about "an automated CI workflow from before CI was deferred" with: `if the existing doc still carries the retired "Quality gates (CI deferred)" section or a merge-slot-serialized step 7, flag the discrepancy and replace them with the two-layer D4′ section and the enqueue flow only on explicit confirmation; verify the CLAUDE.md workflow section stays consistent after any changes`.

- [ ] **Step 6: Sweep the remaining CI-deferred anchors**

`grep -n 'CI deferred\|CI is deferred\|deliberately deferred' content/pipeline/environment/git-workflow.md` must return nothing. Known stragglers beyond Steps 1–5: the Expected Outputs bullet naming `the "Quality gates (CI deferred)" section` (rename to `the "Quality gates (two layers, D4′)" section`) and any Inputs/instruction prose echoing the old framing — rewrite each in the D4′ voice, preserving the surrounding sentence structure.

- [ ] **Step 7: Validate + tests + commit**

Run: `make validate && bats tests/merge-throughput-content.bats -f "git-workflow" && bats tests/git-workflow-guardrail-content.bats`
Expected: all PASS (the guardrail content tests assert the write-guard sections, which this task does not touch — if one fails, the edit clobbered an anchor; restore it).

```bash
git add content/pipeline/environment/git-workflow.md
git commit -m "feat(pipeline): git-workflow — D4' two-layer gates + merge-queue procedure"
```

### Task 9: New pipeline step `environment/merge-throughput.md` (order 335) + presets

**Files:**
- Create: `content/pipeline/environment/merge-throughput.md`
- Modify: `content/methodology/mvp.yml`, `content/methodology/deep.yml`, `content/methodology/custom-defaults.yml`

- [ ] **Step 1: Write the step file**

```markdown
---
name: merge-throughput
description: Install the merge queue and day-one post-merge CI so many agents merge without livelock
summary: "Installs the merge-queue agent-ops component (batching daemon shims, mq-guard, local poller) and — by default — day-one post-merge/nightly CI on a $0 self-hosted runner, then generates docs/merge-queue.md: the enqueue flow, ejection handling, pause-on-red runbook, flake quarantine, and calibration guidance."
phase: "environment"
order: 335
dependencies: [git-workflow]
outputs: [docs/merge-queue.md]
conditional: "if-needed"
knowledge-base: [git-workflow-patterns, multi-agent-coordination, test-impact-analysis]
reads: [dev-env-setup, tdd]
---

## Purpose
Give the project merge throughput that scales with parallel agents: a local
merge-queue daemon that batch-tests and lands PRs (agents enqueue and move on),
and a post-merge/nightly full-suite safety net that runs from day one. Applies
when the project expects 3+ concurrent agents (the same signal that enables the
worktree machinery); skip for solo projects — `bd merge-slot` suffices there.

## Inputs
- docs/git-workflow.md (required) — the enqueue-based PR workflow this step's
  runbook extends
- docs/tdd-standards.md (required) — the two-gate contract (`check-affected` /
  `check`) the queue executes
- .scaffold/agent-ops.yaml (required) — extended here with the `merge_queue:`
  section
- CLAUDE.md (required) — Key Commands table gains the mq targets

## Expected Outputs
- docs/merge-queue.md — how the queue works (enqueue → batch → land/eject),
  ejection recovery, the pause-on-red runbook (fix forward vs revert decision
  tree), flake quarantine policy, calibration via `scaffold mq stats`, and the
  deliberate-direct-merge procedure (`MQ_DIRECT_MERGE_OK=1`, human-only)
- Installed `merge-queue` component (+ `ci` component unless
  `gate_executor: local-poller`)
- `.scaffold/agent-ops.yaml` gains a `merge_queue:` section
- CLAUDE.md Key Commands rows for `make mq-enqueue` / `mq-status` / `mq-stats`
- Registered mq-guard hook (via the git-workflow step's instruction 4)

## Quality Criteria
- (mvp) `scaffold agent-ops install --component merge-queue` completed clean and
  `scaffold agent-ops check` passes
- (mvp) docs/merge-queue.md documents: enqueue-and-move-on, ejection → bead
  reopened → any agent fixes, NEVER `gh pr merge` directly, `.mq/PAUSED`
  semantics (NRS violation vs partial landing vs post-merge red) with the
  recovery for each
- (mvp) Engine-behavior facts from Plan 1 execution documented: a PR whose diff
  is already on the base is CANCELLED with a "close the PR" comment (not
  ejected); the `mq:ready` label enqueues only PRs the queue has never seen (or
  previously landed) — after an ejection, RE-LABELING DOES NOT RE-ENQUEUE;
  recovery is `scaffold mq enqueue --pr <N>` (or `make mq-enqueue`) after the
  fix, which remote agents must route through a colocated agent until a
  label-removal protocol exists
- (mvp) gate_executor decision recorded: `gha-selfhosted` (default — `ci`
  component installed, runner registration in the day-one checklist) or
  `local-poller` (poller scheduled via cron/launchd, no workflows)
- (mvp) batch_cap set consciously: 16 when `gate_command` is the affected gate,
  8 when it is the full gate (single knob — spec Plan-1 note)
- (deep) Post-merge-red drill documented: a deliberate red landing walked
  through fix-forward and revert paths in docs/merge-queue.md
- (deep) Calibration ritual: revisit batch_cap and gate timings from
  `scaffold mq stats` after the first week of multi-agent work

## Methodology Scaling
- **deep**: Full runbook with the red drill, calibration ritual, and the
  remote-agent seam (`mq:ready` label) documented.
- **mvp**: Install + minimal runbook (enqueue flow, ejection, pause recovery).
- **custom:depth(1-5)**:
  - Depth 1–2: as mvp.
  - Depth 3: + gate_executor rationale and quarantine policy.
  - Depth 4: + red drill.
  - Depth 5: + calibration ritual and remote-agent seam.

## Mode Detection
Update mode if docs/merge-queue.md exists. In update mode: re-run
`scaffold agent-ops install --component merge-queue` (and `ci` per
gate_executor) to refresh stale bundle files (`scaffold agent-ops check`
reports drift), preserve the project's tuned `merge_queue:` config values, and
re-generate only runbook sections whose upstream contracts changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/merge-queue.md exists
- **Preserve**: tuned `merge_queue:` values (batch_cap, poll_seconds, timeouts,
  gate_executor), quarantine list contents, any project-specific red-drill notes
- **Triggers for update**: `scaffold agent-ops check` reports a stale bundle,
  gate commands renamed in dev-env-setup, gate_executor switched
- **Conflict resolution**: if the project still documents lease- or
  merge-slot-serialized merging as primary, flag the discrepancy and replace
  with the enqueue flow only on explicit confirmation (merge-slot remains
  documented as the no-component fallback)

## Instructions

### 1. Decide the gate executor
Default `gha-selfhosted` (day-one CI on the user's own Mac, $0). Choose
`local-poller` only when the user explicitly refuses `.github/workflows/` —
record the choice in `.scaffold/agent-ops.yaml`:
```yaml
merge_queue:
  gate_command: "make check-affected"
  full_gate_command: "make check"
  batch_cap: 16          # 8 if gate_command is the full gate
  gate_executor: gha-selfhosted   # or local-poller
```

### 2. Install the components
```bash
scaffold agent-ops install --component merge-queue
# unless gate_executor is local-poller:
scaffold agent-ops install --component ci
scaffold agent-ops check
```
Then register the mq-guard hook per the git-workflow step's instruction 4.

### 3. Wire the executor
- `gha-selfhosted`: put `scripts/ops/setup-gh-runner.sh` in the day-one
  checklist in docs/dev-setup.md (it needs the human's gh admin auth once);
  until the runner registers, pushed workflows simply queue.
- `local-poller`: schedule `make post-merge-watch` every ~10 minutes via
  cron/launchd and document the schedule in docs/dev-setup.md.

### 4. Generate docs/merge-queue.md
Synthesize from the knowledge entries and the ACTUAL installed commands (never
invent): the enqueue flow (`make mq-enqueue PR=<N>` after mmr review passes;
move to the next bead immediately), what landing looks like (PR comment, bead
closed by the daemon), ejection recovery (failing log comment, bead reopened,
NEEDS_REBASE vs EJECTED vs CANCELLED-already-applied; re-enqueue after the fix
— a lingering `mq:ready` label does NOT re-enqueue an ejected PR), `.mq/PAUSED`
semantics and recovery (NRS violation: investigate tree divergence before
unpausing; partial landing: verify the base with the post-merge suite first;
post-merge red: fix forward or revert, then `rm .mq/PAUSED`), flake quarantine (`.mq/quarantine.txt`, auto
bead, fix-SLA), calibration (`scaffold mq stats`), and the deliberate
direct-merge procedure (human-only). Close with a short **Alternatives**
note (spec D2): Mergify's free tier (private repos, ≤5 active contributors —
agents sharing one identity count once) offers a SaaS merge queue with
speculative batching for projects wanting GitHub-visible queue state or
multi-machine agents from day one; caveats — proprietary control plane in the
critical path, free-tier tolerance for continuous agent PR volume unverified —
which is why the local daemon is the default.

### 5. Update CLAUDE.md
Key Commands rows: `make mq-enqueue PR=<n>`, `make mq-status`, `make mq-stats`,
plus (local-poller only) `make post-merge-watch`. Cross-reference
docs/merge-queue.md from the Committing/PR Workflow section.
```

- [ ] **Step 2: Enumerate in every preset**

In each of `mvp.yml`, `deep.yml`, `custom-defaults.yml`, add directly under the `git-workflow:` line (Phase 3 block):
- `mvp.yml`: `  merge-throughput: { enabled: false }`
- `deep.yml`: `  merge-throughput: { enabled: true, conditional: "if-needed" }`
- `custom-defaults.yml`: match the file's own row format for `staging-environments` (same enabled/conditional shape that step uses there).

- [ ] **Step 3: Validate + tests + commit**

Run: `make validate && npx vitest run tests/ -t preset 2>/dev/null || npm test; bats tests/merge-throughput-content.bats -f "merge-throughput step"`
Expected: frontmatter validation green, the preset vitest suites green (they discover steps dynamically and check preset completeness), both Task-9 bats tests PASS.

```bash
git add content/pipeline/environment/merge-throughput.md content/methodology/mvp.yml content/methodology/deep.yml content/methodology/custom-defaults.yml
git commit -m "feat(pipeline): merge-throughput step (order 335) — queue + day-one CI install"
```

### Task 10: work-beads ship loop — enqueue, never merge

**Files:**
- Modify: `content/agent-skills/work-beads/SKILL.md`
- Regenerate: `content/skills/work-beads/*` via `node scripts/generate-agent-skills.mjs`

- [ ] **Step 1: Rewrite step 2.6**

Replace the 2.6 paragraph (`**2.6 Verify yourself:** \`make check\` green on the branch HEAD…`) keeping the Docker-contention sentences, with the gate swapped:

```markdown
**2.6 Verify yourself:** `make check-affected` green on the branch HEAD,
personally watched — a subagent's or reviewer's claim doesn't count. Run full
`make check` instead when you touched gate config, shared test utils, env
files, or migrations (the force-full list in docs/tdd-standards.md) — and
whenever in doubt. Docker contention (testcontainer timeouts, DockerException)
is not a code defect: `make docker-doctor` → `make tc-reap && make
staging-prune` → re-run. Never enqueue on a red gate. Never `docker system
prune`. Long local test loops run at reduced priority so the merge lane stays
fast on a saturated machine: `taskpolicy -c utility make check-affected`
(macOS; skip the wrapper where `taskpolicy` is absent).
```

- [ ] **Step 2: Rewrite step 2.7's merge mechanics**

Keep the mmr-review bullets (review contract, round budget, degraded-pass) unchanged. Replace everything from `- If the project has a merge slot…` through the final `…running it from the primary would be wrong anyway).` with:

```markdown
- **Merge queue installed** (`scripts/mq-guard.sh` exists — the
  merge-throughput step installs it): after the review passes, tear down
  staging first if you brought a stack up this bead (from INSIDE the worktree:
  `make staging-down`; skip when staging was never installed or never started —
  a non-zero exit then must not block the enqueue). Then **enqueue and move
  on**: `make mq-enqueue PR=<N>`. Do NOT merge, do NOT wait, do NOT rebase in
  a loop — the daemon batch-tests against latest main, lands green PRs
  (closing your bead and commenting on the PR), and on ejection comments the
  failing log and REOPENS the bead so any agent picks up the fix.
  `NEEDS_REBASE` ejection means your PR no longer applies onto main: rebase,
  push, re-enqueue. Queue state: `scaffold mq status` (a `.mq/PAUSED` banner
  means merges are held — read docs/merge-queue.md before touching anything).
  Never run `gh pr merge` yourself — the mq-guard hook blocks it; the
  deliberate-override procedure is in docs/merge-queue.md and is human-only.
- **No merge queue** (`scripts/mq-guard.sh` absent): fall back to the
  serialized manual merge. If the project has a merge slot (`bd merge-slot
  check` reports one), serialize EVERY merge: loop on `bd merge-slot acquire`
  until it succeeds (acquire does NOT block; `--wait` only queues you), then
  re-verify with `bd merge-slot check --json`, merge with `gh pr merge <N>
  --squash --delete-branch`, then `bd merge-slot release` — release even if
  the merge fails, with ONE holder identity across acquire → merge → release
  (a fresh per-command `$$` strands the slot). Tear down staging first from
  inside the worktree exactly as above. Then from the primary:
  `make main-sync && make prune-merged`.
```

- [ ] **Step 3: Rewrite step 2.8**

Replace the 2.8 paragraph with:

```markdown
**2.8 Close out:** With the merge queue, the DAEMON closes the bead when the
PR lands — do not `bd close` an enqueued bead yourself; confirm later via
`scaffold mq status --pr <N>` or `bd show <id>`, and treat a reopened bead as
the ejection signal. Without the queue (fallback path), close manually from
the primary after the merge is verified: `bd close <id>`. Noticed a repo-file
fix after merging? Micro follow-up PR; never edit the primary checkout
directly.
```

Also in **Step 3 — Batch report**, extend the `Beads:` line's status vocabulary with `enqueued (PR #<n> awaiting queue)` so agents report fire-and-forget beads honestly.

- [ ] **Step 4: Regenerate + verify + commit**

Run: `node scripts/generate-agent-skills.mjs && node scripts/generate-agent-skills.mjs --check && bats tests/merge-throughput-content.bats -f "work-beads"`
Expected: regen clean, drift check exit 0, both bats tests PASS.

```bash
git add content/agent-skills/work-beads/SKILL.md content/skills/
git commit -m "feat(skill): work-beads ships via mq enqueue (merge-slot fallback preserved)"
```

### Task 11: Mirrors — claude-md-optimization, implementation-playbook, knowledge entries

**Files:**
- Modify: `content/pipeline/consolidation/claude-md-optimization.md`
- Modify: `content/pipeline/finalization/implementation-playbook.md`
- Modify: `content/knowledge/core/git-workflow-patterns.md`
- Modify: `content/knowledge/execution/multi-agent-coordination.md`
- Modify: `content/knowledge/core/testing-strategy.md`

- [ ] **Step 1: claude-md-optimization.md**

In the ship-loop condensation (the numbered list around line 190), replace step 6's text `Review + merge: \`mmr review --pr <N> --sync --format json\` (3-round cap, degraded-pass self-merge past the cap); \`gh pr merge --squash --delete-branch\`` with:

```markdown
   6. Review + enqueue: `mmr review --pr <N> --sync --format json` (3-round
      cap, degraded-pass past the cap), then `make mq-enqueue PR=<N>` and move
      on — the queue lands or ejects; NEVER `gh pr merge` directly (mq-guard
      blocks it). Fallback without the queue: merge-slot-serialized
      `gh pr merge --squash --delete-branch`
```

Also add one AGENTS.md hard rule to the parallel-safety rules list this step relocates: `Merges go through the queue: enqueue and move on; direct gh pr merge is blocked.`

- [ ] **Step 2: implementation-playbook.md**

Update the (mvp) routing criterion's loop description from `(claim → worktree → build → verify → review → merge → close)` to `(claim → worktree → build → verify → review → enqueue → close-on-land)`. Where the playbook lists quality gates, ensure `make check-affected` appears as the pre-enqueue gate with full `make check` as the authoritative/post-merge suite.

- [ ] **Step 3: git-workflow-patterns.md (knowledge)**

- Line ~40 (`…and PR review; CI is deliberately deferred until a launch target is chosen`): replace with `…and PR review; the merge gate is local and fast (check-affected through the merge queue) while post-merge and nightly full-suite CI runs from day one on a self-hosted runner`.
- Line ~99: replace the clause `CI is deliberately deferred until a launch target is chosen` (read the full surrounding sentence first) with `the full suite runs post-merge and nightly — uncached — on the self-hosted runner or local poller`, keeping the rest of the sentence intact. Then `grep -n 'deliberately deferred' content/knowledge/core/git-workflow-patterns.md` must return nothing.
- Add a short `## Merge queues for agent fleets` subsection to Deep Guidance: batch-then-bisect in one paragraph (candidate = latest main + batch, one gate run, land on green with the landed-tree == tested-tree invariant, bisect on red, flake retry-once), why serialization alone caps throughput (the lease/livelock story in two sentences), and the enqueue-and-move-on agent contract.
- Bump `last-reviewed: 2026-07-17`.

- [ ] **Step 4: multi-agent-coordination.md (knowledge)**

- In the `## \`bd merge-slot\` — serialized merge resolution` section, insert as the first paragraph: `**Superseded by the scaffold mq merge queue when the merge-throughput component is installed** — the queue batch-tests and lands PRs itself (agents enqueue and move on), which raises merge throughput instead of just serializing it. merge-slot remains the fallback for projects without the component; everything below applies to that fallback.`
- Update the line-67 rule (`Serialize EVERY merge through \`bd merge-slot\` whenever the project has a slot…`) to open with `On the fallback path (no merge queue installed), serialize EVERY merge…`.
- Bump `last-reviewed: 2026-07-17`.

- [ ] **Step 5: testing-strategy.md (knowledge)**

Add to Deep Guidance a `### The two-gate architecture` subsection (~8 lines): merge gate = affected-only selection (pointer to the test-impact-analysis entry for recipes), full suite = post-merge + nightly uncached, force-full triggers, e2e out of the gate, flake quarantine excluded from the gate but not from post-merge. Bump `last-reviewed: 2026-07-17`.

- [ ] **Step 6: Validate + tests + commit**

Run: `make validate-knowledge && make validate && bats tests/merge-throughput-content.bats`
Expected: ALL 13 content tests now PASS.

```bash
git add content/pipeline/consolidation/claude-md-optimization.md content/pipeline/finalization/implementation-playbook.md content/knowledge/core/git-workflow-patterns.md content/knowledge/execution/multi-agent-coordination.md content/knowledge/core/testing-strategy.md
git commit -m "feat(content): ship-loop and knowledge mirrors follow the enqueue contract"
```

### Task 12: Counts, changelog, final gate

**Files:**
- Modify: `CLAUDE.md` (doc counts + When-to-Consult table)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the CLAUDE.md counts**

- `content/pipeline/` — 90 meta-prompt files → **91** (both occurrences: Project Overview and Source of Truth).
- `content/knowledge/` — 278 domain expertise entries → **279**.

- [ ] **Step 2: Append to the CHANGELOG Unreleased Added section**

```markdown
- Generation layer for merge throughput: new `merge-throughput` pipeline step
  (environment/335, if-needed) installing the queue + day-one CI; `make
  check-affected` two-gate contract in tdd/dev-env-setup; TS projects default
  to a 3–5-package workspace; work-beads ships via `mq enqueue` (merge-slot
  fallback preserved); new `test-impact-analysis` knowledge entry; D4
  (CI-deferred) superseded by D4′ per
  docs/superpowers/specs/2026-07-17-merge-throughput-design.md.
```

- [ ] **Step 3: Full gate**

Run: `make check-all`
Expected: everything green — including `tests/merge-throughput-content.bats` (13/13), preset suites, knowledge validation, ShellCheck on the two spike scripts, and the workflow-audit-adjacent content tests.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: counts + changelog for the merge-throughput content layer"
```

---

## Execution notes

- Order: (1, 2 — spikes, parallelizable) → 3 → 4 → (5, 6, 7 in any order) → 8 → 9 → 10 → 11 → 12. Task 3's bats file is the scoreboard: each subsequent task names the filter (`-f`) that must flip to green.
- **Spike verdicts change wording, not structure**: Tasks 4/6 carry both wordings inline as HTML comments — delete the branch that doesn't apply, never leave both.
- Task 8 is the riskiest edit (largest live prompt): the guardrail bats file (`tests/git-workflow-guardrail-content.bats`) and `beads-pipeline-content.bats` must stay green — they pin sections this task must not disturb.
- The three plans ship as one release: after this plan's final gate, the PR flow is `git push -u origin HEAD` → `gh pr create` → mandatory `mmr review` per CLAUDE.md → merge on pass/degraded-pass → the scaffold release runbook (operations-runbook.md) for vNEXT with CHANGELOG + README when cut.
- Generated-project adoption note for the release notes: existing projects get the new behavior via `scaffold agent-ops install --component merge-queue` (+ `ci`) and re-running the git-workflow/merge-throughput steps in update mode — nibble can adopt the same way.


