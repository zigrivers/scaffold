# mmr (Multi-Model Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@zigrivers/mmr`, an async multi-model code review CLI that dispatches reviews to external model CLIs, reconciles findings, and gates on severity — as a workspace package inside the scaffold monorepo.

**Architecture:** Yargs CLI with five commands (review, status, results, config, jobs). Core modules: dispatcher (spawn + monitor background processes), auth (per-channel verification), prompt (layered assembly), reconciler (consensus rules), job-store (filesystem state). Config loaded from `~/.mmr/config.yaml` + `.mmr.yaml` + CLI flags via zod-validated schemas.

**Tech Stack:** TypeScript (ES2022/Node16), Yargs, Zod, js-yaml, node:child_process, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-mmr-multi-model-review-design.md`

---

## File Map

### New Files (packages/mmr/)

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest, bin entry, dependencies |
| `tsconfig.json` | TypeScript config extending scaffold patterns |
| `src/index.ts` | Shebang entry point, calls `runCli()` |
| `src/cli.ts` | Yargs setup, command registration, global options |
| `src/types.ts` | Shared types: Severity, Finding, ChannelConfig, JobState, etc. |
| `src/config/schema.ts` | Zod schemas for `.mmr.yaml` and channel definitions |
| `src/config/loader.ts` | Load + merge user config → project config → CLI flags |
| `src/config/defaults.ts` | Built-in channel presets (claude, gemini, codex) |
| `src/core/job-store.ts` | Create/read/update/list/prune job directories under `~/.mmr/jobs/` |
| `src/core/auth.ts` | Per-channel auth check (spawn, timeout, exit code classification) |
| `src/core/prompt.ts` | Four-layer prompt assembly engine |
| `src/core/dispatcher.ts` | Spawn channel processes, write PIDs, monitor completion |
| `src/core/parser.ts` | Output parsers: default JSON, gemini (strip wrappers), custom |
| `src/core/reconciler.ts` | Consensus rules, confidence scoring, gate evaluation |
| `src/commands/review.ts` | `mmr review` command |
| `src/commands/status.ts` | `mmr status <job-id>` command |
| `src/commands/results.ts` | `mmr results <job-id>` command |
| `src/commands/config.ts` | `mmr config` subcommands (init, test, channels, add-channel) |
| `src/commands/jobs.ts` | `mmr jobs` subcommands (list, prune) |
| `src/formatters/json.ts` | JSON output formatter (identity — already JSON) |
| `src/formatters/text.ts` | Human-readable terminal output |
| `src/formatters/markdown.ts` | Markdown for PR comments |
| `templates/core-prompt.md` | Immutable Layer 1 review prompt |
| `tests/config/schema.test.ts` | Config schema validation tests |
| `tests/config/loader.test.ts` | Config merge-order tests |
| `tests/core/job-store.test.ts` | Job CRUD tests |
| `tests/core/auth.test.ts` | Auth check logic tests |
| `tests/core/prompt.test.ts` | Prompt assembly tests |
| `tests/core/dispatcher.test.ts` | Dispatch + process management tests |
| `tests/core/parser.test.ts` | Output parser tests |
| `tests/core/reconciler.test.ts` | Reconciliation + gate tests |
| `tests/commands/review.test.ts` | Review command integration test |
| `tests/commands/status.test.ts` | Status command integration test |
| `tests/commands/results.test.ts` | Results command integration test |
| `tests/formatters/text.test.ts` | Text formatter tests |
| `tests/formatters/markdown.test.ts` | Markdown formatter tests |

### Modified Files (scaffold root)

| File | Change |
|------|--------|
| `package.json` | Add `workspaces: ["packages/*"]` |
| `tsconfig.json` | Add project reference to `packages/mmr` |
| `Makefile` | Add `mmr-test`, `mmr-build`, `mmr-check` targets |

---

## Task 1: Monorepo Workspace Setup

**Files:**
- Create: `packages/mmr/package.json`
- Create: `packages/mmr/tsconfig.json`
- Create: `packages/mmr/src/index.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Create packages/mmr directory**

```bash
mkdir -p packages/mmr/src packages/mmr/tests
```

- [ ] **Step 2: Create packages/mmr/package.json**

Create `packages/mmr/package.json`:

```json
{
  "name": "@zigrivers/mmr",
  "version": "0.1.0",
  "description": "Multi-model code review CLI — async dispatch, reconciliation, and severity gating",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/zigrivers/scaffold.git",
    "directory": "packages/mmr"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  },
  "files": [
    "dist/",
    "templates/",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18"
  },
  "bin": {
    "mmr": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ tests/",
    "type-check": "tsc --noEmit",
    "check": "npm run lint && npm run type-check && npm test"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "yargs": "^17.7.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.21.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.13.0",
    "@types/yargs": "^17.0.33",
    "@vitest/coverage-v8": "^3.0.7",
    "eslint": "^9.21.0",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.26.0",
    "vitest": "^3.0.7"
  }
}
```

- [ ] **Step 3: Create packages/mmr/tsconfig.json**

Create `packages/mmr/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create packages/mmr/vitest.config.ts**

Create `packages/mmr/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 5: Create minimal entry point**

Create `packages/mmr/src/index.ts`:

```typescript
#!/usr/bin/env node

import { runCli } from './cli.js'

runCli(process.argv.slice(2))
```

- [ ] **Step 6: Create stub CLI**

Create `packages/mmr/src/cli.ts`:

```typescript
import yargs from 'yargs'

export async function runCli(argv: string[]): Promise<void> {
  await yargs(argv)
    .scriptName('mmr')
    .usage('$0 <command> [options]')
    .demandCommand(1, 'Run mmr --help for usage')
    .strict()
    .help()
    .argv
}
```

- [ ] **Step 7: Add workspaces to root package.json**

Edit `package.json` (root) — add `"workspaces"` field:

```json
"workspaces": ["packages/*"],
```

- [ ] **Step 8: Verify build**

```bash
cd packages/mmr && npm install && npm run build
```

Expected: compiles to `packages/mmr/dist/` with no errors.

- [ ] **Step 9: Verify entry point runs**

```bash
node packages/mmr/dist/index.js --help
```

Expected: prints `mmr <command> [options]` usage.

- [ ] **Step 10: Commit**

```bash
git add packages/mmr/ package.json
git commit -m "feat(mmr): scaffold workspace package with CLI entry point"
```

---

## Task 2: Types & Config Schema

**Files:**
- Create: `packages/mmr/src/types.ts`
- Create: `packages/mmr/src/config/schema.ts`
- Test: `packages/mmr/tests/config/schema.test.ts`

- [ ] **Step 1: Write failing test for config schema validation**

Create `packages/mmr/tests/config/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MmrConfigSchema, Severity } from '../../src/config/schema.js'

describe('MmrConfigSchema', () => {
  it('validates a minimal valid config', () => {
    const config = {
      version: 1,
      defaults: { fix_threshold: 'P2' },
      channels: {
        claude: {
          enabled: true,
          command: 'claude -p',
          auth: {
            check: 'claude -p "ok" 2>/dev/null',
            timeout: 5,
            failure_exit_codes: [1],
            recovery: 'Run: claude login',
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects config without version', () => {
    const config = { channels: {} }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('rejects invalid severity in fix_threshold', () => {
    const config = {
      version: 1,
      defaults: { fix_threshold: 'P5' },
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const config = {
      version: 1,
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.defaults.fix_threshold).toBe('P2')
      expect(result.data.defaults.timeout).toBe(300)
      expect(result.data.defaults.format).toBe('json')
      expect(result.data.defaults.job_retention_days).toBe(7)
    }
  })
})

describe('Severity', () => {
  it('P0 < P1 < P2 < P3 in severity order', () => {
    expect(Severity.parse('P0')).toBe('P0')
    expect(Severity.parse('P3')).toBe('P3')
    expect(() => Severity.parse('P4')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/config/schema.test.ts
```

Expected: FAIL — cannot resolve `../../src/config/schema.js`

- [ ] **Step 3: Create types.ts**

Create `packages/mmr/src/types.ts`:

```typescript
export type Severity = 'P0' | 'P1' | 'P2' | 'P3'

export const SEVERITY_ORDER: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

export type ChannelStatus =
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'timeout'
  | 'failed'
  | 'auth_failed'
  | 'skipped'

export type JobStatus = 'dispatched' | 'running' | 'completed'

export type Agreement = 'consensus' | 'majority' | 'unique' | 'divergent'

export type Confidence = 'high' | 'medium' | 'low'

export type OutputFormat = 'json' | 'text' | 'markdown' | 'sarif'

export interface Finding {
  severity: Severity
  location: string
  description: string
  suggestion: string
}

export interface ReconciledFinding extends Finding {
  confidence: Confidence
  sources: string[]
  agreement: Agreement
}

export interface ChannelResult {
  status: ChannelStatus
  elapsed: string
  findings: Finding[]
  raw_output?: string
  error?: string
}

export interface JobMetadata {
  job_id: string
  status: JobStatus
  fix_threshold: Severity
  format: OutputFormat
  created_at: string
  channels: Record<string, ChannelJobEntry>
}

export interface ChannelJobEntry {
  status: ChannelStatus
  auth: 'ok' | 'failed' | 'skipped'
  recovery?: string
  pid?: number
  started_at?: string
  completed_at?: string
  elapsed?: string
  findings_count?: number
}

export interface ReconciledResults {
  job_id: string
  gate_passed: boolean
  fix_threshold: Severity
  reconciled_findings: ReconciledFinding[]
  per_channel: Record<string, ChannelResult>
  metadata: {
    channels_dispatched: number
    channels_completed: number
    channels_partial: number
    total_elapsed: string
  }
}

export interface ChannelConfig {
  enabled: boolean
  command: string
  flags?: string[]
  env?: Record<string, string>
  auth: {
    check: string
    timeout: number
    failure_exit_codes: number[]
    recovery: string
  }
  prompt_wrapper?: string
  output_parser?: string
  stderr?: 'suppress' | 'capture' | 'passthrough'
  timeout?: number
}

export interface MmrConfig {
  version: number
  defaults: {
    fix_threshold: Severity
    timeout: number
    format: OutputFormat
    parallel: boolean
    job_retention_days: number
  }
  review_criteria?: string[]
  templates?: Record<string, { criteria?: string[] }>
  channels: Record<string, ChannelConfig>
}
```

- [ ] **Step 4: Create config/schema.ts**

Create `packages/mmr/src/config/schema.ts`:

```typescript
import { z } from 'zod'

export const Severity = z.enum(['P0', 'P1', 'P2', 'P3'])

export const OutputFormat = z.enum(['json', 'text', 'markdown', 'sarif'])

const AuthConfigSchema = z.object({
  check: z.string(),
  timeout: z.number().default(5),
  failure_exit_codes: z.array(z.number()),
  recovery: z.string(),
})

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(true),
  command: z.string(),
  flags: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  auth: AuthConfigSchema,
  prompt_wrapper: z.string().default('{{prompt}}'),
  output_parser: z.string().default('default'),
  stderr: z.enum(['suppress', 'capture', 'passthrough']).default('capture'),
  timeout: z.number().optional(),
})

const TemplateSchema = z.object({
  criteria: z.array(z.string()).optional(),
})

const DefaultsSchema = z.object({
  fix_threshold: Severity.default('P2'),
  timeout: z.number().default(300),
  format: OutputFormat.default('json'),
  parallel: z.boolean().default(true),
  job_retention_days: z.number().default(7),
})

export const MmrConfigSchema = z.object({
  version: z.number(),
  defaults: DefaultsSchema.default({}),
  review_criteria: z.array(z.string()).optional(),
  templates: z.record(TemplateSchema).optional(),
  channels: z.record(ChannelConfigSchema).default({}),
})

export type MmrConfigParsed = z.infer<typeof MmrConfigSchema>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/config/schema.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/types.ts packages/mmr/src/config/schema.ts packages/mmr/tests/config/schema.test.ts
git commit -m "feat(mmr): add types and zod config schema with validation"
```

---

## Task 3: Config Loader (Merge User + Project + CLI)

**Files:**
- Create: `packages/mmr/src/config/defaults.ts`
- Create: `packages/mmr/src/config/loader.ts`
- Test: `packages/mmr/tests/config/loader.test.ts`

- [ ] **Step 1: Write failing tests for config loading**

Create `packages/mmr/tests/config/loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../../src/config/loader.js'

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns defaults when no config files exist', () => {
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P2')
    expect(config.defaults.timeout).toBe(300)
  })

  it('loads project .mmr.yaml and merges with defaults', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P1')
    expect(config.defaults.timeout).toBe(300) // still default
    expect(config.channels.claude.enabled).toBe(true)
  })

  it('CLI overrides take precedence over config file', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P2',
      '  timeout: 300',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      cliOverrides: { fix_threshold: 'P0', timeout: 60 },
    })
    expect(config.defaults.fix_threshold).toBe('P0')
    expect(config.defaults.timeout).toBe(60)
  })

  it('merges user config with project config', () => {
    // User config: disables codex globally
    const userDir = path.join(tmpDir, '.mmr')
    fs.mkdirSync(userDir, { recursive: true })
    const userYaml = [
      'channels:',
      '  codex:',
      '    enabled: false',
      '    command: codex exec',
      '    auth:',
      '      check: "codex login status"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: codex login"',
    ].join('\n')
    fs.writeFileSync(path.join(userDir, 'config.yaml'), userYaml)

    // Project config: enables claude
    const projYaml = [
      'version: 1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projYaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude.enabled).toBe(true)
    expect(config.channels.codex.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/config/loader.test.ts
```

Expected: FAIL — cannot resolve `../../src/config/loader.js`

- [ ] **Step 3: Create config/defaults.ts**

Create `packages/mmr/src/config/defaults.ts`:

```typescript
import type { MmrConfig } from '../types.js'

export const DEFAULT_CONFIG: MmrConfig = {
  version: 1,
  defaults: {
    fix_threshold: 'P2',
    timeout: 300,
    format: 'json',
    parallel: true,
    job_retention_days: 7,
  },
  channels: {},
}

export const BUILTIN_CHANNELS: MmrConfig['channels'] = {
  claude: {
    enabled: true,
    command: 'claude -p',
    flags: [],
    env: {},
    auth: {
      check: "claude -p 'respond with ok' 2>/dev/null",
      timeout: 5,
      failure_exit_codes: [1],
      recovery: 'Run: claude login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
  },
  gemini: {
    enabled: true,
    command: 'gemini -p',
    flags: ['--approval-mode yolo', '--output-format json'],
    env: { NO_BROWSER: 'true' },
    auth: {
      check: "NO_BROWSER=true gemini -p 'respond with ok' -o json 2>&1",
      timeout: 5,
      failure_exit_codes: [41],
      recovery: "Run: gemini -p 'hello' (interactive, opens browser)",
    },
    prompt_wrapper: '{{prompt}}\nIMPORTANT: Return raw JSON only. No markdown fences.',
    output_parser: 'gemini',
    stderr: 'capture',
    timeout: 360,
  },
  codex: {
    enabled: true,
    command: 'codex exec',
    flags: ['--skip-git-repo-check', '-s read-only', '--ephemeral'],
    env: {},
    auth: {
      check: 'codex login status 2>/dev/null',
      timeout: 5,
      failure_exit_codes: [1],
      recovery: 'Run: codex login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'suppress',
  },
}
```

- [ ] **Step 4: Create config/loader.ts**

Create `packages/mmr/src/config/loader.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { MmrConfigSchema } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'
import type { MmrConfig, Severity, OutputFormat } from '../types.js'

export interface LoadConfigOptions {
  projectRoot: string
  userHome?: string
  cliOverrides?: {
    fix_threshold?: Severity
    timeout?: number
    format?: OutputFormat
    channels?: string
  }
}

export function loadConfig(opts: LoadConfigOptions): MmrConfig {
  const userHome = opts.userHome ?? process.env.HOME ?? ''

  // Layer 1: Start with defaults
  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>

  // Layer 2: User config (~/.mmr/config.yaml)
  const userConfigPath = path.join(userHome, '.mmr', 'config.yaml')
  if (fs.existsSync(userConfigPath)) {
    const raw = yaml.load(fs.readFileSync(userConfigPath, 'utf-8')) as Record<string, unknown> | null
    if (raw) {
      merged = deepMerge(merged, raw)
    }
  }

  // Layer 3: Project config (.mmr.yaml)
  const projectConfigPath = path.join(opts.projectRoot, '.mmr.yaml')
  if (fs.existsSync(projectConfigPath)) {
    const raw = yaml.load(fs.readFileSync(projectConfigPath, 'utf-8')) as Record<string, unknown> | null
    if (raw) {
      merged = deepMerge(merged, raw)
    }
  }

  // Layer 4: CLI overrides
  if (opts.cliOverrides) {
    const defaults = (merged.defaults ?? {}) as Record<string, unknown>
    if (opts.cliOverrides.fix_threshold) defaults.fix_threshold = opts.cliOverrides.fix_threshold
    if (opts.cliOverrides.timeout) defaults.timeout = opts.cliOverrides.timeout
    if (opts.cliOverrides.format) defaults.format = opts.cliOverrides.format
    merged.defaults = defaults
  }

  // Validate through zod
  const result = MmrConfigSchema.parse(merged)
  return result as unknown as MmrConfig
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      )
    } else {
      result[key] = source[key]
    }
  }
  return result
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/config/loader.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/config/ packages/mmr/tests/config/loader.test.ts
git commit -m "feat(mmr): config loader with user/project/CLI merge order"
```

---

## Task 4: Job Store

**Files:**
- Create: `packages/mmr/src/core/job-store.ts`
- Test: `packages/mmr/tests/core/job-store.test.ts`

- [ ] **Step 1: Write failing tests for job store**

Create `packages/mmr/tests/core/job-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'

describe('JobStore', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-jobs-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('creates a new job with unique ID', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude', 'gemini'],
    })
    expect(job.job_id).toMatch(/^mmr-[a-z0-9]{6}$/)
    expect(job.status).toBe('dispatched')
    expect(fs.existsSync(path.join(tmpDir, job.job_id, 'job.json'))).toBe(true)
  })

  it('saves and loads prompt text', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude'],
    })
    store.savePrompt(job.job_id, 'Review this code...')
    const prompt = store.loadPrompt(job.job_id)
    expect(prompt).toBe('Review this code...')
  })

  it('saves and loads diff', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude'],
    })
    store.saveDiff(job.job_id, '--- a/file.ts\n+++ b/file.ts')
    const diff = store.loadDiff(job.job_id)
    expect(diff).toBe('--- a/file.ts\n+++ b/file.ts')
  })

  it('updates channel status', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude'],
    })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      elapsed: '47s',
      findings_count: 2,
    })
    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.claude.status).toBe('completed')
    expect(loaded.channels.claude.elapsed).toBe('47s')
  })

  it('lists jobs ordered by creation time', () => {
    store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.createJob({ fix_threshold: 'P1', format: 'json', channels: ['gemini'] })
    const jobs = store.listJobs()
    expect(jobs).toHaveLength(2)
  })

  it('prunes jobs older than retention days', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude'],
    })
    // Manually backdate the job
    const jobDir = path.join(tmpDir, job.job_id)
    const jobJson = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf-8'))
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    jobJson.created_at = oldDate
    fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify(jobJson))

    const pruned = store.pruneJobs(7)
    expect(pruned).toBe(1)
    expect(fs.existsSync(jobDir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/job-store.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/job-store.js`

- [ ] **Step 3: Implement job-store.ts**

Create `packages/mmr/src/core/job-store.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { JobMetadata, ChannelJobEntry, Severity, OutputFormat } from '../types.js'

export interface CreateJobOptions {
  fix_threshold: Severity
  format: OutputFormat
  channels: string[]
}

export class JobStore {
  constructor(private readonly jobsDir: string) {
    fs.mkdirSync(jobsDir, { recursive: true })
  }

  createJob(opts: CreateJobOptions): JobMetadata {
    const jobId = `mmr-${crypto.randomBytes(3).toString('hex')}`
    const jobDir = path.join(this.jobsDir, jobId)
    fs.mkdirSync(path.join(jobDir, 'channels'), { recursive: true })

    const channels: Record<string, ChannelJobEntry> = {}
    for (const ch of opts.channels) {
      channels[ch] = { status: 'dispatched', auth: 'ok' }
    }

    const metadata: JobMetadata = {
      job_id: jobId,
      status: 'dispatched',
      fix_threshold: opts.fix_threshold,
      format: opts.format,
      created_at: new Date().toISOString(),
      channels,
    }

    fs.writeFileSync(
      path.join(jobDir, 'job.json'),
      JSON.stringify(metadata, null, 2),
    )

    return metadata
  }

  loadJob(jobId: string): JobMetadata {
    const jobFile = path.join(this.jobsDir, jobId, 'job.json')
    return JSON.parse(fs.readFileSync(jobFile, 'utf-8'))
  }

  saveJob(jobId: string, metadata: JobMetadata): void {
    const jobFile = path.join(this.jobsDir, jobId, 'job.json')
    fs.writeFileSync(jobFile, JSON.stringify(metadata, null, 2))
  }

  savePrompt(jobId: string, prompt: string): void {
    fs.writeFileSync(path.join(this.jobsDir, jobId, 'prompt.txt'), prompt)
  }

  loadPrompt(jobId: string): string {
    return fs.readFileSync(path.join(this.jobsDir, jobId, 'prompt.txt'), 'utf-8')
  }

  saveDiff(jobId: string, diff: string): void {
    fs.writeFileSync(path.join(this.jobsDir, jobId, 'diff.patch'), diff)
  }

  loadDiff(jobId: string): string {
    return fs.readFileSync(path.join(this.jobsDir, jobId, 'diff.patch'), 'utf-8')
  }

  saveChannelOutput(jobId: string, channel: string, output: string): void {
    fs.writeFileSync(
      path.join(this.jobsDir, jobId, 'channels', `${channel}.json`),
      output,
    )
  }

  loadChannelOutput(jobId: string, channel: string): string {
    return fs.readFileSync(
      path.join(this.jobsDir, jobId, 'channels', `${channel}.json`),
      'utf-8',
    )
  }

  saveChannelLog(jobId: string, channel: string, log: string): void {
    fs.writeFileSync(
      path.join(this.jobsDir, jobId, 'channels', `${channel}.log`),
      log,
    )
  }

  updateChannel(
    jobId: string,
    channel: string,
    update: Partial<ChannelJobEntry>,
  ): void {
    const metadata = this.loadJob(jobId)
    metadata.channels[channel] = { ...metadata.channels[channel], ...update }

    // Update overall job status
    const statuses = Object.values(metadata.channels).map(c => c.status)
    if (statuses.every(s => ['completed', 'timeout', 'failed', 'auth_failed', 'skipped'].includes(s))) {
      metadata.status = 'completed'
    } else if (statuses.some(s => s === 'running' || s === 'dispatched')) {
      metadata.status = 'running'
    }

    this.saveJob(jobId, metadata)
  }

  saveResults(jobId: string, results: unknown): void {
    fs.writeFileSync(
      path.join(this.jobsDir, jobId, 'results.json'),
      JSON.stringify(results, null, 2),
    )
  }

  listJobs(): JobMetadata[] {
    if (!fs.existsSync(this.jobsDir)) return []
    return fs.readdirSync(this.jobsDir)
      .filter(d => d.startsWith('mmr-'))
      .map(d => {
        const jobFile = path.join(this.jobsDir, d, 'job.json')
        if (!fs.existsSync(jobFile)) return null
        return JSON.parse(fs.readFileSync(jobFile, 'utf-8')) as JobMetadata
      })
      .filter((j): j is JobMetadata => j !== null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  pruneJobs(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    let pruned = 0
    for (const d of fs.readdirSync(this.jobsDir)) {
      if (!d.startsWith('mmr-')) continue
      const jobFile = path.join(this.jobsDir, d, 'job.json')
      if (!fs.existsSync(jobFile)) continue
      const job = JSON.parse(fs.readFileSync(jobFile, 'utf-8')) as JobMetadata
      if (new Date(job.created_at).getTime() < cutoff) {
        fs.rmSync(path.join(this.jobsDir, d), { recursive: true })
        pruned++
      }
    }
    return pruned
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/job-store.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/job-store.ts packages/mmr/tests/core/job-store.test.ts
git commit -m "feat(mmr): job store with create, load, update, list, prune"
```

---

## Task 5: Auth Verification

**Files:**
- Create: `packages/mmr/src/core/auth.ts`
- Test: `packages/mmr/tests/core/auth.test.ts`

- [ ] **Step 1: Write failing tests for auth**

Create `packages/mmr/tests/core/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { checkAuth, checkInstalled, type AuthResult } from '../../src/core/auth.js'
import type { ChannelConfig } from '../../types.js'

describe('checkInstalled', () => {
  it('returns true for a command that exists', async () => {
    const result = await checkInstalled('node')
    expect(result).toBe(true)
  })

  it('returns false for a command that does not exist', async () => {
    const result = await checkInstalled('nonexistent-binary-xyz-123')
    expect(result).toBe(false)
  })
})

describe('checkAuth', () => {
  it('returns ok for a command that exits 0', async () => {
    const config: ChannelConfig = {
      enabled: true,
      command: 'echo',
      auth: {
        check: 'true',
        timeout: 5,
        failure_exit_codes: [1],
        recovery: 'do something',
      },
    }
    const result = await checkAuth(config)
    expect(result.status).toBe('ok')
  })

  it('returns failed when exit code matches failure_exit_codes', async () => {
    const config: ChannelConfig = {
      enabled: true,
      command: 'echo',
      auth: {
        check: 'exit 1',
        timeout: 5,
        failure_exit_codes: [1],
        recovery: 'Run: reauth',
      },
    }
    const result = await checkAuth(config)
    expect(result.status).toBe('failed')
    expect(result.recovery).toBe('Run: reauth')
  })

  it('returns timeout when auth check exceeds timeout', async () => {
    const config: ChannelConfig = {
      enabled: true,
      command: 'echo',
      auth: {
        check: 'sleep 10',
        timeout: 1,
        failure_exit_codes: [1],
        recovery: 'do something',
      },
    }
    const result = await checkAuth(config)
    expect(result.status).toBe('timeout')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/auth.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/auth.js`

- [ ] **Step 3: Implement auth.ts**

Create `packages/mmr/src/core/auth.ts`:

```typescript
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { ChannelConfig } from '../types.js'

const execFileAsync = promisify(execFile)

export interface AuthResult {
  status: 'ok' | 'failed' | 'timeout'
  recovery?: string
}

export async function checkInstalled(command: string): Promise<boolean> {
  try {
    await execFileAsync('command', ['-v', command], { shell: true })
    return true
  } catch {
    return false
  }
}

export async function checkAuth(config: ChannelConfig): Promise<AuthResult> {
  const timeoutMs = (config.auth.timeout ?? 5) * 1000

  return new Promise<AuthResult>((resolve) => {
    const proc = spawn('sh', ['-c', config.auth.check], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
    })

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      resolve({ status: 'timeout' })
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== null && config.auth.failure_exit_codes.includes(code)) {
        resolve({ status: 'failed', recovery: config.auth.recovery })
      } else if (code === 0) {
        resolve({ status: 'ok' })
      } else {
        // Non-zero exit that isn't in failure_exit_codes — treat as transient
        resolve({ status: 'ok' })
      }
    })

    proc.on('error', () => {
      clearTimeout(timer)
      resolve({ status: 'failed', recovery: config.auth.recovery })
    })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/auth.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/auth.ts packages/mmr/tests/core/auth.test.ts
git commit -m "feat(mmr): auth verification with timeout and exit code classification"
```

---

## Task 6: Core Prompt Assembly

**Files:**
- Create: `packages/mmr/templates/core-prompt.md`
- Create: `packages/mmr/src/core/prompt.ts`
- Test: `packages/mmr/tests/core/prompt.test.ts`

- [ ] **Step 1: Write failing tests for prompt assembly**

Create `packages/mmr/tests/core/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { assemblePrompt } from '../../src/core/prompt.js'

describe('assemblePrompt', () => {
  it('always includes severity definitions in core layer', () => {
    const prompt = assemblePrompt({ diff: 'some diff' })
    expect(prompt).toContain('P0 (Critical)')
    expect(prompt).toContain('P1 (High)')
    expect(prompt).toContain('P2 (Medium)')
    expect(prompt).toContain('P3 (Trivial)')
  })

  it('always includes JSON output format spec', () => {
    const prompt = assemblePrompt({ diff: 'some diff' })
    expect(prompt).toContain('"approved"')
    expect(prompt).toContain('"findings"')
    expect(prompt).toContain('"severity"')
  })

  it('appends project review criteria when provided', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      reviewCriteria: ['Check HIPAA compliance', 'Verify parameterized queries'],
    })
    expect(prompt).toContain('Check HIPAA compliance')
    expect(prompt).toContain('Verify parameterized queries')
  })

  it('appends focus areas when provided', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      focus: 'price consistency, closed-session date logic',
    })
    expect(prompt).toContain('price consistency, closed-session date logic')
  })

  it('includes the diff as the final layer', () => {
    const diff = '--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@'
    const prompt = assemblePrompt({ diff })
    expect(prompt).toContain(diff)
    // Diff should come after the instructions
    const severityIdx = prompt.indexOf('P0 (Critical)')
    const diffIdx = prompt.indexOf(diff)
    expect(diffIdx).toBeGreaterThan(severityIdx)
  })

  it('applies channel prompt wrapper', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      promptWrapper: '{{prompt}}\nIMPORTANT: Return raw JSON only.',
    })
    expect(prompt).toContain('IMPORTANT: Return raw JSON only.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/prompt.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/prompt.js`

- [ ] **Step 3: Create the core prompt template**

Create `packages/mmr/templates/core-prompt.md`:

```markdown
You are reviewing code changes. Return ONLY a JSON object with your findings.

## Severity Definitions
- P0 (Critical): Will cause failure, data loss, security vulnerability, or fundamental architectural flaw
- P1 (High): Will cause bugs in normal usage, inconsistency, or blocks downstream work
- P2 (Medium): Improvement opportunity — style, naming, documentation, minor optimization
- P3 (Trivial): Personal preference, trivial nits — only report if nothing else found

## Review Criteria
- Correctness: Does the logic do what it claims?
- Regressions: Does this break existing behavior?
- Edge cases: What inputs/states are unhandled?
- Test coverage: Are changes tested? Are tests meaningful?
- Security: Injection, auth bypass, data exposure?

## Output Format
Return valid JSON matching this schema exactly:
```json
{
  "approved": true | false,
  "findings": [
    {
      "severity": "P0 | P1 | P2 | P3",
      "location": "file:line",
      "description": "what is wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}
```

If no issues found, return: `{"approved": true, "findings": [], "summary": "No issues found."}`

Do NOT include markdown fences, preamble, or commentary outside the JSON object.
```

- [ ] **Step 4: Implement prompt.ts**

Create `packages/mmr/src/core/prompt.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CORE_PROMPT_PATH = path.resolve(__dirname, '../../templates/core-prompt.md')

let corePromptCache: string | null = null

function getCorePrompt(): string {
  if (corePromptCache === null) {
    corePromptCache = fs.readFileSync(CORE_PROMPT_PATH, 'utf-8')
  }
  return corePromptCache
}

export interface AssemblePromptOptions {
  diff: string
  reviewCriteria?: string[]
  focus?: string
  templateCriteria?: string[]
  promptWrapper?: string
}

export function assemblePrompt(opts: AssemblePromptOptions): string {
  const sections: string[] = []

  // Layer 1: Core prompt (immutable)
  sections.push(getCorePrompt())

  // Layer 2: Project review criteria
  if (opts.reviewCriteria?.length) {
    sections.push('## Project-Specific Review Criteria')
    for (const criterion of opts.reviewCriteria) {
      sections.push(`- ${criterion}`)
    }
  }

  // Layer 2b: Template criteria
  if (opts.templateCriteria?.length) {
    sections.push('## Template-Specific Criteria')
    for (const criterion of opts.templateCriteria) {
      sections.push(`- ${criterion}`)
    }
  }

  // Layer 3: Focus areas
  if (opts.focus) {
    sections.push(`## Focus Areas\nPay special attention to: ${opts.focus}`)
  }

  // Layer 4: The diff
  sections.push('## Code Changes to Review')
  sections.push(opts.diff)

  let assembled = sections.join('\n\n')

  // Apply channel-specific prompt wrapper
  if (opts.promptWrapper && opts.promptWrapper !== '{{prompt}}') {
    assembled = opts.promptWrapper.replace('{{prompt}}', assembled)
  }

  return assembled
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/prompt.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/prompt.ts packages/mmr/templates/core-prompt.md packages/mmr/tests/core/prompt.test.ts
git commit -m "feat(mmr): layered prompt assembly engine with core template"
```

---

## Task 7: Output Parsers

**Files:**
- Create: `packages/mmr/src/core/parser.ts`
- Test: `packages/mmr/tests/core/parser.test.ts`

- [ ] **Step 1: Write failing tests for parsers**

Create `packages/mmr/tests/core/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseChannelOutput, getParser } from '../../src/core/parser.js'

describe('default parser', () => {
  const parse = getParser('default')

  it('parses clean JSON output', () => {
    const raw = '{"approved": true, "findings": [], "summary": "No issues."}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('strips markdown fences from output', () => {
    const raw = '```json\n{"approved": true, "findings": [], "summary": "ok"}\n```'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is my review:\n{"approved": false, "findings": [{"severity": "P1", "location": "file.ts:10", "description": "bug", "suggestion": "fix it"}], "summary": "found bug"}\nEnd of review.'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
  })
})

describe('gemini parser', () => {
  const parse = getParser('gemini')

  it('extracts findings from gemini wrapper JSON', () => {
    const raw = JSON.stringify({
      response: '{"approved": false, "findings": [{"severity": "P0", "location": "f.ts:1", "description": "bad", "suggestion": "fix"}], "summary": "critical"}',
    })
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings[0].severity).toBe('P0')
  })

  it('handles direct JSON (no wrapper)', () => {
    const raw = '{"approved": true, "findings": [], "summary": "clean"}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })

  it('handles trailing commas', () => {
    const raw = '{"approved": true, "findings": [], "summary": "ok",}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })
})

describe('parseChannelOutput', () => {
  it('returns error finding when output is unparseable', () => {
    const result = parseChannelOutput('not json at all', 'default')
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.findings[0].description).toContain('parse')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/parser.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/parser.js`

- [ ] **Step 3: Implement parser.ts**

Create `packages/mmr/src/core/parser.ts`:

```typescript
import type { Finding } from '../types.js'

export interface ParsedOutput {
  approved: boolean
  findings: Finding[]
  summary: string
}

type Parser = (raw: string) => ParsedOutput

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
}

function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1')
}

function extractJson(text: string): string {
  // Try to find a JSON object in the text
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in output')

  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
    if (depth === 0) return text.slice(start, i + 1)
  }
  throw new Error('Unterminated JSON object in output')
}

function defaultParser(raw: string): ParsedOutput {
  let cleaned = stripMarkdownFences(raw).trim()
  cleaned = extractJson(cleaned)
  cleaned = fixTrailingCommas(cleaned)
  return JSON.parse(cleaned)
}

function geminiParser(raw: string): ParsedOutput {
  let text = raw.trim()

  // Gemini sometimes wraps output in { "response": "..." } metadata
  try {
    const wrapper = JSON.parse(text)
    if (typeof wrapper.response === 'string') {
      text = wrapper.response
    }
  } catch {
    // Not a wrapper — continue with raw text
  }

  return defaultParser(text)
}

const PARSERS: Record<string, Parser> = {
  default: defaultParser,
  gemini: geminiParser,
}

export function getParser(name: string): Parser {
  return PARSERS[name] ?? PARSERS.default
}

export function parseChannelOutput(raw: string, parserName: string): ParsedOutput {
  try {
    return getParser(parserName)(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      approved: false,
      findings: [{
        severity: 'P1',
        location: 'output',
        description: `Failed to parse channel output: ${message}`,
        suggestion: 'Check raw channel output for format issues',
      }],
      summary: `Output parse failure: ${message}`,
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/parser.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/parser.ts packages/mmr/tests/core/parser.test.ts
git commit -m "feat(mmr): output parsers for default JSON and gemini wrapper formats"
```

---

## Task 8: Reconciliation Engine

**Files:**
- Create: `packages/mmr/src/core/reconciler.ts`
- Test: `packages/mmr/tests/core/reconciler.test.ts`

- [ ] **Step 1: Write failing tests for reconciliation**

Create `packages/mmr/tests/core/reconciler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { reconcile, evaluateGate } from '../../src/core/reconciler.js'
import type { Finding, ReconciledFinding } from '../../src/types.js'

describe('reconcile', () => {
  it('marks findings as consensus when 2+ channels agree on location and severity', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A variant', suggestion: 'fix A alt' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].agreement).toBe('consensus')
    expect(result[0].confidence).toBe('high')
    expect(result[0].sources).toContain('claude')
    expect(result[0].sources).toContain('gemini')
  })

  it('reports at higher severity when channels disagree on severity for same location', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'minor', suggestion: 'fix' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'important', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('P1')
    expect(result[0].confidence).toBe('medium')
  })

  it('marks single-source findings as unique', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:20', description: 'only claude', suggestion: 'fix' }],
      gemini: [],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].agreement).toBe('unique')
    expect(result[0].sources).toEqual(['claude'])
  })

  it('always reports P0 findings as high confidence even from single source', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P0', location: 'file.ts:1', description: 'critical', suggestion: 'fix now' }],
      gemini: [],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('returns empty array when all channels approve with no findings', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [],
      gemini: [],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(0)
  })
})

describe('evaluateGate', () => {
  it('passes when no findings exist', () => {
    expect(evaluateGate([], 'P2')).toBe(true)
  })

  it('passes when all findings are below threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P3',
      location: 'f.ts:1',
      description: 'nit',
      suggestion: 'fix',
      confidence: 'low',
      sources: ['claude'],
      agreement: 'unique',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(true)
  })

  it('fails when a finding meets the threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P2',
      location: 'f.ts:1',
      description: 'improvement',
      suggestion: 'fix',
      confidence: 'medium',
      sources: ['claude'],
      agreement: 'unique',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(false)
  })

  it('fails when a finding exceeds the threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P0',
      location: 'f.ts:1',
      description: 'critical',
      suggestion: 'fix',
      confidence: 'high',
      sources: ['claude', 'gemini'],
      agreement: 'consensus',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/reconciler.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/reconciler.js`

- [ ] **Step 3: Implement reconciler.ts**

Create `packages/mmr/src/core/reconciler.ts`:

```typescript
import type {
  Finding,
  ReconciledFinding,
  Severity,
  Agreement,
  Confidence,
} from '../types.js'
import { SEVERITY_ORDER } from '../types.js'

function normalizeLocation(loc: string): string {
  // Normalize file:line to enable matching across channels
  return loc.trim().toLowerCase().replace(/\s+/g, '')
}

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b
}

interface FindingWithSource extends Finding {
  source: string
}

export function reconcile(
  channelFindings: Record<string, Finding[]>,
): ReconciledFinding[] {
  // Flatten all findings with source attribution
  const all: FindingWithSource[] = []
  for (const [channel, findings] of Object.entries(channelFindings)) {
    for (const f of findings) {
      all.push({ ...f, source: channel })
    }
  }

  if (all.length === 0) return []

  // Group by normalized location
  const groups = new Map<string, FindingWithSource[]>()
  for (const f of all) {
    const key = normalizeLocation(f.location)
    const group = groups.get(key) ?? []
    group.push(f)
    groups.set(key, group)
  }

  const reconciled: ReconciledFinding[] = []

  for (const group of groups.values()) {
    const sources = [...new Set(group.map(f => f.source))]
    const severities = group.map(f => f.severity)
    const finalSeverity = severities.reduce(higherSeverity)

    let agreement: Agreement
    let confidence: Confidence

    if (sources.length >= 2) {
      const allSameSeverity = severities.every(s => s === severities[0])
      agreement = allSameSeverity ? 'consensus' : 'majority'
      confidence = allSameSeverity ? 'high' : 'medium'
    } else {
      agreement = 'unique'
      // P0 from single source is still high confidence
      confidence = finalSeverity === 'P0' ? 'high' : 'medium'
    }

    // Use the first finding's text (prefer the higher-severity one)
    const primary = group.reduce((a, b) =>
      SEVERITY_ORDER[a.severity] <= SEVERITY_ORDER[b.severity] ? a : b
    )

    reconciled.push({
      severity: finalSeverity,
      confidence,
      location: primary.location,
      description: primary.description,
      suggestion: primary.suggestion,
      sources,
      agreement,
    })
  }

  // Sort by severity (P0 first)
  reconciled.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return reconciled
}

export function evaluateGate(
  findings: ReconciledFinding[],
  threshold: Severity,
): boolean {
  const thresholdOrder = SEVERITY_ORDER[threshold]
  return !findings.some(f => SEVERITY_ORDER[f.severity] <= thresholdOrder)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/reconciler.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/reconciler.ts packages/mmr/tests/core/reconciler.test.ts
git commit -m "feat(mmr): reconciliation engine with consensus rules and gate evaluation"
```

---

## Task 9: Channel Dispatcher

**Files:**
- Create: `packages/mmr/src/core/dispatcher.ts`
- Test: `packages/mmr/tests/core/dispatcher.test.ts`

- [ ] **Step 1: Write failing tests for dispatcher**

Create `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dispatchChannel, isChannelComplete } from '../../src/core/dispatcher.js'
import { JobStore } from '../../src/core/job-store.js'

describe('dispatchChannel', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-dispatch-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('dispatches a channel process and writes PID file', async () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['test'],
    })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'test', {
      command: 'echo',
      prompt: '{"approved": true, "findings": [], "summary": "ok"}',
      flags: [],
      env: {},
      timeout: 10,
      stderr: 'capture',
    })

    // Wait briefly for background process to complete
    await new Promise(resolve => setTimeout(resolve, 500))

    const pidFile = path.join(tmpDir, job.job_id, 'channels', 'test.pid')
    expect(fs.existsSync(pidFile)).toBe(true)
  })

  it('handles channel timeout', async () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['slow'],
    })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'slow', {
      command: 'sleep',
      prompt: '10',
      flags: [],
      env: {},
      timeout: 1,
      stderr: 'capture',
    })

    // Wait for timeout to fire
    await new Promise(resolve => setTimeout(resolve, 1500))

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.slow.status).toBe('timeout')
  })
})

describe('isChannelComplete', () => {
  it('returns true for completed status', () => {
    expect(isChannelComplete('completed')).toBe(true)
  })

  it('returns true for terminal statuses', () => {
    expect(isChannelComplete('timeout')).toBe(true)
    expect(isChannelComplete('failed')).toBe(true)
    expect(isChannelComplete('auth_failed')).toBe(true)
    expect(isChannelComplete('skipped')).toBe(true)
  })

  it('returns false for in-progress statuses', () => {
    expect(isChannelComplete('dispatched')).toBe(false)
    expect(isChannelComplete('running')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts
```

Expected: FAIL — cannot resolve `../../src/core/dispatcher.js`

- [ ] **Step 3: Implement dispatcher.ts**

Create `packages/mmr/src/core/dispatcher.ts`:

```typescript
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ChannelStatus } from '../types.js'
import type { JobStore } from './job-store.js'

export interface DispatchOptions {
  command: string
  prompt: string
  flags: string[]
  env: Record<string, string>
  timeout: number
  stderr: 'suppress' | 'capture' | 'passthrough'
}

const TERMINAL_STATUSES: Set<ChannelStatus> = new Set([
  'completed', 'timeout', 'failed', 'auth_failed', 'skipped',
])

export function isChannelComplete(status: ChannelStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

export async function dispatchChannel(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchOptions,
): Promise<void> {
  const [cmd, ...baseArgs] = opts.command.split(/\s+/)
  const args = [...baseArgs, ...opts.flags, opts.prompt]

  const startTime = Date.now()

  store.updateChannel(jobId, channelName, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  const proc = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
    detached: true,
  })

  // Write PID file
  const job = store.loadJob(jobId)
  const pidFile = path.join(
    path.dirname(
      path.dirname(
        // Navigate from job.json location
        ''
      )
    )
  )
  // Compute PID file path from the store's job directory
  const jobDir = store.getJobDir(jobId)
  fs.writeFileSync(
    path.join(jobDir, 'channels', `${channelName}.pid`),
    String(proc.pid),
  )

  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  // Set up timeout
  const timer = setTimeout(() => {
    proc.kill('SIGTERM')
    const elapsed = formatElapsed(Date.now() - startTime)
    store.updateChannel(jobId, channelName, { status: 'timeout', elapsed })
    if (stdout.trim()) {
      store.saveChannelOutput(jobId, channelName, stdout)
    }
    if (stderr.trim()) {
      store.saveChannelLog(jobId, channelName, stderr)
    }
  }, opts.timeout * 1000)

  proc.on('close', (code) => {
    clearTimeout(timer)
    const elapsed = formatElapsed(Date.now() - startTime)

    if (stderr.trim() && opts.stderr !== 'suppress') {
      store.saveChannelLog(jobId, channelName, stderr)
    }

    if (code === 0 && stdout.trim()) {
      store.saveChannelOutput(jobId, channelName, stdout)
      store.updateChannel(jobId, channelName, {
        status: 'completed',
        elapsed,
        completed_at: new Date().toISOString(),
      })
    } else {
      // Check if we already marked it as timeout
      const current = store.loadJob(jobId)
      if (current.channels[channelName].status !== 'timeout') {
        if (stdout.trim()) {
          store.saveChannelOutput(jobId, channelName, stdout)
        }
        store.updateChannel(jobId, channelName, {
          status: 'failed',
          elapsed,
          completed_at: new Date().toISOString(),
        })
      }
    }
  })

  proc.on('error', (err) => {
    clearTimeout(timer)
    const elapsed = formatElapsed(Date.now() - startTime)
    store.updateChannel(jobId, channelName, {
      status: 'failed',
      elapsed,
    })
    store.saveChannelLog(jobId, channelName, err.message)
  })

  // Unref so the parent process can exit
  proc.unref()
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`
}
```

- [ ] **Step 4: Add `getJobDir` method to JobStore**

Edit `packages/mmr/src/core/job-store.ts` — add this method to the `JobStore` class:

```typescript
getJobDir(jobId: string): string {
  return path.join(this.jobsDir, jobId)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/src/core/job-store.ts packages/mmr/tests/core/dispatcher.test.ts
git commit -m "feat(mmr): async channel dispatcher with timeout and PID tracking"
```

---

## Task 10: Formatters (Text + Markdown)

**Files:**
- Create: `packages/mmr/src/formatters/json.ts`
- Create: `packages/mmr/src/formatters/text.ts`
- Create: `packages/mmr/src/formatters/markdown.ts`
- Test: `packages/mmr/tests/formatters/text.test.ts`
- Test: `packages/mmr/tests/formatters/markdown.test.ts`

- [ ] **Step 1: Write failing tests for text formatter**

Create `packages/mmr/tests/formatters/text.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatText } from '../../src/formatters/text.js'
import type { ReconciledResults } from '../../src/types.js'

describe('formatText', () => {
  it('shows PASSED when gate passes', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      gate_passed: true,
      fix_threshold: 'P2',
      reconciled_findings: [],
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: [] },
      },
      metadata: {
        channels_dispatched: 1,
        channels_completed: 1,
        channels_partial: 0,
        total_elapsed: '30s',
      },
    }
    const output = formatText(results)
    expect(output).toContain('PASSED')
    expect(output).toContain('mmr-abc123')
  })

  it('shows FAILED with findings when gate fails', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      gate_passed: false,
      fix_threshold: 'P2',
      reconciled_findings: [{
        severity: 'P1',
        confidence: 'high',
        location: 'file.ts:10',
        description: 'Bug found',
        suggestion: 'Fix it',
        sources: ['claude', 'gemini'],
        agreement: 'consensus',
      }],
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: [] },
        gemini: { status: 'completed', elapsed: '45s', findings: [] },
      },
      metadata: {
        channels_dispatched: 2,
        channels_completed: 2,
        channels_partial: 0,
        total_elapsed: '45s',
      },
    }
    const output = formatText(results)
    expect(output).toContain('FAILED')
    expect(output).toContain('P1')
    expect(output).toContain('file.ts:10')
    expect(output).toContain('Bug found')
  })
})
```

- [ ] **Step 2: Write failing tests for markdown formatter**

Create `packages/mmr/tests/formatters/markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatMarkdown } from '../../src/formatters/markdown.js'
import type { ReconciledResults } from '../../src/types.js'

describe('formatMarkdown', () => {
  it('produces markdown with findings table', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      gate_passed: false,
      fix_threshold: 'P2',
      reconciled_findings: [{
        severity: 'P0',
        confidence: 'high',
        location: 'file.ts:10',
        description: 'Security vuln',
        suggestion: 'Sanitize input',
        sources: ['claude', 'gemini'],
        agreement: 'consensus',
      }],
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: [] },
        gemini: { status: 'completed', elapsed: '45s', findings: [] },
      },
      metadata: {
        channels_dispatched: 2,
        channels_completed: 2,
        channels_partial: 0,
        total_elapsed: '45s',
      },
    }
    const md = formatMarkdown(results)
    expect(md).toContain('## Multi-Model Review')
    expect(md).toContain('P0')
    expect(md).toContain('Security vuln')
    expect(md).toContain('|')  // Table formatting
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/mmr && npx vitest run tests/formatters/
```

Expected: FAIL — cannot resolve modules.

- [ ] **Step 4: Implement json.ts**

Create `packages/mmr/src/formatters/json.ts`:

```typescript
import type { ReconciledResults } from '../types.js'

export function formatJson(results: ReconciledResults): string {
  return JSON.stringify(results, null, 2)
}
```

- [ ] **Step 5: Implement text.ts**

Create `packages/mmr/src/formatters/text.ts`:

```typescript
import type { ReconciledResults } from '../types.js'

export function formatText(results: ReconciledResults): string {
  const lines: string[] = []

  const gateIcon = results.gate_passed ? 'PASSED' : 'FAILED'
  lines.push(`mmr ${gateIcon} (job: ${results.job_id}, threshold: ${results.fix_threshold})`)
  lines.push('')

  // Channel summary
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`  ${name}: ${ch.status} (${ch.elapsed})`)
  }
  lines.push('')

  if (results.reconciled_findings.length === 0) {
    lines.push('No findings.')
  } else {
    lines.push(`${results.reconciled_findings.length} finding(s):`)
    lines.push('')
    for (const f of results.reconciled_findings) {
      lines.push(`  [${f.severity}] ${f.location} (${f.confidence} confidence, ${f.agreement})`)
      lines.push(`    ${f.description}`)
      lines.push(`    Suggestion: ${f.suggestion}`)
      lines.push(`    Sources: ${f.sources.join(', ')}`)
      lines.push('')
    }
  }

  lines.push(`Channels: ${results.metadata.channels_completed}/${results.metadata.channels_dispatched} completed | ${results.metadata.total_elapsed} total`)

  return lines.join('\n')
}
```

- [ ] **Step 6: Implement markdown.ts**

Create `packages/mmr/src/formatters/markdown.ts`:

```typescript
import type { ReconciledResults } from '../types.js'

export function formatMarkdown(results: ReconciledResults): string {
  const lines: string[] = []

  const gateIcon = results.gate_passed ? 'PASSED' : 'FAILED'
  lines.push(`## Multi-Model Review — ${gateIcon}`)
  lines.push('')
  lines.push(`**Job:** ${results.job_id} | **Threshold:** ${results.fix_threshold} | **Channels:** ${results.metadata.channels_completed}/${results.metadata.channels_dispatched}`)
  lines.push('')

  if (results.reconciled_findings.length === 0) {
    lines.push('No findings. All channels approved.')
  } else {
    lines.push('| Severity | Location | Description | Suggestion | Sources | Agreement |')
    lines.push('|----------|----------|-------------|------------|---------|-----------|')
    for (const f of results.reconciled_findings) {
      lines.push(`| **${f.severity}** | \`${f.location}\` | ${f.description} | ${f.suggestion} | ${f.sources.join(', ')} | ${f.agreement} |`)
    }
  }

  lines.push('')
  lines.push('### Channel Details')
  lines.push('')
  for (const [name, ch] of Object.entries(results.per_channel)) {
    lines.push(`- **${name}:** ${ch.status} (${ch.elapsed})`)
  }

  return lines.join('\n')
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd packages/mmr && npx vitest run tests/formatters/
```

Expected: all 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/mmr/src/formatters/ packages/mmr/tests/formatters/
git commit -m "feat(mmr): json, text, and markdown output formatters"
```

---

## Task 11: CLI Commands — review, status, results

**Files:**
- Create: `packages/mmr/src/commands/review.ts`
- Create: `packages/mmr/src/commands/status.ts`
- Create: `packages/mmr/src/commands/results.ts`
- Modify: `packages/mmr/src/cli.ts`

- [ ] **Step 1: Implement review command**

Create `packages/mmr/src/commands/review.ts`:

```typescript
import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { loadConfig } from '../config/loader.js'
import { JobStore } from '../core/job-store.js'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { assemblePrompt } from '../core/prompt.js'
import { dispatchChannel } from '../core/dispatcher.js'
import type { Severity, OutputFormat } from '../types.js'
import os from 'node:os'
import path from 'node:path'

interface ReviewArgs {
  diff?: string
  pr?: number
  staged?: boolean
  base?: string
  head?: string
  focus?: string
  'fix-threshold'?: string
  channels?: string
  timeout?: number
  template?: string
  format?: string
  sync?: boolean
}

const reviewCommand: CommandModule<Record<string, unknown>, ReviewArgs> = {
  command: 'review',
  describe: 'Dispatch a code review to all configured channels',
  builder: (yargs) => {
    return yargs
      .option('diff', { type: 'string', description: 'Path to diff file (or - for stdin)' })
      .option('pr', { type: 'number', description: 'PR number to review' })
      .option('staged', { type: 'boolean', description: 'Review staged changes' })
      .option('base', { type: 'string', description: 'Base ref for range' })
      .option('head', { type: 'string', description: 'Head ref for range' })
      .option('focus', { type: 'string', description: 'Focus areas for review' })
      .option('fix-threshold', { type: 'string', choices: ['P0', 'P1', 'P2', 'P3'], description: 'Severity gate threshold' })
      .option('channels', { type: 'string', description: 'Comma-separated channel names' })
      .option('timeout', { type: 'number', description: 'Per-channel timeout in seconds' })
      .option('template', { type: 'string', description: 'Named prompt template' })
      .option('format', { type: 'string', choices: ['json', 'text', 'markdown', 'sarif'], description: 'Output format' })
      .option('sync', { type: 'boolean', description: 'Block until complete', default: false })
  },
  handler: async (argv) => {
    // 1. Load config
    const config = loadConfig({
      projectRoot: process.cwd(),
      cliOverrides: {
        fix_threshold: argv['fix-threshold'] as Severity | undefined,
        timeout: argv.timeout,
        format: argv.format as OutputFormat | undefined,
      },
    })

    // 2. Resolve diff input
    let diff: string
    if (argv.diff) {
      diff = argv.diff === '-'
        ? fs.readFileSync(0, 'utf-8')
        : fs.readFileSync(argv.diff, 'utf-8')
    } else if (argv.pr) {
      diff = execSync(`gh pr diff ${argv.pr}`, { encoding: 'utf-8' })
    } else if (argv.staged) {
      diff = execSync('git diff --cached', { encoding: 'utf-8' })
    } else if (argv.base && argv.head) {
      diff = execSync(`git diff ${argv.base}...${argv.head}`, { encoding: 'utf-8' })
    } else {
      process.stderr.write('Error: Provide --diff, --pr, --staged, or --base/--head\n')
      process.exit(1)
      return
    }

    // 3. Determine which channels to use
    const channelNames = argv.channels
      ? argv.channels.split(',').map(c => c.trim())
      : Object.entries(config.channels)
          .filter(([, ch]) => ch.enabled)
          .map(([name]) => name)

    // 4. Auth-check all channels
    const authResults: Record<string, { auth: string; recovery?: string; dispatched: boolean }> = {}
    const dispatchable: string[] = []

    for (const name of channelNames) {
      const ch = config.channels[name]
      if (!ch) {
        authResults[name] = { auth: 'skipped', dispatched: false }
        continue
      }

      const baseCmd = ch.command.split(/\s+/)[0]
      const installed = await checkInstalled(baseCmd)
      if (!installed) {
        authResults[name] = { auth: 'skipped', dispatched: false }
        continue
      }

      const authResult = await checkAuth(ch)
      if (authResult.status === 'ok') {
        authResults[name] = { auth: 'ok', dispatched: true }
        dispatchable.push(name)
      } else {
        authResults[name] = {
          auth: 'failed',
          recovery: authResult.recovery,
          dispatched: false,
        }
      }
    }

    // 5. Create job
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)
    const job = store.createJob({
      fix_threshold: config.defaults.fix_threshold,
      format: config.defaults.format,
      channels: channelNames,
    })

    // Update auth statuses
    for (const [name, result] of Object.entries(authResults)) {
      if (!result.dispatched) {
        store.updateChannel(job.job_id, name, {
          status: result.auth === 'failed' ? 'auth_failed' : 'skipped',
          auth: result.auth as 'ok' | 'failed' | 'skipped',
          recovery: result.recovery,
        })
      }
    }

    // 6. Assemble prompt
    const templateCriteria = argv.template && config.templates?.[argv.template]?.criteria
    const prompt = assemblePrompt({
      diff,
      reviewCriteria: config.review_criteria,
      focus: argv.focus,
      templateCriteria: templateCriteria ?? undefined,
    })
    store.savePrompt(job.job_id, prompt)
    store.saveDiff(job.job_id, diff)

    // 7. Dispatch channels
    for (const name of dispatchable) {
      const ch = config.channels[name]
      const timeout = ch.timeout ?? config.defaults.timeout
      await dispatchChannel(store, job.job_id, name, {
        command: ch.command,
        prompt: ch.prompt_wrapper
          ? ch.prompt_wrapper.replace('{{prompt}}', prompt)
          : prompt,
        flags: ch.flags ?? [],
        env: ch.env ?? {},
        timeout,
        stderr: ch.stderr ?? 'capture',
      })
    }

    // 8. Output dispatch result
    const authFailures = Object.values(authResults).filter(r => r.auth === 'failed').length
    const output = {
      job_id: job.job_id,
      dispatched: Object.fromEntries(
        Object.entries(authResults).map(([name, r]) => [name, {
          auth: r.auth,
          status: r.dispatched ? 'dispatched' : 'skipped',
          ...(r.recovery ? { recovery: r.recovery } : {}),
        }])
      ),
      auth_failures: authFailures,
      message: `${dispatchable.length}/${channelNames.length} channels dispatched.${
        authFailures > 0
          ? ` ${authFailures} auth failure(s).`
          : ''
      }`,
    }

    process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  },
}

export default reviewCommand
```

- [ ] **Step 2: Implement status command**

Create `packages/mmr/src/commands/status.ts`:

```typescript
import type { CommandModule } from 'yargs'
import os from 'node:os'
import path from 'node:path'
import { JobStore } from '../core/job-store.js'

interface StatusArgs {
  'job-id': string
}

const statusCommand: CommandModule<Record<string, unknown>, StatusArgs> = {
  command: 'status <job-id>',
  describe: 'Check progress of a running review job',
  builder: (yargs) => {
    return yargs.positional('job-id', {
      type: 'string',
      demandOption: true,
      description: 'Job ID to check',
    })
  },
  handler: async (argv) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    try {
      const job = store.loadJob(argv['job-id'])
      const output = {
        job_id: job.job_id,
        status: job.status,
        channels: Object.fromEntries(
          Object.entries(job.channels).map(([name, ch]) => [name, {
            status: ch.status,
            elapsed: ch.elapsed ?? 'pending',
            ...(ch.findings_count !== undefined ? { findings_count: ch.findings_count } : {}),
          }])
        ),
      }

      process.stdout.write(JSON.stringify(output, null, 2) + '\n')

      // Exit codes: 0 = all complete, 1 = still running, 2 = at least one failed
      const statuses = Object.values(job.channels).map(c => c.status)
      const terminal = new Set(['completed', 'timeout', 'failed', 'auth_failed', 'skipped'])
      const allDone = statuses.every(s => terminal.has(s))
      const anyFailed = statuses.some(s => s === 'failed' || s === 'auth_failed')

      if (!allDone) process.exit(1)
      else if (anyFailed) process.exit(2)
      else process.exit(0)
    } catch {
      process.stderr.write(`Error: Job ${argv['job-id']} not found\n`)
      process.exit(2)
    }
  },
}

export default statusCommand
```

- [ ] **Step 3: Implement results command**

Create `packages/mmr/src/commands/results.ts`:

```typescript
import type { CommandModule } from 'yargs'
import os from 'node:os'
import path from 'node:path'
import { JobStore } from '../core/job-store.js'
import { parseChannelOutput } from '../core/parser.js'
import { reconcile, evaluateGate } from '../core/reconciler.js'
import { formatJson } from '../formatters/json.js'
import { formatText } from '../formatters/text.js'
import { formatMarkdown } from '../formatters/markdown.js'
import type { Finding, ReconciledResults, ChannelResult, OutputFormat } from '../types.js'

interface ResultsArgs {
  'job-id': string
  format?: string
  raw?: boolean
}

const resultsCommand: CommandModule<Record<string, unknown>, ResultsArgs> = {
  command: 'results <job-id>',
  describe: 'Collect and reconcile review findings',
  builder: (yargs) => {
    return yargs
      .positional('job-id', {
        type: 'string',
        demandOption: true,
        description: 'Job ID to collect results for',
      })
      .option('format', {
        type: 'string',
        choices: ['json', 'text', 'markdown'],
        description: 'Output format',
      })
      .option('raw', {
        type: 'boolean',
        description: 'Show raw per-channel output instead of reconciled',
        default: false,
      })
  },
  handler: async (argv) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    let job
    try {
      job = store.loadJob(argv['job-id'])
    } catch {
      process.stderr.write(`Error: Job ${argv['job-id']} not found\n`)
      process.exit(2)
      return
    }

    // Check if all channels are done
    const terminal = new Set(['completed', 'timeout', 'failed', 'auth_failed', 'skipped'])
    const allDone = Object.values(job.channels).every(c => terminal.has(c.status))
    if (!allDone) {
      process.stderr.write(`Job ${job.job_id} still running. Use 'mmr status ${job.job_id}' to check progress.\n`)
      process.exit(1)
      return
    }

    // Parse each channel's output
    const channelFindings: Record<string, Finding[]> = {}
    const perChannel: Record<string, ChannelResult> = {}

    for (const [name, ch] of Object.entries(job.channels)) {
      if (ch.status === 'skipped' || ch.status === 'auth_failed') {
        perChannel[name] = {
          status: ch.status,
          elapsed: ch.elapsed ?? '0s',
          findings: [],
        }
        continue
      }

      let rawOutput = ''
      try {
        rawOutput = store.loadChannelOutput(job.job_id, name)
      } catch {
        perChannel[name] = {
          status: ch.status,
          elapsed: ch.elapsed ?? '0s',
          findings: [],
          error: 'No output captured',
        }
        continue
      }

      // Determine parser from config or default
      const parsed = parseChannelOutput(rawOutput, 'default')
      channelFindings[name] = parsed.findings
      perChannel[name] = {
        status: ch.status,
        elapsed: ch.elapsed ?? '0s',
        findings: parsed.findings,
        raw_output: argv.raw ? rawOutput : undefined,
      }
    }

    // Reconcile
    const reconciled = reconcile(channelFindings)
    const gatePassed = evaluateGate(reconciled, job.fix_threshold)

    const startTime = new Date(job.created_at).getTime()
    const totalElapsed = formatElapsed(Date.now() - startTime)

    const results: ReconciledResults = {
      job_id: job.job_id,
      gate_passed: gatePassed,
      fix_threshold: job.fix_threshold,
      reconciled_findings: reconciled,
      per_channel: perChannel,
      metadata: {
        channels_dispatched: Object.keys(job.channels).length,
        channels_completed: Object.values(job.channels).filter(c => c.status === 'completed').length,
        channels_partial: Object.values(job.channels).filter(c => c.status === 'timeout').length,
        total_elapsed: totalElapsed,
      },
    }

    // Save results
    store.saveResults(job.job_id, results)

    // Format and output
    const format = (argv.format ?? job.format ?? 'json') as OutputFormat
    let output: string
    switch (format) {
      case 'text':
        output = formatText(results)
        break
      case 'markdown':
        output = formatMarkdown(results)
        break
      default:
        output = formatJson(results)
    }

    process.stdout.write(output + '\n')

    // Exit code: 0 = gate passed, 1 = gate failed
    process.exit(gatePassed ? 0 : 1)
  },
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`
}

export default resultsCommand
```

- [ ] **Step 4: Implement config command**

Create `packages/mmr/src/commands/config.ts`:

```typescript
import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { loadConfig } from '../config/loader.js'
import { BUILTIN_CHANNELS } from '../config/defaults.js'
import type { ChannelConfig } from '../types.js'

const configCommand: CommandModule = {
  command: 'config <action>',
  describe: 'Manage mmr configuration',
  builder: (yargs) => {
    return yargs
      .command('init', 'Create default .mmr.yaml by detecting installed CLIs', {}, async () => {
        const configPath = path.join(process.cwd(), '.mmr.yaml')
        if (fs.existsSync(configPath)) {
          process.stderr.write('.mmr.yaml already exists. Delete it first to reinitialize.\n')
          process.exit(1)
          return
        }

        const channels: Record<string, ChannelConfig> = {}
        const detected: string[] = []

        for (const [name, preset] of Object.entries(BUILTIN_CHANNELS)) {
          const cmd = preset.command.split(/\s+/)[0]
          const installed = await checkInstalled(cmd)
          if (installed) {
            channels[name] = { ...preset }
            detected.push(name)
            process.stderr.write(`  ✓ ${name} (${cmd}) detected\n`)
          } else {
            process.stderr.write(`  ✗ ${name} (${cmd}) not found\n`)
          }
        }

        const config = {
          version: 1,
          defaults: { fix_threshold: 'P2', timeout: 300, format: 'json', parallel: true, job_retention_days: 7 },
          review_criteria: [],
          channels,
        }

        fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: 120 }))
        process.stderr.write(`\nGenerated .mmr.yaml with ${detected.length} enabled channel(s).\n`)
        process.stderr.write('Run `mmr config test` to verify authentication.\n')
      })
      .command('test', 'Verify all configured channels', {}, async () => {
        const config = loadConfig({ projectRoot: process.cwd() })
        let ready = 0
        let failures = 0

        for (const [name, ch] of Object.entries(config.channels)) {
          if (!ch.enabled) {
            process.stderr.write(`  ${name}    disabled\n`)
            continue
          }

          const cmd = ch.command.split(/\s+/)[0]
          const installed = await checkInstalled(cmd)
          if (!installed) {
            process.stderr.write(`  ${name}    ✗ not installed (skipped)\n`)
            continue
          }

          const auth = await checkAuth(ch)
          if (auth.status === 'ok') {
            process.stderr.write(`  ${name}    ✓ installed    ✓ authenticated\n`)
            ready++
          } else {
            process.stderr.write(`  ${name}    ✓ installed    ✗ ${auth.status} → ${auth.recovery}\n`)
            failures++
          }
        }

        const total = Object.keys(config.channels).length
        process.stderr.write(`\n  ${ready}/${total} channels ready.`)
        if (failures > 0) process.stderr.write(` ${failures} auth failure(s).`)
        process.stderr.write('\n')
      })
      .command('channels', 'List configured channels', {}, () => {
        const config = loadConfig({ projectRoot: process.cwd() })
        for (const [name, ch] of Object.entries(config.channels)) {
          process.stdout.write(`${name}: ${ch.enabled ? 'enabled' : 'disabled'} (${ch.command})\n`)
        }
      })
      .demandCommand(1, 'Specify a config action: init, test, channels')
  },
  handler: () => {},
}

export default configCommand
```

- [ ] **Step 5: Implement jobs command**

Create `packages/mmr/src/commands/jobs.ts`:

```typescript
import type { CommandModule } from 'yargs'
import os from 'node:os'
import path from 'node:path'
import { JobStore } from '../core/job-store.js'
import { loadConfig } from '../config/loader.js'

const jobsCommand: CommandModule = {
  command: 'jobs <action>',
  describe: 'Manage review jobs',
  builder: (yargs) => {
    return yargs
      .command('list', 'List recent jobs', {}, () => {
        const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
        const store = new JobStore(jobsDir)
        const jobs = store.listJobs()

        if (jobs.length === 0) {
          process.stdout.write('No jobs found.\n')
          return
        }

        for (const job of jobs) {
          const channelSummary = Object.entries(job.channels)
            .map(([name, ch]) => `${name}:${ch.status}`)
            .join(' ')
          process.stdout.write(`${job.job_id}  ${job.status}  ${job.created_at}  [${channelSummary}]\n`)
        }
      })
      .command('prune', 'Remove old jobs', {}, () => {
        const config = loadConfig({ projectRoot: process.cwd() })
        const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
        const store = new JobStore(jobsDir)
        const pruned = store.pruneJobs(config.defaults.job_retention_days)
        process.stdout.write(`Pruned ${pruned} job(s).\n`)
      })
      .demandCommand(1, 'Specify a jobs action: list, prune')
  },
  handler: () => {},
}

export default jobsCommand
```

- [ ] **Step 6: Wire commands into cli.ts**

Replace `packages/mmr/src/cli.ts`:

```typescript
import yargs from 'yargs'

import reviewCommand from './commands/review.js'
import statusCommand from './commands/status.js'
import resultsCommand from './commands/results.js'
import configCommand from './commands/config.js'
import jobsCommand from './commands/jobs.js'

export async function runCli(argv: string[]): Promise<void> {
  await yargs(argv)
    .scriptName('mmr')
    .usage('$0 <command> [options]')
    .command(reviewCommand)
    .command(statusCommand)
    .command(resultsCommand)
    .command(configCommand)
    .command(jobsCommand)
    .demandCommand(1, 'Run mmr --help for usage')
    .strict()
    .help()
    .argv
}
```

- [ ] **Step 7: Build and verify help output**

```bash
cd packages/mmr && npm run build && node dist/index.js --help
```

Expected: Shows all 5 commands (review, status, results, config, jobs).

- [ ] **Step 8: Verify subcommand help**

```bash
node packages/mmr/dist/index.js review --help
```

Expected: Shows all review options (--diff, --pr, --staged, --focus, etc.)

- [ ] **Step 9: Commit**

```bash
git add packages/mmr/src/commands/ packages/mmr/src/cli.ts
git commit -m "feat(mmr): implement review, status, results, config, and jobs commands"
```

---

## Task 12: Integration Test — Full Review Lifecycle

**Files:**
- Create: `packages/mmr/tests/e2e/review-lifecycle.test.ts`

- [ ] **Step 1: Write end-to-end test with mock channel**

Create `packages/mmr/tests/e2e/review-lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'
import { assemblePrompt } from '../../src/core/prompt.js'
import { parseChannelOutput } from '../../src/core/parser.js'
import { reconcile, evaluateGate } from '../../src/core/reconciler.js'
import { formatText } from '../../src/formatters/text.js'
import type { Finding, ReconciledResults, ChannelResult } from '../../src/types.js'

describe('review lifecycle (unit integration)', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-e2e-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('full lifecycle: create job → save outputs → reconcile → gate', () => {
    // 1. Create job
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude', 'gemini'],
    })
    expect(job.status).toBe('dispatched')

    // 2. Assemble prompt
    const prompt = assemblePrompt({
      diff: '--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n-old\n+new',
      focus: 'correctness',
    })
    store.savePrompt(job.job_id, prompt)
    expect(prompt).toContain('P0 (Critical)')
    expect(prompt).toContain('correctness')

    // 3. Simulate channel outputs
    const claudeOutput = JSON.stringify({
      approved: false,
      findings: [{
        severity: 'P1',
        location: 'f.ts:1',
        description: 'Regression risk',
        suggestion: 'Add test coverage',
      }],
      summary: 'One issue found',
    })
    store.saveChannelOutput(job.job_id, 'claude', claudeOutput)
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      elapsed: '30s',
    })

    const geminiOutput = JSON.stringify({
      approved: false,
      findings: [{
        severity: 'P1',
        location: 'f.ts:1',
        description: 'Breaking change detected',
        suggestion: 'Add backward compat',
      }],
      summary: 'Issue found',
    })
    store.saveChannelOutput(job.job_id, 'gemini', geminiOutput)
    store.updateChannel(job.job_id, 'gemini', {
      status: 'completed',
      elapsed: '45s',
    })

    // 4. Parse outputs
    const claudeParsed = parseChannelOutput(claudeOutput, 'default')
    const geminiParsed = parseChannelOutput(geminiOutput, 'default')

    // 5. Reconcile
    const channelFindings: Record<string, Finding[]> = {
      claude: claudeParsed.findings,
      gemini: geminiParsed.findings,
    }
    const reconciled = reconcile(channelFindings)
    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].agreement).toBe('consensus')
    expect(reconciled[0].confidence).toBe('high')
    expect(reconciled[0].sources).toContain('claude')
    expect(reconciled[0].sources).toContain('gemini')

    // 6. Evaluate gate
    const gatePassed = evaluateGate(reconciled, 'P2')
    expect(gatePassed).toBe(false) // P1 finding blocks P2 gate

    // 7. Format output
    const results: ReconciledResults = {
      job_id: job.job_id,
      gate_passed: gatePassed,
      fix_threshold: 'P2',
      reconciled_findings: reconciled,
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: claudeParsed.findings },
        gemini: { status: 'completed', elapsed: '45s', findings: geminiParsed.findings },
      },
      metadata: {
        channels_dispatched: 2,
        channels_completed: 2,
        channels_partial: 0,
        total_elapsed: '45s',
      },
    }
    const text = formatText(results)
    expect(text).toContain('FAILED')
    expect(text).toContain('P1')
  })

  it('gate passes when all channels approve', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [],
      gemini: [],
    }
    const reconciled = reconcile(channelFindings)
    expect(evaluateGate(reconciled, 'P2')).toBe(true)
  })

  it('gate passes when only P3 findings exist with P2 threshold', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P3', location: 'f.ts:5', description: 'nit', suggestion: 'optional' }],
    }
    const reconciled = reconcile(channelFindings)
    expect(evaluateGate(reconciled, 'P2')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd packages/mmr && npx vitest run tests/e2e/review-lifecycle.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd packages/mmr && npx vitest run
```

Expected: all tests across all files PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/mmr/tests/e2e/
git commit -m "test(mmr): end-to-end review lifecycle integration test"
```

---

## Task 13: Makefile Integration

**Files:**
- Modify: `Makefile` (root)

- [ ] **Step 1: Add mmr targets to Makefile**

Add these targets to the root `Makefile`:

```makefile
## mmr package
mmr-build:
	cd packages/mmr && npm run build

mmr-test:
	cd packages/mmr && npm test

mmr-check:
	cd packages/mmr && npm run check

check-all: check ts-check mmr-check
```

Note: update the existing `check-all` target to include `mmr-check`.

- [ ] **Step 2: Verify mmr-test target works**

```bash
make mmr-test
```

Expected: all mmr tests pass.

- [ ] **Step 3: Verify mmr-build target works**

```bash
make mmr-build
```

Expected: TypeScript compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "build: add mmr package targets to Makefile"
```

---

## Task 14: Core Prompt Template Refinement

**Files:**
- Modify: `packages/mmr/templates/core-prompt.md`

- [ ] **Step 1: Write test for prompt template content**

Add to `packages/mmr/tests/core/prompt.test.ts`:

```typescript
it('core prompt includes instruction to not add preamble', () => {
  const prompt = assemblePrompt({ diff: 'test' })
  expect(prompt).toContain('Do NOT include markdown fences')
})

it('core prompt includes all review criteria categories', () => {
  const prompt = assemblePrompt({ diff: 'test' })
  expect(prompt).toContain('Correctness')
  expect(prompt).toContain('Regressions')
  expect(prompt).toContain('Edge cases')
  expect(prompt).toContain('Test coverage')
  expect(prompt).toContain('Security')
})
```

- [ ] **Step 2: Run to verify tests pass (they should with current template)**

```bash
cd packages/mmr && npx vitest run tests/core/prompt.test.ts
```

Expected: all tests PASS (template already includes this content).

- [ ] **Step 3: Commit**

```bash
git add packages/mmr/tests/core/prompt.test.ts
git commit -m "test(mmr): add core prompt template content assertions"
```

---

## Task 15: Platform Wrapper — Scaffold Skill

**Files:**
- Create: `content/skills/mmr/SKILL.md`

- [ ] **Step 1: Create the mmr skill template**

Create `content/skills/mmr/SKILL.md`:

```markdown
---
name: mmr
description: Multi-model code review — dispatch, poll, and collect results from multiple AI model CLIs
topics:
  - code review
  - multi-model review
  - review gate
  - mmr
---

# mmr — Multi-Model Review

Dispatch code reviews to multiple AI model CLIs, poll for results, and collect reconciled findings with severity gating.

## Quick Reference

```bash
# Dispatch a review for a PR
mmr review --pr <number> --focus "description of what to focus on"

# Check progress
mmr status <job-id>

# Collect reconciled results
mmr results <job-id>

# Pre-flight: verify all channels are authenticated
mmr config test
```

## After Creating a PR

1. Run `mmr review --pr <number>`
2. Note the job ID from the output
3. Continue working on other tasks
4. Periodically run `mmr status <job-id>` until all channels complete
5. Run `mmr results <job-id>` to get reconciled findings
6. If gate failed: fix findings at or above the threshold severity
7. If gate passed: proceed to merge

## Auth Failures

If `mmr review` reports auth failures, follow the recovery instructions in the output:
- **Claude:** `claude login`
- **Gemini:** `gemini -p 'hello'` (interactive, opens browser)
- **Codex:** `codex login`

Re-run `mmr config test` after re-authenticating to verify.

## Severity Gate

Default threshold is P2 (fix P0/P1/P2, skip P3). Override per-review:

```bash
mmr review --pr 47 --fix-threshold P1   # Only fix P0 and P1
mmr review --pr 47 --fix-threshold P0   # Only fix critical issues
```

## Output Formats

```bash
mmr results <job-id>                    # JSON (default)
mmr results <job-id> --format text      # Human-readable terminal output
mmr results <job-id> --format markdown  # For PR comments
```
```

- [ ] **Step 2: Run scaffold build to generate the skill**

```bash
scaffold build
```

- [ ] **Step 3: Commit**

```bash
git add content/skills/mmr/
git commit -m "feat(mmr): add scaffold skill template for mmr integration"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Monorepo workspace setup | package.json, tsconfig, entry point |
| 2 | Types & config schema | types.ts, schema.ts (zod) |
| 3 | Config loader | loader.ts, defaults.ts, merge order |
| 4 | Job store | job-store.ts (CRUD, prune) |
| 5 | Auth verification | auth.ts (install check, auth check, timeout) |
| 6 | Prompt assembly | prompt.ts, core-prompt.md (4-layer engine) |
| 7 | Output parsers | parser.ts (default, gemini) |
| 8 | Reconciliation engine | reconciler.ts (consensus rules, gate) |
| 9 | Channel dispatcher | dispatcher.ts (spawn, timeout, PID) |
| 10 | Formatters | json.ts, text.ts, markdown.ts |
| 11 | CLI commands | review, status, results, config, jobs |
| 12 | Integration test | Full lifecycle e2e test |
| 13 | Makefile integration | mmr-build, mmr-test, mmr-check targets |
| 14 | Prompt template refinement | Template content assertions |
| 15 | Scaffold skill | content/skills/mmr/SKILL.md |
