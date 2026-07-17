# Merge-Queue Agent-Ops Component + Day-One CI Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the installable project-side surface of the merge queue (spec §5.1 shims, §5.6 guard, §6 day-one CI, D4′): two new agent-ops components — `merge-queue` (make targets, mq-guard hook, local post-merge poller) and `ci` (post-merge + nightly workflows, self-hosted runner setup) — plus the `gate_executor` config key.

**Architecture:** Extends the existing manifest-tracked template bundle (`content/assets/agent-ops/` + `src/core/agent-ops/install.ts`). Everything rides the existing `{{KEY}}` resolution, no-clobber manifest semantics, and `[agent-safe]`/`[ask-first]` make conventions. Depends on Plan 1 (`docs/superpowers/plans/2026-07-17-merge-queue-engine.md`): the `scaffold mq` CLI must exist for the make targets to call, and `MergeQueueConfig` (Plan 1 Task 2/5) gains one key here.

**Tech Stack:** TypeScript + vitest for installer changes; bash + ShellCheck + bats-core for templates; GitHub Actions YAML (self-hosted runners only — $0).

## Global Constraints

- **Backcompat: `--component all` (and no flag) stays `['git', 'staging']`.** Existing projects re-running `scaffold agent-ops install` must NOT suddenly receive workflows or the guard. `merge-queue` and `ci` are explicit opt-ins (Plan 3's pipeline step requests them).
- Bundled scripts: `set -euo pipefail`, default branch from `origin/HEAD` (never hardcode `main`), feature-detect `gh`/`jq`/`scaffold` (graceful degradation or loud clear error — never a silent wrong action), idempotent re-runs.
- Make targets carry `## [agent-safe]` / `[ask-first]` doc-comments and self-guard (the fragment installs for ANY component — see `staging_guard` precedent in `content/assets/agent-ops/make/agent-ops.mk.tmpl`).
- Guards are **accident nets, not security boundaries** (bd-guard lesson): mask quoted literals to avoid false positives, document deliberate-construct limits in the header, print NO override recipe in the block message.
- Unknown `{{KEY}}` markers pass through verbatim — every new marker MUST be added to `buildTemplateVars` in `src/core/agent-ops/install.ts`.
- Repo gates per task: `npm run check` for TS tasks, `make lint && make test` for bash tasks; `make check-all` before the final commit. Commit per task; do not push mid-plan.
- Branch: continue on `merge-throughput-design`.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/agent-ops/install.ts` | +`merge-queue`/`ci` components, `.mq/` gitignore, `DEFAULT_BRANCH`/`FULL_GATE_COMMAND` template vars |
| `src/cli/commands/agent-ops.ts` | `resolveComponents` accepts the new names |
| `src/merge-queue/types.ts` + `src/core/agent-ops/config.ts` | `gate_executor` key on `merge_queue:` |
| `content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl` | PreToolUse/`--check` guard routing `gh pr merge` through the queue |
| `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl` | `local-poller` gate executor: full suite on main movement, pause-on-red |
| `content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl` | Register this Mac as a persistent self-hosted runner (svc.sh/launchd) |
| `content/assets/agent-ops/ci/post-merge.yml.tmpl` | Push-to-default-branch full uncached gate, coalescing concurrency |
| `content/assets/agent-ops/ci/nightly.yml.tmpl` | Nightly full + e2e + flake report |
| `content/assets/agent-ops/make/agent-ops.mk.tmpl` | +`mq-*` targets and `post-merge-watch` |
| `tests/agent-ops-merge-queue.bats` | Guard matrix, poller behavior, template content checks |

---

### Task 1: Component plumbing (installer + CLI + template vars)

**Files:**
- Modify: `src/core/agent-ops/install.ts`
- Modify: `src/cli/commands/agent-ops.ts:14-18` (`resolveComponents`)
- Test: `src/core/agent-ops/install.test.ts` (append), `src/cli/commands/agent-ops.test.ts` (append)

**Interfaces:**
- Consumes: existing `AGENT_OPS_FILE_MAP`, `buildTemplateVars`, `installAgentOps` internals (unchanged flow).
- Produces:
  - `AgentOpsComponent = 'git' | 'staging' | 'merge-queue' | 'ci'`
  - FILE_MAP entries (Tasks 3–7 create the template sources; until then installs of the new components error with "template source missing", which existing machinery already reports — that is fine mid-plan):
    - `merge-queue/mq-guard.sh.tmpl` → `scripts/mq-guard.sh` (executable)
    - `merge-queue/post-merge-poller.sh.tmpl` → `scripts/ops/post-merge-poller.sh` (executable)
    - `ci/setup-gh-runner.sh.tmpl` → `scripts/ops/setup-gh-runner.sh` (executable)
    - `ci/post-merge.yml.tmpl` → `.github/workflows/post-merge.yml`
    - `ci/nightly.yml.tmpl` → `.github/workflows/nightly.yml`
  - `buildTemplateVars(config, projectRoot?)` adds `DEFAULT_BRANCH` (from `git rev-parse --abbrev-ref origin/HEAD`, fallback `main`) and `FULL_GATE_COMMAND` (from `config.merge_queue.full_gate_command`)
  - `installAgentOps` appends `.mq/` to `.gitignore` when the `merge-queue` component is requested (idempotent)

- [ ] **Step 1: Write the failing tests (append to install.test.ts)**

```typescript
describe('merge-queue and ci components', () => {
  it('registers the new file-map entries with correct dests', () => {
    expect(AGENT_OPS_FILE_MAP['merge-queue/mq-guard.sh.tmpl']).toEqual({
      dest: 'scripts/mq-guard.sh', component: 'merge-queue', executable: true,
    })
    expect(AGENT_OPS_FILE_MAP['merge-queue/post-merge-poller.sh.tmpl']).toEqual({
      dest: 'scripts/ops/post-merge-poller.sh', component: 'merge-queue', executable: true,
    })
    expect(AGENT_OPS_FILE_MAP['ci/setup-gh-runner.sh.tmpl']).toEqual({
      dest: 'scripts/ops/setup-gh-runner.sh', component: 'ci', executable: true,
    })
    expect(AGENT_OPS_FILE_MAP['ci/post-merge.yml.tmpl']).toEqual({
      dest: '.github/workflows/post-merge.yml', component: 'ci', executable: false,
    })
    expect(AGENT_OPS_FILE_MAP['ci/nightly.yml.tmpl']).toEqual({
      dest: '.github/workflows/nightly.yml', component: 'ci', executable: false,
    })
  })

  it('adds .mq/ to .gitignore when installing merge-queue, idempotently', () => {
    const root = tmpProjectDir() // reuse/create the test helper that makes a temp project dir
    const templateRoot = tmpTemplates({
      'merge-queue/mq-guard.sh.tmpl': '#!/usr/bin/env bash\necho guard\n',
      'merge-queue/post-merge-poller.sh.tmpl': '#!/usr/bin/env bash\necho poll\n',
      'make/agent-ops.mk.tmpl': '# mk\n',
    })
    installAgentOps(root, { components: ['merge-queue'], templateRoot })
    installAgentOps(root, { components: ['merge-queue'], templateRoot })
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(ignore.split('\n').filter(l => l === '.mq/')).toHaveLength(1)
  })

  it('does NOT touch .gitignore for git/staging installs', () => {
    const root = tmpProjectDir()
    const templateRoot = tmpTemplates({ 'make/agent-ops.mk.tmpl': '# mk\n' })
    installAgentOps(root, { components: ['git'], templateRoot })
    expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false)
  })
})

describe('buildTemplateVars extensions', () => {
  it('provides FULL_GATE_COMMAND from merge_queue config', () => {
    const vars = buildTemplateVars(defaultAgentOpsConfig('/tmp/x'))
    expect(vars.FULL_GATE_COMMAND).toBe('make check')
  })

  it('DEFAULT_BRANCH falls back to main outside a repo with origin/HEAD', () => {
    const vars = buildTemplateVars(defaultAgentOpsConfig('/tmp/x'), '/tmp/definitely-not-a-repo')
    expect(vars.DEFAULT_BRANCH).toBe('main')
  })
})
```

Helper notes for the engineer: `install.test.ts` already builds temp projects and fake template roots for its existing cases — read the file first and reuse its helpers if equivalent ones exist; otherwise add these two at the top of the new describe block:

```typescript
function tmpProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-proj-'))
}
function tmpTemplates(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-tmpl-'))
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, body)
  }
  return root
}
```

Import `defaultAgentOpsConfig` from `./config.js`.

Also append to `src/cli/commands/agent-ops.test.ts`:

```typescript
describe('resolveComponents — new components', () => {
  it('accepts merge-queue and ci individually', () => {
    expect(resolveComponents('merge-queue')).toEqual(['merge-queue'])
    expect(resolveComponents('ci')).toEqual(['ci'])
  })
  it('keeps all/undefined as git+staging (backcompat — no surprise installs)', () => {
    expect(resolveComponents(undefined)).toEqual(['git', 'staging'])
    expect(resolveComponents('all')).toEqual(['git', 'staging'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/agent-ops/install.test.ts src/cli/commands/agent-ops.test.ts`
Expected: FAIL — missing FILE_MAP keys, unknown component error, missing vars.

- [ ] **Step 3: Implement**

In `src/core/agent-ops/install.ts`:

```typescript
// widen the union
export type AgentOpsComponent = 'git' | 'staging' | 'merge-queue' | 'ci'

// append to AGENT_OPS_FILE_MAP (after the staging entries):
  'merge-queue/mq-guard.sh.tmpl': {
    dest: 'scripts/mq-guard.sh',
    component: 'merge-queue',
    executable: true,
  },
  'merge-queue/post-merge-poller.sh.tmpl': {
    dest: 'scripts/ops/post-merge-poller.sh',
    component: 'merge-queue',
    executable: true,
  },
  'ci/setup-gh-runner.sh.tmpl': {
    dest: 'scripts/ops/setup-gh-runner.sh',
    component: 'ci',
    executable: true,
  },
  'ci/post-merge.yml.tmpl': {
    dest: '.github/workflows/post-merge.yml',
    component: 'ci',
    executable: false,
  },
  'ci/nightly.yml.tmpl': {
    dest: '.github/workflows/nightly.yml',
    component: 'ci',
    executable: false,
  },
```

```typescript
// buildTemplateVars: add projectRoot param + two vars
import { execFileSync } from 'node:child_process'

function resolveDefaultBranch(projectRoot: string | undefined): string {
  if (!projectRoot) return 'main'
  try {
    const ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
      cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return ref.replace(/^origin\//, '') || 'main'
  } catch {
    return 'main'
  }
}

export function buildTemplateVars(
  config: AgentOpsConfig,
  projectRoot?: string,
): Record<string, string> {
  // ...existing body unchanged, plus in the returned object:
    DEFAULT_BRANCH: resolveDefaultBranch(projectRoot),
    FULL_GATE_COMMAND: config.merge_queue.full_gate_command,
}
```

```typescript
// gitignore idempotent append + wiring in installAgentOps
const GITIGNORE_MQ_ENTRY = '.mq/'

function ensureGitignoreEntry(projectRoot: string, entry: string): void {
  const p = path.join(projectRoot, '.gitignore')
  const body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  if (body.split('\n').includes(entry)) return
  const sep = body === '' || body.endsWith('\n') ? '' : '\n'
  fs.writeFileSync(p, `${body}${sep}${entry}\n`)
}

// in installAgentOps: change `const vars = buildTemplateVars(config)` to
//   const vars = buildTemplateVars(config, projectRoot)
// and after `if (opts.components.length > 0) ensureMakefileInclude(projectRoot)` add:
  if (opts.components.includes('merge-queue')) ensureGitignoreEntry(projectRoot, GITIGNORE_MQ_ENTRY)
```

In `src/cli/commands/agent-ops.ts` replace `resolveComponents`:

```typescript
export function resolveComponents(raw: string | undefined): AgentOpsComponent[] {
  // 'all'/default stays git+staging on purpose: merge-queue and ci are explicit
  // opt-ins so upgrade re-installs never surprise existing projects with
  // workflows or merge guards.
  if (raw === undefined || raw === 'all') return ['git', 'staging']
  if (raw === 'git' || raw === 'staging' || raw === 'merge-queue' || raw === 'ci') return [raw]
  throw new Error(`unknown component "${raw}" (expected git, staging, merge-queue, ci, or all)`)
}
```

Also update the yargs option help text in the same file: `describe: 'git | staging | merge-queue | ci | all (default all = git+staging)'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/agent-ops/ src/cli/commands/agent-ops.test.ts && npm run type-check`
Expected: PASS, type-check clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-ops/install.ts src/core/agent-ops/install.test.ts src/cli/commands/agent-ops.ts src/cli/commands/agent-ops.test.ts
git commit -m "feat(agent-ops): merge-queue + ci components, .mq gitignore, new template vars"
```

### Task 2: `gate_executor` config key

**Files:**
- Modify: `src/merge-queue/types.ts` (field + default)
- Modify: `src/core/agent-ops/config.ts` (enum validation)
- Test: `src/core/agent-ops/config.test.ts` (append)

**Interfaces:**
- Consumes: Plan 1's `MergeQueueConfig` + `defaultMergeQueueConfig` + the `merge_queue` parse block (Plan 1 Task 5).
- Produces: `MergeQueueConfig.gate_executor: 'gha-selfhosted' | 'local-poller'` (default `'gha-selfhosted'`). Consumed by Plan 3's pipeline step (decides whether to install the `ci` component) and by generated docs. NOT consumed by the daemon.

- [ ] **Step 1: Write the failing test (append to the merge_queue describe block)**

```typescript
  it('defaults gate_executor to gha-selfhosted', () => {
    expect(loadAgentOpsConfig(tmpProject()).merge_queue.gate_executor).toBe('gha-selfhosted')
  })

  it('accepts local-poller', () => {
    const cfg = loadAgentOpsConfig(tmpProject(`
project_name: myapp
merge_queue:
  gate_executor: local-poller
`))
    expect(cfg.merge_queue.gate_executor).toBe('local-poller')
  })

  it('fails loud on an unknown gate_executor', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  gate_executor: jenkins
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/gate_executor/)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/agent-ops/config.test.ts`
Expected: FAIL — `gate_executor` undefined.

- [ ] **Step 3: Implement**

`src/merge-queue/types.ts` — add to the interface and default:

```typescript
export interface MergeQueueConfig {
  // ...existing fields...
  /** Who runs the post-merge/nightly full suite (spec D4′). Not read by the daemon. */
  gate_executor: 'gha-selfhosted' | 'local-poller'
}

// in defaultMergeQueueConfig() returned object:
    gate_executor: 'gha-selfhosted',
```

`src/core/agent-ops/config.ts` — inside the `merge_queue` parse block (after the intKeys loop):

```typescript
    if (mq.gate_executor !== undefined) {
      if (mq.gate_executor !== 'gha-selfhosted' && mq.gate_executor !== 'local-poller') {
        fail(`merge_queue.gate_executor must be "gha-selfhosted" or "local-poller", got ${JSON.stringify(mq.gate_executor)}`)
      }
      cfg.merge_queue.gate_executor = mq.gate_executor
    }
```

Update Plan 1 artifacts that pin the default shape: the Task 5 test asserting the full default `merge_queue` object gains `gate_executor: 'gha-selfhosted'`, and `src/merge-queue/journal.test.ts`/`stats` are unaffected. Run the whole merge-queue suite to be sure.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/agent-ops/config.test.ts src/merge-queue/ && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/merge-queue/types.ts src/core/agent-ops/config.ts src/core/agent-ops/config.test.ts
git commit -m "feat(mq): gate_executor config key (gha-selfhosted | local-poller)"
```

### Task 3: `mq-guard.sh.tmpl`

**Files:**
- Create: `content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl`
- Test: `tests/agent-ops-merge-queue.bats` (new file, guard section)

**Interfaces:**
- Consumes: `{{DEFAULT_BRANCH}}` template var (Task 1).
- Produces: `scripts/mq-guard.sh` in target projects — dual-mode (PreToolUse JSON on stdin exit 2 = block; `--check "<cmd>"` same semantics). Registered into `.claude/settings.json` by Plan 3's git-workflow prompt (jq deep-merge, bd-guard precedent).

- [ ] **Step 1: Write the failing bats tests**

```bash
#!/usr/bin/env bats
# tests/agent-ops-merge-queue.bats — merge-queue component templates.

setup() {
  TMP="$(mktemp -d)"
  # Resolve templates the way the installer does: replace known {{KEY}} markers.
  sed -e 's/{{DEFAULT_BRANCH}}/main/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl" \
    > "$TMP/mq-guard.sh"
  chmod +x "$TMP/mq-guard.sh"
}

teardown() { rm -rf "$TMP"; }

@test "mq-guard blocks a direct gh pr merge" {
  run "$TMP/mq-guard.sh" --check 'gh pr merge 123 --squash --delete-branch'
  [ "$status" -eq 2 ]
  [[ "$output" == *"scaffold mq enqueue"* ]]
}

@test "mq-guard blocks gh pr merge buried in a compound command" {
  run "$TMP/mq-guard.sh" --check 'make check && gh pr merge 5 --squash'
  [ "$status" -eq 2 ]
}

@test "mq-guard allows other gh pr commands" {
  run "$TMP/mq-guard.sh" --check 'gh pr view 123 --json mergedAt'
  [ "$status" -eq 0 ]
}

@test "mq-guard allows the phrase inside a quoted string (PR title)" {
  run "$TMP/mq-guard.sh" --check 'gh pr create --title "never run gh pr merge by hand"'
  [ "$status" -eq 0 ]
}

@test "mq-guard honors the deliberate override env" {
  MQ_DIRECT_MERGE_OK=1 run "$TMP/mq-guard.sh" --check 'gh pr merge 9 --squash'
  [ "$status" -eq 0 ]
}

@test "mq-guard prints no override recipe on block" {
  run "$TMP/mq-guard.sh" --check 'gh pr merge 7'
  [[ "$output" != *"MQ_DIRECT_MERGE_OK"* ]]
}

@test "mq-guard hook mode blocks via stdin JSON envelope" {
  command -v jq >/dev/null 2>&1 || skip "jq not installed"
  run bash -c "echo '{\"tool_input\":{\"command\":\"gh pr merge 3 --squash\"}}' | '$TMP/mq-guard.sh'"
  [ "$status" -eq 2 ]
}

@test "mq-guard allows empty/unparseable hook input (fail open)" {
  command -v jq >/dev/null 2>&1 || skip "jq not installed"
  run bash -c "echo '{}' | '$TMP/mq-guard.sh'"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: FAIL — template file does not exist.

- [ ] **Step 3: Write the template**

```bash
#!/usr/bin/env bash
# mq-guard.sh — routes merges through the merge queue.
# Installed by `scaffold agent-ops install --component merge-queue`.
#
# Two modes (bd-guard.sh precedent):
#   1. Claude Code PreToolUse hook (default): reads the hook JSON envelope on
#      stdin, inspects .tool_input.command, exits 2 (block) or 0 (allow).
#   2. CLI check for other harnesses: mq-guard.sh --check "<command>".
#
# Why: a direct `gh pr merge` bypasses the queue's batch testing and invalidates
# every in-flight gate (the livelock this project's merge queue exists to fix).
# This guard is an ACCIDENT NET, not a security boundary. Known deliberate
# bypasses it does not attempt to catch: `bash -c "..."`, `eval`, command
# substitution, scripts that call gh internally. The deliberate direct-merge
# procedure lives in the generated git-workflow doc — not here (no override
# recipe in error text, upstream Beads lesson).
set -euo pipefail

cmd=""
if [ "${1:-}" = "--check" ]; then
	cmd="${2:-}"
else
	if ! command -v jq >/dev/null 2>&1; then
		printf '%s\n' "mq-guard: jq not found — cannot parse hook input; allowing. Install jq to arm the guard." >&2
		exit 0
	fi
	cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
fi
[ -n "$cmd" ] || exit 0

# Deliberate, human-approved override (documented in the git-workflow doc).
if [ "${MQ_DIRECT_MERGE_OK:-0}" = "1" ]; then exit 0; fi

# Fold backslash continuations into logical lines; mask quoted string literals so
# a PR title mentioning "gh pr merge" is text, not a command (bd-guard pattern).
scan=$(printf '%s' "$cmd" | awk 'BEGIN{ORS=""} { if (sub(/\\$/,"")) printf "%s", $0; else print $0 "\n" }')
mcmd=$(printf '%s' "$scan" | sed -E -e 's/"[^"]*"/_Q_/g' -e "s/'[^']*'/_Q_/g")

if printf '%s' "$mcmd" | grep -qE '(^|[^[:alnum:]_])gh[[:space:]]+pr[[:space:]]+merge([^[:alnum:]_]|$)'; then
	printf '%s\n' "mq-guard: direct 'gh pr merge' is routed through the merge queue on this project. Enqueue instead: scaffold mq enqueue --pr <N> (or: make mq-enqueue PR=<N>). The queue batch-tests against latest {{DEFAULT_BRANCH}} and lands green PRs for you; watch with: scaffold mq status." >&2
	exit 2
fi
exit 0
```

- [ ] **Step 4: Lint + run tests**

Run: `shellcheck content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl && bats tests/agent-ops-merge-queue.bats`
Expected: shellcheck clean (the `{{DEFAULT_BRANCH}}` marker sits inside a single-quoted string — no SC warnings), 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl tests/agent-ops-merge-queue.bats
git commit -m "feat(agent-ops): mq-guard — route gh pr merge through the queue"
```

### Task 4: Make targets (`mq-*`, `post-merge-watch`)

**Files:**
- Modify: `content/assets/agent-ops/make/agent-ops.mk.tmpl`
- Test: `tests/agent-ops-merge-queue.bats` (append a make section)

**Interfaces:**
- Consumes: `scaffold mq` CLI (Plan 1 Task 12), `scripts/ops/post-merge-poller.sh` (Task 7).
- Produces: `make mq-enqueue PR=<n>`, `mq-status`, `mq-daemon`, `mq-eject PR=<n>`, `mq-stats`, `post-merge-watch` — the exact surface Plan 3's work-beads skill references.

- [ ] **Step 1: Write the failing bats tests (append)**

```bash
@test "agent-ops.mk defines the mq targets with doc-comments" {
  MK="$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
  grep -qE '^mq-enqueue: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-status: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-daemon: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-eject: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-stats: ## \[agent-safe\]' "$MK"
  grep -qE '^post-merge-watch: ## \[agent-safe\]' "$MK"
}

@test "mq targets self-guard on the scaffold CLI" {
  MK="$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
  grep -q 'define mq_guard' "$MK"
  grep -q 'command -v scaffold' "$MK"
}

@test "mq-enqueue requires PR= and is wired through a real make run" {
  WORK="$(mktemp -d)"
  cp "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" "$WORK/agent-ops.mk"
  printf -- '-include agent-ops.mk\n' > "$WORK/Makefile"
  # stub scaffold on PATH so mq_guard passes and enqueue is observable
  mkdir -p "$WORK/bin"
  printf '#!/usr/bin/env bash\necho "scaffold $*" >> "%s/calls.log"\n' "$WORK" > "$WORK/bin/scaffold"
  chmod +x "$WORK/bin/scaffold"
  run env PATH="$WORK/bin:$PATH" make -C "$WORK" mq-enqueue
  [ "$status" -ne 0 ]
  [[ "$output" == *"PR="* ]]
  run env PATH="$WORK/bin:$PATH" make -C "$WORK" mq-enqueue PR=42
  [ "$status" -eq 0 ]
  grep -q 'mq enqueue --pr 42' "$WORK/calls.log"
  rm -rf "$WORK"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: the three new tests FAIL (targets absent).

- [ ] **Step 3: Append to agent-ops.mk.tmpl**

Add `mq-enqueue mq-status mq-daemon mq-eject mq-stats post-merge-watch` to the `.PHONY` line, then append at the end of the file:

```make
define mq_guard
	@command -v scaffold >/dev/null 2>&1 || { echo "merge-queue targets need the scaffold CLI (npm i -g @zigrivers/scaffold or brew install scaffold)"; exit 1; }
endef

mq-enqueue: ## [agent-safe] Enqueue PR=<n> into the local merge queue (fire-and-forget)
	$(mq_guard)
	@test -n "$(PR)" || { echo "usage: make mq-enqueue PR=<number>"; exit 1; }
	@scaffold mq enqueue --pr $(PR)

mq-status: ## [agent-safe] Show merge-queue state (paused banner, per-PR states)
	$(mq_guard)
	@scaffold mq status

mq-daemon: ## [agent-safe] Run the merge-queue daemon in the foreground (debugging)
	$(mq_guard)
	@scaffold mq daemon --foreground

mq-eject: ## [agent-safe] Withdraw PR=<n> from the queue
	$(mq_guard)
	@test -n "$(PR)" || { echo "usage: make mq-eject PR=<number>"; exit 1; }
	@scaffold mq eject --pr $(PR)

mq-stats: ## [agent-safe] Queue calibration metrics (arrivals, gate outcomes, flakes)
	$(mq_guard)
	@scaffold mq stats

post-merge-watch: ## [agent-safe] One local post-merge full-suite pass (local-poller mode)
	@test -f scripts/ops/post-merge-poller.sh || { echo "merge-queue component not installed (run: scaffold agent-ops install --component merge-queue)"; exit 1; }
	@scripts/ops/post-merge-poller.sh
```

- [ ] **Step 4: Run tests**

Run: `bats tests/agent-ops-merge-queue.bats && make lint`
Expected: PASS (shellcheck skips .mk; lint stays green overall).

- [ ] **Step 5: Commit**

```bash
git add content/assets/agent-ops/make/agent-ops.mk.tmpl tests/agent-ops-merge-queue.bats
git commit -m "feat(agent-ops): mq make targets + post-merge-watch"
```

### Task 5: Workflow templates (`post-merge.yml`, `nightly.yml`)

**Files:**
- Create: `content/assets/agent-ops/ci/post-merge.yml.tmpl`
- Create: `content/assets/agent-ops/ci/nightly.yml.tmpl`
- Test: `tests/agent-ops-merge-queue.bats` (append a ci section)

**Interfaces:**
- Consumes: `{{DEFAULT_BRANCH}}`, `{{FULL_GATE_COMMAND}}` template vars (Task 1).
- Produces: `.github/workflows/post-merge.yml` + `nightly.yml` in target projects. `post-merge.yml`'s workflow file name is load-bearing: Plan 1's `GhClient.postMergeRed` queries `gh run list --workflow post-merge.yml` — do not rename one without the other.

- [ ] **Step 1: Write the failing bats tests (append)**

```bash
@test "post-merge workflow: self-hosted, default-branch push, coalescing concurrency" {
  W="$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/post-merge.yml.tmpl"
  grep -q 'name: post-merge' "$W"
  grep -q 'branches: \[{{DEFAULT_BRANCH}}\]' "$W"
  grep -q 'runs-on: \[self-hosted, macOS, ARM64\]' "$W"
  grep -q 'group: post-merge' "$W"
  grep -q 'cancel-in-progress: true' "$W"
  grep -q 'run: {{FULL_GATE_COMMAND}}' "$W"
  # the merge gate must NOT run here — this is post-merge only (D4')
  ! grep -q 'pull_request' "$W"
}

@test "nightly workflow: schedule + dispatch, full gate, e2e feature-detect, flake report" {
  W="$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/nightly.yml.tmpl"
  grep -q 'schedule:' "$W"
  grep -q 'workflow_dispatch' "$W"
  grep -q 'run: {{FULL_GATE_COMMAND}}' "$W"
  grep -q 'make e2e' "$W"
  grep -q 'scaffold mq stats' "$W"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: the two new tests FAIL (files absent).

- [ ] **Step 3: Write post-merge.yml.tmpl**

```yaml
# post-merge.yml — installed by `scaffold agent-ops install --component ci`.
# Full UNCACHED quality gate after every landing on the default branch, on a
# SELF-HOSTED runner ($0 Actions minutes — billing applies only to GitHub-hosted
# runners). The merge gate itself runs locally in the merge queue (D4'): this
# workflow is the safety net that lets that gate be cheap. Coalescing: only the
# latest HEAD matters, superseded runs are cancelled.
name: post-merge
on:
  push:
    branches: [{{DEFAULT_BRANCH}}]
concurrency:
  group: post-merge
  cancel-in-progress: true
jobs:
  full-suite:
    runs-on: [self-hosted, macOS, ARM64]
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4
      - name: Full uncached gate
        run: {{FULL_GATE_COMMAND}}
```

- [ ] **Step 4: Write nightly.yml.tmpl**

```yaml
# nightly.yml — installed by `scaffold agent-ops install --component ci`.
# Nightly full regression on the self-hosted runner: full uncached gate, e2e
# when the project defines a `make e2e` target, and the merge-queue flake
# report. 09:00 UTC ~= 2am US Pacific.
name: nightly
on:
  schedule:
    - cron: '0 9 * * *'
  workflow_dispatch: {}
jobs:
  full-regression:
    runs-on: [self-hosted, macOS, ARM64]
    timeout-minutes: 240
    steps:
      - uses: actions/checkout@v4
      - name: Full uncached gate
        run: {{FULL_GATE_COMMAND}}
      - name: E2E (when the project defines it)
        run: |
          if make -n e2e >/dev/null 2>&1; then
            make e2e
          else
            echo "no e2e target — skipped"
          fi
      - name: Flake report
        run: |
          if command -v scaffold >/dev/null 2>&1; then
            scaffold mq stats
          else
            echo "scaffold CLI not installed on runner — skipped"
          fi
```

- [ ] **Step 5: Run tests + commit**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: PASS.

```bash
git add content/assets/agent-ops/ci/post-merge.yml.tmpl content/assets/agent-ops/ci/nightly.yml.tmpl tests/agent-ops-merge-queue.bats
git commit -m "feat(agent-ops): day-one CI workflows — post-merge + nightly on self-hosted runner"
```

### Task 6: `setup-gh-runner.sh.tmpl`

**Files:**
- Create: `content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl`
- Test: `tests/agent-ops-merge-queue.bats` (append)

**Interfaces:**
- Consumes: `{{PROJECT_NAME}}` template var (existing), `gh` CLI with admin on the repo.
- Produces: `scripts/ops/setup-gh-runner.sh` — registers this Mac as a **persistent** self-hosted runner managed by launchd via the runner's own `svc.sh` (deviation from the spec's "ephemeral" phrasing, deliberate: ephemeral runners need re-registration after every job — a supervisor loop with fresh tokens — while `svc.sh` is the vendor-supported persistent path with identical $0 billing. Recorded here as the D4′ implementation choice.)

- [ ] **Step 1: Write the failing bats tests (append)**

```bash
@test "setup-gh-runner: --print-only previews without side effects" {
  WORK="$(mktemp -d)"
  sed -e 's/{{PROJECT_NAME}}/myproj/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl" \
    > "$WORK/setup-gh-runner.sh"
  chmod +x "$WORK/setup-gh-runner.sh"
  mkdir -p "$WORK/bin"
  printf '#!/usr/bin/env bash\nif [ "$1 $2" = "repo view" ]; then echo "acme/myproj"; else exit 1; fi\n' > "$WORK/bin/gh"
  chmod +x "$WORK/bin/gh"
  run env PATH="$WORK/bin:$PATH" HOME="$WORK" "$WORK/setup-gh-runner.sh" --print-only
  [ "$status" -eq 0 ]
  [[ "$output" == *"acme/myproj"* ]]
  [[ "$output" == *"myproj-mq-runner"* ]]
  [ ! -d "$WORK/.gh-runner" ]
  rm -rf "$WORK"
}

@test "setup-gh-runner: fails loudly without gh" {
  WORK="$(mktemp -d)"
  sed -e 's/{{PROJECT_NAME}}/myproj/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl" \
    > "$WORK/setup-gh-runner.sh"
  chmod +x "$WORK/setup-gh-runner.sh"
  run env PATH="$WORK" "$WORK/setup-gh-runner.sh" --print-only
  [ "$status" -eq 2 ]
  [[ "$output" == *"gh CLI required"* ]]
  rm -rf "$WORK"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: new tests FAIL.

- [ ] **Step 3: Write the template**

```bash
#!/usr/bin/env bash
# setup-gh-runner.sh — register this Mac as a self-hosted GitHub Actions runner
# for the current repo. Installed by `scaffold agent-ops install --component ci`.
#
# Self-hosted runner usage is FREE on every GitHub plan (Actions minutes bill
# only for GitHub-hosted runners). The runner is persistent, managed by launchd
# via the runner's own svc.sh (start at login, restart on crash). Requires: gh
# authenticated with admin on the repo (registration-token API).
#
#   setup-gh-runner.sh               register + start
#   setup-gh-runner.sh --print-only  preview without side effects
set -euo pipefail

PRINT_ONLY=0
[ "${1:-}" = "--print-only" ] && PRINT_ONLY=1

command -v gh >/dev/null 2>&1 || { echo "gh CLI required" >&2; exit 2; }
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
RUNNER_DIR="$HOME/.gh-runner/{{PROJECT_NAME}}"
NAME="{{PROJECT_NAME}}-mq-runner"

if [ "$PRINT_ONLY" = 1 ]; then
	echo "would register runner '$NAME' for $REPO"
	echo "  dir:    $RUNNER_DIR"
	echo "  labels: self-hosted,macOS,ARM64"
	echo "  mgmt:   ./svc.sh install && ./svc.sh start (launchd)"
	exit 0
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -f config.sh ]; then
	echo "downloading latest actions runner (osx-arm64)…"
	URL="$(gh api repos/actions/runner/releases/latest \
		-q '.assets[] | select(.name | test("actions-runner-osx-arm64-[0-9.]+\\.tar\\.gz$")) | .browser_download_url')"
	curl -fsSL "$URL" -o runner.tar.gz
	tar xzf runner.tar.gz
	rm runner.tar.gz
fi

TOKEN="$(gh api -X POST "repos/$REPO/actions/runners/registration-token" -q .token)"
./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" \
	--name "$NAME" --labels self-hosted,macOS,ARM64 --replace
./svc.sh install
./svc.sh start
echo "runner '$NAME' registered and started (launchd keeps it alive)."
echo "verify: gh api repos/$REPO/actions/runners -q '.runners[].name'"
```

- [ ] **Step 4: Lint + run tests + commit**

Run: `shellcheck content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl && bats tests/agent-ops-merge-queue.bats`
Expected: clean + PASS.

```bash
git add content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl tests/agent-ops-merge-queue.bats
git commit -m "feat(agent-ops): self-hosted runner setup script"
```

### Task 7: `post-merge-poller.sh.tmpl` (local-poller gate executor)

**Files:**
- Create: `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl`
- Test: `tests/agent-ops-merge-queue.bats` (append)

**Interfaces:**
- Consumes: `{{FULL_GATE_COMMAND}}` template var (Task 1); the `.mq/` layout from Plan 1 (`PAUSED`, `logs/`).
- Produces: `scripts/ops/post-merge-poller.sh` — one pass: run the full uncached gate against `origin/<default>` when it moved since the last pass; **on red, write `.mq/PAUSED`** (which Plan 1's daemon honors — this is how `local-poller` mode gets pause-on-red without touching the daemon); on green, record the SHA and clear only a poller-written pause (never an NRS pause). Scheduled by the project via cron/launchd, or ad hoc via `make post-merge-watch`.

- [ ] **Step 1: Write the failing bats tests (append)**

```bash
poller_world() { # builds origin+clone, installs resolved poller with gate cmd $1
  WORK="$(mktemp -d)"
  git init -q --bare -b main "$WORK/origin.git"
  git clone -q "$WORK/origin.git" "$WORK/clone"
  git -C "$WORK/clone" config user.name t
  git -C "$WORK/clone" config user.email t@t.invalid
  echo base > "$WORK/clone/f.txt"
  git -C "$WORK/clone" add f.txt
  git -C "$WORK/clone" commit -qm base
  git -C "$WORK/clone" push -qu origin main
  git -C "$WORK/clone" remote set-head origin main
  mkdir -p "$WORK/clone/scripts/ops"
  sed -e "s|{{FULL_GATE_COMMAND}}|$1|g" \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl" \
    > "$WORK/clone/scripts/ops/post-merge-poller.sh"
  chmod +x "$WORK/clone/scripts/ops/post-merge-poller.sh"
}

@test "poller: green run records the sha and stays quiet when nothing moved" {
  poller_world "true"
  run git -C "$WORK/clone" rev-parse origin/main
  SHA="$output"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [ "$(cat "$WORK/clone/.mq/last-full-suite-sha")" = "$SHA" ]
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"up to date"* ]]
  rm -rf "$WORK"
}

@test "poller: red run pauses the queue; green clears only a poller pause" {
  poller_world "false"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 1 ]
  grep -q 'post-merge red' "$WORK/clone/.mq/PAUSED"
  # switch gate to green and advance origin so the poller re-runs
  sed -i '' -e 's|^GATE=.*|GATE="true"|' "$WORK/clone/scripts/ops/post-merge-poller.sh" 2>/dev/null || \
    sed -i -e 's|^GATE=.*|GATE="true"|' "$WORK/clone/scripts/ops/post-merge-poller.sh"
  echo more >> "$WORK/clone/f.txt"
  git -C "$WORK/clone" commit -qam more
  git -C "$WORK/clone" push -q origin main
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [ ! -f "$WORK/clone/.mq/PAUSED" ]
  rm -rf "$WORK"
}

@test "poller: never clears a non-poller (NRS) pause" {
  poller_world "true"
  mkdir -p "$WORK/clone/.mq"
  echo "NRS violation: trees differ" > "$WORK/clone/.mq/PAUSED"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ -f "$WORK/clone/.mq/PAUSED" ]
  grep -q 'NRS violation' "$WORK/clone/.mq/PAUSED"
  rm -rf "$WORK"
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-merge-queue.bats`
Expected: new tests FAIL.

- [ ] **Step 3: Write the template**

```bash
#!/usr/bin/env bash
# post-merge-poller.sh — the `local-poller` gate executor (merge_queue.gate_executor).
# Installed by `scaffold agent-ops install --component merge-queue`.
#
# One pass per invocation: if origin/<default-branch> moved since the last
# recorded full-suite run, run the FULL UNCACHED gate in a dedicated worktree.
# RED  -> write .mq/PAUSED (the merge-queue daemon stops landing until a human
#         fixes forward or reverts, then removes the file). Exit 1.
# GREEN-> record the sha; clear a pause only if THIS script wrote it (a pause
#         starting "post-merge red") — an NRS pause is never touched.
# Schedule: cron/launchd every ~10 min, or ad hoc via `make post-merge-watch`.
set -euo pipefail

GATE="{{FULL_GATE_COMMAND}}"

PRIMARY="$(git worktree list --porcelain | head -1 | sed 's/^worktree //')"
cd "$PRIMARY"
MQ_DIR="$PRIMARY/.mq"
MARKER="$MQ_DIR/last-full-suite-sha"
PAUSE="$MQ_DIR/PAUSED"
WT="$MQ_DIR/post-merge"

BRANCH="$(git rev-parse --abbrev-ref origin/HEAD | sed 's#^origin/##')"
git fetch origin --prune --quiet
HEAD_SHA="$(git rev-parse "origin/$BRANCH")"
LAST="$(cat "$MARKER" 2>/dev/null || echo none)"
if [ "$HEAD_SHA" = "$LAST" ]; then
	echo "post-merge: up to date at $HEAD_SHA"
	exit 0
fi

mkdir -p "$MQ_DIR/logs"
if [ ! -d "$WT" ]; then
	git worktree add --detach --quiet "$WT" "origin/$BRANCH"
fi
git -C "$WT" fetch origin --quiet
git -C "$WT" checkout --detach --quiet "origin/$BRANCH"
git -C "$WT" reset --hard --quiet "origin/$BRANCH"

LOG="$MQ_DIR/logs/post-merge-$HEAD_SHA.log"
if (cd "$WT" && bash -c "$GATE") >"$LOG" 2>&1; then
	echo "$HEAD_SHA" > "$MARKER"
	if grep -q '^post-merge red' "$PAUSE" 2>/dev/null; then
		rm -f "$PAUSE"
		echo "post-merge: green at $HEAD_SHA — cleared poller pause"
	else
		echo "post-merge: green at $HEAD_SHA"
	fi
else
	printf 'post-merge red at %s — full suite failed; see %s. Fix forward or revert (runbook: docs/git-workflow), then rm .mq/PAUSED\n' \
		"$HEAD_SHA" "$LOG" > "$PAUSE"
	echo "post-merge: RED at $HEAD_SHA — merge queue paused ($LOG)" >&2
	exit 1
fi
```

- [ ] **Step 4: Lint + run tests + commit**

Run: `shellcheck content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl && bats tests/agent-ops-merge-queue.bats`
Expected: clean + PASS (12 bats tests total in the file).

```bash
git add content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl tests/agent-ops-merge-queue.bats
git commit -m "feat(agent-ops): local post-merge poller with pause-on-red"
```

### Task 8: Docs, changelog, final gate

**Files:**
- Modify: `CLAUDE.md` (Key Commands table — agent-ops row)
- Modify: `CHANGELOG.md` (Unreleased)

- [ ] **Step 1: Update the agent-ops Key Commands row in CLAUDE.md**

Change the existing `scaffold agent-ops install` row's component list to:

```markdown
| `scaffold agent-ops install [--component git\|staging\|merge-queue\|ci\|all] [--force]` | Install the parallel-agent tooling bundle into a **generated** project (`all` = git+staging; `merge-queue` and `ci` are explicit opt-ins) |
```

- [ ] **Step 2: Append to the CHANGELOG Unreleased Added section**

```markdown
- agent-ops components `merge-queue` (mq make targets, mq-guard PreToolUse hook,
  local post-merge poller with pause-on-red) and `ci` (post-merge + nightly
  workflows on a $0 self-hosted runner, runner setup script). `--component all`
  deliberately stays git+staging. New config: `merge_queue.gate_executor`.
```

- [ ] **Step 3: Full gate**

Run: `make check-all`
Expected: all green (ShellCheck now covers the three new shell templates; bats suite includes `tests/agent-ops-merge-queue.bats`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs(agent-ops): merge-queue/ci components in key commands + changelog"
```

---

## Execution notes

- Order: 1 → 2 → (3, 4, 5, 6, 7 in any order; 4 references the poller path but only via a file-existence guard) → 8.
- **Make recipes are TAB-indented** — when transcribing Task 4's fragment additions, every recipe line under a target must start with a literal tab (copy the indentation style already in `agent-ops.mk.tmpl`), or make dies with "missing separator".
- Task 1 installs FILE_MAP entries before their template sources exist (Tasks 3–7). `installAgentOps` already reports missing template sources as errors — do not "fix" that; it only matters if someone runs an install of the new components mid-plan.
- ShellCheck runs on `.tmpl` files via `make lint` (they are `.sh.tmpl`; verify the lint glob catches them — if `make lint` only globs `*.sh`, extend the bats content tests to run shellcheck explicitly as shown in the task steps, which is already done).
- The `{{DEFAULT_BRANCH}}`/`{{FULL_GATE_COMMAND}}` markers resolve at install time from the target project's git state and config — the bats tests resolve them with `sed`, mirroring `resolveSkillTemplate`.
- Registration of mq-guard into `.claude/settings.json` and all generated-doc/prompt wiring is **Plan 3**, not here.
- **Plan 1 execution outcomes this plan already absorbs**: `.mq/` gitignore (Task 1's `ensureGitignoreEntry`) and `FULL_GATE_COMMAND` consumption (poller + workflows — the engine itself deliberately does not consume `full_gate_command`) were both anticipated; nothing here changes. Engine-side follow-ups from the final review (gate pgid orphan handling, exec timeouts vs lock staleness, runGate close-hang watchdog, bead-close on recovery paths, alreadyApplied base-relative classification) are tracked in the SDD ledger and are NOT dependencies of this plan.

