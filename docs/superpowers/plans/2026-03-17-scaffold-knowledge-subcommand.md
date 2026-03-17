# scaffold knowledge Subcommand Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scaffold knowledge` subcommand namespace with four subcommands (`update`, `list`, `show`, `reset`) that lets users create and manage project-local knowledge base overrides in `.scaffold/knowledge/`.

**Architecture:** A new yargs nested CommandModule (`knowledge.ts`) with four subcommands, a new `KnowledgeUpdateAssembler` class that interpolates a prompt template for Claude to fill in, and a `buildIndexWithOverrides()` function in the existing `knowledge-loader.ts` that adds local-override precedence to all commands that use knowledge entries.

**Tech Stack:** TypeScript, yargs (nested commands pattern), vitest, Node.js `fs`/`path`/`child_process`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/assembly/knowledge-loader.ts` | Modify | Add `buildIndexWithOverrides()` export |
| `src/core/assembly/knowledge-loader.test.ts` | Modify | Add tests for `buildIndexWithOverrides` |
| `src/core/knowledge/knowledge-update-assembler.ts` | Create | `KnowledgeUpdateAssembler` class |
| `src/core/knowledge/knowledge-update-assembler.test.ts` | Create | Unit tests for assembler |
| `src/core/knowledge/knowledge-update-template.md` | Create | Prompt template with `{{name}}` etc. placeholders |
| `src/cli/commands/knowledge.ts` | Create | Yargs CommandModule with 4 nested subcommands |
| `src/cli/commands/knowledge.test.ts` | Create | Unit tests for CLI handler logic |
| `src/cli/index.ts` | Modify | Register `knowledge` command |
| `src/cli/commands/run.ts` | Modify | Swap `buildIndex` → `buildIndexWithOverrides` |
| `src/e2e/knowledge.test.ts` | Create | E2E tests in a real temp directory |
| `commands/knowledge.md` | Create | Claude Code `/scaffold:knowledge` slash command |

---

## Task 1: `buildIndexWithOverrides` in knowledge-loader.ts

**Files:**
- Modify: `src/core/assembly/knowledge-loader.ts`
- Modify: `src/core/assembly/knowledge-loader.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/core/assembly/knowledge-loader.test.ts` and add a new `describe('buildIndexWithOverrides')` block after the existing tests:

```typescript
import { buildIndex, buildIndexWithOverrides } from './knowledge-loader.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('buildIndexWithOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-kb-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  function writeEntry(dir: string, subPath: string, name: string, description = 'desc') {
    const fullDir = path.join(dir, path.dirname(subPath))
    fs.mkdirSync(fullDir, { recursive: true })
    fs.writeFileSync(path.join(dir, subPath), `---\nname: ${name}\ndescription: ${description}\ntopics: []\n---\n# Body`)
  }

  it('returns global entry when no local override exists', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design', 'Global API design')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.has('api-design')).toBe(true)
    expect(index.get('api-design')).toContain('knowledge')
    expect(index.get('api-design')).toContain('api-design.md')
  })

  it('local override wins over global entry', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design', 'Global')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'api-design.md', 'api-design', 'Local override')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.get('api-design')).toContain('.scaffold')
  })

  it('returns empty map when both dirs do not exist', () => {
    const index = buildIndexWithOverrides(tmpDir, path.join(tmpDir, 'missing'))
    expect(index.size).toBe(0)
  })

  it('includes global entries not overridden locally', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design')
    writeEntry(globalDir, 'core/testing.md', 'testing-strategy')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'api-design.md', 'api-design')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.has('testing-strategy')).toBe(true)
    expect(index.get('testing-strategy')).toContain('knowledge')
  })

  it('emits warning to stderr for duplicate names in local override dir', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'a/api-design.md', 'api-design', 'First')
    writeEntry(localDir, 'b/api-design.md', 'api-design', 'Second')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    buildIndexWithOverrides(tmpDir, globalDir)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('api-design'))
    stderrSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/core/assembly/knowledge-loader.test.ts
```
Expected: error — `buildIndexWithOverrides` is not exported

- [ ] **Step 3: Implement `buildIndexWithOverrides` in knowledge-loader.ts**

Add after the existing `buildIndex` export:

```typescript
/**
 * Like buildIndex(), but checks <projectRoot>/.scaffold/knowledge/ first.
 * Local overrides take precedence over global entries by the same name.
 * Emits a stderr warning for duplicate names within the local override dir.
 */
export function buildIndexWithOverrides(
  projectRoot: string,
  globalKnowledgeDir: string,
): Map<string, string> {
  // Build global index first (lower precedence)
  const globalIndex = buildIndex(globalKnowledgeDir)

  // Build local override index
  const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
  const localIndex = new Map<string, string>()

  if (fileExists(localDir)) {
    function walkLocal(dir: string): void {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walkLocal(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8')
            const fm = extractKBFrontmatter(content)
            if (fm?.name) {
              if (localIndex.has(fm.name)) {
                process.stderr.write(
                  `warn: duplicate knowledge override name "${fm.name}" in ${localDir} — using last found\n`
                )
              }
              localIndex.set(fm.name, fullPath)
            }
          } catch {
            // skip invalid files
          }
        }
      }
    }
    walkLocal(localDir)
  }

  // Merge: local overrides win
  const merged = new Map(globalIndex)
  for (const [name, filePath] of localIndex) {
    merged.set(name, filePath)
  }
  return merged
}
```

- [ ] **Step 4: Run the tests to see them pass**

```bash
npx vitest run src/core/assembly/knowledge-loader.test.ts
```
Expected: all tests pass

- [ ] **Step 5: Update `run.ts` to use `buildIndexWithOverrides`**

In `src/cli/commands/run.ts`, change the import and the knowledge dir call:

```typescript
// Change import line from:
import { buildIndex, loadEntries } from '../../core/assembly/knowledge-loader.js'
// To:
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'

// Change lines ~310-311 from:
const knowledgeDir = path.join(projectRoot, 'knowledge')
const kbIndex = buildIndex(knowledgeDir)
// To:
const kbIndex = buildIndexWithOverrides(projectRoot, path.join(projectRoot, 'knowledge'))
```

Also update the mock in `run.test.ts` to export `buildIndexWithOverrides` instead of `buildIndex`:

```typescript
vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndexWithOverrides: vi.fn(),
  loadEntries: vi.fn(),
}))
// And update the import:
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'
// And update the beforeEach default mock return value from:
vi.mocked(buildIndex).mockReturnValue(new Map())
// To:
vi.mocked(buildIndexWithOverrides).mockReturnValue(new Map())
```

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/core/assembly/knowledge-loader.ts src/core/assembly/knowledge-loader.test.ts src/cli/commands/run.ts src/cli/commands/run.test.ts
git commit -m "feat(knowledge): add buildIndexWithOverrides for project-local overrides"
```

---

## Task 2: Prompt Template and `KnowledgeUpdateAssembler`

**Files:**
- Create: `src/core/knowledge/knowledge-update-template.md`
- Create: `src/core/knowledge/knowledge-update-assembler.ts`
- Create: `src/core/knowledge/knowledge-update-assembler.test.ts`

- [ ] **Step 1: Create the prompt template**

Create `src/core/knowledge/knowledge-update-template.md`:

```markdown
## Task

You are customizing the knowledge base for this project. Write the file
`.scaffold/knowledge/{{name}}.md` with valid YAML frontmatter and a markdown body
tailored to this project's context.

The file must start with:
```yaml
---
name: {{name}}
description: <one-line description reflecting this project's context>
topics: [<comma-separated topic keywords>]
---
```
Followed by the full knowledge body as markdown.

## Global Knowledge Entry (seed)

{{globalBody}}

{{#hasLocalOverride}}
## Existing Local Override (update mode)

The following is the current project-specific version of this entry. Preserve what
is still accurate, revise what the Focus instructions change, and add what is missing.

{{localOverrideContent}}
{{/hasLocalOverride}}

## Project Context

Methodology: {{methodology}}

{{#hasArtifacts}}
Relevant project artifacts:

{{artifacts}}
{{/hasArtifacts}}

{{#hasFocus}}
## Focus

{{focus}}

{{/hasFocus}}
## Output Instructions

- Write the COMPLETE file — frontmatter + full body. Do not summarize or skip sections.
- Tailor the content to this project's tech stack, conventions, and context.
- In create mode: use the Global Knowledge Entry as the structural seed; adapt every
  section to the project rather than keeping generic guidance verbatim.
- In update mode: diff against the Existing Local Override; preserve project-specific
  decisions; revise based on Focus; add anything the Focus requires.
- Output only the file contents. No commentary before or after.
- Output path: `.scaffold/knowledge/{{name}}.md`
```

- [ ] **Step 2: Write the failing assembler tests**

Create `src/core/knowledge/knowledge-update-assembler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { KnowledgeUpdateAssembler } from './knowledge-update-assembler.js'

const TEMPLATE = `## Task
Write \`.scaffold/knowledge/{{name}}.md\`.
## Global Knowledge Entry (seed)
{{globalBody}}
{{#hasLocalOverride}}
## Existing Local Override
{{localOverrideContent}}
{{/hasLocalOverride}}
## Project Context
Methodology: {{methodology}}
{{#hasArtifacts}}
Artifacts:
{{artifacts}}
{{/hasArtifacts}}
{{#hasFocus}}
## Focus
{{focus}}
{{/hasFocus}}
## Output Instructions
- Write the complete file.`

describe('KnowledgeUpdateAssembler', () => {
  it('create mode: includes global body, no local override section', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: '# API Design\nUse REST.',
      localOverrideContent: null,
      methodology: 'deep',
      artifacts: [],
      focus: null,
    })
    expect(result).toContain('api-design')
    expect(result).toContain('# API Design')
    expect(result).toContain('Methodology: deep')
    expect(result).not.toContain('Existing Local Override')
    expect(result).not.toContain('## Focus')
  })

  it('update mode: includes local override section', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: '# API Design\nUse REST.',
      localOverrideContent: '# Custom API\nUse GraphQL.',
      methodology: 'deep',
      artifacts: [],
      focus: null,
    })
    expect(result).toContain('Existing Local Override')
    expect(result).toContain('# Custom API')
  })

  it('includes focus section when instructions provided', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: 'Body.',
      localOverrideContent: null,
      methodology: 'mvp',
      artifacts: [],
      focus: 'Focus on GraphQL patterns',
    })
    expect(result).toContain('## Focus')
    expect(result).toContain('Focus on GraphQL patterns')
  })

  it('includes artifacts when provided', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'api-design',
      globalBody: 'Body.',
      localOverrideContent: null,
      methodology: 'deep',
      artifacts: ['# My API Spec\nEndpoints here.'],
      focus: null,
    })
    expect(result).toContain('Artifacts:')
    expect(result).toContain('# My API Spec')
  })

  it('local-only mode: uses local content as seed when global body is empty', () => {
    const assembler = new KnowledgeUpdateAssembler(TEMPLATE)
    const result = assembler.assemble({
      name: 'custom-entry',
      globalBody: '(no global seed — this entry exists only locally)',
      localOverrideContent: '# Custom\nLocal only.',
      methodology: 'deep',
      artifacts: [],
      focus: 'Expand with more detail',
    })
    expect(result).toContain('no global seed')
    expect(result).toContain('Existing Local Override')
  })
})
```

- [ ] **Step 3: Run the test to see it fail**

```bash
npx vitest run src/core/knowledge/knowledge-update-assembler.test.ts
```
Expected: error — module not found

- [ ] **Step 4: Implement `KnowledgeUpdateAssembler`**

Create `src/core/knowledge/knowledge-update-assembler.ts`:

```typescript
export interface AssembleOptions {
  name: string
  globalBody: string
  localOverrideContent: string | null
  methodology: string
  artifacts: string[]
  focus: string | null
}

/**
 * Lightweight template interpolator for knowledge update prompts.
 * Uses {{var}} substitution and {{#flag}}...{{/flag}} conditional blocks.
 * No dependency on AssemblyEngine or pipeline concepts.
 */
export class KnowledgeUpdateAssembler {
  constructor(private readonly template: string) {}

  assemble(options: AssembleOptions): string {
    const { name, globalBody, localOverrideContent, methodology, artifacts, focus } = options

    let output = this.template

    // Simple variable substitution
    output = output.replace(/\{\{name\}\}/g, name)
    output = output.replace(/\{\{globalBody\}\}/g, globalBody)
    output = output.replace(/\{\{methodology\}\}/g, methodology)
    output = output.replace(/\{\{localOverrideContent\}\}/g, localOverrideContent ?? '')
    output = output.replace(/\{\{artifacts\}\}/g, artifacts.join('\n\n---\n\n'))
    output = output.replace(/\{\{focus\}\}/g, focus ?? '')

    // Conditional blocks: {{#flag}}...{{/flag}}
    output = this.resolveBlock(output, 'hasLocalOverride', localOverrideContent !== null)
    output = this.resolveBlock(output, 'hasArtifacts', artifacts.length > 0)
    output = this.resolveBlock(output, 'hasFocus', focus !== null && focus.trim() !== '')

    return output.trim()
  }

  private resolveBlock(text: string, flag: string, show: boolean): string {
    const pattern = new RegExp(`\\{\\{#${flag}\\}\\}([\\s\\S]*?)\\{\\{/${flag}\\}\\}`, 'g')
    if (show) {
      return text.replace(pattern, (_match, content: string) => content)
    }
    return text.replace(pattern, '')
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

```bash
npx vitest run src/core/knowledge/knowledge-update-assembler.test.ts
```
Expected: all 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/core/knowledge/
git commit -m "feat(knowledge): add KnowledgeUpdateAssembler and prompt template"
```

---

## Task 3: `knowledge.ts` CLI command scaffold + `list` subcommand

**Files:**
- Create: `src/cli/commands/knowledge.ts`
- Create: `src/cli/commands/knowledge.test.ts`

The `knowledge.ts` file uses the yargs nested subcommand pattern: a top-level CommandModule whose `builder` registers four sub-commands via `yargs.command(...)`. This is the pattern required to work with `.strict()` on the parent yargs instance.

- [ ] **Step 1: Write failing tests for `list`**

Create `src/cli/commands/knowledge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies
vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndex: vi.fn(),
  buildIndexWithOverrides: vi.fn(),
  loadEntries: vi.fn(),
}))
vi.mock('../../cli/middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
  ROOT_OPTIONAL_COMMANDS: ['init', 'version', 'update'],
}))
vi.mock('../../cli/output/context.js', () => ({
  createOutputContext: vi.fn(),
}))
vi.mock('../../cli/middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(),
}))
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(),
  }
})

import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { buildIndex } from '../../core/assembly/knowledge-loader.js'
import { createOutputContext } from '../../cli/output/context.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'
import { loadConfig } from '../../config/loader.js'
import fs from 'node:fs'

const PROJECT_ROOT = '/fake/project'

function makeOutputMock() {
  return {
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    result: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
  }
}

function setupDefaults(output = makeOutputMock()) {
  vi.mocked(findProjectRoot).mockReturnValue(PROJECT_ROOT)
  vi.mocked(resolveOutputMode).mockReturnValue('auto')
  vi.mocked(createOutputContext).mockReturnValue(output as any)
  vi.mocked(loadConfig).mockReturnValue({
    config: { version: 2, methodology: 'deep', platforms: ['claude-code'] },
    errors: [],
  } as any)
  return output
}

// Import the CLI runner helper — we'll invoke scaffold knowledge via runCli
import { runCli } from '../../cli/index.js'

describe('scaffold knowledge list', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Suppress process.exit
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('prints table with global and local entries', async () => {
    const output = setupDefaults()
    const globalEntries = new Map([
      ['api-design', '/fake/project/knowledge/api-design.md'],
      ['testing-strategy', '/fake/project/knowledge/testing-strategy.md'],
    ])
    const localEntries = new Map([
      ['api-design', '/fake/project/.scaffold/knowledge/api-design.md'],
    ])
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.scaffold')) return '---\nname: api-design\ndescription: Local override\ntopics: []\n---\n'
      if (String(p).includes('testing-strategy')) return '---\nname: testing-strategy\ndescription: Test strategy\ntopics: []\n---\n'
      return '---\nname: api-design\ndescription: Global\ntopics: []\n---\n'
    })
    vi.mocked(buildIndex)
      .mockReturnValueOnce(globalEntries)   // global scan
      .mockReturnValueOnce(localEntries)    // local scan

    await runCli(['knowledge', 'list'])

    // Should log something containing both names
    const allCalls = [
      ...vi.mocked(output.log).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join(' ')
    expect(allCalls).toContain('api-design')
    expect(allCalls).toContain('testing-strategy')
  })

  it('returns JSON array with --format json', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/fake/project/knowledge/api-design.md']]))
      .mockReturnValueOnce(new Map())
    vi.mocked(fs.readFileSync).mockReturnValue('---\nname: api-design\ndescription: Global\ntopics: []\n---\n')

    await runCli(['knowledge', 'list', '--format', 'json'])
    expect(vi.mocked(output.result)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'api-design', source: 'global' }),
      ])
    )
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
npx vitest run src/cli/commands/knowledge.test.ts
```
Expected: error — module not found

- [ ] **Step 3: Create `knowledge.ts` with the `list` subcommand**

Create `src/cli/commands/knowledge.ts`:

```typescript
import type { Argv, CommandModule } from 'yargs'
import path from 'node:path'
import fs from 'node:fs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { buildIndex } from '../../core/assembly/knowledge-loader.js'
import { loadConfig } from '../../config/loader.js'

// -----------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------

function getProjectRoot(argv: { root?: string }): string | null {
  return argv.root ?? findProjectRoot(process.cwd())
}

function readFrontmatterDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const match = content.match(/^---\n[\s\S]*?description:\s*(.+?)\n[\s\S]*?---/)
    return match?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

// -----------------------------------------------------------------------
// list subcommand
// -----------------------------------------------------------------------

interface ListArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
}

const listSubcommand: CommandModule<Record<string, unknown>, ListArgs> = {
  command: 'list',
  describe: 'Show all knowledge entries — global and local overrides',
  builder: (yargs) => yargs as Argv<ListArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const globalDir = path.join(projectRoot, 'knowledge')
    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')

    const globalIndex = buildIndex(globalDir)
    const localIndex = buildIndex(localDir)

    // Build merged list
    const allNames = new Set([...globalIndex.keys(), ...localIndex.keys()])
    const entries = [...allNames].sort().map((name) => {
      const isLocal = localIndex.has(name)
      const filePath = isLocal ? localIndex.get(name)! : globalIndex.get(name)!
      return {
        name,
        source: isLocal ? 'local' : 'global',
        description: readFrontmatterDescription(filePath),
      }
    })

    if (outputMode === 'json') {
      output.result(entries)
      return
    }

    if (entries.length === 0) {
      output.log('No knowledge entries found.')
      return
    }

    const nameWidth = Math.max(4, ...entries.map((e) => e.name.length)) + 2
    const sourceWidth = 16
    const header = 'NAME'.padEnd(nameWidth) + 'SOURCE'.padEnd(sourceWidth) + 'DESCRIPTION'
    output.log(header)
    output.log('-'.repeat(header.length))
    for (const e of entries) {
      const sourceLabel = e.source === 'local' ? 'local override' : 'global'
      output.log(e.name.padEnd(nameWidth) + sourceLabel.padEnd(sourceWidth) + e.description)
    }
    process.exit(0)
  },
}

// -----------------------------------------------------------------------
// Top-level knowledge command
// -----------------------------------------------------------------------

const knowledgeCommand: CommandModule<Record<string, unknown>, Record<string, unknown>> = {
  command: 'knowledge <subcommand>',
  describe: 'Manage project-local knowledge base overrides',
  builder: (yargs) => {
    return yargs
      .command(listSubcommand)
      .demandCommand(1, 'Specify a subcommand: update, list, show, reset')
      .strict() as Argv<Record<string, unknown>>
  },
  handler: () => {
    // Handled by subcommands
  },
}

export default knowledgeCommand
```

- [ ] **Step 4: Register `knowledge` in `src/cli/index.ts`**

```typescript
// Add import after the last import:
import knowledgeCommand from './commands/knowledge.js'

// Add .command() call after the last .command() in runCli:
.command(knowledgeCommand)
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/cli/commands/knowledge.test.ts
```
Expected: `list` tests pass

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/knowledge.ts src/cli/commands/knowledge.test.ts src/cli/index.ts
git commit -m "feat(knowledge): add scaffold knowledge list subcommand"
```

---

## Task 4: `show` subcommand

**Files:**
- Modify: `src/cli/commands/knowledge.ts`
- Modify: `src/cli/commands/knowledge.test.ts`

- [ ] **Step 1: Write failing tests for `show`**

Add to `knowledge.test.ts`:

```typescript
describe('scaffold knowledge show', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('prints local override content with source header when override exists', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/global/api-design.md']]))
      .mockReturnValueOnce(new Map([['api-design', '/local/api-design.md']]))
    vi.mocked(fs.readFileSync).mockReturnValue('---\nname: api-design\ndescription: Local\ntopics: []\n---\n# Local Body')

    await runCli(['knowledge', 'show', 'api-design'])

    const allOutput = [
      ...vi.mocked(output.log).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join('\n')
    expect(allOutput).toContain('local override')
    expect(allOutput).toContain('# Local Body')
  })

  it('prints global content with source header when no override', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/global/api-design.md']]))
      .mockReturnValueOnce(new Map())  // no local
    vi.mocked(fs.readFileSync).mockReturnValue('---\nname: api-design\ndescription: Global\ntopics: []\n---\n# Global Body')

    await runCli(['knowledge', 'show', 'api-design'])

    const allOutput = [
      ...vi.mocked(output.log).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join('\n')
    expect(allOutput).toContain('global')
    expect(allOutput).toContain('# Global Body')
  })

  it('exits 1 when entry not found in either location', async () => {
    setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map())
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)

    await runCli(['knowledge', 'show', 'nonexistent'])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
```

- [ ] **Step 2: Run to see failures**

```bash
npx vitest run src/cli/commands/knowledge.test.ts --reporter=verbose 2>&1 | grep -A3 "show"
```

- [ ] **Step 3: Implement `show` subcommand**

Add to `knowledge.ts` before `knowledgeCommand`:

```typescript
interface ShowArgs {
  name: string
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const showSubcommand: CommandModule<Record<string, unknown>, ShowArgs> = {
  command: 'show <name>',
  describe: 'Print the effective content of a knowledge entry',
  builder: (yargs) =>
    yargs.positional('name', { type: 'string', demandOption: true }) as Argv<ShowArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const globalDir = path.join(projectRoot, 'knowledge')
    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
    const globalIndex = buildIndex(globalDir)
    const localIndex = buildIndex(localDir)

    const name = argv.name
    const isLocal = localIndex.has(name)
    const filePath = isLocal ? localIndex.get(name) : globalIndex.get(name)

    if (!filePath) {
      output.error({ code: 'ENTRY_NOT_FOUND', message: `Knowledge entry '${name}' not found.`, exitCode: 1 })
      process.exit(1)
      return
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const sourceLabel = isLocal ? 'local override' : 'global'
      output.log(`# Source: ${sourceLabel} (${filePath})\n`)
      output.log(content)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      output.error({ code: 'READ_ERROR', message: `Failed to read entry: ${detail}`, exitCode: 1 })
      process.exit(1)
    }
    process.exit(0)
  },
}
```

Add `showSubcommand` to the `builder` in `knowledgeCommand`:

```typescript
builder: (yargs) => {
  return yargs
    .command(listSubcommand)
    .command(showSubcommand)   // add this line
    .demandCommand(1, 'Specify a subcommand: update, list, show, reset')
    .strict() as Argv<Record<string, unknown>>
},
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/cli/commands/knowledge.test.ts
```
Expected: all `show` tests pass

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/knowledge.ts src/cli/commands/knowledge.test.ts
git commit -m "feat(knowledge): add scaffold knowledge show subcommand"
```

---

## Task 5: `reset` subcommand

**Files:**
- Modify: `src/cli/commands/knowledge.ts`
- Modify: `src/cli/commands/knowledge.test.ts`

- [ ] **Step 1: Write failing tests for `reset`**

Add to `knowledge.test.ts`:

```typescript
import { execSync } from 'node:child_process'

describe('scaffold knowledge reset', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
  })

  it('prints "nothing to reset" and exits 0 when no local override exists', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map())  // no local override

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(output.log)).toHaveBeenCalledWith(expect.stringContaining('Nothing to reset'))
    expect(vi.spyOn(process, 'exit')).not.toHaveBeenCalledWith(1)
  })

  it('deletes the local override file when no uncommitted changes', async () => {
    const output = setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation(() => Buffer.from(''))  // empty = no changes
    vi.mocked(fs.existsSync).mockReturnValue(true)

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
    expect(vi.mocked(output.success)).toHaveBeenCalled()
  })

  it('exits 1 with warning when uncommitted changes and --auto not set', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation(() => Buffer.from(' M .scaffold/knowledge/api-design.md'))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled()
  })

  it('deletes with uncommitted changes when --auto is set', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation(() => Buffer.from(' M .scaffold/knowledge/api-design.md'))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    await runCli(['knowledge', 'reset', 'api-design', '--auto'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
  })

  it('skips git check and deletes when not a git repo', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (String(cmd).includes('rev-parse')) throw new Error('not a git repo')
      return Buffer.from('')
    })
    vi.mocked(fs.existsSync).mockReturnValue(true)

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
  })
})
```

- [ ] **Step 2: Run to see failures**

```bash
npx vitest run src/cli/commands/knowledge.test.ts 2>&1 | grep -E "FAIL|PASS|reset"
```

- [ ] **Step 3: Implement `reset` subcommand**

Add to `knowledge.ts`. Add `execSync` import at the top:

```typescript
import { execSync } from 'node:child_process'
```

Add `reset` subcommand before `knowledgeCommand`:

```typescript
interface ResetArgs {
  name: string
  auto?: boolean
  root?: string
  format?: string
  verbose?: boolean
}

const resetSubcommand: CommandModule<Record<string, unknown>, ResetArgs> = {
  command: 'reset <name>',
  describe: 'Remove a local knowledge override, reverting to the global entry',
  builder: (yargs) =>
    yargs.positional('name', { type: 'string', demandOption: true }) as Argv<ResetArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
    const localIndex = buildIndex(localDir)
    const name = argv.name
    const localPath = localIndex.get(name)

    if (!localPath) {
      output.log(`Nothing to reset for '${name}' — no local override found.`)
      process.exit(0)
      return
    }

    // Check for uncommitted changes
    const isGitRepo = (() => {
      try {
        execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: projectRoot })
        return true
      } catch {
        return false
      }
    })()

    let hasUncommittedChanges = false
    if (isGitRepo) {
      try {
        const result = execSync(`git status --porcelain "${localPath}"`, { stdio: 'pipe', cwd: projectRoot })
        hasUncommittedChanges = result.toString().trim().length > 0
      } catch {
        // ignore
      }
    }

    if (hasUncommittedChanges && !argv.auto) {
      process.stderr.write(
        `warn: '${name}' has uncommitted changes.\n` +
        `  Re-run with --auto to delete anyway.\n`
      )
      process.exit(1)
      return
    }

    try {
      fs.unlinkSync(localPath)
      output.success(`Reset '${name}' — local override removed. Global entry will be used.`)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      output.error({ code: 'DELETE_ERROR', message: `Failed to delete override: ${detail}`, exitCode: 1 })
      process.exit(1)
      return
    }
    process.exit(0)
  },
}
```

Register in `knowledgeCommand.builder`:

```typescript
.command(listSubcommand)
.command(showSubcommand)
.command(resetSubcommand)   // add this
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/cli/commands/knowledge.test.ts
```
Expected: all `reset` tests pass

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/knowledge.ts src/cli/commands/knowledge.test.ts
git commit -m "feat(knowledge): add scaffold knowledge reset subcommand"
```

---

## Task 6: `update` subcommand — target resolution + assembly

**Files:**
- Modify: `src/cli/commands/knowledge.ts`
- Modify: `src/cli/commands/knowledge.test.ts`
- Modify: `src/core/knowledge/knowledge-update-assembler.ts` (add `loadTemplate` helper)

The `update` subcommand: resolves `<target>` to one or more entry names, loads the global entry and any local override, loads project context, calls `KnowledgeUpdateAssembler.assemble()`, writes the prompt to stdout.

- [ ] **Step 1: Write failing tests for `update`**

**Important:** vitest hoists `vi.mock()` calls to the top of the file at compile time. The `meta-prompt-loader` mock below must be added to the top-level mock section (alongside the other `vi.mock` calls near the top of the file), **not** inside this describe block. Move it up.

Add to the top-level mock section of `knowledge.test.ts`:

```typescript
vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(),
}))
```

Then add to the top-level imports:

```typescript
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
```

Then add the describe block to `knowledge.test.ts`:

describe('scaffold knowledge update — target resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('resolves entry name directly', async () => {
    setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['api-design', '/fake/project/knowledge/api-design.md']]))
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      '---\nname: api-design\ndescription: desc\ntopics: []\n---\n# Body'
    )

    await runCli(['knowledge', 'update', 'api-design'])

    // Should write assembled prompt to stdout
    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls.flat().join('')
    expect(stdoutCalls).toContain('api-design')
    expect(stdoutCalls).toContain('# Body')
  })

  it('resolves step name to its knowledge-base entries', async () => {
    setupDefaults()
    const metaPromptMap = new Map([
      ['create-prd', {
        stepName: 'create-prd',
        filePath: '/fake/pipeline/create-prd.md',
        frontmatter: { knowledgeBase: ['prd-craft'] },
        body: '',
        sections: {},
      }],
    ])
    vi.mocked(discoverMetaPrompts).mockReturnValue(metaPromptMap as any)
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['prd-craft', '/fake/project/knowledge/prd-craft.md']]))
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      '---\nname: prd-craft\ndescription: desc\ntopics: []\n---\n# PRD Body'
    )

    await runCli(['knowledge', 'update', 'create-prd', '--step'])

    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls.flat().join('')
    expect(stdoutCalls).toContain('prd-craft')
  })

  it('exits 1 with error when target not found', async () => {
    setupDefaults()
    vi.mocked(buildIndex).mockReturnValue(new Map())
    vi.mocked(discoverMetaPrompts).mockReturnValue(new Map() as any)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)

    await runCli(['knowledge', 'update', 'nonexistent'])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('prefers entry name over step name when both match (without --step)', async () => {
    setupDefaults()
    // 'testing-strategy' exists as both an entry name and a step name
    const metaPromptMap = new Map([
      ['testing-strategy', {
        stepName: 'testing-strategy',
        frontmatter: { knowledgeBase: ['testing-strategy'] },
        body: '', sections: {}, filePath: '',
      }],
    ])
    vi.mocked(discoverMetaPrompts).mockReturnValue(metaPromptMap as any)
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['testing-strategy', '/fake/project/knowledge/testing-strategy.md']]))
    vi.mocked(fs.readFileSync).mockReturnValue(
      '---\nname: testing-strategy\ndescription: desc\ntopics: []\n---\n# Body'
    )
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.mocked(fs.existsSync).mockReturnValue(true)

    await runCli(['knowledge', 'update', 'testing-strategy'])

    // Should note ambiguity in stderr
    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.flat().join('')
    expect(stderrOutput).toContain('also a step')
  })
})
```

- [ ] **Step 2: Run to see failures**

```bash
npx vitest run src/cli/commands/knowledge.test.ts 2>&1 | grep -E "FAIL|update"
```

- [ ] **Step 3: Add a `loadTemplate` helper to the assembler module**

Add to `src/core/knowledge/knowledge-update-assembler.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Load the knowledge-update-template.md file from the same directory.
 */
export function loadTemplate(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const templatePath = path.join(__dirname, 'knowledge-update-template.md')
  return fs.readFileSync(templatePath, 'utf8')
}
```

- [ ] **Step 4: Implement `update` subcommand in `knowledge.ts`**

Add imports at the top of `knowledge.ts`:

```typescript
import { KnowledgeUpdateAssembler, loadTemplate } from '../../core/knowledge/knowledge-update-assembler.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
```

Add `update` subcommand before `knowledgeCommand`:

```typescript
interface UpdateArgs {
  target: string
  instructions?: string[]
  entry?: string
  step?: boolean
  auto?: boolean
  root?: string
  format?: string
  verbose?: boolean
}

const updateSubcommand: CommandModule<Record<string, unknown>, UpdateArgs> = {
  command: 'update <target> [instructions..]',
  describe: 'Generate a prompt to create or update a local knowledge override',
  builder: (yargs) =>
    yargs
      .positional('target', { type: 'string', demandOption: true })
      .positional('instructions', { type: 'string', array: true, default: [] })
      .option('entry', { type: 'string', description: 'Target a specific entry from a step\'s set' })
      .option('step', { type: 'boolean', default: false, description: 'Force step resolution' }) as Argv<UpdateArgs>,
  handler: async (argv) => {
    const projectRoot = getProjectRoot(argv)
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const { config } = loadConfig(projectRoot, [])
    const methodology = config?.methodology ?? 'deep'

    // Build knowledge index (global only for resolution; overrides checked per entry)
    const globalDir = path.join(projectRoot, 'knowledge')
    const globalIndex = buildIndex(globalDir)

    // Discover meta-prompts for step resolution
    const pipelineDir = path.join(projectRoot, 'pipeline')
    const metaPrompts = discoverMetaPrompts(pipelineDir)

    const target = argv.target
    const isEntryName = globalIndex.has(target)
    const isStepName = metaPrompts.has(target)
    const forceStep = argv.step === true

    // Resolve to list of entry names
    let entryNames: string[]

    if (forceStep || (!isEntryName && isStepName)) {
      // Step resolution path
      const mp = metaPrompts.get(target)!
      const stepEntries = mp.frontmatter.knowledgeBase ?? []
      if (stepEntries.length === 0) {
        output.error({
          code: 'NO_KB_ENTRIES',
          message: `Step '${target}' has no knowledge-base entries. Nothing to update.`,
          exitCode: 1,
        })
        process.exit(1)
        return
      }
      entryNames = stepEntries
      if (argv.entry) {
        if (!entryNames.includes(argv.entry)) {
          output.error({
            code: 'ENTRY_NOT_IN_STEP',
            message: `Entry '${argv.entry}' is not in step '${target}'. Valid entries: ${entryNames.join(', ')}`,
            exitCode: 1,
          })
          process.exit(1)
          return
        }
        entryNames = [argv.entry]
      }
    } else if (isEntryName) {
      // Entry name path
      entryNames = [target]
      if (isStepName && !forceStep) {
        process.stderr.write(
          `note: '${target}' is also a step name. Using entry '${target}' directly. Pass --step to resolve as a step.\n`
        )
      }
    } else {
      // Not found
      const allCandidates = [...globalIndex.keys(), ...metaPrompts.keys()]
      const suggestion = findClosestMatch(target, allCandidates, 3)
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : ''
      output.error({
        code: 'TARGET_NOT_FOUND',
        message: `'${target}' not found as an entry name or step name.${hint}`,
        exitCode: 1,
      })
      process.exit(1)
      return
    }

    // Scan for relevant project artifacts in docs/
    const docsDir = path.join(projectRoot, 'docs')
    const docArtifacts: string[] = []
    if (fs.existsSync(docsDir)) {
      function walkDocs(dir: string): void {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              walkDocs(fullPath)
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              // Check each target entry name
              for (const entryName of entryNames) {
                if (entry.name.includes(entryName)) {
                  try {
                    docArtifacts.push(fs.readFileSync(fullPath, 'utf8'))
                  } catch {
                    // skip
                  }
                }
              }
            }
          }
        } catch {
          // skip
        }
      }
      walkDocs(docsDir)
    }

    const template = loadTemplate()
    const assembler = new KnowledgeUpdateAssembler(template)
    const focusText = (argv.instructions as string[] | undefined)?.join(' ') ?? null

    // Assemble and output one prompt per entry
    for (const entryName of entryNames) {
      const globalFilePath = globalIndex.get(entryName)
      let globalBody = '(no global seed — this entry exists only locally)'

      if (globalFilePath) {
        try {
          const raw = fs.readFileSync(globalFilePath, 'utf8')
          // Strip frontmatter
          const lines = raw.split('\n')
          if (lines[0]?.trim() === '---') {
            const closeIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
            globalBody = closeIdx >= 0 ? lines.slice(closeIdx + 2).join('\n').trim() : raw
          } else {
            globalBody = raw
          }
        } catch {
          // leave default message
        }
      }

      // Check for existing local override
      const localDir = path.join(projectRoot, '.scaffold', 'knowledge')
      const localIndex = buildIndex(localDir)
      const localFilePath = localIndex.get(entryName)
      let localOverrideContent: string | null = null
      if (localFilePath) {
        try {
          localOverrideContent = fs.readFileSync(localFilePath, 'utf8')
        } catch {
          // treat as no override
        }
      }

      const prompt = assembler.assemble({
        name: entryName,
        globalBody,
        localOverrideContent,
        methodology,
        artifacts: docArtifacts,
        focus: focusText && focusText.trim() !== '' ? focusText : null,
      })

      process.stdout.write(prompt + '\n')
    }

    process.exit(0)
  },
}
```

Register in `knowledgeCommand.builder`:

```typescript
.command(listSubcommand)
.command(showSubcommand)
.command(resetSubcommand)
.command(updateSubcommand)   // add this
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/cli/commands/knowledge.test.ts
```
Expected: all `update` tests pass

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all tests pass, type-check clean

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/knowledge.ts src/cli/commands/knowledge.test.ts src/core/knowledge/knowledge-update-assembler.ts
git commit -m "feat(knowledge): add scaffold knowledge update subcommand with target resolution and prompt assembly"
```

---

## Task 7: E2E tests

**Files:**
- Create: `src/e2e/knowledge.test.ts`

These tests run the real CLI binary against a real temp directory. Look at the existing `src/e2e/` tests for the pattern (they use `execSync` or `spawnSync` with the built `dist/index.js`).

- [ ] **Step 1: Build the project**

```bash
npm run build
```

- [ ] **Step 2: Write E2E tests**

Create `src/e2e/knowledge.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const DIST = path.resolve(process.cwd(), 'dist/index.js')
const KNOWLEDGE_SRC = path.resolve(process.cwd(), 'knowledge')
const PIPELINE_SRC = path.resolve(process.cwd(), 'pipeline')

function scaffold(args: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(`node ${DIST} ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout: result, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    }
  }
}

function setupProject(dir: string) {
  // .scaffold dir
  const scaffoldDir = path.join(dir, '.scaffold')
  fs.mkdirSync(scaffoldDir, { recursive: true })
  fs.writeFileSync(
    path.join(scaffoldDir, 'config.yml'),
    'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n'
  )
  fs.writeFileSync(
    path.join(scaffoldDir, 'state.json'),
    JSON.stringify({ 'schema-version': 1, 'scaffold-version': '2.0.0', init_methodology: 'deep',
      config_methodology: 'deep', 'init-mode': 'greenfield', created: new Date().toISOString(),
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [] })
  )
  // Symlink knowledge and pipeline from source (read-only)
  fs.symlinkSync(KNOWLEDGE_SRC, path.join(dir, 'knowledge'))
  fs.symlinkSync(PIPELINE_SRC, path.join(dir, 'pipeline'))
}

describe('scaffold knowledge (E2E)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-knowledge-'))
    setupProject(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('list: exits 0 and prints global entries', () => {
    const { stdout, exitCode } = scaffold('knowledge list', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/api-design|testing-strategy|prd-craft/)
  })

  it('list: shows local override as "local override" when one exists', () => {
    const localKbDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localKbDir, { recursive: true })
    fs.writeFileSync(
      path.join(localKbDir, 'api-design.md'),
      '---\nname: api-design\ndescription: Custom GraphQL API design\ntopics: [api, graphql]\n---\n# Custom'
    )
    const { stdout, exitCode } = scaffold('knowledge list', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('local override')
    expect(stdout).toContain('api-design')
  })

  it('show: exits 0 and prints content for a known entry', () => {
    const { stdout, exitCode } = scaffold('knowledge show api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(50)
  })

  it('show: exits 1 for unknown entry', () => {
    const { exitCode } = scaffold('knowledge show totally-unknown-entry-xyz', tmpDir)
    expect(exitCode).toBe(1)
  })

  it('reset: exits 0 with "nothing to reset" when no local override', () => {
    const { stdout, exitCode } = scaffold('knowledge reset api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Nothing to reset')
  })

  it('reset: removes local override file', () => {
    const localKbDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localKbDir, { recursive: true })
    const overridePath = path.join(localKbDir, 'api-design.md')
    fs.writeFileSync(
      overridePath,
      '---\nname: api-design\ndescription: Custom\ntopics: []\n---\n# Custom'
    )
    const { exitCode } = scaffold('knowledge reset api-design --auto', tmpDir)
    expect(exitCode).toBe(0)
    expect(fs.existsSync(overridePath)).toBe(false)
  })

  it('update: exits 0 and writes assembled prompt to stdout', () => {
    const { stdout, exitCode } = scaffold('knowledge update api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('api-design')
    expect(stdout.length).toBeGreaterThan(100)
  })

  it('update: exits 1 for unknown target', () => {
    const { exitCode } = scaffold('knowledge update totally-unknown-target-xyz', tmpDir)
    expect(exitCode).toBe(1)
  })
})
```

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:e2e -- --reporter=verbose 2>&1 | grep -E "knowledge|PASS|FAIL"
```
Expected: all E2E tests pass

- [ ] **Step 4: Commit**

```bash
git add src/e2e/knowledge.test.ts
git commit -m "test(knowledge): add E2E tests for scaffold knowledge subcommands"
```

---

## Task 8: Claude Code slash command

**Files:**
- Create: `commands/knowledge.md`

- [ ] **Step 1: Look at an existing simple command for the frontmatter schema**

```bash
head -20 commands/status.md
```

- [ ] **Step 2: Create `commands/knowledge.md`**

```markdown
---
description: "Manage project-local knowledge base overrides"
long-description: "Create, view, and reset project-specific knowledge entries that override scaffold's global knowledge base during prompt assembly."
argument-hint: "<subcommand> [target] [instructions...]"
---

Manage project-local knowledge base overrides in `.scaffold/knowledge/`.

## Usage

Run the scaffold CLI knowledge subcommand with the arguments you provide:

```
scaffold knowledge $ARGUMENTS
```

**Subcommands:**

- `update <target> [instructions...]` — Generate a prompt for Claude to write a project-specific knowledge override. `<target>` can be an entry name (e.g. `api-design`) or a step name (e.g. `create-prd`). Everything after the target is treated as instructions to Claude.
- `list` — Show all entries with source (global or local override).
- `show <name>` — Print the effective content for an entry.
- `reset <name>` — Remove a local override (use `--auto` to bypass uncommitted-changes check).

**Examples:**

```
scaffold knowledge update api-design research GraphQL federation patterns
scaffold knowledge update create-prd focus on B2B SaaS with enterprise SSO
scaffold knowledge list
scaffold knowledge show testing-strategy
scaffold knowledge reset api-design --auto
```

## After This Step

When `update` is used:
1. The assembled prompt is written to stdout — paste it into a Claude Code session
2. Claude writes `.scaffold/knowledge/<name>.md` — review the output
3. Run `scaffold knowledge show <name>` to verify the effective content
4. Commit `.scaffold/knowledge/<name>.md` so your team shares it
5. Re-run the affected pipeline step with `scaffold run <step>` to see the enriched output

**Pipeline reference:** `/scaffold:prompt-pipeline`
```

- [ ] **Step 3: Validate frontmatter**

```bash
make validate
```
Expected: no frontmatter errors

- [ ] **Step 4: Commit**

```bash
git add commands/knowledge.md
git commit -m "feat(knowledge): add /scaffold:knowledge Claude Code slash command"
```

---

## Task 9: Final quality gate

- [ ] **Step 1: Run the complete check suite**

```bash
make check
```
Expected: lint, type-check, and tests all pass with no errors

- [ ] **Step 2: Run E2E suite one final time**

```bash
npm run test:e2e
```
Expected: all E2E tests pass

- [ ] **Step 3: Verify the command is registered and help text is correct**

```bash
node dist/index.js knowledge --help
node dist/index.js knowledge list --help
node dist/index.js knowledge update --help
```
Expected: help text shows all four subcommands and their options

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If anything unstaged:
git add -p
git commit -m "chore(knowledge): final cleanup"
```
