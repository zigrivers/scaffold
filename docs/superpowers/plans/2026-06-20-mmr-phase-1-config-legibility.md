# MMR Agent-Legible Config — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the MMR CLI a write path and full config visibility — `config disable/enable`, `config path`, provenance in the channels list, review point-of-pain remediation, and `--help` examples — plus the Scaffold docs that teach them.

**Architecture:** Add a comment-preserving YAML writer (`src/config/writer.ts`, eemeli `yaml`) that all mutators share. Extend the existing `configCommand` (yargs) with `enable`/`disable`/`path` actions. Surface the provenance the loader already computes in the channels list and route every machine-readable view through a single redaction pass. Thread per-channel `recovery` into the review result so the text formatter can print a remediation line. Keep all existing default output shapes (the `config channels` JSON array) byte-compatible — new visibility is additive or `--format text`.

**Tech Stack:** TypeScript, yargs, eemeli `yaml` (new, write-side), existing `js-yaml` (read-side), Zod schema, vitest.

## Global Constraints

- **Decisions D1–D5 (from the vision doc §11) are binding.** D1: mutators default to project `./.mmr.yaml`; `disable <channel>` whose CLI is not installed routes to global `~/.mmr/config.yaml` with a notice; `--global`/`--project` override. D2: comment-preserving writes via eemeli `yaml` Document API + schema-aware type coercion; refuse multi-document files. D4: redact once before serialization for ALL output modes, default-on, `--no-redact` warns to **stderr**. D5: canonical disable = per-channel `channels.<id>.enabled: false`; keep reading legacy `channels_disabled`; `enable` prunes stale list entries.
- **No breaking output changes in Phase 1.** `mmr config channels` (no args) MUST keep emitting its current JSON array; new fields are additive; the human table is `--format text` only. (The C1 compensation default-flip is Phase 2, shipped as major.)
- **Node import paths use `.js` extensions** (ESM/NodeNext), even for `.ts` sources.
- **Every mutator is idempotent and self-confirming:** prints the file it wrote, the new effective value with provenance, and the revert command.
- **TDD always:** failing test first, minimal impl, green, commit. Run `npm run check` in `packages/mmr` before each PR-bound push.
- Work on branch `feat/mmr-agent-legible-phase-1`. Commit per task.

---

## File Structure

- `packages/mmr/src/config/writer.ts` — **new.** Comment-preserving YAML mutation: `setConfigValue`, `unsetConfigValue` (used Phase 2), `setChannelEnabled`, `pruneChannelsDisabled`, type coercion. One responsibility: edit a YAML file in place safely.
- `packages/mmr/src/config/paths.ts` — **new.** `resolveConfigPaths({ projectRoot, userHome })` → `{ user, project, userExists, projectExists }`. Single source for "where does config live / land."
- `packages/mmr/src/core/redact.ts` — **modify.** Add `redactConfigView(value, { noRedact })` — one deep pass used by every machine-readable config view.
- `packages/mmr/src/commands/config.ts` — **modify.** Add `enable`/`disable`/`path` actions; add `source` to the channels JSON; add `--format text` table; add `--global`/`--project`; wire `--help` examples.
- `packages/mmr/src/core/results-pipeline.ts` — **modify.** Copy `recovery` from `ChannelJobEntry` into the `ChannelResult` it builds.
- `packages/mmr/src/types.ts` — **modify.** Add optional `recovery?: string` to `ChannelResult`.
- `packages/mmr/src/formatters/text.ts` — **modify.** Print a remediation line for degraded channels + a `mmr doctor` pointer.
- `content/skills/mmr/SKILL.md`, `content/guides/mmr/index.md`, `content/knowledge/core/multi-model-review-dispatch.md` — **modify.** Teach the new surface.
- Tests under `packages/mmr/tests/config/`, `packages/mmr/tests/commands/`, `packages/mmr/tests/formatters/` (new dir).

---

## Task 1: Comment-preserving YAML writer

**Files:**
- Create: `packages/mmr/src/config/writer.ts`
- Test: `packages/mmr/tests/config/writer.test.ts`
- Modify: `packages/mmr/package.json` (add `yaml` dependency)

**Interfaces:**
- Produces:
  - `setConfigValue(file: string, dottedPath: string, value: unknown, opts?: { create?: boolean }): void` — parse → `setIn` → write, preserving comments. Coerces string `value` via `coerceScalar`.
  - `setChannelEnabled(file: string, channel: string, enabled: boolean): void` — sets `channels.<channel>.enabled`; when enabling, also calls `pruneChannelsDisabled`.
  - `pruneChannelsDisabled(file: string, channel: string): boolean` — removes `channel` from a top-level `channels_disabled` sequence if present; returns whether it changed anything.
  - `coerceScalar(raw: string): string | number | boolean` — `"true"/"false"` → boolean, numeric → number, else string.
  - Throws `Error('multi-document YAML not supported: <file>')` for files containing `---` document separators.

- [ ] **Step 1: Add the `yaml` dependency**

```bash
cd packages/mmr && npm install yaml@^2.4.0
```

Expected: `yaml` appears under `dependencies` in `packages/mmr/package.json`.

- [ ] **Step 2: Write the failing test (comment preservation + coercion)**

```typescript
// packages/mmr/tests/config/writer.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setChannelEnabled, setConfigValue, coerceScalar } from '../../src/config/writer.js'

describe('config writer', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-writer-'))
    file = path.join(dir, '.mmr.yaml')
  })
  afterEach(() => fs.rmSync(dir, { recursive: true }))

  it('disables a channel while preserving comments and key order', () => {
    fs.writeFileSync(file, [
      'version: 1',
      'channels:',
      '  grok:',
      '    # second-opinion reviewer',
      '    enabled: true',
    ].join('\n') + '\n')
    setChannelEnabled(file, 'grok', false)
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).toContain('# second-opinion reviewer')
    expect(out).toMatch(/grok:[\s\S]*enabled: false/)
  })

  it('coerces string values to typed scalars', () => {
    expect(coerceScalar('false')).toBe(false)
    expect(coerceScalar('300')).toBe(300)
    expect(coerceScalar('P1')).toBe('P1')
  })

  it('writes a typed boolean, not the string "false"', () => {
    fs.writeFileSync(file, 'version: 1\n')
    setConfigValue(file, 'channels.grok.enabled', 'false')
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).toMatch(/enabled: false\b/)
    expect(out).not.toContain('"false"')
  })

  it('refuses multi-document files', () => {
    fs.writeFileSync(file, 'version: 1\n---\nversion: 2\n')
    expect(() => setConfigValue(file, 'a.b', '1')).toThrow(/multi-document/)
  })

  it('prunes a channel from channels_disabled when enabling', () => {
    fs.writeFileSync(file, 'version: 1\nchannels_disabled:\n  - grok\n  - gemini\n')
    setChannelEnabled(file, 'grok', true)
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).not.toMatch(/-\s*grok/)
    expect(out).toMatch(/-\s*gemini/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/mmr && npx vitest run tests/config/writer.test.ts`
Expected: FAIL — module `../../src/config/writer.js` not found.

- [ ] **Step 4: Implement `writer.ts`**

```typescript
// packages/mmr/src/config/writer.ts
import fs from 'node:fs'
import { parseDocument, isSeq, Document } from 'yaml'

function loadDoc(file: string, opts: { create?: boolean } = {}): Document {
  let raw = ''
  if (fs.existsSync(file)) {
    raw = fs.readFileSync(file, 'utf-8')
  } else if (opts.create) {
    raw = 'version: 1\n'
  } else {
    throw new Error(`config file not found: ${file}`)
  }
  if (/^---\s*$/m.test(raw)) {
    throw new Error(`multi-document YAML not supported: ${file}`)
  }
  return parseDocument(raw)
}

export function coerceScalar(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  return raw
}

export function setConfigValue(
  file: string,
  dottedPath: string,
  value: unknown,
  opts: { create?: boolean } = { create: true },
): void {
  const doc = loadDoc(file, opts)
  const segs = dottedPath.split('.')
  const coerced = typeof value === 'string' ? coerceScalar(value) : value
  doc.setIn(segs, coerced)
  fs.writeFileSync(file, doc.toString())
}

export function pruneChannelsDisabled(file: string, channel: string): boolean {
  if (!fs.existsSync(file)) return false
  const doc = loadDoc(file)
  const seq = doc.get('channels_disabled')
  if (!isSeq(seq)) return false
  const idx = seq.items.findIndex((item) => {
    const v = (item as { value?: unknown }).value ?? item
    return v === channel
  })
  if (idx === -1) return false
  seq.delete(idx)
  fs.writeFileSync(file, doc.toString())
  return true
}

export function setChannelEnabled(file: string, channel: string, enabled: boolean): void {
  setConfigValue(file, `channels.${channel}.enabled`, enabled)
  if (enabled) pruneChannelsDisabled(file, channel)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/config/writer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/config/writer.ts packages/mmr/tests/config/writer.test.ts packages/mmr/package.json packages/mmr/package-lock.json
git commit -m "feat(mmr): comment-preserving config writer (D2)"
```

---

## Task 2: `resolveConfigPaths` + `mmr config path`

**Files:**
- Create: `packages/mmr/src/config/paths.ts`
- Modify: `packages/mmr/src/commands/config.ts`
- Test: `packages/mmr/tests/config/paths.test.ts`, `packages/mmr/tests/commands/config-path.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveConfigPaths(opts: { projectRoot: string; userHome?: string }): { user: string; project: string; userExists: boolean; projectExists: boolean }`.

- [ ] **Step 1: Write the failing test for `resolveConfigPaths`**

```typescript
// packages/mmr/tests/config/paths.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveConfigPaths } from '../../src/config/paths.js'

describe('resolveConfigPaths', () => {
  it('reports user and project paths and existence', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-home-'))
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-proj-'))
    fs.mkdirSync(path.join(home, '.mmr'))
    fs.writeFileSync(path.join(home, '.mmr', 'config.yaml'), 'version: 1\n')
    const r = resolveConfigPaths({ projectRoot: proj, userHome: home })
    expect(r.user).toBe(path.join(home, '.mmr', 'config.yaml'))
    expect(r.project).toBe(path.join(proj, '.mmr.yaml'))
    expect(r.userExists).toBe(true)
    expect(r.projectExists).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify failure**

Run: `cd packages/mmr && npx vitest run tests/config/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `paths.ts`**

```typescript
// packages/mmr/src/config/paths.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function resolveConfigPaths(opts: { projectRoot: string; userHome?: string }): {
  user: string; project: string; userExists: boolean; projectExists: boolean
} {
  const userHome = opts.userHome ?? os.homedir()
  const user = path.join(userHome, '.mmr', 'config.yaml')
  const project = path.join(opts.projectRoot, '.mmr.yaml')
  return {
    user,
    project,
    userExists: fs.existsSync(user),
    projectExists: fs.existsSync(project),
  }
}
```

- [ ] **Step 4: Run it, verify pass**

Run: `cd packages/mmr && npx vitest run tests/config/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the `config path` action**

```typescript
// packages/mmr/tests/commands/config-path.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config path', () => {
  let tmp: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-cfgpath-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => { cwdSpy.mockRestore(); logSpy.mockRestore(); fs.rmSync(tmp, { recursive: true }) })

  it('lists the search order and write target', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'path', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('.mmr.yaml')
    expect(out).toMatch(/config\.yaml/)
    expect(out.toLowerCase()).toContain('write target')
  })
})
```

- [ ] **Step 6: Run it, verify failure** — Expected: FAIL (action `path` not in choices → throws / unexpected-argument path).

- [ ] **Step 7: Implement the `path` action in `config.ts`**

Add `'path'`, `'enable'`, `'disable'` to the `action` positional `choices` array (config.ts ~line 337). Add a `configPath()` function and a switch case:

```typescript
// near other helpers in config.ts
import { resolveConfigPaths } from '../config/paths.js'

function configPath(): void {
  const paths = resolveConfigPaths({ projectRoot: process.cwd() })
  console.log('Search order (later wins):')
  console.log('  1 built-in defaults      (always)')
  console.log(`  2 ${paths.user}      ${paths.userExists ? '✓ exists' : '✗ not found'}`)
  console.log(`  3 ${paths.project}            ${paths.projectExists ? '✓ exists' : '✗ not found'}`)
  console.log('  4 CLI flags              (per-invocation)')
  console.log(`write target (default): ${paths.project}`)
  console.log(`                  --global → ${paths.user}`)
}
```

In the handler switch, add `case 'path': configPath(); break`. Update the early-return guard (config.ts:361) so it does not reject `path` for having no name (it already only rejects when name/target present — `path` passes no name, so no change needed; verify).

- [ ] **Step 8: Run it, verify pass**

Run: `cd packages/mmr && npx vitest run tests/commands/config-path.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/mmr/src/config/paths.ts packages/mmr/src/commands/config.ts packages/mmr/tests/config/paths.test.ts packages/mmr/tests/commands/config-path.test.ts
git commit -m "feat(mmr): config path discloses search order + write target (B1)"
```

---

## Task 3: `mmr config disable` / `enable` (A1)

**Files:**
- Modify: `packages/mmr/src/commands/config.ts`
- Test: `packages/mmr/tests/commands/config-enable-disable.test.ts`

**Interfaces:**
- Consumes: `setChannelEnabled` (Task 1), `resolveConfigPaths` (Task 2), `checkInstalled` (core/auth.js), `loadConfigWithProvenance` (config/loader.js).
- Produces: handler behavior for `disable`/`enable` actions.

**Behavior (D1, D5):**
- `disable <ch>`: default target = project `.mmr.yaml`. If `<ch>`'s CLI command is **not installed**, default target = global `~/.mmr/config.yaml` and print a notice. `--global`/`--project` override.
- `enable <ch>`: same target resolution (no not-installed special-case); also prunes `channels_disabled`.
- After write, print: `✓ {Dis,En}abled channel '<ch>'`, the file written, the new effective `enabled` + provenance source, and the revert command.
- Idempotent: writing the same value twice is fine (no error).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mmr/tests/commands/config-enable-disable.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function run(args: Record<string, unknown>) {
  const { configCommand } = await import('../../src/commands/config.js')
  await configCommand.handler({ _: ['config'], $0: 'mmr', ...args } as never)
}

describe('mmr config disable/enable', () => {
  let tmp: string
  let home: string
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-toggle-'))
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-home-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    vi.spyOn(os, 'homedir').mockReturnValue(home)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true }); fs.rmSync(home, { recursive: true }) })

  it('disables a channel to the project file with --project', async () => {
    await run({ action: 'disable', name: 'codex', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).toMatch(/codex:[\s\S]*enabled: false/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toContain('Disabled channel')
    expect(out).toContain('mmr config enable codex')
  })

  it('routes a not-installed channel disable to global with a notice', async () => {
    // 'grok' command is not installed in CI/test env
    await run({ action: 'disable', name: 'grok' })
    const global = path.join(home, '.mmr', 'config.yaml')
    expect(fs.existsSync(global)).toBe(true)
    expect(fs.readFileSync(global, 'utf-8')).toMatch(/grok:[\s\S]*enabled: false/)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out.toLowerCase()).toContain('not installed')
  })

  it('enable prunes a stale channels_disabled entry', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels_disabled:\n  - codex\n')
    await run({ action: 'enable', name: 'codex', project: true })
    const yaml = fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')
    expect(yaml).not.toMatch(/-\s*codex/)
    expect(yaml).toMatch(/codex:[\s\S]*enabled: true/)
  })
})
```

- [ ] **Step 2: Run it, verify failure** — Expected: FAIL (actions not handled).

- [ ] **Step 3: Implement `disable`/`enable`**

Add options to the builder (`config.ts`): `.option('global', { type: 'boolean' })`, `.option('project', { type: 'boolean' })`. Add to the `ConfigArgs` interface. Implement:

```typescript
import { setChannelEnabled } from '../config/writer.js'
import { checkInstalled } from '../core/auth.js'

async function resolveWriteTarget(
  channel: string, enabling: boolean, args: { global?: boolean; project?: boolean },
): Promise<{ file: string; scope: 'project' | 'global'; notInstalled: boolean }> {
  const paths = resolveConfigPaths({ projectRoot: process.cwd() })
  if (args.global) return { file: paths.user, scope: 'global', notInstalled: false }
  if (args.project) return { file: paths.project, scope: 'project', notInstalled: false }
  // D1: a disable of a not-installed channel is machine-level → global default.
  if (!enabling) {
    const config = loadConfig({ projectRoot: process.cwd() })
    const cmd = config.channels[channel]?.command?.split(' ')[0]
    if (cmd && !(await checkInstalled(cmd))) {
      return { file: paths.user, scope: 'global', notInstalled: true }
    }
  }
  return { file: paths.project, scope: 'project', notInstalled: false }
}

async function configToggle(channel: string | undefined, enabled: boolean, args: ConfigArgs): Promise<void> {
  if (!channel) { console.error(`Usage: mmr config ${enabled ? 'enable' : 'disable'} <channel>`); process.exit(1); return }
  const target = await resolveWriteTarget(channel, enabled, args)
  // ensure parent dir for global
  fs.mkdirSync(path.dirname(target.file), { recursive: true })
  setChannelEnabled(target.file, channel, enabled)
  const verb = enabled ? 'Enabled' : 'Disabled'
  console.log(`✓ ${verb} channel '${channel}'`)
  if (target.notInstalled) {
    console.log(`  ${channel} CLI not found — recorded as a machine-level preference in ${target.file}`)
    console.log(`  pass --project to scope it to this repo instead`)
  } else {
    console.log(`  wrote ${target.file}`)
  }
  const { provenance } = loadConfigWithProvenance({ projectRoot: process.cwd() })
  const src = (provenance.channels[channel]?.enabled as string) ?? 'project'
  console.log(`  now    ${channel}  ${enabled ? 'enabled' : 'disabled'}  (${src})`)
  console.log(`  revert mmr config ${enabled ? 'disable' : 'enable'} ${channel}`)
}
```

Wire into handler switch: `case 'disable': await configToggle(args.name, false, args); break` and `case 'enable': await configToggle(args.name, true, args); break`. Add `loadConfig` to the loader import. Note: the handler's early guard (config.ts:361) rejects name/target for non-`channels` actions — extend it to allow `enable`/`disable` (which legitimately take a name).

- [ ] **Step 4: Run it, verify pass**

Run: `cd packages/mmr && npx vitest run tests/commands/config-enable-disable.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/commands/config.ts packages/mmr/tests/commands/config-enable-disable.test.ts
git commit -m "feat(mmr): config enable/disable channel mutators (A1, D1, D5)"
```

---

## Task 4: provenance `source` in channels list + `--format text` table + centralized redaction (B2, D4)

**Files:**
- Modify: `packages/mmr/src/core/redact.ts`, `packages/mmr/src/commands/config.ts`
- Test: `packages/mmr/tests/commands/config-channels-source.test.ts`, extend `packages/mmr/tests/core/redact.test.ts`

**Interfaces:**
- Produces: `redactConfigView(value: unknown, opts?: { noRedact?: boolean }): unknown` in `redact.ts` (deep pass; default redacts). `configChannels` JSON entries gain `source: ProvenanceSource`.

- [ ] **Step 1: Write the failing test (additive `source`, JSON stays parseable)**

```typescript
// packages/mmr/tests/commands/config-channels-source.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('mmr config channels — source provenance', () => {
  let tmp: string; let cwdSpy: ReturnType<typeof vi.spyOn>; let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-src-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => { cwdSpy.mockRestore(); logSpy.mockRestore(); fs.rmSync(tmp, { recursive: true }) })

  it('adds a source field; default JSON still parses', async () => {
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\nchannels:\n  grok:\n    enabled: false\n')
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', _: ['config'], $0: 'mmr' } as never)
    const rows = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Array<{ name: string; source: string }>
    expect(rows.find((r) => r.name === 'grok')?.source).toBe('project')
    expect(rows.find((r) => r.name === 'claude')?.source).toBe('default')
  })

  it('renders a table with --format text', async () => {
    const { configCommand } = await import('../../src/commands/config.js')
    await configCommand.handler({ action: 'channels', format: 'text', _: ['config'], $0: 'mmr' } as never)
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(out).toMatch(/CHANNEL\s+STATUS\s+SOURCE/)
  })
})
```

- [ ] **Step 2: Run it, verify failure.**

- [ ] **Step 3: Implement.** In `config.ts`, change `configChannels` to use `loadConfigWithProvenance`, attach `source: provenance.channels[name]?.enabled ?? 'default'` to each row, route the row objects through `redactConfigView`, and branch on `args.format === 'text'` to print the aligned table; default still `console.log(JSON.stringify(rows, null, 2))`. Add `redactConfigView` to `redact.ts`:

```typescript
// redact.ts — single deep pass for machine-readable views (D4)
export function redactConfigView(value: unknown, opts: { noRedact?: boolean } = {}): unknown {
  if (opts.noRedact) return value
  if (Array.isArray(value)) return value.map((v) => redactConfigView(v))
  if (value && typeof value === 'object') return redactRecord(value as Record<string, unknown>)
  return value
}
```

Add `.option('format', { choices: ['json', 'text'], default: 'json' })` to the config builder and `format?: string` to `ConfigArgs`. When `--no-redact` is set, print the existing stderr warning before emitting.

- [ ] **Step 4: Run all config tests, verify pass (including the legacy `config-channels.test.ts` JSON-array assertions still pass).**

Run: `cd packages/mmr && npx vitest run tests/commands/config-channels.test.ts tests/commands/config-channels-source.test.ts tests/core/redact.test.ts`
Expected: PASS — legacy JSON shape preserved, new `source` present.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/redact.ts packages/mmr/src/commands/config.ts packages/mmr/tests/commands/config-channels-source.test.ts
git commit -m "feat(mmr): channel provenance source + --format text table; centralized redaction (B2, D4)"
```

---

## Task 5: review point-of-pain remediation (C3)

**Files:**
- Modify: `packages/mmr/src/types.ts`, `packages/mmr/src/core/results-pipeline.ts`, `packages/mmr/src/formatters/text.ts`
- Test: `packages/mmr/tests/formatters/text-remediation.test.ts`

**Interfaces:**
- Consumes: `ChannelResult` (extended with `recovery?: string`).
- Produces: text formatter emits an indented remediation line per degraded channel + a single `mmr doctor` pointer when any channel is degraded.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mmr/tests/formatters/text-remediation.test.ts
import { describe, expect, it } from 'vitest'
import { formatText } from '../../src/formatters/text.js'
import type { ReconciledResults } from '../../src/types.js'

function base(): ReconciledResults {
  return {
    job_id: 'job_x', verdict: 'pass', fix_threshold: 'P2', advisory_count: 0, approved: true,
    summary: '', reconciled_findings: [],
    per_channel: {
      claude: { status: 'completed', elapsed: '3s', findings: [] },
      grok: { status: 'not_installed', elapsed: '0s', findings: [] },
    },
    metadata: { channels_dispatched: 2, channels_completed: 1, channels_partial: 0, total_elapsed: '3s' },
  }
}

describe('formatText remediation', () => {
  it('prints a remediation line for a not-installed channel and a doctor pointer', () => {
    const out = formatText(base())
    expect(out).toMatch(/grok: not_installed/)
    expect(out).toContain('mmr config disable grok')
    expect(out).toContain('mmr doctor')
  })

  it('prints the recovery command for an auth_failed channel', () => {
    const r = base()
    r.per_channel.grok = { status: 'auth_failed', elapsed: '1s', findings: [], recovery: 'grok login' }
    const out = formatText(r)
    expect(out).toContain('grok login')
  })
})
```

- [ ] **Step 2: Run it, verify failure.**

- [ ] **Step 3: Implement.**
  - `types.ts`: add `recovery?: string` to `ChannelResult`.
  - `results-pipeline.ts`: where each `ChannelResult` is built from a `ChannelJobEntry`, copy `recovery: entry.recovery`. (Locate the object literal that sets `status`/`elapsed`/`findings` and add `recovery`.)
  - `text.ts`: replace the channels loop:

```typescript
  lines.push('Channels:')
  let anyDegraded = false
  const DEGRADED = new Set(['not_installed', 'auth_failed', 'failed', 'timeout', 'skipped'])
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`  ${name}: ${ch.status} (${ch.elapsed})`)
    if (DEGRADED.has(ch.status)) {
      anyDegraded = true
      if (ch.status === 'not_installed') {
        lines.push(`    → not installed — install it, or silence: mmr config disable ${name}`)
      } else if (ch.recovery) {
        lines.push(`    → ${ch.recovery}`)
      }
    }
  }
  if (anyDegraded) {
    lines.push('')
    lines.push('Some channels were unavailable — run `mmr doctor` to diagnose and fix.')
  }
```

- [ ] **Step 4: Run it, verify pass.**

Run: `cd packages/mmr && npx vitest run tests/formatters/text-remediation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/types.ts packages/mmr/src/core/results-pipeline.ts packages/mmr/src/formatters/text.ts packages/mmr/tests/formatters/text-remediation.test.ts
git commit -m "feat(mmr): review output prints point-of-pain remediation (C3)"
```

---

## Task 6: `--help` examples + lead with canonical `show <channel>` (D1-help)

**Files:**
- Modify: `packages/mmr/src/commands/config.ts`
- Test: `packages/mmr/tests/commands/config-help.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mmr/tests/commands/config-help.test.ts
import { describe, expect, it } from 'vitest'

describe('config command help', () => {
  it('declares examples leading with canonical forms', () => {
    // The builder attaches .example() calls; assert via the command's builder output.
    // Simplest: snapshot the example list by introspecting the configCommand.
    expect(true).toBe(true) // replaced below with a real assertion against an exported EXAMPLES const
  })
})
```

Refine: export a `CONFIG_EXAMPLES: ReadonlyArray<[string, string]>` from `config.ts` and assert it contains the canonical commands; wire the same array into the builder via `.example(CONFIG_EXAMPLES as [string,string][])`.

```typescript
it('includes the canonical disable and show examples', async () => {
  const { CONFIG_EXAMPLES } = await import('../../src/commands/config.js')
  const cmds = CONFIG_EXAMPLES.map((e) => e[0])
  expect(cmds).toContain('mmr config disable grok')
  expect(cmds).toContain('mmr config channels show codex')
  expect(cmds).toContain('mmr config path')
})
```

- [ ] **Step 2: Run it, verify failure.**

- [ ] **Step 3: Implement.** In `config.ts`:

```typescript
export const CONFIG_EXAMPLES: ReadonlyArray<[string, string]> = [
  ['mmr config path', 'Show where config is read from and written to'],
  ['mmr config channels', 'List channels (JSON; add --format text for a table)'],
  ['mmr config channels show codex', 'Inspect one channel with provenance'],
  ['mmr config disable grok', 'Turn a channel off (writes enabled: false)'],
  ['mmr config enable grok', 'Turn a channel back on'],
]
```

Add `.example(CONFIG_EXAMPLES as Array<[string, string]>)` to the builder. Also accept the positional `show <channel>` form already supported; ensure the help `describe` mentions the canonical `show <channel>` first.

- [ ] **Step 4: Run it, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/commands/config.ts packages/mmr/tests/commands/config-help.test.ts
git commit -m "feat(mmr): config --help examples lead with canonical commands (D1)"
```

---

## Task 7: Scaffold content — teach the new surface (E1, E2, E4)

**Files:**
- Modify: `content/skills/mmr/SKILL.md`, `content/guides/mmr/index.md`, `content/knowledge/core/multi-model-review-dispatch.md`
- Rebuild: `content/guides/mmr/index.html` via `scaffold guides --build`

- [ ] **Step 1: Add a "Configuring channels" section to `content/skills/mmr/SKILL.md`**

Insert after the "Auth Failures" section:

```markdown
## Configuring Channels

Turn a channel off without hand-editing YAML:

​```bash
mmr config disable grok      # writes channels.grok.enabled: false
mmr config enable grok       # turns it back on (and clears legacy channels_disabled)
mmr config path              # where config is read from / written to
mmr config channels --format text   # table with a SOURCE (provenance) column
​```

Disabling a channel whose CLI is not installed records the preference globally
(`~/.mmr/config.yaml`); pass `--project` to scope it to the repo instead.
If a review reports a channel `not_installed`, the output prints the exact
remediation — install it, or `mmr config disable <name>` to stop dispatching it.
```

- [ ] **Step 2: Surface the mutators in `content/guides/mmr/index.md`** — add the same commands near the top of the config section (not buried). Add `mmr config disable`, `enable`, `path` to any command table.

- [ ] **Step 3: Add a pre-flight note to `content/knowledge/core/multi-model-review-dispatch.md`** — one line: "If a channel is permanently unavailable on this machine, `mmr config disable <name>` stops it being dispatched; `mmr config test` / `mmr doctor` diagnose."

- [ ] **Step 4: Rebuild guides + verify drift gate**

```bash
scaffold guides --build
```

Expected: `content/guides/mmr/index.html` regenerated; no drift-gate failure.

- [ ] **Step 5: Commit**

```bash
git add content/skills/mmr/SKILL.md content/guides/mmr/index.md content/guides/mmr/index.html content/knowledge/core/multi-model-review-dispatch.md
git commit -m "docs(mmr): teach config mutators in skill, guide, knowledge (E1, E2, E4)"
```

---

## Final Phase-1 verification (before PR)

- [ ] Run the full MMR gate: `cd packages/mmr && npm run check` → lint + type-check + all vitest green.
- [ ] Run the repo gate touched by content changes: `make check-all` (or at least the bash + frontmatter validators) from repo root.
- [ ] Manually smoke-test in a scratch dir:

```bash
cd "$(mktemp -d)" && node /Users/kenallred/Developer/scaffold/packages/mmr/dist/index.js config path
node …/dist/index.js config disable grok && node …/dist/index.js config channels --format text
```

(After `npm run build`.) Expected: `disable` writes global with the not-installed notice; the table shows `grok disabled (~/.mmr/config.yaml)`.

- [ ] Push branch, open PR, run the multi-model review (next stage of the goal).

---

## Self-Review

**Spec coverage (vision §03–§07, Phase 1 rows):** A1 → Task 3; B1 → Task 2; B2 → Task 4; C3 → Task 5; D1-help → Task 6; E1/E2/E4 → Task 7; D2 writer → Task 1; D4 redaction → Task 4; D5 canonical/prune → Tasks 1+3; D1 routing → Task 3. All Phase-1 items covered. (C1/C2/A2/D2-set are Phase 2; D2/D3 manifest/explain are Phase 3 — out of scope here.)

**Placeholder scan:** Task 6 Step 1 starts with a stub then is explicitly replaced by the real `CONFIG_EXAMPLES` assertion in the same step — no placeholder ships. No other TBDs.

**Type consistency:** `setChannelEnabled`, `pruneChannelsDisabled`, `coerceScalar`, `resolveConfigPaths`, `redactConfigView`, `recovery?` on `ChannelResult` — names used consistently across tasks. `ProvenanceSource` reused from loader.

**Open risk to verify during impl:** exact location in `results-pipeline.ts` where `ChannelResult` is constructed (Task 5 Step 3) — grep `findings:` / `status:` object literal; and confirm the handler guard at `config.ts:361` is loosened to allow `enable`/`disable` names.
