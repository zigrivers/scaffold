# Build Observability — MMR Channel + Lens H Full-Profile (Plan 7 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the audit into MMR as a built-in `doc-conformance` channel, and add Lens H's full-profile LLM-graded prose checks. After this plan: every `mmr review` (PR-gated or otherwise) automatically runs the audit alongside Codex/Gemini/Claude/Superpowers, with engine findings mapped to MMR's finding shape and reconciled by location. `scaffold observe audit --profile=full --scope=docs` runs three new LLM-graded sub-checks under Lens H (tech-stack-supports-PRD, PRD-to-stories semantic coverage, cross-doc terminology drift). A reusable LLM dispatcher abstraction lands here so Plan 8's `--fix` flow can build on the same plumbing.

**Architecture:** Three layers. (1) **MMR integration** — a new `--output-mode=mmr-findings` flag on `scaffold observe audit` emits engine findings as a JSON array in MMR's `Finding` shape (with composite stable location `<source_doc>::<lens_id>::<short_id>` so MMR's location-based reconciler treats each finding as unique while preserving identity across runs). A new `doc-conformance` parser is registered in `packages/mmr/src/core/parser.ts`; a `BUILTIN_CHANNELS["doc-conformance"]` entry in `packages/mmr/src/config/defaults.ts` runs the audit command. (2) **LLM dispatcher** — `src/observability/engine/llm-dispatcher.ts` wraps a configurable subprocess command (default `claude -p`, override via `.scaffold/observability.yaml` `llm.dispatcher_command`), pipes a prompt on stdin, parses JSON output, and returns `{ ok, parsed | reason }`. Used by Lens H full-profile checks here; also exported for Plan 8's `--fix` flow. (3) **Lens H full-profile** — three new sub-checks gated on `profile === 'full'`, each building a focused prompt and parsing the LLM's structured response into `Finding[]`. The fast profile remains structural-only.

**Tech Stack:** TypeScript (vitest, no new runtime deps — `js-yaml` already pulled in by Plan 2), bats-core for hermetic MMR channel tests with stubbed external channels.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** Plans 1, 2, 3, 4, 5, 6. Plan 7 reuses `runAudit()` (Plan 2), `Finding`/`Severity` types (Plan 1), `loadObservabilityConfig` (Plan 3), the MMR test harness pattern documented in spec §6.4 (built but not yet exercised — Plan 7 lands the actual tests). It does not modify the engine `EngineOutput` shape.

**Subsequent plans:** Plan 8 — `--fix` flow + worktree teardown script.

---

## Pre-flight

```bash
test -f src/observability/engine/api.ts && \
  test -f src/observability/checks/lens-h-cross-doc.ts && \
  test -f src/observability/engine/checks/observability-config.ts && \
  test -d packages/mmr && \
  test -f packages/mmr/src/config/defaults.ts && \
  test -f packages/mmr/src/core/parser.ts && \
  echo "Plans 1-6 + MMR present" || echo "missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-mmr-channel
cd ../scaffold-observability-mmr-channel
```

No new dependencies.

---

## File Structure

```
src/observability/engine/
  llm-dispatcher.ts                     llm-dispatcher.test.ts        (new) configurable subprocess wrapper
  checks/observability-config.ts        (modify) add `llm.dispatcher_command` + `llm.timeout_s`

src/observability/renderers/
  mmr-findings.ts                       mmr-findings.test.ts          (new) Finding → MMR-Finding mapper

src/observability/checks/
  lens-h-cross-doc.ts                   (modify) full-profile checks gated on profile flag
  lens-h-cross-doc.test.ts              (modify) stubbed-LLM tests for the three new sub-checks

src/observability/engine/checks/runner.ts (modify) propagate profile to lens fns
src/observability/engine/api.ts           (modify) accept --output-mode=mmr-findings; pass profile to lens fns

src/cli/commands/observe.ts               (modify) plumb --output-mode flag through handleAudit
src/cli/index.ts                          (modify) register --output-mode

packages/mmr/src/core/parser.ts           (modify) register `doc-conformance` parser
packages/mmr/src/config/defaults.ts       (modify) add BUILTIN_CHANNELS["doc-conformance"]
packages/mmr/tests/parsers/doc-conformance.test.ts                                 (new)
packages/mmr/tests/integration/doc-conformance-channel.test.ts                     (new) hermetic harness

tests/observability/audit.bats            (modify) bats coverage for --output-mode=mmr-findings + Lens H full
tests/observability/fixtures/mmr/         (new) hermetic MMR test harness (stubbed channels + canned diff)
```

---

## Task 1: `--output-mode=mmr-findings` on `scaffold observe audit`

**Files:**
- Create: `src/observability/renderers/mmr-findings.ts`
- Create: `src/observability/renderers/mmr-findings.test.ts`

The MMR mapper is a renderer: it consumes `EngineOutput` and emits a JSON array in MMR's `Finding` shape. Composite location is the dedupe key.

- [ ] **Step 1: Inspect MMR's Finding shape**

```bash
grep -n "interface Finding\|export.*Finding\|type Finding" packages/mmr/src/types.ts | head -10
```

Identify the exact field set (typically `severity`, `location`, `description`, `suggestion`, optional `id`/`category`/etc.). The mapping in Step 2 must match this shape.

- [ ] **Step 2: Write the failing test**

Create `src/observability/renderers/mmr-findings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderMmrFindings } from './mmr-findings'
import type { EngineOutput } from '../engine/types'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'audit', args: { profile: 'fast', scope: 'all' }, started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  },
  snapshot: null, replay: null,
  findings: [
    { id: '3a8c1f0211223344', lens_id: 'B-ac-coverage', severity: 'P0',
      title: 'AC has failing test', description: 'Test refresh.spec.ts is failing.',
      source_doc: 'docs/user-stories.md#user-auth-1',
      evidence: { kind: 'rule_violation', rule_id: 'ac-test-failing', file: 'file:src/auth/test.spec.ts' },
      confidence: 'high', first_seen: '', last_seen: '', status: 'open',
      fix_hint: { kind: 'add_test', target: 'src/auth/test.spec.ts', prompt: 'Re-enable the test' } },
    { id: '9d1e02f455667788', lens_id: 'A-tdd', severity: 'P1',
      title: 'AC without test', description: 'AC has no test.',
      source_doc: 'docs/user-stories.md#story-s-1',
      evidence: { kind: 'ac_not_covered', story_id: 'story:s-1', ac_id: 'ac:s-1.1', missing_tests: [] },
      confidence: 'medium', first_seen: '', last_seen: '', status: 'acknowledged' },
    { id: 'ffeeddccbbaa9988', lens_id: 'D-stack', severity: 'P3',
      title: 'D-stack: skipped', description: 'pipeline_docs unavailable',
      source_doc: '', evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['pipeline_docs'] },
      confidence: 'high', first_seen: '', last_seen: '', status: 'skipped' },
  ],
  needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P1', verdict: 'blocked',
  summary: { total: 3, by_severity: { P0: 1, P1: 1, P2: 0, P3: 1 },
    by_severity_status: { P0: { open: 1, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 1, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 1 } },
    blocking: 1, acknowledged: 1, skipped_lenses: 1 },
}

describe('renderMmrFindings', () => {
  it('emits a JSON array — one entry per non-skipped finding (skipped lenses excluded)', () => {
    const out = renderMmrFindings(baseOut)
    const parsed = JSON.parse(out) as Array<{ severity: string; location: string; description: string; suggestion?: string }>
    expect(parsed).toHaveLength(2) // skipped finding excluded
    expect(parsed.every((f) => ['P0', 'P1', 'P2', 'P3'].includes(f.severity))).toBe(true)
  })

  it('builds composite location <source_doc>::<lens_id>::<short_id> for stable cross-run identity', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ location: string }>
    expect(arr[0].location).toBe('docs/user-stories.md#user-auth-1::B-ac-coverage::3a8c1f02')
    expect(arr[1].location).toBe('docs/user-stories.md#story-s-1::A-tdd::9d1e02f4')
  })

  it('description prefixes lens_id and includes the engine title', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ description: string }>
    expect(arr[0].description).toMatch(/^\[doc-conformance\/B-ac-coverage\]/)
    expect(arr[0].description).toContain('AC has failing test')
  })

  it('suggestion is fix_hint.prompt when present, else fix_hint.target, else empty string', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ suggestion?: string }>
    expect(arr[0].suggestion).toBe('Re-enable the test')
    expect(arr[1].suggestion).toBe('')
  })

  it('emits a stable JSON shape that is valid JSON.parse-able', () => {
    expect(() => JSON.parse(renderMmrFindings(baseOut))).not.toThrow()
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/mmr-findings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `mmr-findings.ts`**

Create `src/observability/renderers/mmr-findings.ts`:

```typescript
import type { EngineOutput, Finding } from '../engine/types'
import { redactRendered } from '../engine/redact'

export interface MmrFindingShape {
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  location: string
  description: string
  suggestion?: string
  category?: string
}

function findingToMmr(f: Finding): MmrFindingShape {
  const shortId = f.id.slice(0, 8)
  const location = `${f.source_doc || '(no-source-doc)'}::${f.lens_id}::${shortId}`
  const description = `[doc-conformance/${f.lens_id}] ${f.title}${f.description ? ` — ${f.description}` : ''}`
  const suggestion = f.fix_hint?.prompt ?? f.fix_hint?.target ?? ''
  return {
    severity: f.severity,
    location,
    description,
    suggestion,
    category: 'doc-conformance',
  }
}

export function renderMmrFindings(out: EngineOutput): string {
  const findings = out.findings
    .filter((f) => f.status !== 'skipped')   // skipped lenses are not actionable findings
    .map(findingToMmr)
  return redactRendered(JSON.stringify(findings))
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/mmr-findings.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Wire `--output-mode=mmr-findings` through `handleAudit`**

Append to `src/cli/commands/observe.test.ts`:

```typescript
describe('observe audit --output-mode=mmr-findings', () => {
  it('emits a JSON array (not the EngineOutput object) suitable for MMR consumption', async () => {
    const proj = mkdtempSync(join(tmpdir(), 'observe-mmrf-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\n`)
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')

    let captured = ''
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleAudit({
        cwd: proj, json: false, profile: 'fast', scope: 'all', sinceHours: 24,
        outputMode: 'mmr-findings', ghBin: '/no/such/gh', bdBin: '/no/such/bd',
      })
    } finally { process.stdout.write = orig }
    rmSync(proj, { recursive: true, force: true })

    const parsed = JSON.parse(captured)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.every((f: { severity: string; location: string }) => f.severity && f.location)).toBe(true)
  })
})
```

In `src/cli/commands/observe.ts`, extend `HandleAuditInput`:

```typescript
import { renderMmrFindings } from '../../observability/renderers/mmr-findings'

export interface HandleAuditInput {
  // ... existing fields
  outputMode?: 'mmr-findings'
}
```

In `handleAudit`, after `runAudit(...)` and before the existing markdown/JSON branches, add:

```typescript
if (input.outputMode === 'mmr-findings') {
  process.stdout.write(renderMmrFindings(out))
  return out.verdict === 'blocked' ? 1 : 0
}
```

In `src/cli/index.ts`, add to the `audit` command builder:

```typescript
.option('output-mode', { type: 'string', choices: ['mmr-findings'] as const, describe: 'Emit findings in MMR Finding shape (skips markdown/sidecar)' })
```

And thread through:

```typescript
outputMode: argv.outputMode as 'mmr-findings' | undefined,
```

- [ ] **Step 7: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/observability/renderers/mmr-findings.ts src/observability/renderers/mmr-findings.test.ts src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "observability: --output-mode=mmr-findings emits engine findings in MMR Finding shape (composite stable location)"
```

---

## Task 2: Register `doc-conformance` parser in MMR

**Files:**
- Modify: `packages/mmr/src/core/parser.ts`
- Create: `packages/mmr/tests/parsers/doc-conformance.test.ts`

- [ ] **Step 1: Read the parser-registry pattern**

```bash
grep -n "getParser\|ParserName\|PARSERS\|registerParser" packages/mmr/src/core/parser.ts | head -10
```

Identify the registration mechanism. Typically there's a `Record<ParserName, ParserFn>` with entries `default`, `gemini`, etc., and a `getParser(name): ParserFn` function with a default fallback.

- [ ] **Step 2: Write the failing test**

Create `packages/mmr/tests/parsers/doc-conformance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getParser } from '../../src/core/parser'

describe('doc-conformance parser', () => {
  it('getParser("doc-conformance") returns a parser function (not the default fallback)', () => {
    const parser = getParser('doc-conformance')
    const dflt = getParser('default')
    expect(parser).not.toBe(dflt)
    expect(typeof parser).toBe('function')
  })

  it('parses a JSON-array input into ParsedOutput.findings', () => {
    const parser = getParser('doc-conformance')
    const input = JSON.stringify([
      { severity: 'P0', location: 'docs/x.md::A-tdd::abc12345', description: '[doc-conformance/A-tdd] failing test', suggestion: 'fix it', category: 'doc-conformance' },
      { severity: 'P2', location: 'docs/y.md::B::def67890', description: 'desc', suggestion: '', category: 'doc-conformance' },
    ])
    const result = parser(input)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0].severity).toBe('P0')
    expect(result.findings[0].location).toContain('A-tdd::abc12345')
  })

  it('returns empty findings for invalid JSON without throwing', () => {
    const parser = getParser('doc-conformance')
    const result = parser('not json')
    expect(result.findings).toEqual([])
    expect(result.error).toBeDefined()
  })

  it('returns empty findings for non-array JSON', () => {
    const parser = getParser('doc-conformance')
    const result = parser('{"not": "an array"}')
    expect(result.findings).toEqual([])
  })

  it('skips entries that lack required fields', () => {
    const parser = getParser('doc-conformance')
    const input = JSON.stringify([
      { severity: 'P0', location: 'a::b::c', description: 'good' },
      { severity: 'X', location: 'a::b::c', description: 'bad severity' },
      { severity: 'P1' /* missing location */, description: 'incomplete' },
    ])
    const result = parser(input)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toBe('good')
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run packages/mmr/tests/parsers/doc-conformance.test.ts
```

Expected: FAIL — `doc-conformance` not registered (returns `default` parser).

- [ ] **Step 4: Register the parser**

In `packages/mmr/src/core/parser.ts`, add the parser implementation and register it. Indicative shape (adapt to MMR's actual registry pattern):

```typescript
const VALID_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3'])

function docConformanceParser(input: string): ParsedOutput {
  let raw: unknown
  try { raw = JSON.parse(input) } catch (err) {
    return { findings: [], error: `doc-conformance: invalid JSON — ${(err as Error).message}` }
  }
  if (!Array.isArray(raw)) {
    return { findings: [], error: 'doc-conformance: expected JSON array' }
  }
  const findings = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.severity !== 'string' || !VALID_SEVERITIES.has(e.severity)) continue
    if (typeof e.location !== 'string') continue
    if (typeof e.description !== 'string') continue
    findings.push({
      severity: e.severity,
      location: e.location,
      description: e.description,
      suggestion: typeof e.suggestion === 'string' ? e.suggestion : '',
      category: typeof e.category === 'string' ? e.category : 'doc-conformance',
    })
  }
  return { findings }
}

// In the registry block (adapt to actual structure):
PARSERS['doc-conformance'] = docConformanceParser
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run packages/mmr/tests/parsers/doc-conformance.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/parser.ts packages/mmr/tests/parsers/doc-conformance.test.ts
git commit -m "mmr: register doc-conformance parser (JSON-array → ParsedOutput.findings; tolerant of malformed input)"
```

---

## Task 3: Add `BUILTIN_CHANNELS["doc-conformance"]` to MMR

**Files:**
- Modify: `packages/mmr/src/config/defaults.ts`
- Modify: `packages/mmr/tests/config/defaults.test.ts` (or wherever channel registration is tested)

- [ ] **Step 1: Read the existing builtin-channels block**

```bash
sed -n '20,90p' packages/mmr/src/config/defaults.ts
```

Identify the `ChannelConfigParsed` shape and the `auth.check` / `auth.recovery` / `output_parser` field conventions.

- [ ] **Step 2: Write the failing test**

In `packages/mmr/tests/config/defaults.test.ts` (creating it if it doesn't exist):

```typescript
import { describe, it, expect } from 'vitest'
import { BUILTIN_CHANNELS } from '../../src/config/defaults'

describe('BUILTIN_CHANNELS — doc-conformance', () => {
  it('exposes a doc-conformance channel', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']).toBeDefined()
  })

  it('command invokes scaffold observe audit with --output-mode=mmr-findings', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].command).toMatch(/scaffold observe audit/)
    expect(BUILTIN_CHANNELS['doc-conformance'].command).toMatch(/--output-mode=mmr-findings/)
  })

  it('output_parser is set to doc-conformance', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].output_parser).toBe('doc-conformance')
  })

  it('auth.check verifies scaffold is installed', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].auth.check).toMatch(/scaffold/)
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run packages/mmr/tests/config/defaults.test.ts
```

Expected: FAIL — `BUILTIN_CHANNELS['doc-conformance']` not defined.

- [ ] **Step 4: Add the channel entry**

Add to `BUILTIN_CHANNELS` in `packages/mmr/src/config/defaults.ts`:

```typescript
  'doc-conformance': {
    command: 'scaffold observe audit --profile=fast --scope=all --output-mode=mmr-findings',
    timeout_ms: 60_000,
    auth: {
      check: 'scaffold --version >/dev/null 2>&1',
      recovery: 'npm install -g @zigrivers/scaffold',
    },
    output_parser: 'doc-conformance',
  },
```

(Adapt the shape to match the existing entries' fields exactly. If `timeout_ms` is named differently or missing, copy the pattern from the `claude` entry above it.)

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run packages/mmr/tests/config/defaults.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/config/defaults.ts packages/mmr/tests/config/defaults.test.ts
git commit -m "mmr: add BUILTIN_CHANNELS['doc-conformance'] (runs scaffold observe audit, parsed by doc-conformance)"
```

---

## Task 4: Hermetic MMR-channel integration test

**Files:**
- Create: `packages/mmr/tests/integration/doc-conformance-channel.test.ts`
- Create: `tests/observability/fixtures/mmr/test-config.yaml`
- Create: `tests/observability/fixtures/mmr/pr-diff.patch`
- Create: `tests/observability/fixtures/mmr/stub-channels/{codex,gemini,claude,superpowers}.sh`

A hermetic test stubs every external channel (Codex/Gemini/Claude/Superpowers) and exercises only the real `doc-conformance` channel. No network, no auth.

- [ ] **Step 1: Create the fixture diff and stubbed channel scripts**

Create `tests/observability/fixtures/mmr/pr-diff.patch`:

```patch
diff --git a/src/auth/login.ts b/src/auth/login.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/auth/login.ts
@@ -0,0 +1,3 @@
+export function login(email: string, password: string): boolean {
+  return email.length > 0 && password.length > 0
+}
```

Create the four stub channel scripts (each is a tiny shell script that emits a fixed-format response). Example for `tests/observability/fixtures/mmr/stub-channels/codex.sh`:

```bash
#!/usr/bin/env bash
# Stub codex channel for hermetic MMR integration tests. Emits a single fixed finding
# in whatever shape MMR's `default` parser expects (adapt if needed).
cat <<'EOF'
[
  { "severity": "P2", "location": "src/auth/login.ts:1", "description": "[codex] minor style nit", "suggestion": "ok" }
]
EOF
```

(Each of `codex.sh`, `gemini.sh`, `claude.sh`, `superpowers.sh` follows the same shape; adapt the JSON to the parser each channel uses today.)

Make all four executable:

```bash
chmod +x tests/observability/fixtures/mmr/stub-channels/*.sh
```

Create `tests/observability/fixtures/mmr/test-config.yaml`:

```yaml
# Hermetic test config — overrides BUILTIN_CHANNELS for codex/gemini/claude/superpowers
# with shell stubs. The doc-conformance channel is the real one (binary under test).
channels:
  codex:
    command: 'sh tests/observability/fixtures/mmr/stub-channels/codex.sh'
    output_parser: default
    auth:
      check: 'true'
      recovery: ''
  gemini:
    command: 'sh tests/observability/fixtures/mmr/stub-channels/gemini.sh'
    output_parser: default
    auth: { check: 'true', recovery: '' }
  claude:
    command: 'sh tests/observability/fixtures/mmr/stub-channels/claude.sh'
    output_parser: default
    auth: { check: 'true', recovery: '' }
  superpowers:
    command: 'sh tests/observability/fixtures/mmr/stub-channels/superpowers.sh'
    output_parser: default
    auth: { check: 'true', recovery: '' }
```

(Adapt config shape to MMR's actual schema; the key behaviors are: substitute the four external commands with stubs, leave `doc-conformance` unsubstituted so MMR uses its built-in entry.)

- [ ] **Step 2: Write the failing integration test**

Create `packages/mmr/tests/integration/doc-conformance-channel.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('mmr review --diff with doc-conformance channel (hermetic)', () => {
  let proj: string
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'mmr-doc-conf-'))
    // Bootstrap a minimal scaffold project so `scaffold observe audit` produces findings
    execFileSync('git', ['init', '-q'], { cwd: proj })
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: proj })
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: proj })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n`)
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('runs the doc-conformance channel against a fixture diff and produces findings', () => {
    const out = execFileSync('mmr', [
      'review',
      '--diff', 'tests/observability/fixtures/mmr/pr-diff.patch',
      '--channels', 'doc-conformance',
      '--config', 'tests/observability/fixtures/mmr/test-config.yaml',
      '--sync', '--format', 'json',
    ], { cwd: proj, encoding: 'utf8' })

    const result = JSON.parse(out) as { reconciled_findings: Array<{ location: string; description: string }> }
    expect(result.reconciled_findings.length).toBeGreaterThan(0)
    // Every doc-conformance finding's location embeds a lens_id and short_id
    for (const f of result.reconciled_findings) {
      expect(f.location).toMatch(/::[A-Z]-[a-z-]+::[0-9a-f]{8}/)
      expect(f.description).toMatch(/^\[doc-conformance\//)
    }
  })

  it('reconciles with stubbed external channels without spurious cross-channel collapse', () => {
    const out = execFileSync('mmr', [
      'review',
      '--diff', 'tests/observability/fixtures/mmr/pr-diff.patch',
      '--config', 'tests/observability/fixtures/mmr/test-config.yaml',
      '--sync', '--format', 'json',
    ], { cwd: proj, encoding: 'utf8' })

    const result = JSON.parse(out) as { per_channel: Record<string, { findings: unknown[] }> }
    // All five channels (4 stubs + doc-conformance) reported
    expect(Object.keys(result.per_channel).sort()).toEqual(['claude', 'codex', 'doc-conformance', 'gemini', 'superpowers'])
    expect(result.per_channel['doc-conformance'].findings.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run packages/mmr/tests/integration/doc-conformance-channel.test.ts
```

Expected: FAIL — either the channel isn't registered yet, the parser isn't routed, or the stub config doesn't override the externals.

- [ ] **Step 4: Make the test pass**

The fixes are mostly Plan-7 work that already landed in Tasks 1-3. If the test still fails, common causes:
- `scaffold` binary not on PATH — make sure `npm link` or equivalent is run before the test, or the channel command uses an absolute path.
- Stub channel commands not invoked because MMR's config-merge logic reads command from BUILTIN_CHANNELS rather than the user override — verify how MMR's loader merges layers and adjust the test config to land at the right precedence.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/tests/integration/doc-conformance-channel.test.ts tests/observability/fixtures/mmr/
git commit -m "mmr: hermetic integration test for doc-conformance channel (4 external channels stubbed)"
```

---

## Task 5: LLM dispatcher abstraction

**Files:**
- Create: `src/observability/engine/llm-dispatcher.ts`
- Create: `src/observability/engine/llm-dispatcher.test.ts`
- Modify: `src/observability/engine/checks/observability-config.ts`

The dispatcher is reused by Lens H full-profile (Plan 7) and Plan 8's --fix flow. It takes a prompt, runs a configurable subprocess, and returns parsed JSON or a structured failure.

- [ ] **Step 1: Extend the config schema**

In `src/observability/engine/checks/observability-config.ts`, extend `ObservabilityConfig` and `DEFAULT_CONFIG`:

```typescript
export interface LlmConfig {
  dispatcher_command?: string  // default: "claude -p"
  timeout_s?: number           // default: 60
}

export interface ObservabilityConfig {
  // ... existing fields
  llm: LlmConfig
}

export const DEFAULT_CONFIG: ObservabilityConfig = {
  // ... existing fields
  llm: { dispatcher_command: 'claude -p', timeout_s: 60 },
}
```

- [ ] **Step 2: Write the failing test**

Create `src/observability/engine/llm-dispatcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { dispatchLlm } from './llm-dispatcher'

describe('dispatchLlm', () => {
  it('returns ok=true with parsed JSON when the subprocess emits valid JSON on stdout', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'sh -c "cat >/dev/null; printf \\"%s\\" \'{\\"answer\\": \\"yes\\", \\"findings\\": []}\'"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed).toEqual({ answer: 'yes', findings: [] })
  })

  it('returns ok=false with a parse error when stdout is not JSON', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'sh -c "cat >/dev/null; printf not-json"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/parse|JSON/i)
  })

  it('returns ok=false with timeout when subprocess exceeds timeoutMs', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'sh -c "sleep 5"',
      timeoutMs: 100,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/timeout|timed out/i)
  })

  it('passes the prompt to subprocess stdin', async () => {
    const result = await dispatchLlm({
      prompt: 'echo back',
      command: 'sh -c "cat | sed \'s/.*/{\\\\\"received\\\\\": \\\\\"&\\\\\"}/\'"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.parsed as { received: string }).received).toBe('echo back')
  })

  it('returns ok=false when the binary is missing', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: '/no/such/binary',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ENOENT|not found|exit/i)
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/llm-dispatcher.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `llm-dispatcher.ts`**

Create `src/observability/engine/llm-dispatcher.ts`:

```typescript
import { spawn } from 'node:child_process'

export interface DispatchInput {
  prompt: string
  command: string
  timeoutMs: number
}

export type DispatchResult =
  | { ok: true; parsed: unknown; raw: string }
  | { ok: false; reason: string; raw?: string }

export function dispatchLlm(input: DispatchInput): Promise<DispatchResult> {
  return new Promise((resolve) => {
    const [bin, ...args] = parseShellCommand(input.command)
    let child
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, reason: `spawn failed: ${(err as Error).message}` })
      return
    }

    let stdout = ''
    let stderr = ''
    let resolved = false

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      resolve({ ok: false, reason: `timed out after ${input.timeoutMs}ms`, raw: stdout })
    }, input.timeoutMs)

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const code = err.code ?? 'unknown'
      resolve({ ok: false, reason: `subprocess error (${code}): ${err.message}`, raw: stdout })
    })

    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      if (code !== 0) {
        resolve({ ok: false, reason: `subprocess exit ${code}: ${stderr.trim().slice(0, 200) || 'no stderr'}`, raw: stdout })
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim())
        resolve({ ok: true, parsed, raw: stdout })
      } catch (err) {
        resolve({ ok: false, reason: `JSON parse failed: ${(err as Error).message}`, raw: stdout })
      }
    })

    try {
      child.stdin?.write(input.prompt)
      child.stdin?.end()
    } catch (err) {
      resolved = true
      clearTimeout(timer)
      resolve({ ok: false, reason: `stdin write failed: ${(err as Error).message}` })
    }
  })
}

// Naive shell-string splitter. Sufficient for `claude -p` style commands; doesn't handle quoted args
// the way bash does. Intentionally simple; users who need shell semantics should pre-wrap in `sh -c`.
function parseShellCommand(cmd: string): string[] {
  return cmd.trim().split(/\s+/)
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/llm-dispatcher.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/observability/engine/llm-dispatcher.ts src/observability/engine/llm-dispatcher.test.ts src/observability/engine/checks/observability-config.ts
git commit -m "observability: LLM dispatcher abstraction (configurable subprocess + JSON parse + timeout); reused by Lens H full-profile and Plan 8 --fix flow"
```

---

## Task 6: Profile gating in `runChecks` — pass `profile` to lens fns

The runner already accepts `profile: 'fast' | 'full'`. Task 6 makes that value visible to lens functions so Lens H can branch on it.

**Files:**
- Modify: `src/observability/engine/checks/runner.ts`
- Modify: `src/observability/engine/checks/runner.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/checks/runner.test.ts`:

```typescript
it('passes the profile to each lens function via the LensFnContext', async () => {
  const captured: string[] = []
  const registry: LensManifest[] = [
    { id: 'P', name: 'P', profiles: ['fast', 'full'], required: ['pipeline_docs'], optional: [] },
  ]
  const lenses = {
    P: async (_g: unknown, _l: unknown, _a: unknown, _u: unknown, _e: unknown, ctx?: { profile?: string }) => {
      captured.push(ctx?.profile ?? '(missing)')
      return [] as never[]
    },
  }
  await runChecks({ registry, lenses, graph: stubGraph, ledger: { events: [] }, availability: stubAvailability, profile: 'full' })
  expect(captured).toEqual(['full'])
})
```

- [ ] **Step 2: Update `LensFn` signature and runner**

In `src/observability/engine/checks/runner.ts`, extend the lens-function signature with an optional context:

```typescript
export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
}

export type LensFn = (
  graph: DocGraph,
  ledger: { events: Event[] },
  availability: AvailabilityMap,
  upstreamFindings: Finding[],
  enabledIds: Set<string>,
  context: LensContext,
) => Promise<Finding[]>
```

Update `runChecks` to pass `{ profile: input.profile, cwd: process.cwd() }` as the new arg, and propagate the additional argument through every existing lens call site (Tasks 18-20 of Plan 2 and Tasks 6-10 of Plan 3 introduced 8 lenses; each gets a no-op signature update unless it actively uses `profile`).

- [ ] **Step 3: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/checks/runner.test.ts
```

Expected: PASS — the original 4 tests + the new context test. Existing lens tests may fail because their function signatures mismatch the new `LensFn` shape; update each lens module's exported function accordingly (just add the unused `_context: LensContext` parameter).

- [ ] **Step 4: Run the entire observability + checks test suite**

```bash
npx vitest run src/observability/
```

Expected: PASS — every existing test, including all lens tests, since the lens signatures are now `(graph, ledger, availability, upstream, enabled, _context)`.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/checks/runner.ts src/observability/engine/checks/runner.test.ts src/observability/checks/lens-*.ts src/observability/engine/api.ts
git commit -m "observability: lens functions receive profile + cwd via LensContext (fast vs full gating)"
```

---

## Task 7: Lens H full-profile — tech-stack-supports-PRD (LLM-graded)

**Files:**
- Modify: `src/observability/checks/lens-h-cross-doc.ts`
- Modify: `src/observability/checks/lens-h-cross-doc.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/checks/lens-h-cross-doc.test.ts`:

```typescript
import { vi } from 'vitest'

describe('lensHCrossDoc — full-profile tech-stack-supports-PRD (LLM-graded)', () => {
  it('emits P0 when LLM returns a contradiction finding', async () => {
    // Stub the LLM dispatcher
    const dispatchModule = await import('../engine/llm-dispatcher')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: true,
      parsed: { findings: [{
        severity: 'P0', kind: 'tech-stack-vs-prd',
        title: 'PRD requires offline operation but tech-stack mandates Postgres',
        description: 'PRD §Constraints says "must work offline"; tech-stack chose Postgres which has no offline mode.',
      }] },
      raw: '',
    })

    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '', prose: 'Must work offline.' }]
    g.components = [{ id: 'component:postgres', package_or_url: 'postgres@16', layer: 'data', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    const llmFinding = findings.find((f) => /tech-stack/i.test(f.title))
    expect(llmFinding?.severity).toBe('P0')
    stub.mockRestore()
  })

  it('does NOT run the full-profile checks when profile=fast', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({ ok: true, parsed: { findings: [] }, raw: '' })
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.components = [{ id: 'component:x', package_or_url: 'x@1', source_anchor: '' }]
    const ctx = { profile: 'fast' as const, cwd: process.cwd() }
    await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(stub).not.toHaveBeenCalled()
    stub.mockRestore()
  })

  it('skips the full-profile check (no P0 emitted) when LLM dispatcher fails', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({ ok: false, reason: 'dispatcher unavailable' })
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.components = [{ id: 'component:x', package_or_url: 'x@1', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(findings.find((f) => /tech-stack/i.test(f.title))).toBeUndefined()
    stub.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: FAIL — full-profile sub-check not yet implemented.

- [ ] **Step 3: Add the full-profile sub-check**

In `src/observability/checks/lens-h-cross-doc.ts`, near the bottom of `lensHCrossDoc` (before the final `return findings`):

```typescript
import { dispatchLlm } from '../engine/llm-dispatcher'
import { loadObservabilityConfig } from '../engine/checks/observability-config'

// inside lensHCrossDoc, after all structural fast checks:

if (context?.profile === 'full' && graph.features.length > 0 && graph.components.length > 0) {
  const config = loadObservabilityConfig(context.cwd)
  const cmd = config.llm.dispatcher_command ?? 'claude -p'
  const timeoutMs = (config.llm.timeout_s ?? 60) * 1000

  const prdProse = graph.features
    .filter((f) => f.priority === 'must' || f.priority === 'should')
    .map((f) => `### ${f.title} (${f.priority})\n${f.prose ?? '(no prose)'}\n`)
    .join('\n')
  const techStackText = graph.components
    .map((c) => `- ${c.id}: ${c.package_or_url}${c.layer ? ` (layer: ${c.layer})` : ''}`)
    .join('\n')

  const prompt = `You are auditing two scaffold-pipeline planning documents for direct contradictions or soft tensions.

PRD features (priority: must/should only):
${prdProse}

Tech stack:
${techStackText}

Identify findings where the tech-stack contradicts (P0) or is in tension with (P2) the PRD's constraints. Return ONLY a JSON object of the form:
{"findings": [{"severity": "P0"|"P2", "title": "<≤ 80 chars>", "description": "<≤ 500 chars>"}]}
Return {"findings": []} if there are no issues.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (result.ok) {
    const parsed = result.parsed as { findings?: Array<{ severity: string; title: string; description: string }> }
    for (const f of parsed.findings ?? []) {
      if (f.severity !== 'P0' && f.severity !== 'P2') continue
      findings.push({
        id: makeFindingId([lensId, 'tech-stack-vs-prd', f.title]),
        lens_id: lensId, severity: f.severity as 'P0' | 'P2',
        title: f.title.slice(0, 80),
        description: f.description.slice(0, 500),
        source_doc: 'docs/plan.md',
        evidence: { kind: 'doc_disagreement', left_doc: 'docs/plan.md', right_doc: 'docs/tech-stack.md', conflict: f.title },
        confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }
  // If dispatcher fails, silently skip — full-profile checks are advisory; don't pollute findings with infra failures.
}
```

(Update `lensHCrossDoc`'s function signature to accept the new optional `context: LensContext` argument and `findings`, `lensId`, `now`, `makeFindingId` are already in scope from earlier in the function body.)

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: PASS, all lens H tests including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-h-cross-doc.ts src/observability/checks/lens-h-cross-doc.test.ts
git commit -m "observability: lens H full-profile — tech-stack-supports-PRD (LLM-graded P0/P2; skipped on dispatcher failure)"
```

---

## Task 8: Lens H full-profile — PRD-to-stories semantic coverage

**Files:**
- Modify: `src/observability/checks/lens-h-cross-doc.ts`
- Modify: `src/observability/checks/lens-h-cross-doc.test.ts`

- [ ] **Step 1: Append the failing test**

```typescript
it('emits P1 when LLM finds a PRD-prose feature with no covering story', async () => {
  const dispatchModule = await import('../engine/llm-dispatcher')
  const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
    ok: true,
    parsed: { findings: [{
      severity: 'P1', kind: 'prd-feature-no-story',
      title: 'PRD describes "anonymous browsing" but no story covers it',
      description: 'PRD §Features describes anonymous browsing in prose; no Story user-stories.md captures it.',
    }] },
    raw: '',
  })
  const g = emptyGraph()
  g.features = [{ id: 'feature:auth', title: 'User Auth', priority: 'must', source_anchor: '', prose: 'Users sign in.\n\nAlso anyone can browse anonymously.' }]
  g.stories = [{ id: 'story:auth-1', title: 'Sign in', priority: 'must', source_anchor: '' }]
  const ctx = { profile: 'full' as const, cwd: process.cwd() }
  const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
  expect(findings.find((f) => /anonymous browsing/i.test(f.description))?.severity).toBe('P1')
  stub.mockRestore()
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the second full-profile sub-check**

In `lens-h-cross-doc.ts`, after the tech-stack block (still inside the `if (context?.profile === 'full')` outer guard or as a sibling block):

```typescript
if (context?.profile === 'full' && graph.features.length > 0 && graph.stories.length > 0) {
  // … reuse `cmd`, `timeoutMs` from earlier in the function …
  const featuresProse = graph.features
    .map((f) => `### ${f.title}\n${f.prose ?? '(no prose)'}\n`)
    .join('\n')
  const storiesList = graph.stories
    .map((s) => `- ${s.id}: ${s.title} (${s.priority})`)
    .join('\n')

  const prompt = `You are checking whether the user-stories cover the features described in the PRD's prose.

PRD features (with prose):
${featuresProse}

Existing user stories:
${storiesList}

Identify features that are described in PRD prose but have no covering story. Return ONLY a JSON object of the form:
{"findings": [{"severity": "P1", "title": "<≤ 80 chars>", "description": "<≤ 500 chars>"}]}
Return {"findings": []} if all PRD-prose features are covered.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (result.ok) {
    const parsed = result.parsed as { findings?: Array<{ severity: string; title: string; description: string }> }
    for (const f of parsed.findings ?? []) {
      if (f.severity !== 'P1') continue
      findings.push({
        id: makeFindingId([lensId, 'prd-feature-no-story-prose', f.title]),
        lens_id: lensId, severity: 'P1',
        title: f.title.slice(0, 80),
        description: f.description.slice(0, 500),
        source_doc: 'docs/plan.md',
        evidence: { kind: 'doc_disagreement', left_doc: 'docs/plan.md', right_doc: 'docs/user-stories.md', conflict: f.title },
        confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-h-cross-doc.ts src/observability/checks/lens-h-cross-doc.test.ts
git commit -m "observability: lens H full-profile — PRD-to-stories semantic coverage (LLM-graded P1)"
```

---

## Task 9: Lens H full-profile — cross-doc terminology drift (P2 only)

**Files:**
- Modify: `src/observability/checks/lens-h-cross-doc.ts`
- Modify: `src/observability/checks/lens-h-cross-doc.test.ts`

- [ ] **Step 1: Append the failing test**

```typescript
it('emits P2 when LLM detects terminology drift across docs', async () => {
  const dispatchModule = await import('../engine/llm-dispatcher')
  const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
    ok: true,
    parsed: { findings: [{
      severity: 'P2', kind: 'terminology-drift',
      title: 'PRD says "user account" but stories say "profile"',
      description: 'Concept inconsistency: PRD §Personas says "user account"; user-stories.md uses "profile" interchangeably.',
    }] },
    raw: '',
  })
  const g = emptyGraph()
  g.features = [{ id: 'feature:auth', title: 'Auth', priority: 'must', source_anchor: '', prose: 'Users have user accounts.' }]
  g.stories = [{ id: 'story:s-1', title: 'Edit profile', priority: 'must', source_anchor: '' }]
  const ctx = { profile: 'full' as const, cwd: process.cwd() }
  const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
  expect(findings.find((f) => /terminology/i.test(f.title))?.severity).toBe('P2')
  stub.mockRestore()
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the third full-profile sub-check**

```typescript
if (context?.profile === 'full' && (graph.features.length > 0 || graph.stories.length > 0)) {
  const docDigest = [
    graph.features.length > 0 ? `## PRD features\n${graph.features.map((f) => `- ${f.title}: ${(f.prose ?? '').slice(0, 200)}`).join('\n')}` : '',
    graph.stories.length > 0 ? `## Stories\n${graph.stories.map((s) => `- ${s.id}: ${s.title}`).join('\n')}` : '',
    graph.rules.length > 0 ? `## Standards rules\n${graph.rules.map((r) => `- ${r.id}: ${r.description}`).join('\n')}` : '',
    graph.tokens.length > 0 ? `## Design tokens\n${graph.tokens.map((t) => `- ${t.id} (${t.category})`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const prompt = `Detect terminology drift across these scaffold-pipeline planning documents — same concept named differently across docs (e.g. "user account" vs "profile" vs "user record").

${docDigest}

Return ONLY a JSON object of the form:
{"findings": [{"severity": "P2", "title": "<≤ 80 chars>", "description": "<≤ 500 chars>"}]}
Return {"findings": []} when terminology is internally consistent.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (result.ok) {
    const parsed = result.parsed as { findings?: Array<{ severity: string; title: string; description: string }> }
    for (const f of parsed.findings ?? []) {
      if (f.severity !== 'P2') continue
      findings.push({
        id: makeFindingId([lensId, 'terminology-drift', f.title]),
        lens_id: lensId, severity: 'P2',
        title: f.title.slice(0, 80),
        description: f.description.slice(0, 500),
        source_doc: 'docs/plan.md',
        evidence: { kind: 'doc_disagreement', left_doc: 'multiple', right_doc: 'multiple', conflict: f.title },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-h-cross-doc.test.ts
```

Expected: PASS, all lens H tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-h-cross-doc.ts src/observability/checks/lens-h-cross-doc.test.ts
git commit -m "observability: lens H full-profile — cross-doc terminology drift (LLM-graded P2)"
```

---

## Task 10: bats end-to-end — `--profile=full` and MMR channel from CLI

**Files:**
- Modify: `tests/observability/audit.bats`

- [ ] **Step 1: Append cases**

Append to `tests/observability/audit.bats`:

```bash
@test "observe audit --output-mode=mmr-findings emits a JSON array" {
    cat > docs/plan.md <<'EOF'
# PRD
## Features
### F [priority: must]
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF
    cat > docs/tdd-standards.md <<'EOF'
# TDD
EOF

    run $BIN observe audit --output-mode=mmr-findings --since-hours=24
    [ "$status" -eq 1 ] # blocked (Lens H finds story not covered)
    # Output should start with '['
    [[ "$output" == \[* ]]
    # And contain a composite location
    [[ "$output" == *"::H-cross-doc::"* ]]
}

@test "observe audit --profile=full does not crash when LLM dispatcher is missing" {
    cat > docs/plan.md <<'EOF'
# PRD
## Features
### F [priority: must]
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF
    cat > docs/tech-stack.md <<'EOF'
## Frontend
### React
- package_or_url: react@18
EOF
    cat > docs/tdd-standards.md <<'EOF'
# TDD
EOF
    cat > .scaffold/observability.yaml <<'EOF'
llm:
  dispatcher_command: "/no/such/llm"
  timeout_s: 1
EOF

    # Audit with --profile=full should still complete (not crash) when the dispatcher fails;
    # full-profile findings are absent, but structural findings still surface.
    run $BIN observe audit --profile=full --since-hours=24 --json
    [ "$status" -eq 1 ] || [ "$status" -eq 0 ]
    [[ "$output" == *'"schema_version":"1.0"'* ]]
}
```

- [ ] **Step 2: Run the bats suite**

```bash
npm run build && bats tests/observability/audit.bats
```

Expected: PASS — all original cases + 2 new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/audit.bats
git commit -m "observability: bats end-to-end for --output-mode=mmr-findings + --profile=full graceful degradation"
```

---

## Task 11: `make check-all`, CLAUDE.md, and self-review

- [ ] **Step 1: Run the gate**

```bash
make check-all
```

Common Plan 7 issues:
- Coverage drop in `lens-h-cross-doc.ts` because the new branches are LLM-gated — Tasks 7-9's stub-based tests should already cover this; if coverage still drops, add a small "no full-profile findings when graphs are empty" test.
- MMR test failures because the integration test requires `scaffold` on PATH — wire `npm link` into the test setup or use an absolute path in the channel command.
- Type errors on existing lens function call sites that now need the `_context: LensContext` parameter — fix per Task 6 Step 4 if missed.

- [ ] **Step 2: Update CLAUDE.md**

Append to the existing observability paragraph:

> Plan 7 wires the audit into MMR: `BUILTIN_CHANNELS["doc-conformance"]` runs `scaffold observe audit --output-mode=mmr-findings` as a built-in channel; engine findings map to MMR's Finding shape with composite location `<source_doc>::<lens_id>::<short_id>` for stable cross-run identity. The `doc-conformance` parser is registered in MMR. Lens H gains three full-profile (LLM-graded) sub-checks: tech-stack-supports-PRD, PRD-to-stories semantic coverage, cross-doc terminology drift — all gated on `--profile=full`. The LLM dispatcher (`.scaffold/observability.yaml` `llm.dispatcher_command`, default `claude -p`) is a configurable subprocess wrapper that's reused by Plan 8's --fix flow. Opt out of the MMR channel via `channels_disabled: ["doc-conformance"]` in `.mmr.yaml`.

Add to the Key Commands table:

```markdown
| `scaffold observe audit --profile=full` | Run audit including LLM-graded prose checks (Lens H) |
| `scaffold observe audit --output-mode=mmr-findings` | Emit findings in MMR Finding shape (used by the doc-conformance MMR channel) |
| `mmr review --channels=doc-conformance` | Run only the audit channel under MMR (e.g., for a focused doc-conformance pass) |
```

- [ ] **Step 3: Self-review**

| Spec section | Implemented in |
|---|---|
| --output-mode=mmr-findings on observe audit (§5.3) | Task 1 |
| Engine Finding → MMR Finding mapping with composite location (§5.3) | Task 1 |
| MMR doc-conformance parser registered (§5.3) | Task 2 |
| BUILTIN_CHANNELS doc-conformance entry (§5.3) | Task 3 |
| Hermetic MMR integration test (§6.4) | Task 4 |
| LLM dispatcher abstraction (§5.4 — Plan 8 reuses) | Task 5 |
| Profile gating in checks runner (§3.1) | Task 6 |
| Lens H tech-stack-supports-PRD (full) (§3.9) | Task 7 |
| Lens H PRD-to-stories semantic coverage (full) (§3.9) | Task 8 |
| Lens H cross-doc terminology drift (full, P2) (§3.9) | Task 9 |
| Bats end-to-end coverage (§6.3) | Task 10 |
| Quality gate + docs (§6.8) | Task 11 |

Out-of-scope (Plan 8): `--fix` flow and worktree teardown.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-05-04-build-observability-mmr-channel.md
git commit -m "plans: build-observability MMR channel + Lens H full-profile — final pass" --allow-empty
```

---

## Plan 7 — Self-review (built into the plan)

**Spec coverage:** every Plan-7-scoped requirement maps to a task. The MMR channel registration follows MMR's actual `BUILTIN_CHANNELS` + `output_parser` architecture (no fictional `MmrChannel.run` interface — that was caught by MMR review of the original spec and resolved). Lens H's three full-profile checks all use the same LLM dispatcher abstraction that Plan 8 will reuse for the --fix flow.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present.

**Type consistency:**
- The new `LensContext` type (Task 6) is added to the `LensFn` signature; every existing lens picks up an optional `_context` parameter via the type-only signature update.
- `MmrFindingShape` is local to `mmr-findings.ts` and matches MMR's `Finding` field set as observed in `packages/mmr/src/types.ts`.
- `DispatchResult` is a discriminated union (`{ ok: true } | { ok: false }`) so all consumers must handle both cases.
- `EngineOutput` shape unchanged.

**Scope:** Plan 7 ships the MMR integration and full-profile audit. After Plan 7, the audit feature integrates with MMR and exposes both fast (structural) and full (LLM-graded) profiles. Plan 8 is the last plan: --fix flow + worktree teardown.

---

**Plan 7 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-mmr-channel.md`.**

Plans 1–7 produce a feature-complete observability layer with full MMR integration and LLM-graded prose checks. Only Plan 8 remains (--fix flow + worktree teardown).

**Three execution options for Plans 1–7:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all seven plans (~131 tasks total).
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.
3. **Pause and write Plan 8 first** — full design committed before any code lands.

Which approach?
