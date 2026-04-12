# Auto-Sync Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate manual `scaffold skill install` by auto-syncing project-local skills on every CLI invocation when the installed Scaffold version changes.

**Architecture:** Extract skill resolution logic into a shared `src/core/skills/sync.ts` module. The existing project-root middleware calls `syncSkillsIfNeeded(projectRoot)` after detecting the root. A `.scaffold-skill-version` marker file in each skill directory enables a fast-path no-op when versions match. `scaffold init` calls sync explicitly after build since the middleware can't handle it (ROOT_OPTIONAL_COMMANDS).

**Tech Stack:** TypeScript (vitest), ESM modules

**Spec:** `docs/superpowers/specs/2026-04-04-auto-sync-skills-design.md`

---

### Task 1: Create shared skill sync module with tests

**Files:**
- Create: `src/core/skills/sync.ts`
- Create: `src/core/skills/sync.test.ts`

- [ ] **Step 1: Write the failing tests for the sync module**

Create `src/core/skills/sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

// Mock getPackageRoot so we control template source location
vi.mock('../../utils/fs.js', () => ({
  getPackageRoot: vi.fn(() => '/mock-package-root'),
}))

import { syncSkillsIfNeeded, installAllSkills, getPackageVersion } from './sync.js'
import { getPackageRoot } from '../../utils/fs.js'

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-sync-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function seedSkillTemplates(packageRoot: string): void {
  for (const name of ['scaffold-runner', 'scaffold-pipeline']) {
    const skillDir = path.join(packageRoot, 'content', 'skills', name)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `# ${name}\nInstructions file: {{INSTRUCTIONS_FILE}}\n`,
      'utf8',
    )
  }
}

function writeVersionMarker(projectRoot: string, installDir: string, version: string): void {
  const dir = path.join(projectRoot, installDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '.scaffold-skill-version'), version, 'utf8')
}

describe('syncSkillsIfNeeded', () => {
  let projectRoot: string
  let packageRoot: string

  beforeEach(() => {
    projectRoot = makeTmpDir()
    packageRoot = makeTmpDir()
    vi.mocked(getPackageRoot).mockReturnValue(packageRoot)
    seedSkillTemplates(packageRoot)
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true })
    fs.rmSync(packageRoot, { recursive: true })
    vi.restoreAllMocks()
  })

  it('installs skills when no version marker exists', () => {
    syncSkillsIfNeeded(projectRoot)

    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/scaffold-runner/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/scaffold-runner/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/.scaffold-skill-version'))).toBe(true)
  })

  it('resolves {{INSTRUCTIONS_FILE}} to CLAUDE.md for .claude/skills/', () => {
    syncSkillsIfNeeded(projectRoot)

    const content = fs.readFileSync(
      path.join(projectRoot, '.claude/skills/scaffold-runner/SKILL.md'),
      'utf8',
    )
    expect(content).toContain('CLAUDE.md')
    expect(content).not.toContain('{{INSTRUCTIONS_FILE}}')
  })

  it('resolves {{INSTRUCTIONS_FILE}} to AGENTS.md for .agents/skills/', () => {
    syncSkillsIfNeeded(projectRoot)

    const content = fs.readFileSync(
      path.join(projectRoot, '.agents/skills/scaffold-runner/SKILL.md'),
      'utf8',
    )
    expect(content).toContain('AGENTS.md')
    expect(content).not.toContain('{{INSTRUCTIONS_FILE}}')
  })

  it('skips sync when version marker matches package version', () => {
    const version = getPackageVersion()
    writeVersionMarker(projectRoot, '.claude/skills', version)
    writeVersionMarker(projectRoot, '.agents/skills', version)

    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    syncSkillsIfNeeded(projectRoot)

    // Should not have written any files (fast path)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('re-syncs when version marker is stale', () => {
    writeVersionMarker(projectRoot, '.claude/skills', '2.0.0')
    writeVersionMarker(projectRoot, '.agents/skills', '2.0.0')

    syncSkillsIfNeeded(projectRoot)

    const marker = fs.readFileSync(
      path.join(projectRoot, '.claude/skills/.scaffold-skill-version'),
      'utf8',
    ).trim()
    expect(marker).toBe(getPackageVersion())
  })

  it('skips silently when template source is missing', () => {
    // Remove templates
    fs.rmSync(path.join(packageRoot, 'content', 'skills'), { recursive: true })

    // Should not throw
    expect(() => syncSkillsIfNeeded(projectRoot)).not.toThrow()
  })
})

describe('installAllSkills', () => {
  let projectRoot: string
  let packageRoot: string

  beforeEach(() => {
    projectRoot = makeTmpDir()
    packageRoot = makeTmpDir()
    vi.mocked(getPackageRoot).mockReturnValue(packageRoot)
    seedSkillTemplates(packageRoot)
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true })
    fs.rmSync(packageRoot, { recursive: true })
    vi.restoreAllMocks()
  })

  it('installs all skills to both target directories', () => {
    const result = installAllSkills(projectRoot)

    expect(result.installed).toBe(2)
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/scaffold-runner/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/scaffold-pipeline/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/scaffold-runner/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/scaffold-pipeline/SKILL.md'))).toBe(true)
  })

  it('writes version markers', () => {
    installAllSkills(projectRoot)

    const claudeMarker = fs.readFileSync(
      path.join(projectRoot, '.claude/skills/.scaffold-skill-version'),
      'utf8',
    ).trim()
    const agentsMarker = fs.readFileSync(
      path.join(projectRoot, '.agents/skills/.scaffold-skill-version'),
      'utf8',
    ).trim()
    expect(claudeMarker).toBe(getPackageVersion())
    expect(agentsMarker).toBe(getPackageVersion())
  })

  it('overwrites existing skills when force is true', () => {
    // Install once
    installAllSkills(projectRoot)

    // Corrupt a skill file
    fs.writeFileSync(
      path.join(projectRoot, '.claude/skills/scaffold-runner/SKILL.md'),
      'CORRUPTED',
      'utf8',
    )

    // Reinstall with force
    installAllSkills(projectRoot, { force: true })

    const content = fs.readFileSync(
      path.join(projectRoot, '.claude/skills/scaffold-runner/SKILL.md'),
      'utf8',
    )
    expect(content).not.toBe('CORRUPTED')
    expect(content).toContain('CLAUDE.md')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/core/skills/sync.test.ts
```

Expected: FAIL — module `./sync.js` not found.

- [ ] **Step 3: Implement the sync module**

Create `src/core/skills/sync.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackageRoot } from '../../utils/fs.js'

export interface SkillTarget {
  installDir: '.claude/skills' | '.agents/skills'
  label: string
  templateVars: Record<string, string>
}

export interface SkillDefinition {
  name: string
  description: string
}

export const SKILL_TARGETS: SkillTarget[] = [
  {
    installDir: '.claude/skills',
    label: 'Claude Code',
    templateVars: { INSTRUCTIONS_FILE: 'CLAUDE.md' },
  },
  {
    installDir: '.agents/skills',
    label: 'shared agents',
    templateVars: { INSTRUCTIONS_FILE: 'AGENTS.md' },
  },
]

export const INSTALLABLE_SKILLS: SkillDefinition[] = [
  {
    name: 'scaffold-runner',
    description: 'Interactive CLI wrapper that surfaces decision points before execution',
  },
  {
    name: 'scaffold-pipeline',
    description: 'Static reference for pipeline ordering, dependencies, and phase structure',
  },
]

const VERSION_MARKER = '.scaffold-skill-version'

/** Resolve {{KEY}} template markers in skill content. */
export function resolveSkillTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

/** Read the installed Scaffold package version. */
export function getPackageVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  // Both dist/core/skills/sync.js and src/core/skills/sync.ts are 3 levels deep
  const candidates = [
    path.resolve(__dirname, '../../../package.json'),
  ]
  for (const pkgPath of candidates) {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    }
  }
  return 'unknown'
}

/** Get the path to skill templates in the package. */
export function getSkillTemplateDir(): string {
  return path.join(getPackageRoot(), 'content', 'skills')
}

function readVersionMarker(dir: string): string | null {
  const markerPath = path.join(dir, VERSION_MARKER)
  if (!fs.existsSync(markerPath)) return null
  return fs.readFileSync(markerPath, 'utf8').trim()
}

function writeVersionMarker(dir: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, VERSION_MARKER), version + '\n', 'utf8')
}

/**
 * Check if project-local skills are current. If not, re-resolve templates and write.
 * Fast path: 1 file read per target when versions match.
 * Called from project-root middleware on every CLI command.
 */
export function syncSkillsIfNeeded(projectRoot: string): void {
  const currentVersion = getPackageVersion()
  if (currentVersion === 'unknown') return

  // Fast path: check if all targets are current
  const allCurrent = SKILL_TARGETS.every(target => {
    const installedVersion = readVersionMarker(path.join(projectRoot, target.installDir))
    return installedVersion === currentVersion
  })

  if (allCurrent) return

  // Sync needed — resolve and write
  installAllSkills(projectRoot)
}

export interface InstallResult {
  installed: number
  errors: string[]
}

/**
 * Install all skills to all target directories, resolving templates.
 * Used by both auto-sync and `scaffold skill install`.
 */
export function installAllSkills(
  projectRoot: string,
  options?: { force?: boolean },
): InstallResult {
  const templateDir = getSkillTemplateDir()
  const currentVersion = getPackageVersion()
  const result: InstallResult = { installed: 0, errors: [] }

  if (!fs.existsSync(templateDir)) return result

  for (const skill of INSTALLABLE_SKILLS) {
    const templatePath = path.join(templateDir, skill.name, 'SKILL.md')
    if (!fs.existsSync(templatePath)) {
      result.errors.push(`${skill.name}: template not found at ${templatePath}`)
      continue
    }

    const template = fs.readFileSync(templatePath, 'utf8')
    let installedAny = false

    for (const target of SKILL_TARGETS) {
      const destDir = path.join(projectRoot, target.installDir, skill.name)
      const destPath = path.join(destDir, 'SKILL.md')

      if (fs.existsSync(destPath) && !options?.force) {
        // Check if this target's version is current — if so, skip
        const installedVersion = readVersionMarker(path.join(projectRoot, target.installDir))
        if (installedVersion === currentVersion) continue
      }

      // Clean up old flat-file format if present
      if (target.installDir === '.claude/skills') {
        const oldFlatPath = path.join(projectRoot, '.claude', 'skills', `${skill.name}.md`)
        if (fs.existsSync(oldFlatPath)) {
          fs.unlinkSync(oldFlatPath)
        }
      }

      fs.mkdirSync(destDir, { recursive: true })
      const resolved = resolveSkillTemplate(template, target.templateVars)
      fs.writeFileSync(destPath, resolved, 'utf8')
      installedAny = true
    }

    if (installedAny) result.installed++
  }

  // Write version markers
  for (const target of SKILL_TARGETS) {
    writeVersionMarker(path.join(projectRoot, target.installDir), currentVersion)
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/core/skills/sync.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/skills/sync.ts src/core/skills/sync.test.ts
git commit -m "feat: add shared skill sync module with version-based auto-update

Extracts skill resolution logic into src/core/skills/sync.ts.
syncSkillsIfNeeded() checks .scaffold-skill-version marker and
silently updates skills when the package version changes."
```

---

### Task 2: Wire sync into project-root middleware

**Files:**
- Modify: `src/cli/middleware/project-root.ts`
- Modify: `src/cli/middleware/project-root.test.ts`

- [ ] **Step 1: Write the failing test for middleware sync**

Add to `src/cli/middleware/project-root.test.ts`, after the existing tests:

```typescript
// At the top, add mock for sync module
vi.mock('../../core/skills/sync.js', () => ({
  syncSkillsIfNeeded: vi.fn(),
}))

import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
```

Add this test inside the `createProjectRootMiddleware` describe block:

```typescript
  it('calls syncSkillsIfNeeded when project root is found', () => {
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['run'] }
    middleware(argv)

    expect(syncSkillsIfNeeded).toHaveBeenCalledWith(tmpDir)
  })

  it('does not call syncSkillsIfNeeded when no project root found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['init'] }

    expect(() => middleware(argv)).not.toThrow()
    expect(syncSkillsIfNeeded).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/cli/middleware/project-root.test.ts
```

Expected: FAIL — syncSkillsIfNeeded not called (not wired in yet).

- [ ] **Step 3: Add sync call to middleware**

In `src/cli/middleware/project-root.ts`, add import at top:

```typescript
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
```

In the `createProjectRootMiddleware` function, after `argv['detectedRoot'] = found ?? undefined`, add:

```typescript
    // Auto-sync project-local skills when version changes
    if (argv['detectedRoot']) {
      try {
        syncSkillsIfNeeded(argv['detectedRoot'] as string)
      } catch {
        // Skill sync is best-effort — never block CLI commands
      }
    }
```

Place this BEFORE the `ROOT_OPTIONAL_COMMANDS` check (so sync runs for all commands with a detected root, but doesn't run when there's no root).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cli/middleware/project-root.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/middleware/project-root.ts src/cli/middleware/project-root.test.ts
git commit -m "feat: wire skill auto-sync into project-root middleware

Every CLI command with a detected project root now checks if
project-local skills are current and silently updates them."
```

---

### Task 3: Refactor skill command to use shared module

**Files:**
- Modify: `src/cli/commands/skill.ts`
- Modify: `src/cli/commands/skill.test.ts`

- [ ] **Step 1: Refactor skill.ts to import from shared module**

Replace the local type definitions, constants, and utility functions in `src/cli/commands/skill.ts` with imports from the shared module. The file should import from `../../core/skills/sync.js`:

```typescript
import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import {
  SKILL_TARGETS,
  INSTALLABLE_SKILLS,
  installAllSkills,
  getSkillTemplateDir,
} from '../../core/skills/sync.js'
```

Remove from skill.ts:
- `SkillTarget` interface (now in sync.ts)
- `SkillDefinition` interface (now in sync.ts)
- `SKILL_TARGETS` constant (now in sync.ts)
- `INSTALLABLE_SKILLS` constant (now in sync.ts)
- `resolveSkillTemplate` function (now in sync.ts)
- `getSkillTemplateDir` function (now in sync.ts)

Keep in skill.ts:
- `SkillArgs` interface (CLI-specific)
- `SkillTargetState` interface (used for list/remove display logic)
- `getSkillSourcePath`, `getSkillDestDir`, `getSkillDestPath`, `buildTargetStates` (use `getSkillTemplateDir()` from sync)
- The command handler (install/list/remove)

Update the `install` case to use `installAllSkills`:

```typescript
    case 'install': {
      const result = installAllSkills(projectRoot, { force: argv.force })

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          output.error(err)
        }
      }

      if (result.installed > 0) {
        output.info(
          `\n${result.installed} skill(s) installed. Start a new Claude Code or Gemini session to activate.`,
        )
      } else if (result.errors.length > 0) {
        output.warn('\nNo skills installed due to source errors.')
      } else {
        output.info('\nAll skills already installed.')
      }
      break
    }
```

Update `getSkillSourcePath` to use the shared `getSkillTemplateDir`:

```typescript
function getSkillSourcePath(skillName: string): string {
  return path.join(getSkillTemplateDir(), skillName, 'SKILL.md')
}
```

- [ ] **Step 2: Update skill.test.ts mock to use shared module**

In `src/cli/commands/skill.test.ts`, update the mock to point at the shared module instead of local `../../utils/fs.js`:

Add mock for the sync module:
```typescript
vi.mock('../../core/skills/sync.js', async () => {
  const actual = await vi.importActual('../../core/skills/sync.js')
  return {
    ...actual,
    getSkillTemplateDir: vi.fn(() => '/mock-package-root/content/skills'),
  }
})
```

Update any test that directly references the old internal functions to use the shared module exports.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run src/cli/commands/skill.test.ts
npx vitest run src/core/skills/sync.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/skill.ts src/cli/commands/skill.test.ts
git commit -m "refactor: skill command now uses shared sync module

scaffold skill install delegates to installAllSkills() from
src/core/skills/sync.ts. Removes duplicated type definitions,
constants, and template resolution logic."
```

---

### Task 4: Add skill sync to scaffold init

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/commands/init.test.ts`

- [ ] **Step 1: Add sync call to init handler**

In `src/cli/commands/init.ts`, add import:

```typescript
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
```

After the `runBuild()` call succeeds (after line 67, before the JSON output), add:

```typescript
    // Install project-local skills (middleware can't handle this
    // because init is ROOT_OPTIONAL and .scaffold/ doesn't exist when middleware runs)
    syncSkillsIfNeeded(projectRoot)
```

- [ ] **Step 2: Write a test verifying init installs skills**

In `src/cli/commands/init.test.ts`, add a mock for the sync module and verify it's called. Find the appropriate test section and add:

```typescript
vi.mock('../../core/skills/sync.js', () => ({
  syncSkillsIfNeeded: vi.fn(),
}))

import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
```

Then in a test that exercises a successful init flow, add:

```typescript
expect(syncSkillsIfNeeded).toHaveBeenCalledWith(projectRoot)
```

The exact test location depends on the existing test structure — find a test that exercises the full init → build → success path and add the assertion there.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/cli/commands/init.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts src/cli/commands/init.test.ts
git commit -m "feat: scaffold init now auto-installs project-local skills

After runBuild() completes, init calls syncSkillsIfNeeded() so
the user's first experience has skills ready without manual install."
```

---

### Task 5: Full verification

- [ ] **Step 1: Run full TypeScript check**

```bash
npm run type-check && npm test
```

Expected: Type-check clean, all tests pass.

- [ ] **Step 2: Run full quality gates**

```bash
make check-all
```

Expected: All gates pass.

- [ ] **Step 3: Integration test — verify auto-sync works end-to-end**

```bash
# Create a temp project
cd /tmp && mkdir scaffold-sync-test && cd scaffold-sync-test
scaffold init --auto --methodology mvp

# Verify skills were installed by init
cat .claude/skills/scaffold-runner/SKILL.md | head -3
cat .agents/skills/scaffold-runner/SKILL.md | head -3
cat .claude/skills/.scaffold-skill-version
cat .agents/skills/.scaffold-skill-version

# Simulate version upgrade by corrupting the marker
echo "0.0.0" > .claude/skills/.scaffold-skill-version
echo "0.0.0" > .agents/skills/.scaffold-skill-version

# Run any CLI command — should auto-sync
scaffold status

# Verify markers are updated
cat .claude/skills/.scaffold-skill-version

# Cleanup
cd / && rm -rf /tmp/scaffold-sync-test
```

- [ ] **Step 4: Commit any fixes from integration testing**

If issues found, fix and commit.

```bash
git add -A
git commit -m "fix: address issues found during auto-sync integration testing"
```
