# Configurable MMR `fix_threshold` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MMR's `fix_threshold` configurable per-project (via `.mmr.yaml`) and per-invocation (via `--fix-threshold` forwarded through scaffold wrappers), surface advisory-finding counts in verdict output, and stop hardcoding `P0/P1/P2` in agent-facing docs.

**Architecture:** Three layers of change. (1) MMR CLI gains an `advisory_count` field on its result type and renders it in formatters; `mmr config init` writes a self-documenting `.mmr.yaml`. (2) Scaffold meta-prompts (`review-pr.md`, `review-code.md`, `post-implementation-review.md`) accept and forward a `--fix-threshold` argument from `$ARGUMENTS`. (3) Agent-facing docs replace literal `P0/P1/P2` with "findings at or above `fix_threshold`" and read the value from `results.fix_threshold`.

**Tech Stack:** TypeScript (vitest, yargs, zod, js-yaml) for MMR; Markdown content for scaffold meta-prompts and CLAUDE.md; bats-core for regression guard.

**Spec:** [`docs/superpowers/specs/2026-04-28-mmr-fix-threshold-config-design.md`](../specs/2026-04-28-mmr-fix-threshold-config-design.md)

---

## Pre-flight: Worktree (recommended)

If you haven't already:

```bash
scripts/setup-agent-worktree.sh fix-threshold-config
cd ../scaffold-fix-threshold-config
```

Working on `main` directly is fine too — every task is small and committed.

---

## Task 1: Add `advisory_count` to `ReconciledResults`

**Files:**
- Modify: `packages/mmr/src/types.ts:79-93` (add field to interface)
- Modify: `packages/mmr/src/core/results-pipeline.ts:130-175` (compute and emit)
- Test: `packages/mmr/tests/core/results-pipeline.test.ts` (add 2 cases)
- Modify: `packages/mmr/tests/formatters/text.test.ts` (4 fixtures need `advisory_count: 0`)
- Modify: `packages/mmr/tests/formatters/markdown.test.ts` (5 fixtures need `advisory_count: 0`)
- Modify: `packages/mmr/tests/e2e/review-lifecycle.test.ts` (3 fixtures need `advisory_count: 0`)

- [ ] **Step 1: Write the failing test cases**

Append to `packages/mmr/tests/core/results-pipeline.test.ts` inside the existing `describe('runResultsPipeline', ...)` block, before the closing `})`:

```typescript
  it('emits advisory_count for findings strictly below threshold', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-28T00:00:00Z',
      completed_at: '2026-04-28T00:00:10Z',
    })
    store.saveChannelOutput(
      job.job_id,
      'claude',
      JSON.stringify({
        approved: true,
        findings: [
          { severity: 'P3', location: 'a.ts:1', description: 'nit', suggestion: 'fix' },
          { severity: 'P3', location: 'b.ts:2', description: 'nit', suggestion: 'fix' },
        ],
        summary: 'two P3 nits',
      }),
    )

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('pass')
    expect(results.advisory_count).toBe(2)
  })

  it('only counts findings strictly below threshold as advisory', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-28T00:00:00Z',
      completed_at: '2026-04-28T00:00:10Z',
    })
    store.saveChannelOutput(
      job.job_id,
      'claude',
      JSON.stringify({
        approved: false,
        findings: [
          { severity: 'P0', location: 'a.ts:1', description: 'crit', suggestion: 'fix' },
          { severity: 'P2', location: 'b.ts:2', description: 'sugg', suggestion: 'fix' },
          { severity: 'P3', location: 'c.ts:3', description: 'nit', suggestion: 'fix' },
        ],
        summary: 'mixed',
      }),
    )

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('blocked')
    expect(results.advisory_count).toBe(1)
  })
```

- [ ] **Step 2: Run the new test cases — verify they fail**

```bash
cd packages/mmr
npx vitest run tests/core/results-pipeline.test.ts
```

Expected: TypeScript compile error (or runtime undefined) on `results.advisory_count` because the field does not exist yet.

- [ ] **Step 3: Add the field to the type**

Edit `packages/mmr/src/types.ts` — modify the `ReconciledResults` interface (currently lines 79–93). Add `advisory_count: number` after `fix_threshold`:

```typescript
export interface ReconciledResults {
  job_id: string
  verdict: Verdict
  fix_threshold: Severity
  advisory_count: number
  approved: boolean
  summary: string
  reconciled_findings: ReconciledFinding[]
  per_channel: Record<string, ChannelResult>
  metadata: {
    channels_dispatched: number
    channels_completed: number
    channels_partial: number
    total_elapsed: string
  }
}
```

- [ ] **Step 4: Compute the field in the results pipeline**

Edit `packages/mmr/src/core/results-pipeline.ts`. Locate the block that builds the `results: ReconciledResults` object (currently around line 160). Add an `advisoryCount` calculation immediately after the `summary` is computed (around line 158, before the `const results: ReconciledResults = {…}` literal):

```typescript
  const advisoryCount = reconciledFindings.filter(
    (f) => SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[fixThreshold],
  ).length

  const results: ReconciledResults = {
    job_id: job.job_id,
    verdict,
    fix_threshold: fixThreshold,
    advisory_count: advisoryCount,
    approved,
    summary,
    reconciled_findings: reconciledFindings,
    per_channel: perChannel,
    metadata: {
      channels_dispatched: Object.keys(job.channels).length,
      channels_completed: completedChannels,
      channels_partial: Object.values(job.channels)
        .filter((ch) => ['failed', 'timeout'].includes(ch.status)).length,
      total_elapsed: totalElapsed,
    },
  }
```

(The `>` comparison is correct: `SEVERITY_ORDER` maps P0→0, P1→1, P2→2, P3→3, and `evaluateGate` already uses `> thresholdOrder` to gate. Findings with order strictly *greater* than the threshold are below it — i.e. advisory.)

- [ ] **Step 5: Update existing test fixtures that construct `ReconciledResults` literals**

These will fail TypeScript compile until each adds `advisory_count: 0`. Add the field on a new line directly after `fix_threshold:` in every literal in these files:

- `packages/mmr/tests/formatters/text.test.ts` lines 7, 23, 48, 63 (4 literals)
- `packages/mmr/tests/formatters/markdown.test.ts` lines 7, 32, 47, 62, 87 (5 literals)
- `packages/mmr/tests/e2e/review-lifecycle.test.ts` lines 75, 134, 166 (3 literals)

Each addition looks like:

```typescript
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
```

Use grep to verify all literals are caught:

```bash
grep -rn "fix_threshold: 'P" packages/mmr/tests/ | grep -v advisory_count
```

Expected: empty output (every `fix_threshold` literal in tests is now followed by `advisory_count`).

- [ ] **Step 6: Run all MMR tests — verify everything passes**

```bash
cd packages/mmr
npm test
```

Expected: all tests pass, including the two new advisory-count tests.

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/types.ts \
        packages/mmr/src/core/results-pipeline.ts \
        packages/mmr/tests/core/results-pipeline.test.ts \
        packages/mmr/tests/formatters/text.test.ts \
        packages/mmr/tests/formatters/markdown.test.ts \
        packages/mmr/tests/e2e/review-lifecycle.test.ts
git commit -m "$(cat <<'EOF'
feat(mmr): add advisory_count to reconciled results

Findings strictly below the configured fix_threshold are now counted in
results.advisory_count. The verdict gate is unchanged — these findings
remain in reconciled_findings but don't cause `blocked`.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Render advisory count in text + markdown formatters

**Files:**
- Modify: `packages/mmr/src/formatters/text.ts:13-47`
- Modify: `packages/mmr/src/formatters/markdown.ts:13-52`
- Test: `packages/mmr/tests/formatters/text.test.ts`
- Test: `packages/mmr/tests/formatters/markdown.test.ts`

- [ ] **Step 1: Write failing tests for advisory rendering**

Append to `packages/mmr/tests/formatters/text.test.ts` inside the existing `describe('formatText', ...)` block, before the closing `})`:

```typescript
  it('shows advisory count when present', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-adv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 3,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '5s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).toContain('Advisory: 3')
  })

  it('omits advisory segment when count is zero', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-noadv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '5s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).not.toContain('Advisory')
  })
```

Append parallel tests to `packages/mmr/tests/formatters/markdown.test.ts` inside the existing `describe('formatMarkdown', ...)` block:

```typescript
  it('shows advisory count when present', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-adv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 3,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatMarkdown(results)
    expect(output).toContain('**Advisory:** 3')
  })

  it('omits advisory segment when count is zero', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-noadv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatMarkdown(results)
    expect(output).not.toContain('Advisory')
  })
```

- [ ] **Step 2: Run formatter tests — verify the new ones fail**

```bash
cd packages/mmr
npx vitest run tests/formatters/
```

Expected: 4 failures (`Advisory: 3` and `**Advisory:** 3` not found; pre-existing tests still pass).

- [ ] **Step 3: Implement advisory segment in `formatText`**

Edit `packages/mmr/src/formatters/text.ts`. Replace the `lines.push(\`Threshold: …\`)` block (currently lines 19–22) with:

```typescript
  const segments = [
    `Threshold: ${results.fix_threshold}`,
  ]
  if (results.advisory_count > 0) {
    segments.push(`Advisory: ${results.advisory_count}`)
  }
  segments.push(
    `Channels: ${chCount}`,
    `Elapsed: ${results.metadata.total_elapsed}`,
  )
  lines.push(segments.join(' | '))
```

(Move the `chCount` declaration above this block if not already there. The segments array makes the conditional `Advisory:` segment a clean insert without string concatenation.)

- [ ] **Step 4: Implement advisory segment in `formatMarkdown`**

Edit `packages/mmr/src/formatters/markdown.ts`. Replace the existing `lines.push(\`**Job:** …\`)` block (currently lines 19–22) with:

```typescript
  const segments = [
    `**Job:** ${results.job_id}`,
    `**Threshold:** ${results.fix_threshold}`,
  ]
  if (results.advisory_count > 0) {
    segments.push(`**Advisory:** ${results.advisory_count}`)
  }
  segments.push(`**Elapsed:** ${results.metadata.total_elapsed}`)
  lines.push(segments.join(' | '))
```

- [ ] **Step 5: Run all MMR tests — verify pass**

```bash
cd packages/mmr
npm test
```

Expected: every test passes, including the four new formatter tests.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/formatters/text.ts \
        packages/mmr/src/formatters/markdown.ts \
        packages/mmr/tests/formatters/text.test.ts \
        packages/mmr/tests/formatters/markdown.test.ts
git commit -m "$(cat <<'EOF'
feat(mmr): show advisory count in text + markdown verdict copy

When advisory_count > 0, formatters insert "Advisory: N" (text) or
"**Advisory:** N" (markdown) between the threshold and channel segments.
When zero, the segment is omitted to avoid noise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Improve `mmr config init` template with explanatory comment

**Files:**
- Modify: `packages/mmr/src/commands/config.ts:13-41` (the `configInit` function)
- Test: `packages/mmr/tests/commands/cli-parsing.test.ts` or new `packages/mmr/tests/commands/config-init.test.ts`

- [ ] **Step 1: Check existing test coverage for `mmr config init`**

```bash
grep -rln "configInit\|config init\|config.*init" packages/mmr/tests/
```

If no test exists for `configInit` output, create `packages/mmr/tests/commands/config-init.test.ts`. Otherwise, add the new cases to whatever file already covers it.

- [ ] **Step 2: Write the failing test**

Create `packages/mmr/tests/commands/config-init.test.ts` (or extend the existing test file) with:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr config init template', () => {
  let tmpDir: string
  let originalCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-config-init-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('writes .mmr.yaml with explanatory comment block above fix_threshold', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    // Avoid process.exit terminating the test run
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await configCommand.handler({ action: 'init', _: ['config'], $0: 'mmr' } as never)

    exitSpy.mockRestore()

    const written = fs.readFileSync(path.join(tmpDir, '.mmr.yaml'), 'utf-8')
    // Comment block exists
    expect(written).toMatch(/# fix_threshold:/)
    // Each severity tier is described
    expect(written).toMatch(/#\s+P0\b/)
    expect(written).toMatch(/#\s+P1\b/)
    expect(written).toMatch(/#\s+P2\b/)
    expect(written).toMatch(/#\s+P3\b/)
    // Default value is explicit
    expect(written).toMatch(/^\s*fix_threshold:\s*P2\s*$/m)
  })
})
```

- [ ] **Step 3: Run the new test — verify failure**

```bash
cd packages/mmr
npx vitest run tests/commands/config-init.test.ts
```

Expected: assertion failures because `yaml.dump` output has no comment block.

- [ ] **Step 4: Replace `yaml.dump` with hand-written template**

Edit `packages/mmr/src/commands/config.ts`. Replace the entire body of `configInit()` (currently lines 13–41) with:

```typescript
async function configInit(): Promise<void> {
  const configPath = path.join(process.cwd(), '.mmr.yaml')
  if (fs.existsSync(configPath)) {
    console.error('.mmr.yaml already exists. Remove it first to re-initialize.')
    process.exit(1)
  }

  // Auto-detect which CLIs are installed
  const channelLines: string[] = ['channels:']
  for (const [name, chConfig] of Object.entries(BUILTIN_CHANNELS)) {
    const cmd = chConfig.command.split(' ')[0]
    const installed = await checkInstalled(cmd)
    channelLines.push(`  ${name}:`)
    channelLines.push(`    enabled: ${installed}`)
    console.log(`  ${name}: ${installed ? 'detected' : 'not found'}`)
  }

  const template = [
    'version: 1',
    '',
    'defaults:',
    '  # fix_threshold: minimum severity that blocks the review verdict.',
    '  # Findings below this severity are kept in the result as advisory',
    '  # but don\'t cause `blocked`. Choose based on project risk profile:',
    '  #   P0 — block only on critical (security, data loss, broken functionality)',
    '  #   P1 — block on critical + significant bugs                 [low friction]',
    '  #   P2 — block on critical + significant + suggestions        [DEFAULT]',
    '  #   P3 — block on everything down to nits                     [strict]',
    '  fix_threshold: P2',
    '  timeout: 300',
    '  format: json',
    '',
    ...channelLines,
    '',
  ].join('\n')

  fs.writeFileSync(configPath, template)
  console.log(`\nCreated ${configPath}`)
}
```

The `yaml` import is no longer used in this function; if it's not used elsewhere in the file, remove the `import yaml from 'js-yaml'` line at the top. Check first:

```bash
grep -c "yaml\." packages/mmr/src/commands/config.ts
```

If the count is `0` after the edit, remove the import.

- [ ] **Step 5: Run the test — verify pass**

```bash
cd packages/mmr
npx vitest run tests/commands/config-init.test.ts
```

Expected: all assertions pass.

- [ ] **Step 6: Run full MMR suite — verify nothing else broke**

```bash
cd packages/mmr
npm run check
```

Expected: lint, type-check, and all tests pass.

- [ ] **Step 7: Manual smoke test**

```bash
cd /tmp && mkdir mmr-smoke && cd mmr-smoke
node /Users/kenallred/Documents/dev-projects/scaffold/packages/mmr/dist/index.js config init || \
  (cd /Users/kenallred/Documents/dev-projects/scaffold/packages/mmr && npm run build && cd /tmp/mmr-smoke && \
   node /Users/kenallred/Documents/dev-projects/scaffold/packages/mmr/dist/index.js config init)
cat .mmr.yaml
```

Expected: a `.mmr.yaml` whose `defaults:` block contains the comment block describing P0–P3 tiers above an explicit `fix_threshold: P2`. Clean up: `rm -rf /tmp/mmr-smoke`.

- [ ] **Step 8: Commit**

```bash
git add packages/mmr/src/commands/config.ts \
        packages/mmr/tests/commands/config-init.test.ts
git commit -m "$(cat <<'EOF'
feat(mmr): self-documenting fix_threshold in config init template

`mmr config init` now writes an explanatory comment block above
fix_threshold describing each severity tier and pinning the value
explicitly so future MMR default shifts don't silently change
behavior for existing projects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: MMR CHANGELOG entry

**Files:**
- Modify: `packages/mmr/CHANGELOG.md`

- [ ] **Step 1: Add a new unreleased entry at the top**

Edit `packages/mmr/CHANGELOG.md`. Add a new section directly under `# Changelog` (above `## [1.2.2] — 2026-04-27`):

```markdown
## [Unreleased]

### Added
- **`advisory_count` field in reconciled results.** Findings strictly below
  the configured `fix_threshold` are now counted in `results.advisory_count`
  in the JSON output and rendered as `Advisory: N` (text) or
  `**Advisory:** N` (markdown) in the verdict copy when non-zero. The gate
  is unchanged — advisory findings remain in `reconciled_findings` but
  don't cause `blocked`.
- **Self-documenting `mmr config init` template.** New `.mmr.yaml` files
  include an explanatory comment block above `fix_threshold` describing
  the P0–P3 tiers, and the value is written explicitly (`P2`) rather than
  relying on the schema default — so future default shifts don't silently
  change behavior for existing projects.
```

- [ ] **Step 2: Verify markdown syntax is valid**

```bash
head -25 packages/mmr/CHANGELOG.md
```

Expected: well-formed markdown, `## [Unreleased]` precedes `## [1.2.2]`.

- [ ] **Step 3: Commit**

```bash
git add packages/mmr/CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs(mmr): changelog entry for advisory_count + config init template

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `content/tools/review-pr.md` (passthrough + dynamicization)

**Files:**
- Modify: `content/tools/review-pr.md`

This task touches one file with two related changes: (a) accept `--fix-threshold` from `$ARGUMENTS` and forward to `mmr review`, (b) replace hardcoded `P0/P1/P2` with threshold-relative language.

- [ ] **Step 1: Update frontmatter `argument-hint`**

Edit `content/tools/review-pr.md` line 12. Change:

```
argument-hint: "<PR number or blank for current branch>"
```

To:

```
argument-hint: "<PR# or blank> [--fix-threshold P0|P1|P2|P3]"
```

- [ ] **Step 2: Document the `$ARGUMENTS` field**

In the `## Inputs` section (around line 47), change:

```
- $ARGUMENTS — PR number (optional; auto-detected from current branch if omitted)
```

To:

```
- $ARGUMENTS — PR number (optional; auto-detected from current branch if omitted) and/or `--fix-threshold P0|P1|P2|P3` to override the project's configured threshold for this run
```

- [ ] **Step 3: Update Step 1 to parse `$ARGUMENTS`**

Locate "### Step 1: Identify the PR" (around line 62). Replace the bash block with:

````markdown
```bash
# Strip --fix-threshold from $ARGUMENTS if present; remainder is the PR number
FIX_THRESHOLD=""
ARGS_REMAINING="$ARGUMENTS"
if [[ "$ARGS_REMAINING" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
  ARGS_REMAINING="${ARGS_REMAINING//--fix-threshold ${FIX_THRESHOLD}/}"
fi

# Use remaining argument if provided, otherwise detect from current branch
PR_NUMBER="$(echo "$ARGS_REMAINING" | tr -d '[:space:]')"
PR_NUMBER="${PR_NUMBER:-$(gh pr view --json number -q .number 2>/dev/null)}"
```
````

- [ ] **Step 4: Update Step 2 to forward `--fix-threshold`**

Locate "### Step 2: Run MMR Review" (around line 71). Replace the bash block with:

````markdown
```bash
MMR_FLAGS=(--pr "$PR_NUMBER" --sync --format json)
[ -n "$FIX_THRESHOLD" ] && MMR_FLAGS+=(--fix-threshold "$FIX_THRESHOLD")
MMR_RESULT=$(mmr review "${MMR_FLAGS[@]}")
# Extract job_id from JSON output for use in mmr reconcile
JOB_ID=$(echo "$MMR_RESULT" | grep -o '"job_id": "[^"]*"' | head -1 | cut -d'"' -f4)
```
````

- [ ] **Step 5: Replace hardcoded `P0/P1/P2` language**

Inside `content/tools/review-pr.md`, find and replace:

| Old | New |
|-----|-----|
| `P0/P1/P2 findings fixed before proceeding` (in Expected Outputs) | `findings at or above the configured \`fix_threshold\` fixed before proceeding (read from \`results.fix_threshold\` in the verdict JSON; default \`P2\`)` |
| `### Step 7: Fix P0/P1/P2 Findings` (heading) | `### Step 7: Fix Blocking Findings` |
| `If any P0, P1, or P2 findings exist:` | `If any findings sit at or above \`fix_threshold\` (the verdict JSON's \`fix_threshold\` field; default \`P2\`):` |
| `the *same* P0/P1/P2 finding (or set) recurs` (in 3-round-limit bullet) | `the *same* blocking finding (or set) recurs` |
| `(typically the *same* finding(s) remain unresolved after 3 fix attempts)` in Step 6a (around line 205) | unchanged (no severity in this line) |
| `default threshold is \`P2\`, so this means no unresolved P0/P1/P2` (Step 6a `pass` description) | `the threshold defaults to \`P2\` but is configurable via \`.mmr.yaml\` or \`--fix-threshold\`` |
| `at least one unresolved finding sits at or above the fix threshold (typically the *same* finding(s) remain unresolved after 3 fix attempts)` | unchanged |
| `**Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.` (Process Rules) | `**Fix before proceeding** — findings at or above \`fix_threshold\` must be resolved before moving to the next task.` |
| `**3-round limit (per finding)** — never attempt to fix the *same* P0/P1/P2 finding more than 3 times.` | `**3-round limit (per finding)** — never attempt to fix the *same* blocking finding more than 3 times.` |
| `Compensating-pass P0/P1/P2 finding` (Step 5 reconciliation table) | `Compensating-pass blocking finding` |
| `Fix per normal thresholds, label as compensating` | unchanged |

Use grep to verify nothing remains:

```bash
grep -n "P0/P1/P2" content/tools/review-pr.md
```

Expected: empty output.

- [ ] **Step 6: Sanity-check the file**

```bash
make validate    # validates frontmatter
grep -n "FIX_THRESHOLD\|--fix-threshold\|fix_threshold" content/tools/review-pr.md
```

Expected: `make validate` passes; grep shows the new threshold parsing/forwarding.

- [ ] **Step 7: Commit**

```bash
git add content/tools/review-pr.md
git commit -m "$(cat <<'EOF'
feat(content): review-pr accepts --fix-threshold passthrough

review-pr.md now parses --fix-threshold from $ARGUMENTS and forwards
it to `mmr review`. Hardcoded P0/P1/P2 language replaced with
threshold-relative phrasing that reads the configured value from
the verdict JSON.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `content/tools/review-code.md` (passthrough + dynamicization + critical prompt fix)

**Files:**
- Modify: `content/tools/review-code.md`

This task is the most consequential single doc edit because line 316 of `review-code.md` ("Report only P0, P1, and P2 issues") is in the per-channel review prompt — without fixing this, raising the threshold to P3 would not surface any P3 findings.

- [ ] **Step 1: Update frontmatter `argument-hint`**

Edit `content/tools/review-code.md` line 13. Change:

```
argument-hint: "[--base <ref>] [--head <ref>] [--staged] [--report-only]"
```

To:

```
argument-hint: "[--base <ref>] [--head <ref>] [--staged] [--report-only] [--fix-threshold P0|P1|P2|P3]"
```

- [ ] **Step 2: Document `--fix-threshold` in Inputs**

In the `## Inputs` section (around line 42), add a new bullet under the existing scope flags:

```
  - `--fix-threshold P0|P1|P2|P3` — override the project's configured threshold for this run
```

- [ ] **Step 3: Parse `--fix-threshold` in Step 1 (Detect Mode)**

Locate "### Step 1: Detect Mode" (around line 128). Append after the existing parse instructions:

```
- `FIX_THRESHOLD` from `--fix-threshold <value>` if present (must match `P0`, `P1`, `P2`, or `P3`); leave empty to defer to `.mmr.yaml`/built-in default
```

And add a bash example near the top of that section:

````markdown
```bash
FIX_THRESHOLD=""
if [[ "$ARGUMENTS" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
fi
```
````

- [ ] **Step 4: Forward `--fix-threshold` in the Primary MMR CLI invocations**

Locate "### Primary: MMR CLI + Agent Reconcile" (around line 61). Update the bash invocations to forward the flag. Change each `mmr review …` line to insert the threshold flag when set. The cleanest pattern is a helper-array:

````markdown
```bash
MMR_FLAGS=(--sync --format json)
[ -n "$FIX_THRESHOLD" ] && MMR_FLAGS+=(--fix-threshold "$FIX_THRESHOLD")
```
````

…and then prefix each of the four MMR invocations with this convention:

````markdown
# Default (full delivery candidate)
git diff "$MERGE_BASE" | mmr review --diff - "${MMR_FLAGS[@]}"

# Staged changes only
mmr review --staged "${MMR_FLAGS[@]}"

# Branch diff against main
mmr review --base main "${MMR_FLAGS[@]}"

# Explicit ref range
mmr review --base <base-ref> --head <head-ref> "${MMR_FLAGS[@]}"
````

- [ ] **Step 5: Critical fix — update the per-channel review prompt template**

Locate "### Step 5: Use This Review Prompt" (around line 310). Find the prompt template that begins:

```
You are reviewing local code changes before commit or push. Report only P0, P1,
and P2 issues.
```

Change the second line to:

```
You are reviewing local code changes before commit or push. Report all P0, P1,
P2, and P3 findings; the project's fix threshold is applied downstream.
```

In the Output Format section of the same prompt template, change the severity enum from `"P0" | "P1" | "P2"` to `"P0" | "P1" | "P2" | "P3"`.

(This is what channels actually see. Without it, P3 findings never surface even when the threshold is set to P3.)

- [ ] **Step 6: Replace remaining hardcoded P0/P1/P2 in `review-code.md`**

| Old | New |
|-----|-----|
| `[docs/review-standards.md if present, otherwise define P0/P1/P2]` (Step 5 prompt template, around line 322) | `[docs/review-standards.md if present, otherwise define P0/P1/P2/P3]` |
| `Compensating-pass P0/P1/P2 finding` (Step 6 reconciliation table) | `Compensating-pass blocking finding` |
| `1. Fix all P0/P1/P2 findings` (Step 7) | `1. Fix all findings at or above \`fix_threshold\` (read from \`results.fix_threshold\` in the verdict JSON; default \`P2\`)` |
| `the *same* P0/P1/P2 finding (or set) recurs` (Step 7 fix loop) | `the *same* blocking finding (or set) recurs` |
| ``pass` — all channels completed with `full` coverage, no unresolved P0/P1/P2` (Step 8) | `\`pass\` — all channels completed with \`full\` coverage, no unresolved findings at or above \`fix_threshold\`` |
| `but all executed and compensating channels have no unresolved P0/P1/P2` | `but all executed and compensating channels have no unresolved findings at or above \`fix_threshold\`` |
| `default threshold is \`P2\`, so this means an unresolved P0/P1/P2` | `the threshold defaults to \`P2\` but is configurable via \`.mmr.yaml\` or \`--fix-threshold\`` |
| `**Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.` (Process Rules) | `**Fix before proceeding** — findings at or above \`fix_threshold\` must be resolved before moving to the next task.` |

Verify nothing remains:

```bash
grep -n "P0/P1/P2" content/tools/review-code.md
```

Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add content/tools/review-code.md
git commit -m "$(cat <<'EOF'
feat(content): review-code accepts --fix-threshold passthrough + reports P0-P3

review-code.md now parses --fix-threshold from \$ARGUMENTS and forwards it
to every mmr review invocation in the routing rules. Per-channel prompt
template now asks for all P0-P3 findings (was P0/P1/P2 only); without
this fix, raising the threshold to P3 would surface nothing. Hardcoded
P0/P1/P2 language replaced with threshold-relative phrasing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `content/tools/post-implementation-review.md` (passthrough + dynamicization)

**Files:**
- Modify: `content/tools/post-implementation-review.md`

- [ ] **Step 1: Update frontmatter `argument-hint`**

Edit line 13:

```
argument-hint: "[--report-only] [--fix-threshold P0|P1|P2|P3]"
```

- [ ] **Step 2: Document `--fix-threshold` in Inputs**

In the `## Inputs` section (around line 33), change:

```
- `$ARGUMENTS` — `--report-only` flag (optional; omit to review + fix)
```

To:

```
- `$ARGUMENTS` — `--report-only` flag and/or `--fix-threshold P0|P1|P2|P3` (both optional)
```

- [ ] **Step 3: Parse `--fix-threshold` in Step 1 (Detect Mode)**

Locate "### Step 1: Detect Mode" (around line 60). Append after the existing parse:

````markdown
```bash
# Detect --fix-threshold flag
FIX_THRESHOLD=""
if [[ "$ARGUMENTS" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
fi
```
````

- [ ] **Step 4: Use `FIX_THRESHOLD` in fix-queue framing**

Locate "### Step 6: Consolidate Findings" (around line 485). Update the "Fix queue" sentence:

```
**Fix queue:** P0, P1, and P2 findings enter the fix queue. P3 findings are recorded
in the report but not actioned.
```

Replace with:

```
**Fix queue:** Findings at or above the configured `fix_threshold` enter the
fix queue. The threshold defaults to `P2` (so P0/P1/P2 enter the queue and
P3 is advisory) and is configurable via `.mmr.yaml`, `--fix-threshold`
passed to this command, or the user's `~/.mmr/config.yaml`. The agent
reads the active threshold from `$FIX_THRESHOLD` if set; otherwise from
`.mmr.yaml` or the built-in default.
```

- [ ] **Step 5: Forward `--fix-threshold` to optional `mmr reconcile`**

Locate "### Step 5e: Optional — Inject Findings into MMR" (around line 462). The existing `mmr reconcile` invocation does not need a threshold flag itself — `mmr reconcile` re-runs reconciliation against the job's pre-set threshold. However, if the agent runs an opportunistic `mmr review` against the same diff to seed a job, that command must forward the threshold. Add this clarifying note at the bottom of Step 5e:

```
If `$FIX_THRESHOLD` is set and a fresh `mmr review` is dispatched as part
of this flow (e.g., to seed a job for `mmr reconcile`), forward it to that
invocation: `mmr review … --fix-threshold "$FIX_THRESHOLD" …`. The
existing `mmr reconcile` call does not take `--fix-threshold` directly —
the job's threshold is set at `mmr review` time.
```

- [ ] **Step 6: Replace hardcoded P0/P1/P2 language**

| Old | New |
|-----|-----|
| `Fixed code (P0/P1/P2 findings resolved) — in review+fix and update modes` (Expected Outputs) | `Fixed code (findings at or above \`fix_threshold\` resolved) — in review+fix and update modes` |
| `then fix P0/P1/P2` (Mode Detection table) | `then fix findings at or above \`fix_threshold\`` |
| `the *same* P0/P1/P2 finding more than 3 times` (Process Rules item 6) | `the *same* blocking finding more than 3 times` |

Severity-tier definitions in the prompt templates (`P0|P1|P2|P3` enums in JSON schemas around lines 192, 293, 429) are educational and STAY as-is — they document what the channels return, not the gate.

`P0/P1/P2/P3 findings for this story` at line 546 is a column header in the report table; replace with `Findings (sorted by severity)`.

`This captures files from every severity-tier commit (P0, P1, P2)` at line 619 — replace with `This captures files from every severity-tier commit`.

Verify:

```bash
grep -n "P0/P1/P2" content/tools/post-implementation-review.md
```

Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add content/tools/post-implementation-review.md
git commit -m "$(cat <<'EOF'
feat(content): post-implementation-review accepts --fix-threshold

post-implementation-review.md now parses --fix-threshold from \$ARGUMENTS,
uses it to gate the fix queue, and forwards it to any seed mmr review
dispatch. Hardcoded P0/P1/P2 language replaced with threshold-relative
phrasing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `CLAUDE.md` "Mandatory Code Review" section

**Files:**
- Modify: `CLAUDE.md` (around the "Mandatory Code Review" subsection)

- [ ] **Step 1: Locate hardcoded references**

```bash
grep -n "P0/P1/P2" CLAUDE.md
```

There is currently one occurrence (in the "Critical rules" list). The 3-round-limit rule directly below it has additional language to update.

- [ ] **Step 2: Update the "Fix all P0/P1/P2" rule**

In `CLAUDE.md`'s "Critical rules" list, change:

```
- **Fix all P0/P1/P2** findings before proceeding to the next task.
```

To:

```
- **Fix all blocking findings** (severity at or above `results.fix_threshold` in the verdict JSON; the project default lives in `.mmr.yaml` and is `P2` unless changed) before proceeding to the next task. Use `--fix-threshold P0|P1|P2|P3` on `scaffold run review-pr` / `review-code` to override per-invocation.
```

- [ ] **Step 3: Update the 3-round-limit rule**

In the same list, change:

```
- **3-round limit** — the limit is **per finding**, not per total review
  rounds. Stop and ask the user only when the *same* P0/P1/P2 finding (or
  set of findings) remains unresolved after 3 fix attempts.
```

To:

```
- **3-round limit** — the limit is **per finding**, not per total review
  rounds. Stop and ask the user only when the *same* blocking finding (or
  set of findings) remains unresolved after 3 fix attempts.
```

- [ ] **Step 4: Verify**

```bash
grep -n "P0/P1/P2" CLAUDE.md
```

Expected: empty output.

```bash
grep -n "fix_threshold\|--fix-threshold" CLAUDE.md
```

Expected: at least one match showing the new language.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude-md): mandatory review reads fix_threshold from verdict JSON

Replaces hardcoded P0/P1/P2 language in the Mandatory Code Review section
with threshold-relative phrasing. Agent now reads results.fix_threshold
from the MMR verdict and uses it to decide what blocks vs. what is
advisory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update `content/pipeline/build/{single,multi}-agent-{start,resume}.md`

**Files (all four touched, with identical edits):**
- Modify: `content/pipeline/build/single-agent-start.md`
- Modify: `content/pipeline/build/single-agent-resume.md`
- Modify: `content/pipeline/build/multi-agent-start.md`
- Modify: `content/pipeline/build/multi-agent-resume.md`

Each file has 3 occurrences of "P0/P1/P2" — two in checklist bullets and one in a numbered "Code review before next task" line.

- [ ] **Step 1: Replace each occurrence in all four files**

For each of the four files, replace:

| Old | New |
|-----|-----|
| `Fix any P0/P1/P2 findings before proceeding` | `Fix any findings at or above \`fix_threshold\` before proceeding` |
| `Fix all P0/P1/P2 findings before moving on.` | `Fix all findings at or above \`fix_threshold\` before moving on.` |

You can do this in one shot per file with sed:

```bash
for f in content/pipeline/build/single-agent-start.md \
         content/pipeline/build/single-agent-resume.md \
         content/pipeline/build/multi-agent-start.md \
         content/pipeline/build/multi-agent-resume.md; do
  sed -i.bak \
    -e 's|Fix any P0/P1/P2 findings before proceeding|Fix any findings at or above `fix_threshold` before proceeding|g' \
    -e 's|Fix all P0/P1/P2 findings before moving on\.|Fix all findings at or above `fix_threshold` before moving on.|g' \
    "$f"
  rm "$f.bak"
done
```

- [ ] **Step 2: Verify no occurrences remain**

```bash
grep -n "P0/P1/P2" content/pipeline/build/*.md
```

Expected: empty output.

```bash
grep -c "fix_threshold" content/pipeline/build/single-agent-start.md \
                       content/pipeline/build/single-agent-resume.md \
                       content/pipeline/build/multi-agent-start.md \
                       content/pipeline/build/multi-agent-resume.md
```

Expected: each file shows 3 matches.

- [ ] **Step 3: Run `make validate`**

```bash
make validate
```

Expected: no frontmatter errors.

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/build/single-agent-start.md \
        content/pipeline/build/single-agent-resume.md \
        content/pipeline/build/multi-agent-start.md \
        content/pipeline/build/multi-agent-resume.md
git commit -m "$(cat <<'EOF'
docs(content): pipeline/build prompts read fix_threshold dynamically

Replaces hardcoded P0/P1/P2 across the four agent start/resume prompts
with threshold-relative phrasing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update `content/pipeline/environment/automated-pr-review.md` (hook reminder + delegated init nudge)

**Files:**
- Modify: `content/pipeline/environment/automated-pr-review.md`

This file has two occurrences of `P0/P1/P2` — one inside a long PostToolUse hook reminder string and one in body text. It's also where the new `mmr config init` delegation nudge should land.

- [ ] **Step 1: Locate occurrences**

```bash
grep -n "P0/P1/P2" content/pipeline/environment/automated-pr-review.md
```

Expected: line 121 (inside the hook command string) and line 154 (body text).

- [ ] **Step 2: Replace line 121 occurrence (hook reminder string)**

Inside the long `"command":` string on line 121, find:

```
Fix all P0/P1/P2 findings before moving on.
```

Replace with:

```
Fix all findings at or above the configured fix_threshold (see results.fix_threshold in the verdict JSON; default P2).
```

Be careful: this is inside a JSON-escaped string. The `\\n` newline escapes and surrounding quotes must be preserved exactly.

- [ ] **Step 3: Replace line 154 occurrence (body text)**

Around line 154, find:

```
Superpowers code-reviewer agent as a complementary 4th channel. Fix P0/P1/P2
```

Replace with:

```
Superpowers code-reviewer agent as a complementary 4th channel. Fix findings at or above `fix_threshold`
```

(Verify the surrounding sentence still flows.)

- [ ] **Step 4: Add delegated init nudge**

Locate the "Setup" or "Prerequisites" section of `automated-pr-review.md` (or, if no such section exists, near the top of the body where MMR is first mentioned). Add a paragraph:

```markdown
### MMR Configuration

If `.mmr.yaml` does not exist in the project root and `mmr` is on `PATH`,
run `mmr config init` once to create one. The generated file pins
`fix_threshold: P2` (the recommended default for typical software work)
with an explanatory comment block describing each severity tier — edit
the value if your project warrants a different gate (`P1` for low-friction
prototypes; `P3` for security-sensitive work).

If `mmr` is not installed, install it before running multi-model review;
otherwise channels will degrade.
```

- [ ] **Step 5: Verify**

```bash
grep -n "P0/P1/P2" content/pipeline/environment/automated-pr-review.md
grep -n "mmr config init" content/pipeline/environment/automated-pr-review.md
make validate
```

Expected: first grep is empty; second grep matches; `make validate` passes.

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/environment/automated-pr-review.md
git commit -m "$(cat <<'EOF'
docs(content): automated-pr-review reads fix_threshold + delegates init

Replaces hardcoded P0/P1/P2 in the post-tool-use hook reminder and body
text with threshold-relative phrasing. Adds a "MMR Configuration"
subsection that delegates .mmr.yaml creation to `mmr config init`
rather than having scaffold own the config format.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `content/skills/mmr/SKILL.md`

**Files:**
- Modify: `content/skills/mmr/SKILL.md`

- [ ] **Step 1: Find the threshold section**

```bash
grep -n "P0/P1/P2\|fix-threshold\|advisory" content/skills/mmr/SKILL.md
```

Currently line 122 has `Default threshold is P2 (fix P0/P1/P2, skip P3). Override per-review:`.

- [ ] **Step 2: Update the threshold description**

Replace line 122 (and surrounding context as needed) with:

```
Default threshold is `P2` (the verdict gate blocks on P0, P1, and P2;
P3 findings are kept in the result as **advisory** but don't cause
`blocked`). Override per-review:
```

- [ ] **Step 3: Add `advisory_count` documentation**

Below the existing `mmr review --pr 47 --fix-threshold P0` examples, add:

````markdown
The verdict JSON includes `advisory_count` (count of findings strictly
below the threshold). Formatted output shows `Advisory: N` (text) or
`**Advisory:** N` (markdown) when non-zero — useful for spotting real
findings that the gate didn't block.
````

- [ ] **Step 4: Verify**

```bash
grep -n "P0/P1/P2" content/skills/mmr/SKILL.md
grep -n "advisory" content/skills/mmr/SKILL.md
```

Expected: first grep empty; second grep shows the new language.

- [ ] **Step 5: Commit**

```bash
git add content/skills/mmr/SKILL.md
git commit -m "$(cat <<'EOF'
docs(skills/mmr): document advisory_count + threshold semantics

SKILL.md now explains that findings below fix_threshold are kept as
advisory (counted in advisory_count, rendered in formatted verdict)
rather than dropped, and removes the "skip P3" framing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Bats regression guard against literal `P0/P1/P2`

**Files:**
- Create: `tests/fix-threshold-language-guard.bats`

- [ ] **Step 1: Write the bats test**

Create `tests/fix-threshold-language-guard.bats`:

```bash
#!/usr/bin/env bats

# Regression guard: agent-facing docs must not contain the literal
# string "P0/P1/P2", which would re-introduce the hardcoded threshold
# this work removed (see docs/superpowers/specs/2026-04-28-mmr-fix-threshold-config-design.md).
#
# Allowlist: CHANGELOG.md (historical entries) and docs/superpowers/specs/
# (frozen design docs). Severity-tier definitions in JSON schemas inside
# prompts use the pipe-separated form `P0|P1|P2|P3`, which does NOT match
# this guard's slash-separated pattern.

ROOT="$BATS_TEST_DIRNAME/.."

@test "no agent-facing doc contains literal P0/P1/P2" {
    cd "$ROOT"
    # Search across CLAUDE.md and content/, exclude allowlist
    matches=$(grep -rn 'P0/P1/P2' \
        --include='*.md' \
        CLAUDE.md content/ \
        2>/dev/null || true)
    if [ -n "$matches" ]; then
        echo "Found hardcoded P0/P1/P2 in agent-facing docs:"
        echo "$matches"
        echo ""
        echo "Replace with threshold-relative language:"
        echo "  'findings at or above \`fix_threshold\`'"
        echo "  or 'blocking finding(s)'"
        return 1
    fi
}

@test "guard does not flag pipe-separated severity definitions" {
    cd "$ROOT"
    # Sanity check: ensure the JSON-schema enum form is still allowed
    pipes=$(grep -r 'P0|P1|P2|P3' content/ 2>/dev/null | head -1 || true)
    [ -n "$pipes" ]
}
```

- [ ] **Step 2: Run the test — verify it passes**

```bash
bats tests/fix-threshold-language-guard.bats
```

Expected: both tests pass. (If the first test fails, an earlier task missed an occurrence — go back and fix it.)

- [ ] **Step 3: Verify the guard actually works (sanity test)**

Temporarily reintroduce the bad pattern into a doc and confirm the guard catches it:

```bash
# Add a known-bad line, run the guard, expect failure
echo "TEMPORARY: P0/P1/P2 sentinel" >> content/skills/mmr/SKILL.md
bats tests/fix-threshold-language-guard.bats || echo "Guard correctly failed"

# Revert
git checkout content/skills/mmr/SKILL.md

# Re-run guard, expect pass
bats tests/fix-threshold-language-guard.bats
```

Expected: failure on the dirty file, pass on the reverted file.

- [ ] **Step 4: Run full bats suite**

```bash
make test
```

Expected: all bats tests pass, including the new guard.

- [ ] **Step 5: Commit**

```bash
git add tests/fix-threshold-language-guard.bats
git commit -m "$(cat <<'EOF'
test: bats regression guard against hardcoded P0/P1/P2 language

Fails the build if any agent-facing doc (CLAUDE.md, content/) contains
the literal string `P0/P1/P2`. Allowlist covers CHANGELOG.md (historical)
and docs/superpowers/specs/ (frozen designs). Pipe-separated severity
definitions (`P0|P1|P2|P3`) in JSON-schema enums are not flagged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Scaffold root `CHANGELOG.md` entry

**Files:**
- Modify: `CHANGELOG.md` (root)

- [ ] **Step 1: Add an entry to the `[Unreleased]` section**

Edit `CHANGELOG.md`. Below `## [Unreleased]` (currently empty), add:

```markdown
### Added
- **`--fix-threshold` passthrough on review wrappers.** `scaffold run review-pr`,
  `review-code`, and `post-implementation-review` now accept
  `--fix-threshold P0|P1|P2|P3` in `$ARGUMENTS` and forward it to `mmr review`.
  Default behavior unchanged — when the flag is omitted, MMR uses
  `.mmr.yaml` or its built-in default (`P2`).
- **MMR delegated-init guidance** in `automated-pr-review.md`. Pipeline now
  prompts the agent to run `mmr config init` if `.mmr.yaml` is missing,
  rather than scaffold writing the file directly.

### Changed
- **Agent-facing docs read `fix_threshold` from the MMR verdict JSON**
  instead of hardcoding `P0/P1/P2`. Files updated: `CLAUDE.md`,
  `content/tools/review-pr.md`, `review-code.md`,
  `post-implementation-review.md`, `content/pipeline/build/{single,multi}-agent-{start,resume}.md`,
  `content/pipeline/environment/automated-pr-review.md`,
  `content/skills/mmr/SKILL.md`. Behavior is unchanged at the default
  threshold (`P2`); projects that lower or raise the threshold now get
  consistent behavior across all wrappers and prompts.
- **Per-channel review prompt** in `review-code.md` now asks for all P0–P3
  findings (was P0/P1/P2 only). Required so projects running at threshold
  `P3` actually see P3 findings.

### Internal
- Bats regression guard (`tests/fix-threshold-language-guard.bats`) prevents
  reintroduction of literal `P0/P1/P2` into agent-facing docs.
```

- [ ] **Step 2: Verify markdown**

```bash
sed -n '1,40p' CHANGELOG.md
```

Expected: well-formed entry under `[Unreleased]`.

- [ ] **Step 3: Run all gates one final time**

```bash
make check-all
```

Expected: bash quality gates + TypeScript gates all pass. If anything fails, go back and fix before committing.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs(changelog): record fix_threshold configurability work

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Step 1: Confirm clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Verify guard is enforced**

```bash
make check-all
```

Expected: all gates pass, including the new `tests/fix-threshold-language-guard.bats`.

- [ ] **Step 3: End-to-end smoke (optional but recommended)**

In a fresh git repo with a small diff:

```bash
cd /tmp && git init mmr-e2e && cd mmr-e2e
echo "console.log('hi')" > a.js && git add a.js && git commit -m "init"
echo "console.log('changed')" > a.js
node /Users/kenallred/Documents/dev-projects/scaffold/packages/mmr/dist/index.js review --diff <(git diff) --sync --format text --fix-threshold P1
```

(You may need `npm run build` in `packages/mmr` first if `dist/` is stale.)

Expected: text output containing `Threshold: P1`. If any P2 findings exist, output also contains `Advisory: N`.

Cleanup: `rm -rf /tmp/mmr-e2e`.

- [ ] **Step 4: Push and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: configurable mmr fix_threshold" --body "$(cat <<'EOF'
## Summary
- MMR emits `advisory_count` (findings strictly below `fix_threshold`) in JSON results and renders it in text/markdown verdict copy.
- `mmr config init` writes a self-documenting `.mmr.yaml` template (explicit `P2` value with comment block describing each tier).
- Scaffold review wrappers (`review-pr`, `review-code`, `post-implementation-review`) accept and forward `--fix-threshold` from `$ARGUMENTS` to `mmr review`.
- Agent-facing docs read `fix_threshold` from the verdict JSON instead of hardcoding `P0/P1/P2`. The per-channel review prompt now requests all P0–P3 findings (was P0/P1/P2 only).
- Bats regression guard prevents reintroduction of hardcoded threshold language.

Spec: `docs/superpowers/specs/2026-04-28-mmr-fix-threshold-config-design.md`

## Test plan
- [ ] `make check-all` passes locally
- [ ] `npm test` in `packages/mmr/` passes (new advisory-count + config-init tests)
- [ ] `mmr review --fix-threshold P1` against a sample diff shows `Threshold: P1` and `Advisory: N` when non-zero
- [ ] `mmr config init` in a fresh dir writes `.mmr.yaml` with the comment block
- [ ] Bats guard catches a planted `P0/P1/P2` string and passes when reverted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (planner — already done, kept for reference)

**Spec coverage:**
- §1 (advisory_count surfacing) → Tasks 1, 2 ✓
- §2 (wrapper passthrough, doc-only) → Tasks 5, 6, 7 ✓
- §3 (doc dynamicization, including review-code.md:316 critical fix) → Tasks 5, 6, 7, 8, 9, 10, 11 (Task 6 step 5 covers the critical line) ✓
- §4 (mmr config init template) → Task 3 ✓
- §5 (delegated init, no scaffold writer) → Task 10 step 4 ✓
- §6 (vitest + bats tests) → Tasks 1, 2, 3 (vitest), 12 (bats) ✓
- §7 (CHANGELOG entries) → Tasks 4 (mmr) + 13 (scaffold) ✓

**Placeholder scan:** None. Every step has the exact code/command/edit required.

**Type consistency:** `advisory_count` (snake_case) used consistently in JSON, type, formatters, tests. `FIX_THRESHOLD` shell var name consistent across the three meta-prompt tasks.
