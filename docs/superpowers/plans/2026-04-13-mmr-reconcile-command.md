# MMR `reconcile` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mmr reconcile <job-id> --channel <name> --input <source>` command that injects external review findings into an existing job for unified reconciliation.

**Architecture:** New command reuses existing `runResultsPipeline`. New `normalizeExternalInput` helper handles wrapper/array input with strict validation. Parser internals exported for reuse. Tool specs updated for 4-channel flow.

**Tech Stack:** TypeScript, vitest, yargs, Node.js fs

**Test command:** `cd packages/mmr && npx vitest run`
**Type check:** `cd packages/mmr && npx tsc --noEmit`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/mmr/src/core/parser.ts` | Modify | Export helpers; add strict validators |
| `packages/mmr/src/core/normalize-input.ts` | Create | `normalizeExternalInput` + `readInput` |
| `packages/mmr/src/commands/reconcile.ts` | Create | `reconcileCommand` yargs command |
| `packages/mmr/src/cli.ts` | Modify | Register `reconcileCommand` |
| `packages/mmr/tests/core/normalize-input.test.ts` | Create | Normalization tests |
| `packages/mmr/tests/commands/reconcile.test.ts` | Create | Command integration tests |
| `content/tools/review-pr.md` | Modify | 4-channel flow with `mmr reconcile` |
| `content/tools/review-code.md` | Modify | Use MMR CLI |
| `content/tools/post-implementation-review.md` | Modify | Use MMR + injection |
| `CLAUDE.md` | Modify | 4-channel MMR model |

---

### Task 1: Export parser helpers and add strict validators

**Files:**
- Modify: `packages/mmr/src/core/parser.ts`
- Test: `packages/mmr/tests/core/parser.test.ts`

Export the private helpers that `normalizeExternalInput` needs, and add strict validation variants that throw instead of coercing.

- [ ] **Step 1: Write failing tests for strict validators**

Add to `packages/mmr/tests/core/parser.test.ts`:

```typescript
import { validateFindingStrict, validateParsedOutputStrict } from '../../src/core/parser.js'

describe('validateFindingStrict', () => {
  it('accepts a valid finding', () => {
    const f = validateFindingStrict({ severity: 'P1', location: 'f.ts:10', description: 'bug', suggestion: 'fix' })
    expect(f.severity).toBe('P1')
  })

  it('throws on missing severity', () => {
    expect(() => validateFindingStrict({ location: 'f.ts:1', description: 'bug', suggestion: '' }))
      .toThrow('missing or invalid severity')
  })

  it('throws on invalid severity value', () => {
    expect(() => validateFindingStrict({ severity: 'CRITICAL', location: 'f.ts:1', description: 'bug', suggestion: '' }))
      .toThrow('missing or invalid severity')
  })

  it('throws on missing description', () => {
    expect(() => validateFindingStrict({ severity: 'P2', location: 'f.ts:1', suggestion: '' }))
      .toThrow('missing description')
  })

  it('throws on missing location', () => {
    expect(() => validateFindingStrict({ severity: 'P2', description: 'bug', suggestion: '' }))
      .toThrow('missing location')
  })

  it('preserves optional id and category', () => {
    const f = validateFindingStrict({ id: 'X-1', category: 'security', severity: 'P0', location: 'f.ts:1', description: 'vuln', suggestion: 'fix' })
    expect(f.id).toBe('X-1')
    expect(f.category).toBe('security')
  })
})

describe('validateParsedOutputStrict', () => {
  it('accepts valid wrapper with findings', () => {
    const result = validateParsedOutputStrict({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug', suggestion: 'fix' }],
      summary: 'found bug',
    })
    expect(result.findings).toHaveLength(1)
  })

  it('throws when findings is not an array', () => {
    expect(() => validateParsedOutputStrict({ approved: true, findings: 'none', summary: 'ok' }))
      .toThrow('findings must be an array')
  })

  it('throws when a finding inside is invalid', () => {
    expect(() => validateParsedOutputStrict({
      approved: false,
      findings: [{ severity: 'BAD', location: 'f.ts:1', description: 'x', suggestion: '' }],
      summary: 'x',
    })).toThrow('missing or invalid severity')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: FAIL — `validateFindingStrict` and `validateParsedOutputStrict` not exported

- [ ] **Step 3: Export helpers and add strict validators**

In `packages/mmr/src/core/parser.ts`:

**a)** Add `export` to `stripMarkdownFences`, `extractJson`, `fixTrailingCommas`, `validateParsedOutput`, `validateFinding`:

```typescript
export function stripMarkdownFences(text: string): string {
export function fixTrailingCommas(text: string): string {
export function extractJson(text: string): string {
export function validateParsedOutput(obj: unknown): ParsedOutput {
export function validateFinding(f: unknown): Finding {
```

**b)** Add strict validators after `validateFinding`:

```typescript
export function validateFindingStrict(f: unknown): Finding {
  if (typeof f !== 'object' || f === null) {
    throw new Error('Finding must be an object')
  }
  const record = f as Record<string, unknown>
  if (!['P0', 'P1', 'P2', 'P3'].includes(record.severity as string)) {
    throw new Error('Finding missing or invalid severity (must be P0-P3)')
  }
  if (typeof record.location !== 'string' || !record.location) {
    throw new Error('Finding missing location')
  }
  if (typeof record.description !== 'string' || !record.description) {
    throw new Error('Finding missing description')
  }
  return {
    severity: record.severity as Finding['severity'],
    location: record.location as string,
    description: record.description as string,
    suggestion: typeof record.suggestion === 'string' ? record.suggestion : '',
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.category === 'string' ? { category: record.category } : {}),
  }
}

export function validateParsedOutputStrict(obj: unknown): ParsedOutput {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Input must be an object')
  }
  const record = obj as Record<string, unknown>
  if (!Array.isArray(record.findings)) {
    throw new Error('Input findings must be an array')
  }
  return {
    approved: typeof record.approved === 'boolean' ? record.approved : false,
    findings: record.findings.map(validateFindingStrict),
    summary: typeof record.summary === 'string' ? record.summary : '',
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: All PASS

- [ ] **Step 5: Run type check**

Run: `cd packages/mmr && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/parser.ts packages/mmr/tests/core/parser.test.ts
git commit -m "feat(mmr): export parser helpers and add strict validators

Export stripMarkdownFences, extractJson, fixTrailingCommas,
validateParsedOutput, validateFinding for reuse by normalize-input.
Add validateFindingStrict and validateParsedOutputStrict that throw
on missing/invalid fields instead of coercing to defaults."
```

---

### Task 2: Create `normalizeExternalInput` helper

**Files:**
- Create: `packages/mmr/src/core/normalize-input.ts`
- Create: `packages/mmr/tests/core/normalize-input.test.ts`

- [ ] **Step 1: Write tests**

Create `packages/mmr/tests/core/normalize-input.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { normalizeExternalInput, readInput } from '../../src/core/normalize-input.js'

describe('normalizeExternalInput', () => {
  it('normalizes wrapper format with findings', () => {
    const input = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug', suggestion: 'fix' }],
      summary: 'found bug',
    })
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.summary).toBe('found bug')
  })

  it('normalizes bare array of findings', () => {
    const input = JSON.stringify([
      { severity: 'P2', location: 'a.ts:5', description: 'style', suggestion: 'refactor' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.summary).toBe('Injected external findings')
    expect(result.approved).toBe(true) // no P0/P1
  })

  it('infers approved=false when bare array has P0 findings', () => {
    const input = JSON.stringify([
      { severity: 'P0', location: 'f.ts:1', description: 'critical', suggestion: 'fix now' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('infers approved=false when bare array has P1 findings', () => {
    const input = JSON.stringify([
      { severity: 'P1', location: 'f.ts:1', description: 'important', suggestion: 'fix' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('strips markdown fences from input', () => {
    const input = '```json\n{"approved": true, "findings": [], "summary": "ok"}\n```'
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('strips markdown fences from bare array', () => {
    const input = '```json\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\n```'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })

  it('handles wrapper with surrounding text', () => {
    const input = 'Here are my findings:\n{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "bug", "suggestion": "fix"}], "summary": "review"}\nEnd.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })

  it('fixes trailing commas', () => {
    const input = '{"approved": true, "findings": [], "summary": "ok",}'
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
  })

  it('throws on invalid input (plain string)', () => {
    expect(() => normalizeExternalInput('not json at all')).toThrow()
  })

  it('throws on finding with invalid severity (strict)', () => {
    const input = JSON.stringify([
      { severity: 'CRITICAL', location: 'f.ts:1', description: 'bad', suggestion: '' },
    ])
    expect(() => normalizeExternalInput(input)).toThrow('severity')
  })

  it('throws on finding missing location (strict)', () => {
    const input = JSON.stringify([
      { severity: 'P1', description: 'bad', suggestion: '' },
    ])
    expect(() => normalizeExternalInput(input)).toThrow('location')
  })

  it('normalizes empty array to approved output', () => {
    const result = normalizeExternalInput('[]')
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('normalizes wrapper with empty findings', () => {
    const input = JSON.stringify({ approved: true, findings: [], summary: 'clean' })
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('preserves approved=false from wrapper even with empty findings', () => {
    const input = JSON.stringify({ approved: false, findings: [], summary: 'manual block' })
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('handles bare array with surrounding prose text', () => {
    const input = 'Here are my findings:\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\nEnd of review.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P2')
  })
})

describe('readInput', () => {
  it('returns inline JSON starting with {', () => {
    const result = readInput('{"findings": []}')
    expect(result).toBe('{"findings": []}')
  })

  it('returns inline JSON starting with [', () => {
    const result = readInput('[{"severity": "P1"}]')
    expect(result).toBe('[{"severity": "P1"}]')
  })

  it('returns inline JSON with leading whitespace', () => {
    const result = readInput('  {"findings": []}')
    expect(result).toBe('  {"findings": []}')
  })

  it('reads from file path', () => {
    const tmpFile = path.join(os.tmpdir(), `mmr-readinput-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, '{"approved": true, "findings": [], "summary": "ok"}')
    try {
      const result = readInput(tmpFile)
      expect(result).toContain('approved')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  it('throws on nonexistent non-JSON input', () => {
    expect(() => readInput('not-a-file-or-json')).toThrow('Input not found')
  })
})

describe('normalizeExternalInput edge cases', () => {
  it('handles fenced bare array with surrounding prose', () => {
    const input = 'Review output:\n```json\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\n```\nEnd.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mmr && npx vitest run tests/core/normalize-input.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `normalizeExternalInput`**

Create `packages/mmr/src/core/normalize-input.ts`:

```typescript
import fs from 'node:fs'
import { stripMarkdownFences, extractJson, fixTrailingCommas, validateParsedOutputStrict, validateFindingStrict } from './parser.js'
import type { ParsedOutput } from './parser.js'

export function normalizeExternalInput(raw: string): ParsedOutput {
  let text = stripMarkdownFences(raw)
  text = text.trim()

  let parsed: unknown
  if (text.startsWith('[')) {
    // Bare array at start — skip extractJson (which only handles objects)
    text = fixTrailingCommas(text)
    parsed = JSON.parse(text)
  } else if (text.startsWith('{')) {
    // Object at start — use extractJson for robustness
    text = extractJson(text)
    text = fixTrailingCommas(text)
    parsed = JSON.parse(text)
  } else {
    // Surrounded text — try extractJson for objects first, then look for arrays
    try {
      text = extractJson(text)
      text = fixTrailingCommas(text)
      parsed = JSON.parse(text)
    } catch {
      // extractJson failed (no object found) — look for bare array in already-stripped text
      const arrayStart = text.indexOf('[')
      if (arrayStart === -1) throw new Error('No JSON object or array found in input')
      // Find matching ] by tracking bracket depth (mirrors extractJson for arrays)
      let depth = 0
      let inStr = false
      for (let i = arrayStart; i < text.length; i++) {
        const c = text[i]
        if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
        if (c === '"') inStr = true
        else if (c === '[') depth++
        else if (c === ']') { depth--; if (depth === 0) { const arrayText = fixTrailingCommas(text.slice(arrayStart, i + 1)); parsed = JSON.parse(arrayText); break } }
      }
      if (parsed === undefined) throw new Error('Unbalanced brackets in array input')
    }
  }

  if (Array.isArray(parsed)) {
    const findings = parsed.map(validateFindingStrict)
    const hasBlockingFindings = findings.some(f => f.severity === 'P0' || f.severity === 'P1')
    return {
      approved: !hasBlockingFindings,
      findings,
      summary: 'Injected external findings',
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.findings)) {
      return validateParsedOutputStrict(parsed)
    }
  }

  throw new Error('Invalid input format: expected JSON object with findings array or bare array of findings')
}

export function readInput(input: string): string {
  if (input === '-') {
    return fs.readFileSync(0, 'utf-8')
  }

  const trimmed = input.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return input
  }

  // Try to read as file path
  try {
    return fs.readFileSync(input, 'utf-8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENAMETOOLONG') {
      throw new Error(`Input not found: "${input}" is not a file, stdin (-), or valid JSON`)
    }
    throw err // permission error, etc. — surface it
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/normalize-input.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full suite and type check**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/normalize-input.ts packages/mmr/tests/core/normalize-input.test.ts
git commit -m "feat(mmr): add normalizeExternalInput helper for reconcile command

Strips markdown fences, handles wrapper and bare-array formats,
uses strict validation (throws on invalid severity/location/description).
Includes readInput helper for stdin/file/inline detection."
```

---

### Task 3: Create `reconcileCommand`

**Files:**
- Create: `packages/mmr/src/commands/reconcile.ts`
- Modify: `packages/mmr/src/cli.ts`
- Create: `packages/mmr/tests/commands/reconcile.test.ts`

- [ ] **Step 1: Write integration tests**

Create `packages/mmr/tests/commands/reconcile.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'
import { normalizeExternalInput, readInput } from '../../src/core/normalize-input.js'
import { runResultsPipeline } from '../../src/core/results-pipeline.js'
import { TERMINAL_STATUSES } from '../../src/types.js'
import type { ChannelStatus } from '../../src/types.js'

describe('reconcile command logic', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-reconcile-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('injects external channel and re-reconciles', () => {
    // Set up a completed job with one channel
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    // Inject external findings
    const externalInput = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug from superpowers', suggestion: 'fix' }],
      summary: 'found issue',
    })
    const normalized = normalizeExternalInput(externalInput)

    // Register, save, update — the commit sequence
    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', normalized)
    const now = new Date().toISOString()
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: now, completed_at: now })

    // Re-run pipeline
    const updatedJob = store.loadJob(job.job_id)
    const { results, exitCode } = runResultsPipeline(store, updatedJob, 'json')

    expect(results.reconciled_findings).toHaveLength(1)
    expect(results.reconciled_findings[0].sources).toContain('superpowers')
    expect(results.verdict).toBe('blocked') // P1 finding breaches P2 threshold
    expect(exitCode).toBe(2)
  })

  it('verdict stays pass when injected findings are below threshold', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const externalInput = JSON.stringify([
      { severity: 'P3', location: 'f.ts:5', description: 'nit', suggestion: 'optional' },
    ])
    const normalized = normalizeExternalInput(externalInput)

    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', normalized)
    const now = new Date().toISOString()
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: now, completed_at: now })

    const updatedJob = store.loadJob(job.job_id)
    const { results, exitCode } = runResultsPipeline(store, updatedJob, 'json')

    expect(results.verdict).toBe('pass')
    expect(exitCode).toBe(0)
  })

  it('rejects duplicate channel name', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    const existingChannels = Object.keys(store.loadJob(job.job_id).channels)
    const channelName = 'claude'
    const collision = existingChannels.some(k => k.toLowerCase() === channelName.toLowerCase())
    expect(collision).toBe(true)
  })

  it('detects case-insensitive collision', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['Claude'] })
    const existingChannels = Object.keys(store.loadJob(job.job_id).channels)
    const channelName = 'claude'
    const collision = existingChannels.some(k => k.toLowerCase() === channelName.toLowerCase())
    expect(collision).toBe(true)
  })

  it('rejects injection when channels are still running', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    // Don't update claude to completed — leave it in 'dispatched' state
    const loaded = store.loadJob(job.job_id)
    const incompleteChannels = Object.entries(loaded.channels)
      .filter(([, entry]) => !TERMINAL_STATUSES.has(entry.status))
      .map(([name]) => name)
    expect(incompleteChannels).toContain('claude')
  })

  it('supports multiple sequential injections', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    // Inject first external channel
    const input1 = normalizeExternalInput('[]')
    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', input1)
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })

    // Inject second external channel
    const input2 = normalizeExternalInput('[]')
    store.registerChannel(job.job_id, 'security-audit', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'security-audit', input2)
    store.updateChannel(job.job_id, 'security-audit', { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })

    const updatedJob = store.loadJob(job.job_id)
    expect(Object.keys(updatedJob.channels)).toContain('superpowers')
    expect(Object.keys(updatedJob.channels)).toContain('security-audit')

    const { results } = runResultsPipeline(store, updatedJob, 'json')
    expect(results.verdict).toBe('pass')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass (these test the primitives, not the command)**

Run: `cd packages/mmr && npx vitest run tests/commands/reconcile.test.ts`
Expected: All PASS (tests use existing primitives, not the command module yet)

- [ ] **Step 3: Create `reconcileCommand`**

Create `packages/mmr/src/commands/reconcile.ts`:

```typescript
import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { normalizeExternalInput, readInput } from '../core/normalize-input.js'
import { runResultsPipeline } from '../core/results-pipeline.js'
import { TERMINAL_STATUSES } from '../types.js'
import type { OutputFormat } from '../types.js'

interface ReconcileArgs {
  'job-id': string
  channel: string
  input: string
  format?: string
}

export const reconcileCommand: CommandModule<object, ReconcileArgs> = {
  command: 'reconcile <job-id>',
  describe: 'Inject external findings into a job and re-reconcile',
  builder: (yargs) =>
    yargs
      .positional('job-id', {
        type: 'string',
        demandOption: true,
        describe: 'Job ID (e.g. mmr-abc123)',
      })
      .option('channel', {
        type: 'string',
        demandOption: true,
        describe: 'Name for the external channel (e.g. superpowers)',
      })
      .option('input', {
        type: 'string',
        demandOption: true,
        describe: 'Findings: file path, - for stdin, or inline JSON',
      })
      .option('format', {
        type: 'string',
        describe: 'Output format',
        choices: ['json', 'text', 'markdown'],
      }),
  handler: (args: ArgumentsCamelCase<ReconcileArgs>) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    // 1. Load job
    let job
    try {
      job = store.loadJob(args['job-id'] as string)
    } catch {
      console.error(`Job not found: ${args['job-id']}`)
      process.exit(5)
    }

    // 2. Verify all channels in terminal state
    const incompleteChannels = Object.entries(job.channels)
      .filter(([, entry]) => !TERMINAL_STATUSES.has(entry.status))
      .map(([name]) => name)

    if (incompleteChannels.length > 0) {
      console.error(`Channels still running: ${incompleteChannels.join(', ')}`)
      process.exit(1)
    }

    // 3. Validate raw channel name, then lowercase for case-insensitive safety
    const rawChannel = args.channel as string
    if (!/^[a-zA-Z0-9._-]+$/.test(rawChannel)) {
      console.error(`Invalid channel name: "${rawChannel}"`)
      process.exit(5)
    }
    const channelName = rawChannel.toLowerCase()

    const existingLower = Object.keys(job.channels).map(k => k.toLowerCase())
    if (existingLower.includes(channelName)) {
      console.error(`Channel '${channelName}' already exists in job ${job.job_id}`)
      process.exit(5)
    }

    // 4. Read input
    let rawInput: string
    try {
      rawInput = readInput(args.input as string)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(5)
    }

    // 5. Normalize and validate
    let normalized
    try {
      normalized = normalizeExternalInput(rawInput)
    } catch (err) {
      console.error(`Invalid input: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(5)
    }

    // 6. Commit sequence (only after validation)
    const now = new Date().toISOString()
    store.registerChannel(job.job_id, channelName, { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, channelName, normalized)
    store.updateChannel(job.job_id, channelName, {
      status: 'completed',
      started_at: now,
      completed_at: now,
    })

    // 7. Re-run pipeline
    const updatedJob = store.loadJob(job.job_id)
    const outputFormat = (args.format ?? job.format ?? 'json') as OutputFormat
    const { results, formatted, exitCode } = runResultsPipeline(store, updatedJob, outputFormat)

    // 8. Save and output
    store.saveResults(job.job_id, results)
    console.log(formatted)
    process.exit(exitCode)
  },
}
```

- [ ] **Step 4: Register in cli.ts**

In `packages/mmr/src/cli.ts`, add import and command:

```typescript
import { reconcileCommand } from './commands/reconcile.js'
```

And add `.command(reconcileCommand)` after the existing `.command(jobsCommand)` line.

- [ ] **Step 5: Run full suite and type check**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/commands/reconcile.ts packages/mmr/src/cli.ts packages/mmr/tests/commands/reconcile.test.ts
git commit -m "feat(mmr): add reconcile command for injecting external findings

mmr reconcile <job-id> --channel <name> --input <source> injects
external review findings into an existing job and re-runs the full
reconciliation pipeline. Supports wrapper and bare-array input formats.
Validates before writing, rejects duplicate channels (case-insensitive)."
```

---

### Task 4: Update tool specs for 4-channel flow

**Files:**
- Modify: `content/tools/review-pr.md`
- Modify: `content/tools/review-code.md`
- Modify: `content/tools/post-implementation-review.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update review-pr.md**

Read `content/tools/review-pr.md`. Update "Step 2: Run MMR Review" to use `--format json` so the `job_id` is machine-readable, and capture it. Then add the 4th channel injection steps after it:

```markdown
### Step 3: Run Agent Code Review (4th channel)

Dispatch your platform's code-reviewer skill for a complementary review:
- **Claude Code:** dispatch `superpowers:code-reviewer` subagent with the PR diff and review criteria
- **Gemini CLI:** use built-in review capability
- **Codex CLI:** use built-in review capability

The agent skill runs inside your agent's context — it has access to conversation history, project knowledge, and plan context that external CLIs lack.

**Important:** The agent's review output must use MMR-compatible finding schema: each finding needs `severity` (P0-P3), `location` (file:line), `description`, and `suggestion`. The strict validator in `mmr reconcile` will reject findings with missing or invalid fields.

### Step 4: Inject Agent Review into MMR

Feed the agent review findings into MMR for unified reconciliation:

```bash
# job_id is captured from mmr review --sync --format json output
mmr reconcile "$JOB_ID" --channel superpowers --input - <<< "$AGENT_FINDINGS"
```

The `reconcile` command:
- Adds the agent's findings as a new channel in the job
- Re-runs reconciliation across ALL channels (CLI + agent)
- Outputs the unified verdict with all sources included
```

Renumber subsequent steps (old Step 4 becomes Step 5, etc.).

- [ ] **Step 2: Update review-code.md**

Read `content/tools/review-code.md`. Replace manual channel dispatch with MMR CLI usage. Add `mmr review --staged --sync` or `mmr review --base main --sync` as the primary entry point, with the same `mmr reconcile` pattern for the 4th channel.

- [ ] **Step 3: Update post-implementation-review.md**

Read `content/tools/post-implementation-review.md`. This tool does full-codebase review (not just diffs), so it CANNOT be replaced by `mmr review` (which is diff-only). Instead, add `mmr reconcile` as an optional injection step: after the existing multi-channel dispatch completes, the agent can inject its findings into an MMR job for unified reconciliation if one exists. Do NOT replace the existing dispatch workflow — only add the injection option.

Also ensure the agent's review prompt for each channel requires MMR-compatible finding schema: `severity` (P0-P3), `location` (file:line), `description`, `suggestion`.

- [ ] **Step 4: Update CLAUDE.md MMR section**

In `CLAUDE.md`, find the "Mandatory 3-Channel PR Review" section. Add mention of `mmr reconcile` for the 4th channel. Update quick reference:

```markdown
# Primary (recommended):
mmr review --pr "$PR_NUMBER" --sync --format text
# Then inject agent review:
mmr reconcile <job-id> --channel superpowers --input findings.json
```

- [ ] **Step 5: Validate frontmatter**

Run: `make validate`
Expected: Pass

- [ ] **Step 6: Rebuild scaffold**

Run: `scaffold build 2>/dev/null || echo "build skipped"`

- [ ] **Step 7: Commit**

```bash
git add content/tools/ CLAUDE.md
git commit -m "docs: update tool specs for 4-channel flow with mmr reconcile

review-pr.md: add Step 3 (agent review) and Step 4 (mmr reconcile injection)
review-code.md: use MMR CLI instead of manual dispatch
post-implementation-review.md: use MMR + injection for Phase 1/2
CLAUDE.md: add mmr reconcile to quick reference"
```

---

### Task 5: Version bump, CHANGELOG, and release

**Files:**
- Modify: `packages/mmr/package.json`
- Modify: `packages/mmr/CHANGELOG.md`

- [ ] **Step 1: Bump version**

In `packages/mmr/package.json`, update version to `"1.1.0"`.

- [ ] **Step 2: Update CHANGELOG**

Add before `[1.0.0]` in `packages/mmr/CHANGELOG.md`:

```markdown
## [1.1.0] — 2026-04-13

### Added
- `mmr reconcile <job-id> --channel <name> --input <source>` — inject external review findings into a job for unified reconciliation
- `normalizeExternalInput` helper — handles wrapper and bare-array input with strict validation
- Strict validators (`validateFindingStrict`, `validateParsedOutputStrict`) that throw on invalid input
- Exported parser helpers for reuse: `stripMarkdownFences`, `extractJson`, `fixTrailingCommas`

### Changed
- Tool specs updated for 4-channel flow: 3 CLI channels via `mmr review` + agent skill via `mmr reconcile`
- CLAUDE.md updated with `mmr reconcile` quick reference
```

- [ ] **Step 3: Sync lockfile**

```bash
npm install --package-lock-only
```

Commit lockfile if changed:
```bash
git add package-lock.json 2>/dev/null
```

- [ ] **Step 4: Update packages/mmr/README.md**

Add `mmr reconcile` to the Commands table and Quick Start:

In the Quick Start section, add:
```bash
# Inject external review findings
mmr reconcile <job-id> --channel superpowers --input findings.json
```

In the Commands table, add:
```
| `mmr reconcile <job-id>` | Inject external findings and re-reconcile |
```

- [ ] **Step 5: Run final verification**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Run: `npx vitest run` (full project)
Run: `make check-all`

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/package.json packages/mmr/CHANGELOG.md packages/mmr/README.md package-lock.json
git commit -m "chore(mmr): bump version to 1.1.0, update CHANGELOG and README

New reconcile command for injecting external findings."
```

- [ ] **Step 7: Push and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(mmr): reconcile command for external channel injection (v1.1.0)" --body "$(cat <<'EOF'
## Summary
- New `mmr reconcile <job-id> --channel <name> --input <source>` command
- Injects external review findings (from agent skills, manual reviews, etc.) into existing jobs
- Re-runs full reconciliation pipeline across all channels
- Supports wrapper and bare-array input formats with strict validation
- Tool specs updated for 4-channel flow (3 CLI + agent review)

## Test plan
- [ ] `cd packages/mmr && npx vitest run` — all tests pass
- [ ] `npx vitest run` — all project tests pass
- [ ] `make validate` — frontmatter validation passes
- [ ] New tests: normalization (13), integration (5), strict validators (8)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: After CI passes, merge and tag**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
git tag mmr-v1.1.0
git push origin mmr-v1.1.0
```
