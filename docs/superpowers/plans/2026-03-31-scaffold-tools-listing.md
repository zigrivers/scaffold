# Scaffold Tools Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `scaffold list --section tools` to the CLI and update scaffold-runner to call it and render an enriched two-section display.

**Architecture:** The CLI reads tool metadata from two source directories (`tools/` for utility tools, `pipeline/build/` for build steps) by parsing frontmatter from each `.md` file using the existing `parseFrontmatter()` function. Results are grouped and rendered. The skill calls `scaffold list --section tools --format json` and adds usage context.

**Tech Stack:** TypeScript, Node.js fs/path, js-yaml (via existing `parseFrontmatter`), vitest

---

## File Map

| File | Change |
|------|--------|
| `src/cli/commands/list.ts` | Add `tools` section: `ToolEntry` interface, `scanTools()` helper, handler branch for compact/verbose/JSON output |
| `src/cli/commands/list.test.ts` | Add test fixtures (fake tool files in tmp dirs) and 5 new test cases |
| `skills/scaffold-runner/SKILL.md` | Fix nav table entry (`--tools` → `--section tools --format json`) + fix "Accessing Tools" comment + add Tool Listing behavior block |

---

### Task 1: CLI — compact text output for `--section tools`

**Files:**
- Modify: `src/cli/commands/list.test.ts`
- Modify: `src/cli/commands/list.ts`

- [ ] **Step 1: Add fixture helpers and write the failing compact test**

Open `src/cli/commands/list.test.ts`. Add a new fixture builder after `makeProjectRoot` and a new `describe` block:

```typescript
const fakeBuildStep = `---
name: fake-build-step
description: A fake stateless build step
phase: build
order: 1510
dependencies: []
outputs: []
conditional: null
stateless: true
category: pipeline
---

Content.
`

const fakeUtilTool = `---
name: fake-util-tool
description: A fake utility tool
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
argument-hint: "<foo|bar>"
---

Content.
`

function makeProjectRootWithTools(): string {
  const root = makeTmpDir()
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  // pipeline/build/ — stateless build steps
  fs.mkdirSync(path.join(root, 'pipeline', 'build'), { recursive: true })
  fs.writeFileSync(path.join(root, 'pipeline', 'build', 'fake-build-step.md'), fakeBuildStep, 'utf8')
  // tools/ — utility tools
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tools', 'fake-util-tool.md'), fakeUtilTool, 'utf8')
  return root
}
```

Then add this describe block (still in `list.test.ts`):

```typescript
describe('list command — tools section', () => {
  let stdoutWrite: MockInstance
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  it('--section tools shows Build Tools and Utility Tools sections', async () => {
    const root = makeProjectRootWithTools()

    await runListHandler({ root, section: 'tools', format: undefined, auto: false, verbose: false })

    const written = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    expect(written).toContain('Build Tools')
    expect(written).toContain('fake-build-step')
    expect(written).toContain('A fake stateless build step')
    expect(written).toContain('Utility Tools')
    expect(written).toContain('fake-util-tool')
    expect(written).toContain('A fake utility tool')
    expect(exitSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -30
```

Expected: FAIL — `section` choice validation error or "tools section not handled".

- [ ] **Step 3: Implement `--section tools` in `list.ts`**

Open `src/cli/commands/list.ts`. Apply these changes:

**Add imports** at the top (after the existing imports):

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from '../../project/frontmatter.js'
import { getPackageToolsDir, getPackagePipelineDir } from '../../utils/fs.js'
```

**Add `ToolEntry` interface and `scanTools` helper** before the `listCommand` const:

```typescript
interface ToolEntry {
  name: string
  description: string
  argumentHint: string | null
}

function scanTools(projectRoot: string | undefined): { build: ToolEntry[]; utility: ToolEntry[] } {
  const toolsDir = getPackageToolsDir(projectRoot)
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const buildDir = path.join(pipelineDir, 'build')

  const utility: ToolEntry[] = []
  const buildRaw: Array<ToolEntry & { order: number }> = []

  // Scan tools/ for category: tool
  try {
    for (const file of fs.readdirSync(toolsDir).filter(f => f.endsWith('.md')).sort()) {
      try {
        const fm = parseFrontmatter(path.join(toolsDir, file))
        if (fm.category !== 'tool') continue
        utility.push({
          name: fm.name,
          description: fm.description,
          argumentHint: typeof fm['argument-hint'] === 'string' ? fm['argument-hint'] : null,
        })
      } catch { /* skip unparseable files */ }
    }
  } catch { /* toolsDir not found */ }

  // Scan pipeline/build/ for stateless: true, sort by order
  try {
    for (const file of fs.readdirSync(buildDir).filter(f => f.endsWith('.md'))) {
      try {
        const fm = parseFrontmatter(path.join(buildDir, file))
        if (!fm.stateless) continue
        buildRaw.push({
          name: fm.name,
          description: fm.description,
          argumentHint: typeof fm['argument-hint'] === 'string' ? fm['argument-hint'] : null,
          order: fm.order ?? 9999,
        })
      } catch { /* skip unparseable files */ }
    }
  } catch { /* buildDir not found */ }

  buildRaw.sort((a, b) => a.order - b.order)
  const build = buildRaw.map(({ name, description, argumentHint }) => ({ name, description, argumentHint }))

  return { build, utility }
}
```

**Update the `ListArgs` interface** — add `verbose` if not already present (it already is):

```typescript
interface ListArgs {
  section?: 'methodologies' | 'platforms' | 'tools'
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}
```

**Update the builder** to add `tools` to the section choices:

```typescript
builder: (yargs) => {
  return yargs.option('section', {
    type: 'string',
    choices: ['methodologies', 'platforms', 'tools'] as const,
    description: 'Filter to show only this section',
  })
},
```

**Add tools rendering in the handler**, inside the `else` block (interactive output), after the platforms block:

```typescript
if (!section || section === 'tools') {
  const { build, utility } = scanTools(projectRoot ?? undefined)
  const nameWidth = Math.max(
    ...build.map(t => t.name.length),
    ...utility.map(t => t.name.length),
    12,
  ) + 2

  output.info('Build Tools:')
  if (build.length === 0) {
    output.info('  (none found)')
  }
  for (const t of build) {
    output.info(`  ${t.name.padEnd(nameWidth)}${t.description}`)
  }

  output.info('Utility Tools:')
  if (utility.length === 0) {
    output.info('  (none found)')
  }
  for (const t of utility) {
    output.info(`  ${t.name.padEnd(nameWidth)}${t.description}`)
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -30
```

Expected: all tests pass, including the new `--section tools shows Build Tools and Utility Tools sections` test.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/list.ts src/cli/commands/list.test.ts
git commit -m "feat: add scaffold list --section tools with compact text output"
```

---

### Task 2: CLI — verbose output (argument-hint column)

**Files:**
- Modify: `src/cli/commands/list.test.ts`
- Modify: `src/cli/commands/list.ts`

- [ ] **Step 1: Write the failing verbose test**

Add inside the `describe('list command — tools section')` block in `list.test.ts`:

```typescript
it('--section tools --verbose shows argument-hint column', async () => {
  const root = makeProjectRootWithTools()

  await runListHandler({ root, section: 'tools', format: undefined, auto: false, verbose: true })

  const written = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
  expect(written).toContain('<foo|bar>')
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -20
```

Expected: FAIL — argument hint not shown yet.

- [ ] **Step 3: Add verbose rendering to the tools block in `list.ts`**

Replace the tools rendering block added in Task 1 with this version (adds `argumentHint` column when `argv.verbose` is true):

```typescript
if (!section || section === 'tools') {
  const { build, utility } = scanTools(projectRoot ?? undefined)
  const nameWidth = Math.max(
    ...build.map(t => t.name.length),
    ...utility.map(t => t.name.length),
    12,
  ) + 2
  const descWidth = argv.verbose
    ? Math.max(
      ...build.map(t => t.description.length),
      ...utility.map(t => t.description.length),
      20,
    ) + 2
    : 0

  const formatEntry = (t: ToolEntry): string => {
    const base = `  ${t.name.padEnd(nameWidth)}${t.description}`
    if (argv.verbose && t.argumentHint) {
      return `${base.padEnd(nameWidth + descWidth + 2)}  ${t.argumentHint}`
    }
    return base
  }

  output.info('Build Tools:')
  if (build.length === 0) {
    output.info('  (none found)')
  }
  for (const t of build) {
    output.info(formatEntry(t))
  }

  output.info('Utility Tools:')
  if (utility.length === 0) {
    output.info('  (none found)')
  }
  for (const t of utility) {
    output.info(formatEntry(t))
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/list.ts src/cli/commands/list.test.ts
git commit -m "feat: add --verbose flag to scaffold list --section tools (shows argument hints)"
```

---

### Task 3: CLI — JSON output for tools section

**Files:**
- Modify: `src/cli/commands/list.test.ts`
- Modify: `src/cli/commands/list.ts`

- [ ] **Step 1: Write the failing JSON test**

Add inside the `describe('list command — tools section')` block in `list.test.ts`:

```typescript
it('--section tools --format json returns structured tools data', async () => {
  const root = makeProjectRootWithTools()

  await runListHandler({ root, section: 'tools', format: 'json', auto: false, verbose: false })

  const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
  const parsed = JSON.parse(allStdout) as {
    success: boolean
    data: { tools: { build: Array<{ name: string; description: string; argumentHint: string | null }>; utility: Array<{ name: string; description: string; argumentHint: string | null }> } }
  }
  expect(parsed.success).toBe(true)
  expect(Array.isArray(parsed.data.tools.build)).toBe(true)
  expect(Array.isArray(parsed.data.tools.utility)).toBe(true)
  const buildNames = parsed.data.tools.build.map(t => t.name)
  expect(buildNames).toContain('fake-build-step')
  const utilNames = parsed.data.tools.utility.map(t => t.name)
  expect(utilNames).toContain('fake-util-tool')
  expect(parsed.data.tools.utility.find(t => t.name === 'fake-util-tool')?.argumentHint).toBe('<foo|bar>')
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -20
```

Expected: FAIL — `data.tools` is undefined in the JSON output.

- [ ] **Step 3: Add tools to the JSON branch in `list.ts`**

In the `if (outputMode === 'json')` block, add tools alongside methodologies and platforms:

```typescript
if (outputMode === 'json') {
  const result: Record<string, unknown> = {}
  if (!section || section === 'methodologies') {
    result['methodologies'] = [...presets.entries()].map(([name, p]) => ({
      name,
      depth: p.default_depth,
      description: p.description,
    }))
  }
  if (!section || section === 'platforms') {
    result['platforms'] = []
  }
  if (!section || section === 'tools') {
    const { build, utility } = scanTools(projectRoot ?? undefined)
    result['tools'] = { build, utility }
  }
  output.result(result)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/cli/commands/list.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
make check 2>&1 | tail -30
```

Expected: all quality gates pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/list.ts src/cli/commands/list.test.ts
git commit -m "feat: add JSON output for scaffold list --section tools"
```

---

### Task 4: Update scaffold-runner skill

**Files:**
- Modify: `skills/scaffold-runner/SKILL.md`

- [ ] **Step 1: Fix the navigation table entry**

In `skills/scaffold-runner/SKILL.md`, find this line in the navigation table (around line 220):

```
| "What tools are available?" | `scaffold list --tools` |
```

Replace with:

```
| "What tools are available?" | Run `scaffold list --section tools --format json`, render as two-section grouped display — see [Tool Listing](#tool-listing) |
```

- [ ] **Step 2: Fix the "Accessing Tools" comment in the Tool Execution section**

Find this block (around line 169):

```
### Accessing Tools

- `scaffold run <tool-name>` — run a specific tool
- `scaffold list --tools` — show available tools (when implemented)
```

Replace with:

```
### Accessing Tools

- `scaffold run <tool-name>` — run a specific tool
- `scaffold list --section tools` — show available tools (compact)
- `scaffold list --section tools --verbose` — show with argument hints
- `scaffold list --section tools --format json` — machine-readable output
```

- [ ] **Step 3: Add the Tool Listing behavior block**

Add a new section after the `## Tool Execution` section (after the "Accessing Tools" block, before `## Session Preferences`):

```markdown
## Tool Listing

When the user asks "what tools are available?", "what can I build?", or "show me the tools":

1. Run `scaffold list --section tools --format json`
2. Parse the JSON: `data.tools.build` (6 build phase steps) and `data.tools.utility` (utility tools)
3. Render as two grouped sections:

**Build Phase (Phase 15)**
> These are stateless pipeline steps — they appear in `scaffold next` once Phase 14 is complete and can be run repeatedly.

| Command | When to Use |
|---------|-------------|
| `scaffold run single-agent-start` | Start the autonomous TDD implementation loop — Claude picks up tasks and builds |
| `scaffold run single-agent-resume` | Resume where you left off after closing Claude Code |
| `scaffold run multi-agent-start` | Start parallel implementation with multiple agents in worktrees |
| `scaffold run multi-agent-resume` | Resume parallel agent work after a break |
| `scaffold run quick-task` | Create a focused task for a bug fix, refactor, or small improvement |
| `scaffold run new-enhancement` | Add a new feature to an already-scaffolded project |

**Utility Tools**
> These are orthogonal to the pipeline — usable at any time, not tied to pipeline state.

| Command | When to Use |
|---------|-------------|
| `scaffold run version-bump` | Mark a milestone with a version number without the full release ceremony |
| `scaffold run release` | Ship a new version — changelog, Git tag, and GitHub release. Supports `--dry-run`, `current`, and `rollback` |
| `scaffold run version` | Show the current scaffold version |
| `scaffold run update` | Update scaffold to the latest version |
| `scaffold run dashboard` | Open a visual progress dashboard in your browser |
| `scaffold run prompt-pipeline` | Print the full pipeline reference table |
| `scaffold run review-pr` | Run all 3 code review channels (Codex CLI, Gemini CLI, Superpowers) on a PR |
| `scaffold run post-implementation-review` | Full 3-channel codebase review after an AI agent completes all tasks |
| `scaffold run session-analyzer` | Analyze Claude Code session logs for patterns and insights |

**Display rules:**
- The tool list comes from CLI output (always complete and up-to-date)
- The "When to Use" column comes from the table above (stable prose)
- If the CLI returns a tool not in the table above, display it using its `description` field from the CLI output — graceful degradation
- For verbose detail (`--verbose`), call `scaffold list --section tools --verbose --format json` and add an Arguments column using the `argumentHint` values
```

- [ ] **Step 4: Run make check to verify nothing is broken**

```bash
make check 2>&1 | tail -20
```

Expected: all quality gates pass (lint, validate, test).

- [ ] **Step 5: Commit**

```bash
git add skills/scaffold-runner/SKILL.md
git commit -m "feat: update scaffold-runner to use scaffold list --section tools for tool listing"
```
