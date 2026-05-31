# MCP Server Project Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "MCP Server" as a first-class scaffold project type (selectable, detectable, with tailored pipeline knowledge), mirroring the `research` project type added in commit `506a01f4`.

**Architecture:** Scaffold has one source-of-truth enum (`ProjectTypeSchema`) plus a fan-out of per-type registration points (config schema, coupling validator, detector, CLI flag family, wizard copy/questions, `adopt` maps). Prompt tailoring is done via a `content/methodology/<type>-overlay.yml` overlay (static step-enablement + knowledge injection), **not** frontmatter. This plan adds all registration points, a thin overlay (PR1), then a knowledge directory + one new pipeline step (PR2).

**Tech Stack:** TypeScript (Zod schemas, yargs CLI), Vitest (unit/e2e), bats (content evals), YAML (methodology overlays/presets), Markdown (knowledge entries + meta-prompts).

**Source spec:** `docs/architecture/mcp-server-project-type-research.md` (merged in #451). Decisions: rich 6-field config; no domains in v1; `database-schema = if-needed`; scope = thin overlay + 1 new step; conservative detection.

**Reference precedent:** the `research` type. When this plan says "mirror research," the verbatim research code is reproduced inline — you do not need to go read it, but `git show 506a01f4` is the canonical diff if in doubt.

**Verification note:** all `path:line` citations were captured at commit `ce4c2da1` (now merged to `main`). Line numbers drift as code lands above them — treat `:NN` as hints and re-locate with `grep -n` before editing.

---

## File Structure

**PR1 — registration (working, selectable type):**
- Modify `src/config/schema.ts` — enum value + `McpServerConfigSchema` + add `mcpServerConfig?` to `ServiceSchema` and `ProjectSchema`.
- Modify `src/types/config.ts` — export `McpServerConfig`; add to `ServiceConfig`, `ProjectConfig`, `DetectedConfig`.
- Create `src/config/validators/mcp-server.ts`; modify `src/config/validators/index.ts`.
- Modify `src/project/detectors/types.ts` — `McpServerMatch` + union.
- Create `src/project/detectors/mcp-server.ts`; modify `src/project/detectors/index.ts` and `disambiguate.ts`.
- Modify `src/project/adopt.ts` — `TYPE_KEY` + `schemaForType`.
- Create `src/wizard/copy/mcp-server.ts`; modify `src/wizard/copy/{index,types,core}.ts`.
- Modify `src/wizard/flags.ts` — `McpServerFlags`.
- Modify `src/cli/init-flag-families.ts` — `MCP_SERVER_FLAGS` + 3 sites.
- Modify `src/wizard/questions.ts` — `WizardAnswers` field + inline collection block.
- Modify `src/wizard/wizard.ts` — `WizardOptions` field + destructure + spread.
- Modify `src/cli/commands/init.ts` and `src/cli/commands/adopt.ts` — yargs options + parsing.
- Create `content/methodology/mcp-server-overlay.yml` (thin).
- Modify `README.md`.
- Tests: `src/config/schema.test.ts`, `src/config/validators/mcp-server.test.ts`, `src/project/detectors/mcp-server.test.ts`, `src/cli/init-flag-families.test.ts`, `src/wizard/questions.test.ts`.

**PR2 — MCP depth:**
- Create `content/pipeline/specification/mcp-tool-resource-contract.md`.
- Modify `content/methodology/{deep,mvp,custom-defaults}.yml` (declare step `enabled: false`).
- Expand `content/methodology/mcp-server-overlay.yml` (enable step + knowledge injection).
- Create `content/knowledge/mcp-server/*.md` (12 entries).
- Tests: extend `src/e2e/project-type-overlays.test.ts`; create `tests/evals/mcp-server-overlay-content.bats`.
- Modify `README.md`, `CHANGELOG.md`.

**The chosen config shape (referenced throughout):**
```typescript
McpServerConfigSchema = z.object({
  language:   z.enum(['typescript', 'python']),                              // REQUIRED (no default) — the auto-mode gate flag
  transport:  z.enum(['stdio', 'streamable-http', 'sse']).default('stdio'),  // sse = legacy HTTP+SSE, deprecated
  primitives: z.array(z.enum(['tools', 'resources', 'prompts'])).min(1).default(['tools']),
  auth:       z.enum(['none', 'oauth', 'apikey']).default('none'),
  deployment: z.enum(['local', 'hosted']).default('local'),
  stateful:   z.boolean().default(false),
}).strict()
```
Cross-field rule (in the validator): `auth !== 'none'` requires `transport !== 'stdio'` (network auth is meaningless for a local stdio subprocess).

---

# PART A — PR1: Type registration + thin overlay

> Goal of PR1: a working, selectable, detectable `mcp-server` type with the packaging gate green. No knowledge injection or new pipeline step yet (that's PR2).

## Task A1: Config schema — enum + McpServerConfigSchema + wiring

**Files:**
- Test: `src/config/schema.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/types/config.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/config/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema, McpServerConfigSchema, ProjectSchema } from './schema.js'

describe('McpServerConfigSchema', () => {
  it("'mcp-server' is a member of ProjectTypeSchema", () => {
    expect(ProjectTypeSchema.options).toContain('mcp-server')
  })

  it('accepts a valid full config', () => {
    const r = McpServerConfigSchema.safeParse({
      language: 'typescript', transport: 'stdio', primitives: ['tools'],
      auth: 'none', deployment: 'local', stateful: false,
    })
    expect(r.success).toBe(true)
  })

  it('applies defaults; language is required', () => {
    const r = McpServerConfigSchema.safeParse({ language: 'python' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.transport).toBe('stdio')
      expect(r.data.primitives).toEqual(['tools'])
      expect(r.data.auth).toBe('none')
      expect(r.data.deployment).toBe('local')
      expect(r.data.stateful).toBe(false)
    }
    expect(McpServerConfigSchema.safeParse({}).success).toBe(false) // missing language
  })

  it('rejects unknown keys (.strict) and an empty primitives array', () => {
    expect(McpServerConfigSchema.safeParse({ language: 'python', bogus: 1 }).success).toBe(false)
    expect(McpServerConfigSchema.safeParse({ language: 'python', primitives: [] }).success).toBe(false)
  })

  it('couples mcpServerConfig to projectType at the project level', () => {
    // mcpServerConfig present without matching projectType → invalid
    const bad = ProjectSchema.safeParse({
      projectType: 'cli', mcpServerConfig: { language: 'python' },
    })
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/schema.test.ts -t McpServerConfigSchema`
Expected: FAIL — `McpServerConfigSchema` is not exported / `'mcp-server'` not in enum.

- [ ] **Step 3: Add the enum value**

In `src/config/schema.ts`, change `ProjectTypeSchema` (currently ~line 18):

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science', 'web3', 'mcp-server',
])
```

- [ ] **Step 4: Define `McpServerConfigSchema`**

In `src/config/schema.ts`, add near the other per-type schemas (e.g. after `Web3ConfigSchema`). Do **not** use `domainField(...)` — there are no domains:

```typescript
export const McpServerConfigSchema = z.object({
  language: z.enum(['typescript', 'python']),
  transport: z.enum(['stdio', 'streamable-http', 'sse']).default('stdio'),
  primitives: z.array(z.enum(['tools', 'resources', 'prompts'])).min(1).default(['tools']),
  auth: z.enum(['none', 'oauth', 'apikey']).default('none'),
  deployment: z.enum(['local', 'hosted']).default('local'),
  stateful: z.boolean().default(false),
}).strict()
```

- [ ] **Step 5: Wire into ServiceSchema and ProjectSchema**

In `src/config/schema.ts`, add this line to BOTH the `ServiceSchema` object literal (near `web3Config: Web3ConfigSchema.optional(),`) and the `ProjectSchema` object literal (same place):

```typescript
  mcpServerConfig: McpServerConfigSchema.optional(),
```

No `superRefine` edits are needed — both schemas iterate `ALL_COUPLING_VALIDATORS`, and `ServiceSchema`'s forward rule uses `configKeyFor(projectType)` from the registry. Both pick up `mcp-server` automatically once Task A3 registers the validator.

- [ ] **Step 6: Export the type and extend the config interfaces**

In `src/types/config.ts`, add the type export (near `ResearchConfig`):

```typescript
/** MCP Server project configuration — derived from Zod schema (single source of truth). */
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>
```

Ensure `McpServerConfigSchema` is in the import from `../config/schema.js` at the top of the file (add it to the existing import list).

Then add `mcpServerConfig?: McpServerConfig` to the `ServiceConfig` interface and the `ProjectConfig` interface (next to `web3Config?`), and add this arm to the `DetectedConfig` union:

```typescript
  | { type: 'mcp-server'; config: McpServerConfig }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/config/schema.test.ts -t McpServerConfigSchema`
Expected: the first 4 tests PASS. The coupling test ("couples mcpServerConfig…") still FAILS until Task A3 — that's expected; leave it.

- [ ] **Step 8: Commit**

```bash
git add src/config/schema.ts src/types/config.ts src/config/schema.test.ts
git commit -m "feat(mcp-server): add project type enum + config schema"
```

## Task A2: Coupling validator

**Files:**
- Test: `src/config/validators/mcp-server.test.ts`
- Create: `src/config/validators/mcp-server.ts`
- Modify: `src/config/validators/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/config/validators/mcp-server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { mcpServerCouplingValidator } from './mcp-server.js'
import type { McpServerConfig } from '../../types/config.js'

function runValidate(projectType: any, config: Partial<McpServerConfig> | undefined) {
  const issues: { path: (string | number)[]; message: string }[] = []
  const ctx = {
    addIssue: (i: any) => issues.push({ path: i.path, message: i.message }),
  } as unknown as z.RefinementCtx
  mcpServerCouplingValidator.validate(ctx, [], projectType, config as McpServerConfig | undefined)
  return issues
}

describe('mcpServerCouplingValidator', () => {
  it('rejects mcpServerConfig without projectType mcp-server', () => {
    const issues = runValidate('cli', { language: 'python' })
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/requires projectType: mcp-server/)
  })

  it('accepts mcpServerConfig with matching projectType', () => {
    expect(runValidate('mcp-server', { language: 'python' })).toHaveLength(0)
  })

  it('rejects auth other than none on stdio transport', () => {
    const issues = runValidate('mcp-server', { language: 'python', transport: 'stdio', auth: 'oauth' })
    expect(issues.some(i => /stdio.*auth|auth.*stdio/i.test(i.message))).toBe(true)
  })

  it('allows oauth on a non-stdio transport', () => {
    expect(runValidate('mcp-server', {
      language: 'typescript', transport: 'streamable-http', auth: 'oauth',
    })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/validators/mcp-server.test.ts`
Expected: FAIL — `./mcp-server.js` does not exist.

- [ ] **Step 3: Create the validator**

Create `src/config/validators/mcp-server.ts` (mirrors `research.ts`):

```typescript
import type { CouplingValidator } from './types.js'
import type { McpServerConfig } from '../../types/config.js'

export const mcpServerCouplingValidator: CouplingValidator<McpServerConfig> = {
  configKey: 'mcpServerConfig',
  projectType: 'mcp-server',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'mcp-server') {
      ctx.addIssue({
        path: [...path, 'mcpServerConfig'],
        code: 'custom',
        message: 'mcpServerConfig requires projectType: mcp-server',
      })
    }
    if (config) {
      const { transport, auth } = config
      if (auth !== undefined && auth !== 'none' && transport === 'stdio') {
        ctx.addIssue({
          path: [...path, 'mcpServerConfig', 'auth'],
          code: 'custom',
          message: 'stdio transport cannot use network auth (set auth: none or use a non-stdio transport)',
        })
      }
    }
  },
}
```

- [ ] **Step 4: Register the validator**

In `src/config/validators/index.ts`: add the import (next to the research import) and the array entry (next to the research entry):

```typescript
import { mcpServerCouplingValidator } from './mcp-server.js'
```
```typescript
  mcpServerCouplingValidator as CouplingValidator<unknown>,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config/validators/mcp-server.test.ts src/config/schema.test.ts`
Expected: PASS — including the previously-failing coupling test in `schema.test.ts` (the registry now covers `mcp-server`).

- [ ] **Step 6: Commit**

```bash
git add src/config/validators/mcp-server.ts src/config/validators/index.ts src/config/validators/mcp-server.test.ts
git commit -m "feat(mcp-server): add coupling validator + cross-field auth rule"
```

## Task A3: Detector type variant

**Files:**
- Modify: `src/project/detectors/types.ts`

- [ ] **Step 1: Add the match interface and union arm**

In `src/project/detectors/types.ts`: add `McpServerConfigSchema` to the existing `import type { ... } from '../../config/schema.js'` list, add the interface (next to `ResearchMatch`), and add it to the `DetectionMatch` union:

```typescript
export interface McpServerMatch extends BaseMatch {
  readonly projectType: 'mcp-server'
  readonly partialConfig: Partial<z.infer<typeof McpServerConfigSchema>>
}
```
```typescript
export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | ResearchMatch | BrowserExtensionMatch | GameMatch
  | DataScienceMatch | Web3Match | McpServerMatch
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no detector implementation yet, but the type is valid). It's fine for `adopt.ts`'s `schemaForType` to still be missing the case — that's Task A5; tsc will flag `assertNever` exhaustiveness there. If tsc errors *only* in `adopt.ts`/`detectors/index.ts` exhaustiveness, proceed; those are fixed in A4/A5.

- [ ] **Step 3: Commit**

```bash
git add src/project/detectors/types.ts
git commit -m "feat(mcp-server): add McpServerMatch detection type"
```

## Task A4: Detector implementation

**Files:**
- Test: `src/project/detectors/mcp-server.test.ts`
- Create: `src/project/detectors/mcp-server.ts`
- Modify: `src/project/detectors/index.ts`, `src/project/detectors/disambiguate.ts`

**Detection logic (conservative, per spec §7.6):** a dependency alone (`@modelcontextprotocol/sdk` for TS, `mcp`/`fastmcp` for Python) is **medium**; a dependency **plus** an entrypoint that registers MCP primitives is **high**. `SignalContext.hasAnyDep(names, 'npm' | 'py')` checks deps; `ManifestKind` is `'npm' | 'py' | 'cargo' | 'go'`.

- [ ] **Step 1: Write the failing test**

Create `src/project/detectors/mcp-server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectMcpServer } from './mcp-server.js'

describe('detectMcpServer', () => {
  it('high: TS SDK dep + entrypoint registering a tool', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 's', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
      files: {
        'src/index.ts': 'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"\n'
          + 'const server = new McpServer({ name: "s", version: "1" })\n'
          + 'server.registerTool("greet", {}, async () => ({ content: [] }))\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('mcp-server')
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('typescript')
    expect(m!.partialConfig.primitives).toContain('tools')
  })

  it('high: Python fastmcp dep + FastMCP entrypoint', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 's', dependencies: ['fastmcp'] } },
      files: { 'server.py': 'from fastmcp import FastMCP\nmcp = FastMCP("s")\n@mcp.tool\ndef greet(): ...\n' },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('python')
  })

  it('medium: SDK dep present but no registration entrypoint (could be a client)', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'c', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.language).toBe('typescript')
  })

  it('infers streamable-http transport from entrypoint text', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 's', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
      files: {
        'src/server.ts': 'import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"\n'
          + 'const server = new McpServer({})\nserver.registerTool("x", {}, async () => ({content:[]}))\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m!.partialConfig.transport).toBe('streamable-http')
  })

  it('null: no MCP deps and no markers', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x', dependencies: { express: '^4' } },
    })
    expect(detectMcpServer(ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/project/detectors/mcp-server.test.ts`
Expected: FAIL — `./mcp-server.js` not found.

- [ ] **Step 3: Implement the detector**

Create `src/project/detectors/mcp-server.ts`:

```typescript
import type { SignalContext } from './context.js'
import type { McpServerMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const TS_SDK_DEPS = ['@modelcontextprotocol/sdk'] as const
const PY_MCP_DEPS = ['mcp', 'fastmcp'] as const

// Entry files we probe for primitive-registration markers.
const TS_ENTRYPOINTS = ['src/index.ts', 'src/server.ts', 'index.ts', 'server.ts', 'src/mcp.ts'] as const
const PY_ENTRYPOINTS = ['server.py', 'main.py', 'src/server.py', 'app.py', 'mcp_server.py'] as const

// Registration markers (TS SDK + Python FastMCP / low-level Server).
const TS_REGISTER = /McpServer\s*\(|new Server\s*\(|\.registerTool\s*\(|\.registerResource\s*\(|\.registerPrompt\s*\(|setRequestHandler\s*\(/
const PY_REGISTER = /FastMCP\s*\(|@mcp\.tool|@mcp\.resource|@mcp\.prompt|@server\.call_tool|@server\.list_tools/

type Transport = NonNullable<McpServerMatch['partialConfig']['transport']>
type Primitive = 'tools' | 'resources' | 'prompts'

function inferTransport(text: string): Transport | undefined {
  if (/StreamableHTTP|streamableHttp|streamable_http/.test(text)) return 'streamable-http'
  if (/SSEServerTransport|sse/i.test(text)) return 'sse'
  if (/StdioServerTransport|stdio/i.test(text)) return 'stdio'
  return undefined
}

function inferPrimitives(text: string): Primitive[] {
  const p: Primitive[] = []
  if (/registerTool|@mcp\.tool|list_tools|call_tool|\.tool\s*\(/.test(text)) p.push('tools')
  if (/registerResource|@mcp\.resource|list_resources|read_resource/.test(text)) p.push('resources')
  if (/registerPrompt|@mcp\.prompt|list_prompts|get_prompt/.test(text)) p.push('prompts')
  return p
}

export function detectMcpServer(ctx: SignalContext): McpServerMatch | null {
  const ev: DetectionEvidence[] = []

  const hasTsDep = ctx.hasAnyDep([...TS_SDK_DEPS], 'npm')
  const hasPyDep = ctx.hasAnyDep([...PY_MCP_DEPS], 'py')
  if (!hasTsDep && !hasPyDep) return null

  const language: 'typescript' | 'python' = hasTsDep ? 'typescript' : 'python'
  ev.push(evidence('mcp-sdk-dep', undefined, language === 'typescript' ? '@modelcontextprotocol/sdk' : 'mcp/fastmcp'))

  const entrypoints = language === 'typescript' ? TS_ENTRYPOINTS : PY_ENTRYPOINTS
  const marker = language === 'typescript' ? TS_REGISTER : PY_REGISTER

  let registeredText: string | undefined
  let registeredFile: string | undefined
  for (const f of entrypoints) {
    if (!ctx.hasFile(f)) continue
    const text = ctx.readFileText(f, 8192) ?? ''
    if (marker.test(text)) { registeredText = text; registeredFile = f; break }
  }

  const partialConfig: McpServerMatch['partialConfig'] = { language }
  let confidence: McpServerMatch['confidence']

  if (registeredText && registeredFile) {
    confidence = 'high'
    ev.push(evidence('mcp-registration', registeredFile, 'registers MCP primitives'))
    const transport = inferTransport(registeredText)
    if (transport) partialConfig.transport = transport
    const primitives = inferPrimitives(registeredText)
    if (primitives.length > 0) partialConfig.primitives = primitives
  } else {
    // Dep present but no confirmed server entrypoint — could be a client/consumer.
    confidence = 'medium'
  }

  return { projectType: 'mcp-server', confidence, partialConfig, evidence: ev }
}
```

- [ ] **Step 4: Register the detector**

In `src/project/detectors/index.ts`: add the import and place it in `ALL_DETECTORS` in Tier 2 (dep-heavy), next to `detectResearch`:

```typescript
import { detectMcpServer } from './mcp-server.js'
```
```typescript
  // Tier 2: dep-heavy detectors
  detectWebApp, detectBackend, detectMl, detectResearch, detectMcpServer, detectCli,
```

- [ ] **Step 5: Add to disambiguation preference**

In `src/project/detectors/disambiguate.ts`, add `'mcp-server'` to `PROJECT_TYPE_PREFERENCE` (after `'backend'` — a server-like type, ranked above generic catch-alls):

```typescript
export const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'mcp-server', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'research', 'data-science',
  'browser-extension', 'game', 'web3',
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/project/detectors/mcp-server.test.ts`
Expected: PASS (all 5).

> If `createFakeSignalContext` rejects the `packageJson` option key, grep an existing npm-based detector test (e.g. `src/project/detectors/web-app.test.ts` or `cli.test.ts`) for the exact fixture key it uses and match it.

- [ ] **Step 7: Commit**

```bash
git add src/project/detectors/mcp-server.ts src/project/detectors/index.ts src/project/detectors/disambiguate.ts src/project/detectors/mcp-server.test.ts
git commit -m "feat(mcp-server): add conservative detector (dep=medium, dep+registration=high)"
```

## Task A5: adopt.ts exhaustive maps

**Files:**
- Modify: `src/project/adopt.ts`

- [ ] **Step 1: Add the TYPE_KEY entry and schemaForType case**

In `src/project/adopt.ts`: add `McpServerConfigSchema` to the existing import from `../config/schema.js`; add to `TYPE_KEY`:

```typescript
  'mcp-server':        'mcpServerConfig',
```
and add the `schemaForType` case (before `default:`):

```typescript
  case 'mcp-server':        return McpServerConfigSchema
```

- [ ] **Step 2: Verify exhaustiveness compiles**

Run: `npx tsc --noEmit`
Expected: PASS — the `assertNever(type as never)` default no longer errors, because all `ProjectType` arms are covered.

- [ ] **Step 3: Commit**

```bash
git add src/project/adopt.ts
git commit -m "feat(mcp-server): add adopt TYPE_KEY + schemaForType arms"
```

## Task A6: Wizard copy

**Files:**
- Create: `src/wizard/copy/mcp-server.ts`
- Modify: `src/wizard/copy/types.ts`, `src/wizard/copy/index.ts`, `src/wizard/copy/core.ts`

- [ ] **Step 1: Add the copy type**

In `src/wizard/copy/types.ts`: add `McpServerConfig` to the import from `../../types/index.js`; add the type alias (next to `ResearchCopy`); and add the entry to `ProjectCopyMap`:

```typescript
export type McpServerCopy = { [K in keyof McpServerConfig]: QuestionCopy<McpServerConfig[K]> }
```
```typescript
  'mcp-server':        McpServerCopy
```

- [ ] **Step 2: Create the copy file**

Create `src/wizard/copy/mcp-server.ts`:

```typescript
import type { McpServerCopy } from './types.js'

export const mcpServerCopy: McpServerCopy = {
  language: {
    options: {
      'typescript': { label: 'TypeScript', short: 'Official @modelcontextprotocol/sdk.' },
      'python':     { label: 'Python',     short: 'Official MCP SDK / FastMCP.' },
    },
  },
  transport: {
    options: {
      'stdio':           { label: 'stdio',           short: 'Local subprocess over stdin/stdout (e.g. Claude Desktop).' },
      'streamable-http': { label: 'Streamable HTTP', short: 'Remote HTTP endpoint (current spec transport).' },
      'sse':             { label: 'SSE (legacy)',    short: 'Deprecated HTTP+SSE — prefer streamable-http.' },
    },
  },
  primitives: {
    options: {
      'tools':     { label: 'Tools',     short: 'Callable actions the model can invoke.' },
      'resources': { label: 'Resources', short: 'Readable data the model can fetch.' },
      'prompts':   { label: 'Prompts',   short: 'Reusable prompt templates.' },
    },
  },
  auth: {
    options: {
      'none':   { label: 'None',          short: 'No auth (typical for local stdio).' },
      'oauth':  { label: 'OAuth 2.1',     short: 'MCP authorization spec for remote servers.' },
      'apikey': { label: 'API key',       short: 'Static key/header auth.' },
    },
  },
  deployment: {
    options: {
      'local':  { label: 'Local',  short: 'Runs on the user machine as a subprocess.' },
      'hosted': { label: 'Hosted', short: 'Deployed as a remote service.' },
    },
  },
  stateful: {},
}
```

- [ ] **Step 3: Register the copy**

In `src/wizard/copy/index.ts`: add the import and the `PROJECT_COPY` entry:

```typescript
import { mcpServerCopy } from './mcp-server.js'
```
```typescript
  'mcp-server': mcpServerCopy,
```

- [ ] **Step 4: Add the project-type option label**

In `src/wizard/copy/core.ts`, inside `coreCopy.projectType.options`, add (next to `web3`):

```typescript
      'mcp-server': {
        label: 'MCP server',
        short: 'Model Context Protocol server exposing tools/resources/prompts to AI clients.',
      },
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/wizard/copy/mcp-server.ts src/wizard/copy/types.ts src/wizard/copy/index.ts src/wizard/copy/core.ts
git commit -m "feat(mcp-server): add wizard copy + project-type label"
```

## Task A7: CLI flags type

**Files:**
- Modify: `src/wizard/flags.ts`

- [ ] **Step 1: Add the flags interface**

In `src/wizard/flags.ts`: add `McpServerConfig` to the import from `../types/index.js`, and add:

```typescript
export interface McpServerFlags {
  mcpLanguage?: McpServerConfig['language']
  mcpTransport?: McpServerConfig['transport']
  mcpPrimitives?: McpServerConfig['primitives']
  mcpAuth?: McpServerConfig['auth']
  mcpDeployment?: McpServerConfig['deployment']
  mcpStateful?: McpServerConfig['stateful']
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/wizard/flags.ts
git commit -m "feat(mcp-server): add McpServerFlags type"
```

## Task A8: Flag family wiring

**Files:**
- Test: `src/cli/init-flag-families.test.ts`
- Modify: `src/cli/init-flag-families.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/cli/init-flag-families.test.ts` (mirror the research cases already there):

```typescript
import { describe, it, expect } from 'vitest'
import { buildFlagOverrides, applyFlagFamilyValidation, MCP_SERVER_FLAGS } from './init-flag-families.js'

describe('mcp-server flag family', () => {
  it('buildFlagOverrides maps --mcp-* to McpServerConfig partial', () => {
    const out = buildFlagOverrides({
      'mcp-language': 'python', 'mcp-transport': 'streamable-http', 'mcp-auth': 'oauth',
    })
    expect(out).toEqual({
      type: 'mcp-server',
      partial: { language: 'python', transport: 'streamable-http', auth: 'oauth' },
    })
  })

  it('rejects mixing --mcp-* with another family', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'python', 'web-rendering': 'spa' }))
      .toThrow(/multiple project types/)
  })

  it('rejects --mcp-* with a conflicting --project-type', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'python', 'project-type': 'cli' }))
      .toThrow(/--project-type mcp-server/)
  })

  it('MCP_SERVER_FLAGS preserves its literal members', () => {
    const f: typeof MCP_SERVER_FLAGS[number] = 'mcp-language'
    expect(MCP_SERVER_FLAGS).toContain(f)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/init-flag-families.test.ts -t mcp-server`
Expected: FAIL — `MCP_SERVER_FLAGS` not exported.

- [ ] **Step 3: Add the flag constant**

In `src/cli/init-flag-families.ts` (next to `RESEARCH_FLAGS`):

```typescript
export const MCP_SERVER_FLAGS = [
  'mcp-language', 'mcp-transport', 'mcp-primitives', 'mcp-auth', 'mcp-deployment', 'mcp-stateful',
] as const
```

- [ ] **Step 4: Add to family detection**

In `detectFamily`, add the return-type union member `| 'mcp-server'` to the signature, and add the branch (before `return undefined`):

```typescript
  if (MCP_SERVER_FLAGS.some((f) => argv[f] !== undefined)) return 'mcp-server'
```

- [ ] **Step 5: Add to validation**

In `applyFlagFamilyValidation`, add the presence flag, include it in `typeCount`, add it to the error-message family list, and add the project-type guard:

```typescript
  const hasMcpServerFlag = MCP_SERVER_FLAGS.some((f) => argv[f] !== undefined)
```
Add `hasMcpServerFlag,` to the `typeCount` array. Then:
```typescript
  if (hasMcpServerFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'mcp-server') {
    throw new Error('--mcp-* flags require --project-type mcp-server')
  }
  if (argv['mcp-transport'] === 'stdio' && argv['mcp-auth'] !== undefined && argv['mcp-auth'] !== 'none') {
    throw new Error('stdio transport cannot use network auth (set --mcp-auth none or use a non-stdio transport)')
  }
```

- [ ] **Step 6: Add to buildFlagOverrides**

In `buildFlagOverrides`'s `switch (family)`, add (before `default:`):

```typescript
  case 'mcp-server': {
    const partial: Partial<McpServerConfig> = {}
    if (argv['mcp-language'] !== undefined) partial.language = argv['mcp-language'] as McpServerConfig['language']
    if (argv['mcp-transport'] !== undefined) partial.transport = argv['mcp-transport'] as McpServerConfig['transport']
    if (argv['mcp-primitives'] !== undefined) partial.primitives = argv['mcp-primitives'] as McpServerConfig['primitives']
    if (argv['mcp-auth'] !== undefined) partial.auth = argv['mcp-auth'] as McpServerConfig['auth']
    if (argv['mcp-deployment'] !== undefined) partial.deployment = argv['mcp-deployment'] as McpServerConfig['deployment']
    if (argv['mcp-stateful'] !== undefined) partial.stateful = argv['mcp-stateful'] as boolean
    return { type: 'mcp-server', partial }
  }
```
Add `McpServerConfig` to the type imports at the top of the file (from `../types/index.js`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/cli/init-flag-families.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/init-flag-families.test.ts
git commit -m "feat(mcp-server): wire --mcp-* flag family"
```

## Task A9: Wizard questions + options wiring

**Files:**
- Test: `src/wizard/questions.test.ts`
- Modify: `src/wizard/questions.ts`, `src/wizard/wizard.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/wizard/questions.test.ts` (mirror the research wizard tests at the bottom of the file; reuse that file's existing harness/mock-output helpers):

```typescript
describe('mcp-server wizard (auto mode)', () => {
  it('throws when --mcp-language missing in auto mode', async () => {
    await expect(askWizardQuestions({
      output: createMockOutput(), auto: true, projectType: 'mcp-server',
      // ...other required WizardOptions fields per the existing research test...
    } as any)).rejects.toThrow(/--mcp-language is required/)
  })

  it('produces mcpServerConfig from flags with defaults', async () => {
    const answers = await askWizardQuestions({
      output: createMockOutput(), auto: true, projectType: 'mcp-server',
      mcpServerFlags: { mcpLanguage: 'python' },
      // ...other required WizardOptions fields...
    } as any)
    expect(answers.mcpServerConfig).toEqual({
      language: 'python', transport: 'stdio', primitives: ['tools'],
      auth: 'none', deployment: 'local', stateful: false,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wizard/questions.test.ts -t mcp-server`
Expected: FAIL — no mcp-server branch / `mcpServerConfig` undefined.

- [ ] **Step 3: Extend WizardAnswers and imports**

In `src/wizard/questions.ts`: add `McpServerConfig` to the `../types/index.js` import and `McpServerFlags` to the `./flags.js` import; add to `WizardAnswers`:

```typescript
  mcpServerConfig?: McpServerConfig
```

- [ ] **Step 4: Add the collection block**

In `askWizardQuestions` (after the `research` block, mirroring its structure):

```typescript
  // MCP server configuration
  let mcpServerConfig: McpServerConfig | undefined
  if (projectType === 'mcp-server') {
    const copy = getCopyForType('mcp-server')
    showBannerOnce()

    if (auto && !options.mcpServerFlags?.mcpLanguage) {
      throw new Error('--mcp-language is required in auto mode for mcp-server projects')
    }

    const language: McpServerConfig['language'] = options.mcpServerFlags?.mcpLanguage
      ?? await output.select('Implementation language?',
        optionsFromCopy(copy.language.options, ['typescript', 'python']),
        'typescript', copy.language) as McpServerConfig['language']

    const transport: McpServerConfig['transport'] = options.mcpServerFlags?.mcpTransport
      ?? (!auto ? await output.select('Transport?',
        optionsFromCopy(copy.transport.options, ['stdio', 'streamable-http', 'sse']),
        'stdio', copy.transport) as McpServerConfig['transport'] : 'stdio')

    const primitives: McpServerConfig['primitives'] = options.mcpServerFlags?.mcpPrimitives
      ?? (!auto ? await output.multiSelect('Primitives exposed?',
        optionsFromCopy(copy.primitives.options, ['tools', 'resources', 'prompts']),
        ['tools'], copy.primitives) as McpServerConfig['primitives'] : ['tools'])

    // stdio transport forbids network auth; only offer auth for non-stdio.
    const auth: McpServerConfig['auth'] = options.mcpServerFlags?.mcpAuth
      ?? (!auto && transport !== 'stdio' ? await output.select('Auth?',
        optionsFromCopy(copy.auth.options, ['none', 'oauth', 'apikey']),
        'none', copy.auth) as McpServerConfig['auth'] : 'none')

    const deployment: McpServerConfig['deployment'] = options.mcpServerFlags?.mcpDeployment
      ?? (transport === 'stdio' ? 'local'
        : (!auto ? await output.select('Deployment?',
          optionsFromCopy(copy.deployment.options, ['local', 'hosted']),
          'hosted', copy.deployment) as McpServerConfig['deployment'] : 'hosted'))

    const stateful = options.mcpServerFlags?.mcpStateful
      ?? (!auto ? await output.confirm('Does the server persist state/resources?', false, copy.stateful) : false)

    mcpServerConfig = { language, transport, primitives, auth, deployment, stateful }
  }
```

Add `mcpServerConfig` to the object returned by `askWizardQuestions` (next to `researchConfig`).

Also add `mcpServerFlags?: McpServerFlags` to the local options interface that `askWizardQuestions` accepts (the inline `options` parameter type in `questions.ts`, mirroring `researchFlags`).

- [ ] **Step 5: Wire wizard.ts**

In `src/wizard/wizard.ts`: add `mcpServerFlags?: McpServerFlags` to `WizardOptions` (add the `McpServerFlags` import); destructure `mcpServerFlags` in `collectWizardAnswers`; pass `mcpServerFlags` into the `askWizardQuestions({...})` call; and add to the assembled config:

```typescript
      ...(answers.mcpServerConfig && { mcpServerConfig: answers.mcpServerConfig }),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/wizard/questions.test.ts -t mcp-server`
Expected: PASS. (Fill in the `as any` test stubs with the exact required `WizardOptions` fields the neighboring research test uses — copy that test's option bag.)

- [ ] **Step 7: Commit**

```bash
git add src/wizard/questions.ts src/wizard/wizard.ts src/wizard/questions.test.ts
git commit -m "feat(mcp-server): add wizard collection block + options wiring"
```

## Task A10: CLI command options (init + adopt)

**Files:**
- Modify: `src/cli/commands/init.ts`, `src/cli/commands/adopt.ts`

- [ ] **Step 1: Extend InitArgs and add yargs options**

In `src/cli/commands/init.ts`: add the fields to `InitArgs`:

```typescript
  // MCP server flags
  'mcp-language'?: string
  'mcp-transport'?: string
  'mcp-primitives'?: string[]
  'mcp-auth'?: string
  'mcp-deployment'?: string
  'mcp-stateful'?: boolean
```

Add `...MCP_SERVER_FLAGS` to the `CONFIG_SETTING_FLAGS` array (import `MCP_SERVER_FLAGS` from `../init-flag-families.js`). Add the yargs `.option(...)` blocks (next to the `research-*` options):

```typescript
.option('mcp-language', { type: 'string', describe: 'MCP server language', choices: ['typescript', 'python'] as const })
.option('mcp-transport', { type: 'string', describe: 'MCP transport', choices: ['stdio', 'streamable-http', 'sse'] as const })
.option('mcp-primitives', { type: 'array', describe: 'MCP primitives exposed', choices: ['tools', 'resources', 'prompts'] as const })
.option('mcp-auth', { type: 'string', describe: 'MCP auth', choices: ['none', 'oauth', 'apikey'] as const })
.option('mcp-deployment', { type: 'string', describe: 'MCP deployment', choices: ['local', 'hosted'] as const })
.option('mcp-stateful', { type: 'boolean', describe: 'MCP server persists state' })
```

Where the handler builds `WizardOptions`, populate `mcpServerFlags` from argv (mirror how `researchFlags` is built — map `argv['mcp-language']` → `mcpLanguage`, etc.).

- [ ] **Step 2: Mirror in adopt.ts**

In `src/cli/commands/adopt.ts`: replicate the same `.option(...)` blocks and the `mcpServerFlags` population that `init.ts` uses (adopt mirrors init's CLI surface).

- [ ] **Step 3: Verify build + a manual smoke**

Run: `npx tsc --noEmit && npm run build`
Then: `node dist/cli.js init --help | grep mcp-` → Expected: the six `--mcp-*` options listed.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/adopt.ts
git commit -m "feat(mcp-server): expose --mcp-* CLI options on init and adopt"
```

## Task A11: Thin overlay (satisfies the packaging gate)

**Files:**
- Create: `content/methodology/mcp-server-overlay.yml`
- Test (already exists, will now pass): `tests/packaging/project-type-overlay-alignment.test.ts`

- [ ] **Step 1: Run the packaging test to confirm it currently fails**

Run: `npx vitest run tests/packaging/project-type-overlay-alignment.test.ts`
Expected: FAIL for `mcp-server` — no overlay file (the test enumerates `ProjectTypeSchema.options`).

- [ ] **Step 2: Create the thin overlay**

Create `content/methodology/mcp-server-overlay.yml`. PR1 only disables UI steps and relaxes `database-schema`; knowledge injection + the new step are added in PR2:

```yaml
# methodology/mcp-server-overlay.yml
name: mcp-server
description: >
  MCP Server overlay — an MCP server has no UI, so the design-system and UX
  steps are disabled. database-schema stays available (if-needed) for servers
  that persist resources/state. Knowledge injection and the
  mcp-tool-resource-contract step are added in PR2.
project-type: mcp-server

step-overrides:
  # No UI surface — disable design/UX steps entirely.
  design-system: { enabled: false }
  ux-spec: { enabled: false }
  review-ux: { enabled: false }
  # Stateful servers may persist resources; keep available but skippable.
  database-schema: { enabled: true, conditional: "if-needed" }
  review-database: { enabled: true, conditional: "if-needed" }
```

- [ ] **Step 3: Run the packaging test to verify it passes**

Run: `npx vitest run tests/packaging/project-type-overlay-alignment.test.ts`
Expected: PASS for all project types including `mcp-server`.

- [ ] **Step 4: Commit**

```bash
git add content/methodology/mcp-server-overlay.yml
git commit -m "feat(mcp-server): add thin methodology overlay (disable UI steps)"
```

## Task A12: README + full gates + PR1

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

In `README.md`: add `mcp-server` to the `--project-type` enum list (~line 375), add a row to the project-type overlay table (~line 668), add the `--mcp-*` flags to the flags section, and add `mcp-server` to the `scaffold adopt` detection table with its signals (SDK dep = medium; dep + registration entrypoint = high). Do **not** change the knowledge-base count yet (no entries until PR2).

- [ ] **Step 2: Run all gates**

Run: `make check-all`
Expected: PASS (lint + frontmatter validate + bats + vitest + tsc).

- [ ] **Step 3: Commit, push, open PR**

```bash
git add README.md
git commit -m "docs(mcp-server): document the mcp-server project type"
git push -u origin HEAD
gh pr create --base main --title "feat(mcp-server): register MCP Server project type (PR1: registration)" \
  --body "First of two PRs from docs/architecture/mcp-server-project-type-research.md. Adds the type end-to-end: enum, rich config, coupling validator, conservative detector, wizard copy/questions, --mcp-* flags, adopt maps, and a thin overlay (UI steps disabled). Packaging gate green. PR2 adds the knowledge directory + mcp-tool-resource-contract step."
```

- [ ] **Step 4: Mandatory review + CI + merge**

Run `scaffold run review-pr` (or `mmr review --pr <n>`); fix blocking findings; wait for CI; `gh pr merge --squash --delete-branch`.

---

# PART B — PR2: Knowledge directory + new pipeline step

> Goal of PR2: MCP-specific depth. Author the knowledge entries, the `mcp-tool-resource-contract` meta-prompt, register the step in all three presets, and expand the overlay to inject knowledge + enable the step. Branch off the updated `main` after PR1 merges.

## Task B1: The new pipeline step (meta-prompt)

**Files:**
- Create: `content/pipeline/specification/mcp-tool-resource-contract.md`

- [ ] **Step 1: Author the meta-prompt**

Create `content/pipeline/specification/mcp-tool-resource-contract.md`, modeled exactly on `content/pipeline/specification/api-contracts.md` (same frontmatter keys, same `## Mode Detection` + `## Update Mode Specifics` sections). Use a distinct `order` after `api-contracts` (api-contracts is `order: 830`; use `835`):

```markdown
---
name: mcp-tool-resource-contract
description: Specify the MCP tool, resource, and prompt contracts the server exposes
summary: "Specifies every MCP tool (name, input schema, output, errors), resource (URI template, mime, pagination), and prompt the server exposes — the contract MCP clients depend on."
phase: "specification"
order: 835
dependencies: [review-architecture]
outputs: [docs/mcp-contract.md]
conditional: "if-needed"
knowledge-base: [mcp-tool-design, mcp-resource-design, mcp-prompt-primitives, mcp-error-handling]
---

## Purpose
Define the Model Context Protocol surface this server exposes: tools (callable
actions with JSON-Schema inputs), resources (readable data addressed by URI),
and prompts (reusable templates). This contract is what MCP clients negotiate
against during initialization and is expensive to change once clients depend on
it.

## Inputs
- docs/system-architecture.md (required) — the handlers/capabilities to expose
- docs/domain-models/ (if present) — domain operations to surface as tools/resources
- .scaffold/config.yml — mcpServerConfig (transport, primitives, auth, stateful)

## Expected Outputs
- docs/mcp-contract.md — per-primitive contract: tool input/output schemas,
  resource URI templates + mime types, prompt arguments, and error codes.

## Quality Criteria
- (mvp) Every exposed tool documents: name, description, input JSON Schema, output shape, and >= 1 domain error condition.
- (mvp) Every exposed resource documents: URI template, mime type, and whether it is listable.
- (mvp) Prompts (if `prompts` is in mcpServerConfig.primitives) document name + arguments.
- (mvp) Capability set matches mcpServerConfig.primitives.
- (deep) Pagination documented for listable resources; subscription/notification behavior documented if stateful.
- (deep) Auth/authorization per tool documented when mcpServerConfig.auth != none.

## Methodology Scaling
- **deep**: full per-primitive schemas with examples, error catalog, auth/authorization notes, pagination + subscription semantics.
- **mvp**: tool/resource/prompt list with names, one-line descriptions, and input shapes.
- **custom:depth(1-5)**: depth 1 = primitive list; depth 3 = + input/output schemas + error codes; depth 5 = + auth, pagination, subscriptions, examples.

## Mode Detection
Check for docs/mcp-contract.md. If it exists, operate in update mode: read the
existing primitive definitions and diff against the current architecture and
mcpServerConfig.primitives. Preserve existing tool names, input schemas, resource
URI templates, and error codes. Add new primitives for new capabilities. Never
remove or rename an existing tool/resource without explicit user approval (it is
a breaking change for clients).

## Update Mode Specifics
- **Detect prior artifact**: docs/mcp-contract.md exists
- **Preserve**: existing tool names + input schemas, resource URI templates + mime types, prompt argument lists, error codes, auth requirements
- **Triggers for update**: architecture added a capability, mcpServerConfig.primitives changed, domain models added operations
- **Conflict resolution**: if a capability moved, update its grouping but preserve its wire contract; flag breaking schema changes for user review
```

- [ ] **Step 2: Validate frontmatter**

Run: `make validate`
Expected: PASS (the new file conforms to the frontmatter schema). If it complains the step is unknown to presets, that's Task B2.

- [ ] **Step 3: Commit**

```bash
git add content/pipeline/specification/mcp-tool-resource-contract.md
git commit -m "feat(mcp-server): add mcp-tool-resource-contract pipeline step"
```

## Task B2: Register the step in presets + enable in overlay

**Files:**
- Modify: `content/methodology/deep.yml`, `content/methodology/mvp.yml`, `content/methodology/custom-defaults.yml`
- Modify: `content/methodology/mcp-server-overlay.yml`

- [ ] **Step 1: Declare the step (disabled) in all three presets**

The step is auto-discovered from the meta-prompt file; a discovered step not listed in a preset emits a `presetMissingStep` warning (`preset-loader.ts:142`). Add it to the `specification` phase block, next to `api-contracts`, as **disabled by default** (it is MCP-only):

In `content/methodology/deep.yml` and `content/methodology/custom-defaults.yml`:
```yaml
  mcp-tool-resource-contract: { enabled: false }   # enabled only by mcp-server-overlay
```
In `content/methodology/mvp.yml`:
```yaml
  mcp-tool-resource-contract: { enabled: false }
```

- [ ] **Step 2: Enable it in the overlay**

In `content/methodology/mcp-server-overlay.yml`, add to `step-overrides`:
```yaml
  mcp-tool-resource-contract: { enabled: true, conditional: "if-needed" }
```

- [ ] **Step 3: Verify no preset warnings**

Run: `npx vitest run tests/packaging/project-type-overlay-alignment.test.ts && make validate`
Expected: PASS, no `presetMissingStep` warnings for `mcp-tool-resource-contract`. (If a preset-loading unit test asserts zero warnings, it should stay green.)

- [ ] **Step 4: Commit**

```bash
git add content/methodology/deep.yml content/methodology/mvp.yml content/methodology/custom-defaults.yml content/methodology/mcp-server-overlay.yml
git commit -m "feat(mcp-server): register new step in presets + enable in overlay"
```

## Task B3: Author the knowledge directory

**Files:**
- Create: `content/knowledge/mcp-server/*.md` (12 entries)

Each entry follows the convention from `content/knowledge/backend/backend-api-design.md`: frontmatter (`name`, `description`, `topics`, `volatility`, `last-reviewed: null`, `version-pin: null`, `sources`), an opening paragraph, a `## Summary` section, and a `## Deep Guidance` section. Protocol/transport/SDK entries use `volatility: fast-moving`. Cite the official spec (`https://modelcontextprotocol.io/specification/2025-06-18/...`) and SDK docs.

- [ ] **Step 1: Create the 12 entries**

Author these files. The **required keyword(s)** column drives the bats keyword test in B5 — each entry MUST contain its keyword(s):

| File | volatility | Required keyword(s) | Must cover |
|------|-----------|---------------------|------------|
| `mcp-protocol-fundamentals.md` | fast-moving | `JSON-RPC`, `initialize` | client/server model, capability negotiation, message lifecycle |
| `mcp-tool-design.md` | evolving | `inputSchema` | tool naming, JSON-Schema inputs, idempotency, output content blocks |
| `mcp-resource-design.md` | evolving | `URI` | resource URIs/templates, mime types, listable vs static, pagination |
| `mcp-prompt-primitives.md` | evolving | `prompts/get` | prompts as primitives, arguments, when to use vs tools |
| `mcp-transport-patterns.md` | fast-moving | `Streamable HTTP`, `stdio` | the two spec transports; legacy HTTP+SSE migration; when to use each |
| `mcp-sdk-selection.md` | fast-moving | `FastMCP` | TS `@modelcontextprotocol/sdk` vs Python SDK/FastMCP trade-offs |
| `mcp-authentication.md` | evolving | `OAuth` | none/oauth/apikey; why stdio ⇒ no network auth; capability gating |
| `mcp-error-handling.md` | evolving | `isError` | protocol vs tool errors, error content, partial failures |
| `mcp-testing-strategies.md` | stable | `MCP Inspector` | client mocks, protocol-compliance tests, integration testing |
| `mcp-deployment-patterns.md` | evolving | `stdio` | local subprocess vs hosted (container/serverless); lifecycle |
| `mcp-observability.md` | evolving | `logging` | request tracing, structured logs (stderr for stdio), debugging |
| `mcp-versioning.md` | stable | `MCP-Protocol-Version` | protocol version negotiation, capability/back-compat |

Example skeleton (use for each, filling Summary + Deep Guidance with real content sourced from the spec + SDK docs; the `mcp-builder` Claude skill is a good content reference):

```markdown
---
name: mcp-transport-patterns
description: The two standard MCP transports (stdio and Streamable HTTP), legacy HTTP+SSE migration, and how to choose
topics: [mcp, transport, stdio, streamable-http, sse]
volatility: fast-moving
last-reviewed: null
version-pin: null
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
---

An MCP server's transport determines how clients connect to it...

## Summary

The current MCP spec defines exactly two standard transports: **stdio** (local
subprocess over stdin/stdout — the default for desktop clients) and **Streamable
HTTP** (a single HTTP endpoint, optionally using SSE internally for streaming —
for remote servers). The older standalone "HTTP+SSE" transport (protocol version
2024-11-05) is **deprecated**; new servers use Streamable HTTP...

## Deep Guidance

### stdio
...
### Streamable HTTP
...
### Migrating from legacy HTTP+SSE
...
### Choosing a transport
...
```

- [ ] **Step 2: Validate**

Run: `make validate`
Expected: PASS (knowledge frontmatter conforms).

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/mcp-server/
git commit -m "feat(mcp-server): author MCP server knowledge directory (12 entries)"
```

## Task B4: Expand the overlay with knowledge injection

**Files:**
- Modify: `content/methodology/mcp-server-overlay.yml`

- [ ] **Step 1: Add knowledge-overrides + reads**

Add a `knowledge-overrides:` block to `content/methodology/mcp-server-overlay.yml` mapping the new entries into existing steps (mirror `research-overlay.yml`'s structure). Surface `stateful`-relevant guidance via the `database-schema` step:

```yaml
knowledge-overrides:
  tech-stack:
    append: [mcp-protocol-fundamentals, mcp-sdk-selection, mcp-transport-patterns]
  system-architecture:
    append: [mcp-protocol-fundamentals, mcp-transport-patterns, mcp-tool-design, mcp-resource-design]
  adrs:
    append: [mcp-sdk-selection, mcp-transport-patterns]
  api-contracts:
    append: [mcp-tool-design, mcp-resource-design, mcp-error-handling]
  mcp-tool-resource-contract:
    append: [mcp-tool-design, mcp-resource-design, mcp-prompt-primitives, mcp-error-handling]
  database-schema:
    append: [mcp-resource-design]
  security:
    append: [mcp-authentication]
  operations:
    append: [mcp-deployment-patterns, mcp-observability, mcp-versioning]
  tdd:
    append: [mcp-testing-strategies]
  add-e2e-testing:
    append: [mcp-testing-strategies]
  review-architecture:
    append: [mcp-transport-patterns, mcp-tool-design, mcp-resource-design]
  review-security:
    append: [mcp-authentication]
  review-operations:
    append: [mcp-deployment-patterns, mcp-observability]
```

- [ ] **Step 2: Validate**

Run: `make validate && npx vitest run tests/packaging/project-type-overlay-alignment.test.ts`
Expected: PASS (every appended knowledge name must resolve to a real entry in `content/knowledge/mcp-server/`).

- [ ] **Step 3: Commit**

```bash
git add content/methodology/mcp-server-overlay.yml
git commit -m "feat(mcp-server): inject MCP knowledge into pipeline steps via overlay"
```

## Task B5: E2E overlay test + bats eval

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`
- Create: `tests/evals/mcp-server-overlay-content.bats`

- [ ] **Step 1: Write the E2E overlay test**

Add to `src/e2e/project-type-overlays.test.ts` (mirror the research overlay block; build a config with `projectType: 'mcp-server'` + a minimal `mcpServerConfig`, call `resolveOverlayState`, and assert injection + step enablement):

```typescript
describe('mcp-server overlay integration', () => {
  async function resolveMcpOverlay(): Promise<OverlayState> {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const presets = loadAllPresets(methodologyDir, [...realMetaPrompts.keys()])
    return resolveOverlayState({
      config: {
        version: 2, methodology: 'deep', platforms: ['claude-code'],
        project: {
          projectType: 'mcp-server',
          mcpServerConfig: {
            language: 'typescript', transport: 'stdio', primitives: ['tools'],
            auth: 'none', deployment: 'local', stateful: false,
          },
        },
      },
      methodologyDir,
      metaPrompts: realMetaPrompts,
      presetSteps: presets.deep?.steps ?? {},
      output: createMockOutput(),
    })
  }

  it('injects MCP knowledge into expected steps', async () => {
    const state = await resolveMcpOverlay()
    expect(state.knowledge['system-architecture']).toContain('mcp-transport-patterns')
    expect(state.knowledge['security']).toContain('mcp-authentication')
    expect(state.knowledge['tdd']).toContain('mcp-testing-strategies')
  })

  it('enables mcp-tool-resource-contract and disables UI steps', async () => {
    const state = await resolveMcpOverlay()
    expect(state.steps['mcp-tool-resource-contract']?.enabled).toBe(true)
    expect(state.steps['design-system']?.enabled).toBe(false)
    expect(state.steps['ux-spec']?.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run the E2E test**

Run: `npx vitest run src/e2e/project-type-overlays.test.ts -t mcp-server`
Expected: PASS. (Match the exact `OverlayState`/helper imports the research block in the same file uses.)

- [ ] **Step 3: Create the bats keyword eval**

Create `tests/evals/mcp-server-overlay-content.bats` (mirror `tests/evals/web3-overlay-content.bats`), one `@test` per knowledge file asserting its required keyword from B3:

```bash
#!/usr/bin/env bats
PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/mcp-server"

@test "mcp-protocol-fundamentals mentions JSON-RPC" { grep -q 'JSON-RPC' "${KB_DIR}/mcp-protocol-fundamentals.md"; }
@test "mcp-tool-design mentions inputSchema" { grep -q 'inputSchema' "${KB_DIR}/mcp-tool-design.md"; }
@test "mcp-resource-design mentions URI" { grep -q 'URI' "${KB_DIR}/mcp-resource-design.md"; }
@test "mcp-prompt-primitives mentions prompts/get" { grep -q 'prompts/get' "${KB_DIR}/mcp-prompt-primitives.md"; }
@test "mcp-transport-patterns mentions Streamable HTTP" { grep -q 'Streamable HTTP' "${KB_DIR}/mcp-transport-patterns.md"; }
@test "mcp-sdk-selection mentions FastMCP" { grep -q 'FastMCP' "${KB_DIR}/mcp-sdk-selection.md"; }
@test "mcp-authentication mentions OAuth" { grep -q 'OAuth' "${KB_DIR}/mcp-authentication.md"; }
@test "mcp-error-handling mentions isError" { grep -q 'isError' "${KB_DIR}/mcp-error-handling.md"; }
@test "mcp-testing-strategies mentions MCP Inspector" { grep -q 'MCP Inspector' "${KB_DIR}/mcp-testing-strategies.md"; }
@test "mcp-deployment-patterns mentions stdio" { grep -q 'stdio' "${KB_DIR}/mcp-deployment-patterns.md"; }
@test "mcp-observability mentions logging" { grep -q 'logging' "${KB_DIR}/mcp-observability.md"; }
@test "mcp-versioning mentions MCP-Protocol-Version" { grep -q 'MCP-Protocol-Version' "${KB_DIR}/mcp-versioning.md"; }
```

- [ ] **Step 4: Run the bats eval**

Run: `bats tests/evals/mcp-server-overlay-content.bats`
Expected: PASS (12 tests). Fix any knowledge entry missing its keyword.

- [ ] **Step 5: Commit**

```bash
git add src/e2e/project-type-overlays.test.ts tests/evals/mcp-server-overlay-content.bats
git commit -m "test(mcp-server): e2e overlay injection + knowledge content evals"
```

## Task B6: README + CHANGELOG + full gates + PR2

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update README knowledge count + category list**

In `README.md`: bump the knowledge-base count (currently `267 ... nineteen categories` at line 32, ~1532, ~1761) to reflect +12 entries and the new `mcp-server` category (nineteen → twenty categories). Re-run the count to get the exact number: `find content/knowledge -type f -name '*.md' ! -iname 'readme*' | wc -l`.

- [ ] **Step 2: Add CHANGELOG entry**

In `CHANGELOG.md`, under the current unreleased/next version block, add an entry describing the mcp-server type: rich config (language/transport/primitives/auth/deployment/stateful), `--mcp-*` flags, conservative detector, `mcp-server-overlay.yml`, the `mcp-tool-resource-contract` step, and the 12-entry knowledge directory.

- [ ] **Step 3: Full gates**

Run: `make check-all`
Expected: PASS.

- [ ] **Step 4: Commit, push, PR, review, merge**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(mcp-server): knowledge count + changelog for PR2"
git push -u origin HEAD
gh pr create --base main --title "feat(mcp-server): knowledge + tool/resource contract step (PR2)" \
  --body "Second of two PRs. Adds the content/knowledge/mcp-server/ directory (12 entries), the mcp-tool-resource-contract pipeline step, preset registration, and overlay knowledge injection."
```
Then mandatory review (`scaffold run review-pr`), fix blocking findings, wait for CI, `gh pr merge --squash --delete-branch`.

---

## Self-Review

**Spec coverage** (against `docs/architecture/mcp-server-project-type-research.md`):
- §4 base registration checklist items 1–15b → Tasks A1–A10. ✓ (`adopt.ts` exhaustiveness = A5; `wizard.ts` WizardOptions = A9.)
- §4a new-step + preset registration → Tasks B1, B2. ✓
- §5 packaging gate → A11; domain-overlay test → N/A (no domains, per §7.2). ✓
- §6 TDD outline + PR1/PR2 split → Part A / Part B boundary matches. ✓
- §7.1 rich 6-field config (apikey, .min(1)) → A1. ✓  §7.2 no domains → no `mcpServerRealDomains` (A1 omits it). ✓  §7.3 database-schema if-needed + stateful surfaced via reads/knowledge → A11 + B4. ✓  §7.5 fast-moving volatility + spec citation → B3. ✓  §7.6 conservative detection → A4. ✓

**Type consistency:** config key `mcpServerConfig` and flag prefix `mcp-*` / `mcp...` (camelCase in `McpServerFlags`) are used consistently across schema, validator, detector, copy, flags, questions, wizard, adopt, init. Config field names (`language`/`transport`/`primitives`/`auth`/`deployment`/`stateful`) match between A1 schema, A6 copy, A7 flags, A8 overrides, A9 questions.

**Placeholder scan:** the only intentionally-deferred prose is the *body* of the 12 knowledge entries (B3) and a few `...other required WizardOptions fields...` test stubs (A9) — both point to the exact neighboring precedent to copy. All code steps contain complete code.

**Known follow-ups (not blocking):** config-value-driven step enablement (truly keying `database-schema` off `stateful`) is out of scope; domains are deferred; a scaffold *output template* for an actual MCP server skeleton is a possible future enhancement.
