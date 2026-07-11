# Nibble Agent-Workflow Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port nibble's hardened parallel-agent process into Scaffold so generated projects get an `agent-ops` script bundle (worktree + Docker-staging machinery), a `/work-beads` ship-loop skill, and updated pipeline prompts/knowledge/presets.

**Architecture:** Three layers per the approved spec (`docs/superpowers/specs/2026-07-10-nibble-agent-workflow-port-design.md`): (1) a versioned template bundle at `content/assets/agent-ops/` installed by a new `scaffold agent-ops` CLI command; (2) a `work-beads` canonical skill fanned out through the existing skill machinery; (3) edits to pipeline prompts, knowledge entries, and methodology presets. Wave 1 (Tasks 1–6) must merge before Wave 3's staging step is end-to-end runnable; Waves 2 and 3 are otherwise independent of each other.

**Tech Stack:** TypeScript (strict, ESM, yargs CLI, vitest), bash templates (bats-core tests), js-yaml, markdown pipeline content validated by `make validate` / `make eval`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-nibble-agent-workflow-port-design.md` — decisions D1–D8 are binding; consult Appendix A there for nibble source paths.
- Nibble sources live at `/Users/kenallred/Developer/nibble` (readable on this machine). Port scripts by copying the source and applying each task's transformation table — do NOT rewrite shell logic from memory.
- Shell templates are named `*.sh.tmpl` / `*.mk.tmpl` (so `make lint` ShellCheck, which targets `*.sh`, skips them); the installer strips `.tmpl` on install and chmods `0755` for scripts.
- Placeholder syntax is `{{KEY}}` resolved by `resolveSkillTemplate()` from `src/core/skills/sync.ts` (reuse it; do not write a second template engine).
- YAML parsing uses `js-yaml` (`import yaml from 'js-yaml'`) — the same library `src/core/assembly/preset-loader.ts` uses. Do not add the `yaml` package to new code.
- Branch/commit conventions in generated content follow D7: `<type>/<desc>` branches, `agent/<name>` worktree branches, bead IDs only in commit/PR **bodies** (`Closes <id>`), never in branch names or commit subjects.
- Generated projects get NO `.github/workflows/` (D4). Scaffold's own CI is unaffected.
- Every new pipeline step must appear in all three presets (`content/methodology/{mvp,deep,custom-defaults}.yml`) — `tests/evals/preset-exhaustiveness.bats` enforces this.
- Run `make check-all` before any PR; commit after every green task.
- New knowledge entries need freshness frontmatter (`volatility`, `sources`, `last-reviewed`) to pass `make validate-knowledge`.
- Work on a feature branch off `origin/main`; one PR per wave is acceptable, or one PR for the whole plan if executed by a single agent.

---

## Wave 1 — `agent-ops` bundle + installer

### Task 1: Agent-ops config loader

**Files:**
- Create: `src/core/agent-ops/config.ts`
- Test: `src/core/agent-ops/config.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `AgentOpsConfig`, `AgentOpsService`, `loadAgentOpsConfig(projectRoot: string): AgentOpsConfig`, `defaultAgentOpsConfig(projectRoot: string): AgentOpsConfig`, `AGENT_OPS_CONFIG_PATH = '.scaffold/agent-ops.yaml'`. Task 2 and Task 3 import all of these.

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/agent-ops/config.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultAgentOpsConfig, loadAgentOpsConfig } from './config.js'

function tmpProject(yamlBody?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-'))
  if (yamlBody !== undefined) {
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.scaffold', 'agent-ops.yaml'), yamlBody)
  }
  return dir
}

describe('loadAgentOpsConfig', () => {
  it('returns defaults derived from the directory name when no config exists', () => {
    const dir = tmpProject()
    const cfg = loadAgentOpsConfig(dir)
    expect(cfg.project_name).toBe(path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    expect(cfg.critical_labels).toEqual([])
    expect(cfg.worktree_setup_commands).toEqual([])
    expect(cfg.docker).toBeUndefined()
  })

  it('parses a full config', () => {
    const dir = tmpProject(`
project_name: myapp
critical_labels: [auth]
worktree_setup_commands: ["npm ci"]
docker:
  context: orbstack
  services:
    - name: postgres
      band: 20000
    - name: api
      band: 21000
  shared_stack:
    postgres: 55432
    api: 8001
`)
    const cfg = loadAgentOpsConfig(dir)
    expect(cfg.project_name).toBe('myapp')
    expect(cfg.docker?.services).toEqual([
      { name: 'postgres', band: 20000 },
      { name: 'api', band: 21000 },
    ])
    expect(cfg.docker?.shared_stack).toEqual({ postgres: 55432, api: 8001 })
  })

  it('rejects invalid service names and bands', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  context: orbstack
  services:
    - name: "has space"
      band: 123
  shared_stack: {}
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/service/i)
  })

  it('rejects duplicate bands', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  context: orbstack
  services:
    - name: a
      band: 20000
    - name: b
      band: 20000
  shared_stack: {}
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/band/i)
  })
})

describe('defaultAgentOpsConfig', () => {
  it('sanitizes the project name', () => {
    expect(defaultAgentOpsConfig('/tmp/My App_2').project_name).toBe('my-app-2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/agent-ops/config.test.ts`
Expected: FAIL — `Cannot find module './config.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/agent-ops/config.ts
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

export const AGENT_OPS_CONFIG_PATH = '.scaffold/agent-ops.yaml'

export interface AgentOpsService {
  name: string
  band: number
}

export interface AgentOpsDocker {
  context: string
  services: AgentOpsService[]
  shared_stack: Record<string, number>
}

export interface AgentOpsConfig {
  project_name: string
  critical_labels: string[]
  worktree_setup_commands: string[]
  docker?: AgentOpsDocker
}

const NAME_RE = /^[a-z][a-z0-9_-]*$/

function sanitizeName(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'project'
}

export function defaultAgentOpsConfig(projectRoot: string): AgentOpsConfig {
  return {
    project_name: sanitizeName(path.basename(projectRoot)),
    critical_labels: [],
    worktree_setup_commands: [],
  }
}

function fail(msg: string): never {
  throw new Error(`agent-ops config: ${msg}`)
}

export function loadAgentOpsConfig(projectRoot: string): AgentOpsConfig {
  const file = path.join(projectRoot, AGENT_OPS_CONFIG_PATH)
  if (!fs.existsSync(file)) return defaultAgentOpsConfig(projectRoot)

  const raw = yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') fail('file is empty or not a mapping')

  const cfg = defaultAgentOpsConfig(projectRoot)
  if (typeof raw.project_name === 'string' && raw.project_name) {
    if (!NAME_RE.test(raw.project_name)) fail(`invalid project_name "${raw.project_name}"`)
    cfg.project_name = raw.project_name
  }
  if (Array.isArray(raw.critical_labels)) cfg.critical_labels = raw.critical_labels.map(String)
  if (Array.isArray(raw.worktree_setup_commands)) {
    cfg.worktree_setup_commands = raw.worktree_setup_commands.map(String)
  }

  if (raw.docker !== undefined) {
    const d = raw.docker as Record<string, unknown>
    const services = (Array.isArray(d.services) ? d.services : []).map(s => {
      const svc = s as Record<string, unknown>
      if (typeof svc.name !== 'string' || !NAME_RE.test(svc.name)) {
        fail(`invalid service name "${String(svc.name)}"`)
      }
      if (typeof svc.band !== 'number' || !Number.isInteger(svc.band) || svc.band < 1024) {
        fail(`service "${svc.name}" needs an integer band >= 1024`)
      }
      return { name: svc.name, band: svc.band }
    })
    const bands = new Set<number>()
    for (const s of services) {
      if (bands.has(s.band)) fail(`duplicate band ${s.band}`)
      bands.add(s.band)
    }
    const shared = (d.shared_stack && typeof d.shared_stack === 'object' ? d.shared_stack : {}) as Record<string, number>
    cfg.docker = {
      context: typeof d.context === 'string' && d.context ? d.context : 'orbstack',
      services,
      shared_stack: shared,
    }
  }
  return cfg
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/agent-ops/config.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-ops/config.ts src/core/agent-ops/config.test.ts
git commit -m "feat(agent-ops): add agent-ops.yaml config loader"
```

---

### Task 2: Installer core with manifest and drift check

**Files:**
- Create: `src/core/agent-ops/install.ts`
- Create: `content/assets/agent-ops/git/.gitkeep`, `content/assets/agent-ops/staging/.gitkeep`, `content/assets/agent-ops/make/.gitkeep` (placeholder dirs; real templates arrive in Tasks 4–6 — the installer tolerates missing templates the same way `installAllSkills` does)
- Test: `src/core/agent-ops/install.test.ts`

**Interfaces:**
- Consumes: `loadAgentOpsConfig`, `AgentOpsConfig` (Task 1); `resolveSkillTemplate` from `src/core/skills/sync.ts`; `getPackageRoot` from `src/utils/fs.ts`; `getPackageVersion` from `src/core/skills/sync.ts`.
- Produces (Task 3 imports these): `AgentOpsComponent = 'git' | 'staging'`, `installAgentOps(projectRoot, opts): AgentOpsInstallResult`, `checkAgentOps(projectRoot): AgentOpsCheckResult`, `AGENT_OPS_FILE_MAP`.

**Behavior contract:**
- `AGENT_OPS_FILE_MAP` maps template path (relative to `content/assets/agent-ops/`) → `{ dest, component, executable }`:

| Template | Dest in project | Component |
|---|---|---|
| `git/setup-agent-worktree.sh.tmpl` | `scripts/setup-agent-worktree.sh` | git |
| `git/cleanup-merged-branches.sh.tmpl` | `scripts/cleanup-merged-branches.sh` | git |
| `git/main-sync.sh.tmpl` | `scripts/main-sync.sh` | git |
| `git/doctor.sh.tmpl` | `scripts/doctor.sh` | git |
| `git/beads-snapshot.sh.tmpl` | `scripts/beads-snapshot.sh` | git |
| `make/agent-ops.mk.tmpl` | `agent-ops.mk` (not executable) | git |
| `staging/staging-env.sh.tmpl` | `scripts/ops/staging-env.sh` | staging |
| `staging/staging-teardown.sh.tmpl` | `scripts/ops/staging-teardown.sh` | staging |
| `staging/docker-env.sh.tmpl` | `scripts/ops/docker-env.sh` | staging |
| `staging/docker-doctor.sh.tmpl` | `scripts/ops/docker-doctor.sh` | staging |
| `staging/tc-reap.sh.tmpl` | `scripts/ops/tc-reap.sh` | staging |
| `staging/staging.env.example.tmpl` | `ops/compose/staging.env.example` (not executable) | staging |

- Template vars built from config: `PROJECT_NAME`; `DOCKER_CONTEXT` (default `orbstack` on `process.platform === 'darwin'`, else `default`, overridden by `config.docker.context`); `WORKTREE_SETUP_COMMANDS` = the commands joined with `\n` (empty string when none); `SERVICE_PORT_BANDS` = generated shell lines, e.g. for services postgres/20000, api/21000 with shared 55432/8001:

```
SERVICES="postgres api"
BAND_postgres=20000
BAND_api=21000
SHARED_postgres=55432
SHARED_api=8001
```

- Manifest `.scaffold/agent-ops-manifest.json`: `{ "version": "<pkg version>", "files": { "<dest>": "<sha256 of installed content>" } }`. Version marker file `.scaffold/agent-ops-version` contains the package version (mirrors `.scaffold-skill-version`).
- Install semantics: for each file in the requested components — if dest exists AND its on-disk sha256 differs from the manifest entry (locally modified) AND `!force` → add to `skippedModified`, don't write. Otherwise resolve, write, chmod, record new hash. Missing template sources are skipped silently (pre-Task-4 state). Manifest entries merge across components.
- `checkAgentOps`: `{ upToDate: boolean, staleVersion: boolean, modified: string[], missing: string[] }` — `modified` = manifest hash ≠ disk hash; `missing` = in manifest but absent on disk; `staleVersion` = marker ≠ package version.

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/agent-ops/install.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildTemplateVars, checkAgentOps, installAgentOps } from './install.js'

let projectRoot: string
let templateRoot: string

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-proj-'))
  templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-tmpl-'))
  fs.mkdirSync(path.join(templateRoot, 'git'), { recursive: true })
  fs.writeFileSync(
    path.join(templateRoot, 'git', 'setup-agent-worktree.sh.tmpl'),
    '#!/usr/bin/env bash\necho "{{PROJECT_NAME}}"\n{{WORKTREE_SETUP_COMMANDS}}\n',
  )
})

describe('buildTemplateVars', () => {
  it('emits shell band lines and joined setup commands', () => {
    const vars = buildTemplateVars({
      project_name: 'myapp',
      critical_labels: [],
      worktree_setup_commands: ['npm ci', 'uv sync'],
      docker: {
        context: 'orbstack',
        services: [{ name: 'postgres', band: 20000 }, { name: 'api', band: 21000 }],
        shared_stack: { postgres: 55432, api: 8001 },
      },
    })
    expect(vars.PROJECT_NAME).toBe('myapp')
    expect(vars.DOCKER_CONTEXT).toBe('orbstack')
    expect(vars.WORKTREE_SETUP_COMMANDS).toBe('npm ci\nuv sync')
    expect(vars.SERVICE_PORT_BANDS).toBe(
      'SERVICES="postgres api"\nBAND_postgres=20000\nBAND_api=21000\nSHARED_postgres=55432\nSHARED_api=8001',
    )
  })
})

describe('installAgentOps / checkAgentOps', () => {
  it('installs git component, resolves vars, chmods, writes manifest + marker', () => {
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(res.errors).toEqual([])
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('{{')
    expect(fs.statSync(dest).mode & 0o111).toBeTruthy()
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.scaffold', 'agent-ops-manifest.json'), 'utf8'),
    )
    expect(manifest.files['scripts/setup-agent-worktree.sh']).toMatch(/^[0-9a-f]{64}$/)
    expect(checkAgentOps(projectRoot).upToDate).toBe(true)
  })

  it('refuses to overwrite locally modified files unless force', () => {
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    fs.appendFileSync(dest, '# local edit\n')
    expect(checkAgentOps(projectRoot).modified).toEqual(['scripts/setup-agent-worktree.sh'])
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(res.skippedModified).toEqual(['scripts/setup-agent-worktree.sh'])
    expect(fs.readFileSync(dest, 'utf8')).toContain('# local edit')
    const forced = installAgentOps(projectRoot, { components: ['git'], templateRoot, force: true })
    expect(forced.skippedModified).toEqual([])
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('# local edit')
  })

  it('ensures the Makefile includes agent-ops.mk exactly once', () => {
    fs.writeFileSync(path.join(projectRoot, 'Makefile'), 'test:\n\techo hi\n')
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const mk = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf8')
    expect(mk.match(/-include agent-ops\.mk/g)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/agent-ops/install.test.ts`
Expected: FAIL — `Cannot find module './install.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/agent-ops/install.ts
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getPackageRoot } from '../../utils/fs.js'
import { getPackageVersion, resolveSkillTemplate } from '../skills/sync.js'
import { loadAgentOpsConfig, type AgentOpsConfig } from './config.js'

export type AgentOpsComponent = 'git' | 'staging'

export interface AgentOpsFileSpec {
  dest: string
  component: AgentOpsComponent
  executable: boolean
}

export const AGENT_OPS_FILE_MAP: Record<string, AgentOpsFileSpec> = {
  'git/setup-agent-worktree.sh.tmpl': { dest: 'scripts/setup-agent-worktree.sh', component: 'git', executable: true },
  'git/cleanup-merged-branches.sh.tmpl': { dest: 'scripts/cleanup-merged-branches.sh', component: 'git', executable: true },
  'git/main-sync.sh.tmpl': { dest: 'scripts/main-sync.sh', component: 'git', executable: true },
  'git/doctor.sh.tmpl': { dest: 'scripts/doctor.sh', component: 'git', executable: true },
  'git/beads-snapshot.sh.tmpl': { dest: 'scripts/beads-snapshot.sh', component: 'git', executable: true },
  'make/agent-ops.mk.tmpl': { dest: 'agent-ops.mk', component: 'git', executable: false },
  'staging/staging-env.sh.tmpl': { dest: 'scripts/ops/staging-env.sh', component: 'staging', executable: true },
  'staging/staging-teardown.sh.tmpl': { dest: 'scripts/ops/staging-teardown.sh', component: 'staging', executable: true },
  'staging/docker-env.sh.tmpl': { dest: 'scripts/ops/docker-env.sh', component: 'staging', executable: true },
  'staging/docker-doctor.sh.tmpl': { dest: 'scripts/ops/docker-doctor.sh', component: 'staging', executable: true },
  'staging/tc-reap.sh.tmpl': { dest: 'scripts/ops/tc-reap.sh', component: 'staging', executable: true },
  'staging/staging.env.example.tmpl': { dest: 'ops/compose/staging.env.example', component: 'staging', executable: false },
}

const MANIFEST_PATH = '.scaffold/agent-ops-manifest.json'
const VERSION_MARKER_PATH = '.scaffold/agent-ops-version'
const MAKEFILE_INCLUDE = '-include agent-ops.mk'

export interface AgentOpsInstallOptions {
  components: AgentOpsComponent[]
  force?: boolean
  /** Test override for content/assets/agent-ops */
  templateRoot?: string
}

export interface AgentOpsInstallResult {
  installed: string[]
  skippedModified: string[]
  errors: string[]
}

export interface AgentOpsCheckResult {
  upToDate: boolean
  staleVersion: boolean
  modified: string[]
  missing: string[]
}

interface Manifest {
  version: string
  files: Record<string, string>
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function readManifest(projectRoot: string): Manifest {
  const p = path.join(projectRoot, MANIFEST_PATH)
  if (!fs.existsSync(p)) return { version: '', files: {} }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest
}

export function buildTemplateVars(config: AgentOpsConfig): Record<string, string> {
  const defaultContext = process.platform === 'darwin' ? 'orbstack' : 'default'
  const bandLines: string[] = []
  if (config.docker) {
    bandLines.push(`SERVICES="${config.docker.services.map(s => s.name).join(' ')}"`)
    for (const s of config.docker.services) bandLines.push(`BAND_${s.name}=${s.band}`)
    for (const [name, port] of Object.entries(config.docker.shared_stack)) {
      bandLines.push(`SHARED_${name}=${port}`)
    }
  }
  return {
    PROJECT_NAME: config.project_name,
    DOCKER_CONTEXT: config.docker?.context ?? defaultContext,
    WORKTREE_SETUP_COMMANDS: config.worktree_setup_commands.join('\n'),
    SERVICE_PORT_BANDS: bandLines.join('\n'),
  }
}

function ensureMakefileInclude(projectRoot: string): void {
  const mkPath = path.join(projectRoot, 'Makefile')
  if (!fs.existsSync(mkPath)) {
    fs.writeFileSync(mkPath, `${MAKEFILE_INCLUDE}\n`)
    return
  }
  const body = fs.readFileSync(mkPath, 'utf8')
  if (!body.includes(MAKEFILE_INCLUDE)) {
    fs.writeFileSync(mkPath, `${body.replace(/\n*$/, '\n')}\n${MAKEFILE_INCLUDE}\n`)
  }
}

export function installAgentOps(projectRoot: string, opts: AgentOpsInstallOptions): AgentOpsInstallResult {
  const templateRoot = opts.templateRoot ?? path.join(getPackageRoot(), 'content', 'assets', 'agent-ops')
  const config = loadAgentOpsConfig(projectRoot)
  const vars = buildTemplateVars(config)
  const manifest = readManifest(projectRoot)
  const result: AgentOpsInstallResult = { installed: [], skippedModified: [], errors: [] }

  for (const [tmpl, spec] of Object.entries(AGENT_OPS_FILE_MAP)) {
    if (!opts.components.includes(spec.component)) continue
    const srcPath = path.join(templateRoot, tmpl)
    if (!fs.existsSync(srcPath)) continue // template not bundled (pre-Task-4 state)

    const destPath = path.join(projectRoot, spec.dest)
    if (fs.existsSync(destPath) && !opts.force) {
      const onDisk = sha256(fs.readFileSync(destPath))
      const recorded = manifest.files[spec.dest]
      if (recorded && recorded !== onDisk) {
        result.skippedModified.push(spec.dest)
        continue
      }
    }

    try {
      const resolved = resolveSkillTemplate(fs.readFileSync(srcPath, 'utf8'), vars)
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, resolved)
      if (spec.executable) fs.chmodSync(destPath, 0o755)
      manifest.files[spec.dest] = sha256(resolved)
      result.installed.push(spec.dest)
    } catch (err) {
      result.errors.push(`${spec.dest}: ${err}`)
    }
  }

  manifest.version = getPackageVersion()
  fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(path.join(projectRoot, VERSION_MARKER_PATH), manifest.version)
  if (opts.components.includes('git')) ensureMakefileInclude(projectRoot)
  return result
}

export function checkAgentOps(projectRoot: string): AgentOpsCheckResult {
  const manifest = readManifest(projectRoot)
  const markerPath = path.join(projectRoot, VERSION_MARKER_PATH)
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : ''
  const staleVersion = marker !== getPackageVersion()
  const modified: string[] = []
  const missing: string[] = []
  for (const [dest, hash] of Object.entries(manifest.files)) {
    const p = path.join(projectRoot, dest)
    if (!fs.existsSync(p)) missing.push(dest)
    else if (sha256(fs.readFileSync(p)) !== hash) modified.push(dest)
  }
  return { upToDate: !staleVersion && modified.length === 0 && missing.length === 0, staleVersion, modified, missing }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/agent-ops/install.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
mkdir -p content/assets/agent-ops/git content/assets/agent-ops/staging content/assets/agent-ops/make
touch content/assets/agent-ops/{git,staging,make}/.gitkeep
git add src/core/agent-ops/install.ts src/core/agent-ops/install.test.ts content/assets/agent-ops
git commit -m "feat(agent-ops): add installer core with manifest and drift check"
```

---

### Task 3: `scaffold agent-ops` CLI command

**Files:**
- Create: `src/cli/commands/agent-ops.ts`
- Modify: `src/cli/index.ts` (add import + `.command(agentOpsCommand)` alongside the existing `.command(...)` chain, lines ~35–58)
- Test: `src/cli/commands/agent-ops.test.ts`

**Interfaces:**
- Consumes: `installAgentOps`, `checkAgentOps`, `AgentOpsComponent` (Task 2).
- Produces: `agentOpsCommand: CommandModule` — `scaffold agent-ops install [--component git|staging|all] [--force]` and `scaffold agent-ops check` (exit 1 when not up to date). Wave 3 prompts reference these exact invocations.

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/agent-ops.test.ts
import { describe, expect, it } from 'vitest'
import { resolveComponents } from './agent-ops.js'

describe('resolveComponents', () => {
  it('maps all to both components', () => {
    expect(resolveComponents('all')).toEqual(['git', 'staging'])
  })
  it('maps single component names', () => {
    expect(resolveComponents('git')).toEqual(['git'])
    expect(resolveComponents('staging')).toEqual(['staging'])
  })
  it('defaults to all when omitted', () => {
    expect(resolveComponents(undefined)).toEqual(['git', 'staging'])
  })
  it('throws on unknown component', () => {
    expect(() => resolveComponents('nope')).toThrow(/unknown component/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/agent-ops.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Model the handler plumbing (output context, `shutdown`) on `src/cli/commands/skill.ts` — read that file first and mirror its structure. Core:

```typescript
// src/cli/commands/agent-ops.ts
import type { CommandModule } from 'yargs'
import { checkAgentOps, installAgentOps, type AgentOpsComponent } from '../../core/agent-ops/install.js'

export function resolveComponents(raw: string | undefined): AgentOpsComponent[] {
  if (raw === undefined || raw === 'all') return ['git', 'staging']
  if (raw === 'git' || raw === 'staging') return [raw]
  throw new Error(`unknown component "${raw}" (expected git, staging, or all)`)
}

interface AgentOpsArgs {
  action: string
  component?: string
  force?: boolean
  root?: string
}

export const agentOpsCommand: CommandModule<object, AgentOpsArgs> = {
  command: 'agent-ops <action>',
  describe: 'Install or check the agent-ops script bundle (worktree + staging machinery)',
  builder: y =>
    y
      .positional('action', { choices: ['install', 'check'] as const, demandOption: true, type: 'string' })
      .option('component', { type: 'string', describe: 'git | staging | all (default all)' })
      .option('force', { type: 'boolean', default: false, describe: 'Overwrite locally modified files' })
      .option('root', { type: 'string', describe: 'Project root (default: cwd)' }),
  handler: async argv => {
    const projectRoot = argv.root ?? process.cwd()
    if (argv.action === 'check') {
      const res = checkAgentOps(projectRoot)
      if (res.upToDate) {
        console.log('agent-ops: up to date')
        return
      }
      if (res.staleVersion) console.log('agent-ops: bundle version is stale — run: scaffold agent-ops install')
      for (const f of res.modified) console.log(`agent-ops: locally modified: ${f}`)
      for (const f of res.missing) console.log(`agent-ops: missing: ${f}`)
      process.exitCode = 1
      return
    }
    const result = installAgentOps(projectRoot, {
      components: resolveComponents(argv.component),
      force: argv.force,
    })
    for (const f of result.installed) console.log(`installed ${f}`)
    for (const f of result.skippedModified) {
      console.log(`SKIPPED (locally modified — use --force to overwrite): ${f}`)
    }
    for (const e of result.errors) console.error(`ERROR: ${e}`)
    if (result.errors.length > 0) process.exitCode = 1
  },
}
```

Then in `src/cli/index.ts` add `import { agentOpsCommand } from './commands/agent-ops.js'` and `.command(agentOpsCommand)` in the chain.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/cli/commands/agent-ops.test.ts && make ts-check`
Expected: PASS; typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/agent-ops.ts src/cli/commands/agent-ops.test.ts src/cli/index.ts
git commit -m "feat(cli): add scaffold agent-ops install/check command"
```

---

### Task 4: Git-component script templates (ported from nibble)

**Files:**
- Create: `content/assets/agent-ops/git/setup-agent-worktree.sh.tmpl`
- Create: `content/assets/agent-ops/git/cleanup-merged-branches.sh.tmpl`
- Create: `content/assets/agent-ops/git/main-sync.sh.tmpl`
- Create: `content/assets/agent-ops/git/doctor.sh.tmpl`
- Create: `content/assets/agent-ops/git/beads-snapshot.sh.tmpl`
- Test: `tests/agent-ops-git-scripts.bats`
- Test fixture: `tests/fixtures/agent-ops/resolve-template.bash`

**Interfaces:**
- Consumes: placeholder names from Task 2 (`{{PROJECT_NAME}}`, `{{WORKTREE_SETUP_COMMANDS}}`).
- Produces: the five installed scripts with the CLI surfaces the work-beads skill (Task 7) and Wave 3 prompts invoke: `setup-agent-worktree.sh <name> [--task "<goal>"] [--preflight-only]`, `cleanup-merged-branches.sh`, `main-sync.sh`, `doctor.sh [--fix]`, `beads-snapshot.sh`.

**Port procedure (applies to every script in this task):**

1. Copy the nibble source verbatim:
   - `/Users/kenallred/Developer/nibble/scripts/setup-agent-worktree.sh`
   - `/Users/kenallred/Developer/nibble/scripts/cleanup-merged-branches.sh`
   - `/Users/kenallred/Developer/nibble/scripts/main-sync.sh`
   - `/Users/kenallred/Developer/nibble/scripts/doctor.sh`
   - `/Users/kenallred/Developer/nibble/scripts/ops/beads-snapshot.sh`
2. Apply this transformation table (exact, whole-file):

| Nibble text | Template text |
|---|---|
| `nibble` (project-name literal in compose names, identity emails, messages) | `{{PROJECT_NAME}}` |
| `agent-<name>@nibble.local` | `agent-<name>@{{PROJECT_NAME}}.local` |
| the hardcoded dependency-install section in setup-agent-worktree.sh (`uv sync --all-packages --all-groups` and `(cd dashboard && npm ci)`) | replace the whole section with:<br>`# --- GENERATED: worktree setup commands ---`<br>`{{WORKTREE_SETUP_COMMANDS}}`<br>`# --- END GENERATED ---` |
| any reference to here.now sites, `publish-*.sh`, `live-sites.md`, `sites-status` | delete the block |
| any reference to nibble services (`research-engine`, `backtesting-engine`, `trading-engine`, `dashboard/`) | delete or generalize the block (these appear in comments/echo text only in the git-component scripts) |
| `bd list --status in_progress` preflight and `gh pr list` scan in setup-agent-worktree.sh | keep as-is, but guard each behind `command -v bd`/`command -v gh` so projects without them still work |
| staging-stack reclaim call in cleanup-merged-branches.sh | keep, but guard: `[ -f scripts/ops/staging-teardown.sh ] && scripts/ops/staging-teardown.sh --for-worktree "$wt" || true` |
| `.scaffold/identity.json` seeding | keep if present in nibble's script; if absent, ADD it — copy the identity-seeding block from Scaffold's own `scripts/setup-agent-worktree.sh` (this repo) so `scaffold observe` works in target-project worktrees |
3. Rename with `.tmpl` suffix. Do not fix ShellCheck warnings beyond what nibble already passes — behavior parity over style.

- [ ] **Step 1: Write the resolver fixture + failing tests**

```bash
# tests/fixtures/agent-ops/resolve-template.bash
# Resolve agent-ops template placeholders the way the installer does,
# for use in bats tests (keeps bats independent of the TS build).
resolve_agent_ops_template() {
    local src="$1" dest="$2"
    sed -e 's/{{PROJECT_NAME}}/testproj/g' \
        -e 's/{{DOCKER_CONTEXT}}/default/g' \
        -e '/{{WORKTREE_SETUP_COMMANDS}}/d' \
        -e '/{{SERVICE_PORT_BANDS}}/r '"$BATS_TEST_DIRNAME"'/fixtures/agent-ops/bands.sh' \
        -e '/{{SERVICE_PORT_BANDS}}/d' \
        "$src" > "$dest"
    chmod +x "$dest"
}
```

```bash
# tests/fixtures/agent-ops/bands.sh
SERVICES="postgres api"
BAND_postgres=20000
BAND_api=21000
SHARED_postgres=55432
SHARED_api=8001
```

```bash
# tests/agent-ops-git-scripts.bats
#!/usr/bin/env bats
# Behavior tests for the agent-ops git-component templates, run against a
# sandbox repo with resolved placeholders. Mirrors tests/setup-agent-worktree.bats
# sandbox conventions.

load fixtures/agent-ops/resolve-template.bash

TEMPLATES="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export ORIG_DIR="$RESOLVED_TMPDIR/orig-$$"
    export CLONE_DIR="$RESOLVED_TMPDIR/proj-$$"
    mkdir -p "$ORIG_DIR"
    git -C "$ORIG_DIR" init --bare --quiet --initial-branch=main
    git clone --quiet "$ORIG_DIR" "$CLONE_DIR"
    git -C "$CLONE_DIR" config user.email t@t.com
    git -C "$CLONE_DIR" config user.name T
    git -C "$CLONE_DIR" commit --allow-empty -m initial --quiet
    git -C "$CLONE_DIR" push --quiet origin main 2>/dev/null
    mkdir -p "$CLONE_DIR/scripts"
    for t in "$TEMPLATES"/*.sh.tmpl; do
        name="$(basename "$t" .tmpl)"
        resolve_agent_ops_template "$t" "$CLONE_DIR/scripts/$name"
    done
    # Stub gh and bd so preflight paths run without network/tools
    mkdir -p "$CLONE_DIR/stubs"
    cat > "$CLONE_DIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
# `gh pr list ... --json title` consumers get an empty list by default
echo "[]"
EOF
    cat > "$CLONE_DIR/stubs/bd" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "$CLONE_DIR/stubs/gh" "$CLONE_DIR/stubs/bd"
    export PATH="$CLONE_DIR/stubs:$PATH"
}

teardown() { rm -rf "$ORIG_DIR" "$CLONE_DIR"; }

@test "setup: creates .worktrees/<name> on branch agent/<name> and gitignores .worktrees" {
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/alpha" ]
    run git -C "$CLONE_DIR/.worktrees/alpha" branch --show-current
    [ "$output" = "agent/alpha" ]
    grep -q '\.worktrees' "$CLONE_DIR/.gitignore"
}

@test "setup: sets per-worktree agent identity with project domain" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run git -C "$CLONE_DIR/.worktrees/alpha" config user.email
    [ "$output" = "agent-alpha@testproj.local" ]
}

@test "setup: is idempotent" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
}

@test "setup: --preflight-only reports overlap against in-flight PR titles" {
    cat > "$CLONE_DIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
echo '[{"title":"feat: add user login flow"}]'
EOF
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh --preflight-only --task 'user login flow'"
    [ "$status" -eq 0 ]
    [[ "$output" == *login* ]]
}

@test "main-sync: fast-forwards main from a worktree" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    git -C "$CLONE_DIR" commit --allow-empty -m ahead --quiet
    git -C "$CLONE_DIR" push --quiet origin main
    git -C "$CLONE_DIR" reset --hard --quiet HEAD~1
    run bash -c "cd '$CLONE_DIR/.worktrees/alpha' && ../../scripts/main-sync.sh"
    [ "$status" -eq 0 ]
    [ "$(git -C "$CLONE_DIR" rev-parse main)" = "$(git -C "$CLONE_DIR" rev-parse origin/main)" ]
}

@test "doctor: clean primary on main passes; detached primary is diagnosed" {
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh"
    [ "$status" -eq 0 ]
    git -C "$CLONE_DIR" checkout --quiet --detach HEAD
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh"
    [ "$status" -ne 0 ]
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh --fix"
    [ "$status" -eq 0 ]
    run git -C "$CLONE_DIR" branch --show-current
    [ "$output" = "main" ]
}

@test "prune: removes a branch merged by ancestry and reports triage for unmerged" {
    git -C "$CLONE_DIR" checkout --quiet -b feat/done
    git -C "$CLONE_DIR" commit --allow-empty -m done --quiet
    git -C "$CLONE_DIR" checkout --quiet main
    git -C "$CLONE_DIR" merge --quiet --ff-only feat/done
    git -C "$CLONE_DIR" push --quiet origin main
    git -C "$CLONE_DIR" checkout --quiet -b feat/wip
    git -C "$CLONE_DIR" commit --allow-empty -m wip --quiet
    git -C "$CLONE_DIR" checkout --quiet main
    run bash -c "cd '$CLONE_DIR' && scripts/cleanup-merged-branches.sh"
    [ "$status" -eq 0 ]
    run git -C "$CLONE_DIR" branch --list feat/done
    [ -z "$output" ]
    run git -C "$CLONE_DIR" branch --list feat/wip
    [ -n "$output" ]
}

@test "beads-snapshot: no-ops gracefully when bd is absent" {
    rm "$CLONE_DIR/stubs/bd"
    run bash -c "cd '$CLONE_DIR' && scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *bd* ]]
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-git-scripts.bats`
Expected: FAIL — templates don't exist yet

- [ ] **Step 3: Port the five scripts per the Port procedure above**

Read each nibble source in full, apply the transformation table, save as `.sh.tmpl`. Where a test above demands behavior the nibble script routes differently (e.g. exact `--preflight-only` flag name), match the test — the tests are this task's contract. If a nibble behavior is untestable without its infra (Dolt remote, here.now), delete that branch of the script rather than stubbing it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bats tests/agent-ops-git-scripts.bats && make lint`
Expected: PASS (9 tests); `make lint` clean (templates are `.tmpl`, so ShellCheck skips them — verify it does; if `make lint` globs them anyway, add `content/assets` to its exclusion list in the Makefile)

- [ ] **Step 5: Commit**

```bash
git add content/assets/agent-ops/git tests/agent-ops-git-scripts.bats tests/fixtures/agent-ops
git commit -m "feat(agent-ops): port git-component worktree scripts from nibble"
```

---

### Task 5: Staging-component templates (per-worktree Docker isolation)

**Files:**
- Create: `content/assets/agent-ops/staging/staging-env.sh.tmpl` (written fresh below — the port math is the contract)
- Create: `content/assets/agent-ops/staging/staging-teardown.sh.tmpl`, `docker-env.sh.tmpl`, `docker-doctor.sh.tmpl`, `tc-reap.sh.tmpl` (ported from `/Users/kenallred/Developer/nibble/scripts/ops/` with the same transformation table as Task 4, plus: replace nibble's per-service port variables with the generated `BAND_*`/`SHARED_*` scheme; replace the hardcoded `orbstack` context with `{{DOCKER_CONTEXT}}`)
- Create: `content/assets/agent-ops/staging/staging.env.example.tmpl` (comment header + `ALLOWED_ORIGINS=` skeleton)
- Test: `tests/agent-ops-staging-scripts.bats`

**Interfaces:**
- Consumes: `{{PROJECT_NAME}}`, `{{DOCKER_CONTEXT}}`, `{{SERVICE_PORT_BANDS}}` (Task 2 var scheme).
- Produces (sourced API used by compose files, `agent-ops.mk`, and Wave 3 docs): `staging-env.sh` exports `COMPOSE_PROJECT_NAME`, `STAGING_SUBNET`, `STAGING_OFFSET`, and `PORT_<SERVICE>` per service; functions `is_primary_checkout`, `worktree_offset`.

- [ ] **Step 1: Write the failing tests**

```bash
# tests/agent-ops-staging-scripts.bats
#!/usr/bin/env bats

load fixtures/agent-ops/resolve-template.bash

TEMPLATES="$BATS_TEST_DIRNAME/../content/assets/agent-ops/staging"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export REPO="$RESOLVED_TMPDIR/stg-$$"
    mkdir -p "$REPO/scripts/ops"
    git -C "$REPO" init --quiet --initial-branch=main
    git -C "$REPO" config user.email t@t.com
    git -C "$REPO" config user.name T
    git -C "$REPO" commit --allow-empty -m initial --quiet
    resolve_agent_ops_template "$TEMPLATES/staging-env.sh.tmpl" "$REPO/scripts/ops/staging-env.sh"
}

teardown() { rm -rf "$REPO"; }

# helper: source staging-env.sh in a subshell at a path and echo one var
env_var_at() { bash -c "cd '$1' && source scripts/ops/staging-env.sh && echo \${$2}"; }

@test "offset is deterministic and within 1..254" {
    o1=$(env_var_at "$REPO" STAGING_OFFSET)
    o2=$(env_var_at "$REPO" STAGING_OFFSET)
    [ "$o1" = "$o2" ]
    [ "$o1" -ge 1 ] && [ "$o1" -le 254 ]
    expected=$(( $(printf '%s' "$(cd "$REPO" && git rev-parse --show-toplevel)" | cksum | awk '{print $1}') % 254 + 1 ))
    [ "$o1" = "$expected" ]
}

@test "worktree gets banded ports and hashed compose project; primary gets shared" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/a" -b agent/a
    mkdir -p "$REPO/.worktrees/a/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/a/scripts/ops/"
    o=$(env_var_at "$REPO/.worktrees/a" STAGING_OFFSET)
    [ "$(env_var_at "$REPO/.worktrees/a" PORT_POSTGRES)" = "$(( 20000 + o ))" ]
    [ "$(env_var_at "$REPO/.worktrees/a" PORT_API)" = "$(( 21000 + o ))" ]
    [[ "$(env_var_at "$REPO/.worktrees/a" COMPOSE_PROJECT_NAME)" == testproj-wt-* ]]
    [ "$(env_var_at "$REPO/.worktrees/a" STAGING_SUBNET)" = "10.$o.0.0/16" ]
    # primary checkout selects the shared stack with fixed ports
    [ "$(env_var_at "$REPO" COMPOSE_PROJECT_NAME)" = "testproj" ]
    [ "$(env_var_at "$REPO" PORT_POSTGRES)" = "55432" ]
    [ "$(env_var_at "$REPO" PORT_API)" = "8001" ]
}

@test "STAGING_WT_OFFSET overrides the derived offset" {
    run bash -c "cd '$REPO' && STAGING_WT_OFFSET=7 source scripts/ops/staging-env.sh && echo \$STAGING_OFFSET"
    [ "$output" = "7" ]
}

@test "selecting the shared stack from a worktree is refused" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/b" -b agent/b
    mkdir -p "$REPO/.worktrees/b/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/b/scripts/ops/"
    run bash -c "cd '$REPO/.worktrees/b' && STAGING_COMPOSE_PROJECT=testproj source scripts/ops/staging-env.sh"
    [ "$status" -ne 0 ]
    [[ "$output" == *primary* ]]
}

@test "teardown --reap only names orphaned -wt- stacks (dry run with stubbed docker)" {
    resolve_agent_ops_template "$TEMPLATES/staging-teardown.sh.tmpl" "$REPO/scripts/ops/staging-teardown.sh"
    mkdir -p "$REPO/stubs"
    cat > "$REPO/stubs/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"compose ls"* || "$*" == *"ls --format"* ]]; then
  echo "testproj-wt-12345"
  echo "testproj-wt-99999"
  echo "testproj"
  exit 0
fi
echo "docker $*" >> "${DOCKER_CALLS:?}"
EOF
    chmod +x "$REPO/stubs/docker"
    export DOCKER_CALLS="$REPO/docker-calls.log"
    # one live worktree whose hash we register as 12345 via env override hook
    run bash -c "cd '$REPO' && PATH='$REPO/stubs:$PATH' LIVE_WT_HASHES='12345' scripts/ops/staging-teardown.sh --reap --dry-run"
    [ "$status" -eq 0 ]
    [[ "$output" == *testproj-wt-99999* ]]
    [[ "$output" != *"testproj-wt-12345"* ]]
    # the shared stack is never a reap candidate
    [[ "$output" != *"reap testproj"$'\n'* ]]
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bats tests/agent-ops-staging-scripts.bats`
Expected: FAIL — templates missing

- [ ] **Step 3: Write `staging-env.sh.tmpl`**

```bash
#!/usr/bin/env bash
# staging-env.sh — deterministic per-worktree staging environment.
# SOURCE this file (do not execute). Installed by `scaffold agent-ops install`.
#
# Every worktree gets a collision-free slot derived from its path:
#   O = (cksum(worktree_path) % 254) + 1          # 1..254
#   compose project = {{PROJECT_NAME}}-wt-<cksum>
#   host port for service S = BAND_S + O
#   subnet = 10.<O>.0.0/16
# The primary checkout gets the shared stack ({{PROJECT_NAME}}, SHARED_* ports).
# Never select the shared stack from a worktree.

set -euo pipefail

PROJECT_NAME="{{PROJECT_NAME}}"

# --- GENERATED: service port bands (from .scaffold/agent-ops.yaml) ---
{{SERVICE_PORT_BANDS}}
# --- END GENERATED ---

_repo_root() { git rev-parse --show-toplevel; }
_primary_root() { git worktree list --porcelain | head -1 | sed 's/^worktree //'; }

is_primary_checkout() { [ "$(_repo_root)" = "$(_primary_root)" ]; }

worktree_offset() {
    if [ -n "${STAGING_WT_OFFSET:-}" ]; then
        echo "${STAGING_WT_OFFSET}"
        return
    fi
    local cksum_val
    cksum_val=$(printf '%s' "$(_repo_root)" | cksum | awk '{print $1}')
    echo $(( (cksum_val % 254) + 1 ))
}

_cksum_val=$(printf '%s' "$(_repo_root)" | cksum | awk '{print $1}')
STAGING_OFFSET="$(worktree_offset)"
export STAGING_OFFSET

if is_primary_checkout || [ "${STAGING_COMPOSE_PROJECT:-}" = "$PROJECT_NAME" ]; then
    if ! is_primary_checkout; then
        echo "ERROR: the shared '$PROJECT_NAME' stack may only be selected from the primary checkout." >&2
        echo "       From a worktree, use the default per-worktree stack instead." >&2
        return 1 2>/dev/null || exit 1
    fi
    export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
    for svc in $SERVICES; do
        shared_var="SHARED_${svc}"
        port_var="PORT_$(echo "$svc" | tr '[:lower:]-' '[:upper:]_')"
        export "$port_var"="${!shared_var}"
    done
    # Shared stack keeps the conventional docker-compose default network.
    export STAGING_SUBNET=""
else
    export COMPOSE_PROJECT_NAME="${PROJECT_NAME}-wt-${_cksum_val}"
    for svc in $SERVICES; do
        band_var="BAND_${svc}"
        port_var="PORT_$(echo "$svc" | tr '[:lower:]-' '[:upper:]_')"
        export "$port_var"="$(( ${!band_var} + STAGING_OFFSET ))"
    done
    export STAGING_SUBNET="10.${STAGING_OFFSET}.0.0/16"
fi
```

- [ ] **Step 4: Port the remaining staging scripts**

Apply the Task 4 Port procedure to `staging-teardown.sh`, `docker-env.sh`, `docker-doctor.sh`, `tc-reap.sh` from `/Users/kenallred/Developer/nibble/scripts/ops/`, with these additions:
- `docker-env.sh.tmpl`: the pinned context becomes `{{DOCKER_CONTEXT}}`; keep the "export DOCKER_CONTEXT unless already set" shape.
- `staging-teardown.sh.tmpl`: support `--reap`, `--dry-run`, and `--for-worktree <path>` (Task 4's prune script calls the latter). Reap logic: list compose projects matching `${PROJECT_NAME}-wt-*`, compute live hashes from `git worktree list` (`cksum` of each worktree path) — allow a test override via `LIVE_WT_HASHES` env var — and tear down only projects whose hash is not live. The shared `${PROJECT_NAME}` stack is never a candidate (name filter excludes it).
- `tc-reap.sh.tmpl`: keep nibble's label-scoped, age-guarded testcontainer sweep; parameterize only the project label.
- `staging.env.example.tmpl`: a commented skeleton documenting that non-derived values (CORS origins, email-link base URLs) live here and must match resolved ports.
- Env-file preflight (spec §4.3): at the end of `staging-env.sh.tmpl`, if `ops/compose/staging.env` exists and contains a `PORT_`-derived URL that disagrees with the just-resolved ports, print a one-line warning naming the mismatched variable (warning only — never fail the source).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bats tests/agent-ops-staging-scripts.bats`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add content/assets/agent-ops/staging tests/agent-ops-staging-scripts.bats
git commit -m "feat(agent-ops): add per-worktree Docker staging templates"
```

---

### Task 6: `agent-ops.mk` Makefile fragment

**Files:**
- Create: `content/assets/agent-ops/make/agent-ops.mk.tmpl`
- Test: extend `tests/agent-ops-git-scripts.bats`

**Interfaces:**
- Produces the make targets every generated doc and the work-beads skill reference: `main-sync`, `prune-merged`, `doctor`, `doctor-fix`, `beads-snapshot`, `staging-up`, `staging-down`, `staging-prune`, `docker-doctor`, `tc-reap`.

- [ ] **Step 1: Add failing test**

```bash
@test "agent-ops.mk: git targets run; staging targets fail cleanly without staging component" {
    sed 's/{{PROJECT_NAME}}/testproj/g' \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" \
        > "$CLONE_DIR/agent-ops.mk"
    printf -- '-include agent-ops.mk\n' > "$CLONE_DIR/Makefile"
    run make -C "$CLONE_DIR" doctor
    [ "$status" -eq 0 ]
    run make -C "$CLONE_DIR" staging-up
    [ "$status" -ne 0 ]
    [[ "$output" == *"staging component not installed"* ]]
}
```

- [ ] **Step 2: Run to verify it fails** — `bats tests/agent-ops-git-scripts.bats` → new test FAILS.

- [ ] **Step 3: Write the fragment**

```make
# agent-ops.mk — installed by `scaffold agent-ops install`. Do not edit; re-run
# the installer to update. Targets marked [agent-safe] may run unattended.

.PHONY: main-sync prune-merged doctor doctor-fix beads-snapshot \
        staging-up staging-down staging-prune docker-doctor tc-reap

main-sync: ## [agent-safe] Fetch + fast-forward main from anywhere
	@scripts/main-sync.sh

prune-merged: ## [agent-safe] Sweep merged branches/worktrees + reclaim staging
	@scripts/cleanup-merged-branches.sh

doctor: ## [agent-safe] Diagnose primary-checkout invariant (read-only)
	@scripts/doctor.sh

doctor-fix: ## [agent-safe] Repair unattended-safe primary-checkout problems
	@scripts/doctor.sh --fix

beads-snapshot: ## [agent-safe] Export beads DB to a local git-ignored restore copy
	@scripts/beads-snapshot.sh

define staging_guard
	@test -f scripts/ops/staging-env.sh || { echo "staging component not installed (run: scaffold agent-ops install --component staging)"; exit 1; }
endef

staging-up: ## [agent-safe, worktree-only] Start this worktree's staging stack
	$(staging_guard)
	@bash -c 'source scripts/ops/docker-env.sh && source scripts/ops/staging-env.sh && docker compose -f ops/compose/staging.yml --env-file ops/compose/staging.env up -d'

staging-down: ## [agent-safe] Stop this worktree's staging stack
	$(staging_guard)
	@bash -c 'source scripts/ops/docker-env.sh && source scripts/ops/staging-env.sh && docker compose -f ops/compose/staging.yml --env-file ops/compose/staging.env down -v'

staging-prune: ## [agent-safe] Reap orphaned per-worktree staging stacks
	$(staging_guard)
	@scripts/ops/staging-teardown.sh --reap

docker-doctor: ## [agent-safe] Show engine placement; warn on split-brain
	$(staging_guard)
	@scripts/ops/docker-doctor.sh

tc-reap: ## [agent-safe] Remove leaked testcontainers from dead sessions
	$(staging_guard)
	@scripts/ops/tc-reap.sh
```

- [ ] **Step 4: Run to verify it passes** — `bats tests/agent-ops-git-scripts.bats` → PASS (10 tests). Also run `make check` (full bash gates).

- [ ] **Step 5: Commit**

```bash
git add content/assets/agent-ops/make tests/agent-ops-git-scripts.bats
git commit -m "feat(agent-ops): add agent-ops.mk make-target fragment"
```

---

## Wave 2 — the `work-beads` skill

### Task 7: Author the canonical work-beads skill

**Files:**
- Create: `content/agent-skills/work-beads/SKILL.md`

**Interfaces:**
- Consumes: script/make surfaces from Tasks 4–6 (`scripts/setup-agent-worktree.sh`, `make doctor|doctor-fix|main-sync|prune-merged|staging-up|staging-down|staging-prune|docker-doctor|tc-reap`).
- Produces: canonical source that Task 8 registers; the `<!-- lean:start -->` region becomes the AGENTS.md block and Cursor rule.

- [ ] **Step 1: Write the canonical skill** (full content below — the lean region carries the loop contract; the body carries the full procedure; generalized per spec §5.2, decisions D7/D8 applied):

````markdown
---
name: work-beads
description: Work the project's Beads task queue end-to-end - claim a bead, build in an isolated worktree, verify, review, merge, close, report. Use when the user says "/work-beads", "/work-beads 5", "work the next N beads", "work on <bead-id>", "pick up some open tasks", or asks to work the backlog. Applies to every coding agent (Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok).
---

<!-- lean:start -->
# Work Beads

Work the Beads queue with the ship loop. Multiple agents run this concurrently
with no memory of each other — the loop is self-contained on purpose; do not
skip steps.

**The loop contract (memorize this):**

```
for each selected bead (strictly sequential, one open PR per agent):
  claim -> worktree -> build (draft PR on first push) -> verify (make check)
  -> review (mmr, 3-round cap) -> squash-merge -> sync + prune -> close bead
batch end: report in the required slots
```

**The bead is not done until the PR is MERGED and the bead is CLOSED.**
Standing authorization: run the whole loop without asking permission. Do not
end your turn after opening a draft PR with a list of "next steps" — that is
the #1 observed agent failure. The only mid-loop stops: a verified,
still-reproducing P0, or a blocker you can name.

Invocation: `/work-beads` (1 bead) · `/work-beads N` · `/work-beads N <label>`
· `/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
<!-- lean:end -->

## Step 0 — Orient (read-only, from the primary checkout)

The primary checkout is the first entry of `git worktree list`. Run:

```bash
bd ready && bd stats
gh pr list --state open        # open + draft PRs = live registry of what others build
git worktree list
make doctor                    # wedged home base? make doctor-fix (unattended-safe)
```

If `bd` or the agent-ops scripts are missing, stop and instruct:
`scaffold agent-ops install` (scripts) / see docs/beads-workflow.md (tracker).

## Step 1 — Select beads

Ranking, strict order: (1) priority P0 > P1 > P2 > P3; (2) beads labeled with a
`critical_labels` entry from `.scaffold/agent-ops.yaml`, if any; (3) work that
unblocks other beads; (4) fit to your strengths.

Hard exclusions — never select:
- a bead already `in_progress` under another agent, or covered by ANY open/draft PR
- a bead conflicting with an open PR's surface (same module, same migration
  sequence, same shared code — see docs/git-workflow.md conflict rules)

Mandatory duplicate-work scan per candidate:
`scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle.

## Step 2 — Per-bead loop

**2.1 Claim** (from the primary checkout): `bd ready --claim` scoped with
`--has-metadata-key plan_task_id` when a materialized plan exists; otherwise
`bd update <id> --status in_progress`. If the project has build observability
(a `.scaffold/` directory and the `scaffold` CLI), also
`scaffold observe event claim --task <id>` — feature-detect and skip silently.

**2.2 Worktree:** `scripts/setup-agent-worktree.sh <name> --task "<bead title>"`,
then `cd .worktrees/<name>`. The script runs the configured worktree setup
commands — skipping dependency install is a known `make check` breaker. Need a
live stack? `make staging-up` **from the worktree** (never the primary).

**2.3 Build:** use the Superpowers discipline if available (brainstorm → plan →
TDD); otherwise write the failing test first. Commit and push frequently on
`agent/<name>`. **Open a draft PR on the first push — the draft is the visible
claim.** Bead IDs go in commit/PR bodies (`Closes <id>`), never in branch names
or commit subjects.

**2.4 Docs travel with the PR:** resolve the bead's `docs:` tail and update
every stale doc in this same PR. Check the project-invariants section of
AGENTS.md (if the project defines one) before shipping.

**2.5 Defer = bead, immediately.** Anything you decide not to do now:

```bash
bd create "<imperative title>" -t task -p 2 --deps discovered-from:<id> \
  -d "<what, why, where (file/function)>; docs: <paths or none>"
```

A TODO comment, PR note, or mental note is NOT tracking.

**2.6 Verify yourself:** `make check` green on the branch HEAD, personally
watched — a subagent's or reviewer's claim doesn't count. Docker contention
(testcontainer timeouts, DockerException) is not a code defect:
`make docker-doctor` → `make tc-reap && make staging-prune` → re-run. Never
merge on a red gate. Never `docker system prune`.

**2.7 Review and merge:** `mmr review --pr <N> --sync --format json`.
- Check the diff is uncontaminated first: `gh pr diff <N> --name-only` shows
  only your intended surface.
- Surface channel auth failures to the user with recovery commands; never
  silently skip a channel.
- Round budget: round 1 fixes every real finding; round 2+ fixes only P0/P1
  and files beads for P2/P3. **Hard cap: 3 rounds — then complete the
  degraded-pass merge yourself**: file a bead per unresolved finding, map them
  in a PR comment, and merge. Do not stop for user sign-off at the cap.
- The one thing that still blocks the merge: a verified, still-reproducing
  real P0 — file it, keep the PR open, post the reproduction, notify the user,
  end the batch.
- 3+ agents active? Serialize the merge: `bd merge-slot acquire --wait` (if
  the project's Beads has merge-slots), release after merging.
- Merge: `gh pr merge <N> --squash --delete-branch`. Then from the primary:
  `make main-sync && make prune-merged`, and `make staging-down` for this
  worktree's stack.

**2.8 Close out** (from the primary): `bd close <id>` — only now, with the
merge verified. Noticed a repo-file fix after merging? Micro follow-up PR;
never edit the primary checkout directly.

## Step 3 — Batch report (required slots — answer each, say "none" out loud)

```
Beads:              <id> -> PR #<n> -> merged | parked (why) | skipped (why) | not started (why)
Docs updated in-PR: <paths - or "none needed: <why>">
Beads filed (open): <id - one-line title - or none>
```

If the batch ran long and `launchpad` is installed: `launchpad notify "<summary>"`.

## Red flags — stop if you're about to…

| Temptation | Reality |
|---|---|
| Commit or edit in the primary checkout | Work happens in `.worktrees/` only |
| Start bead k+1 before bead k's PR merges | One open PR per agent, strictly sequential |
| Skip the draft PR "until it's ready" | The draft IS the claim other agents see |
| End the turn after the draft PR with "next steps" | #1 observed agent failure — finish the loop |
| Leave a TODO/FIXME comment | That work is a bead, filed now |
| Merge with a red `make check` or Docker gate | Fix or file; never merge red |
| Chase a clean review past round 3 | Degraded-pass self-merge is the documented path |
| Leave the staging stack running after merge | `make staging-down`, always |
| `--no-verify`, plain `--force`, merge commits | Forbidden; `--force-with-lease` after rebase only |
| Close the bead when the PR opens | Close only after MERGED + verified |
| Prose summary instead of the Step 3 slots | The slots are the report format |
````

- [ ] **Step 2: Sanity-check the format**

Run: `node -e "const {parseCanonicalSkill} = require('./packages/agent-integration/dist/index.js'); parseCanonicalSkill(require('fs').readFileSync('content/agent-skills/work-beads/SKILL.md','utf8')); console.log('parses OK')"`
(If the package needs a build first: `npm run build -w packages/agent-integration`.)
Expected: `parses OK`

- [ ] **Step 3: Commit**

```bash
git add content/agent-skills/work-beads
git commit -m "feat(skills): author canonical work-beads ship-loop skill"
```

---

### Task 8: Register and fan out work-beads

**Files:**
- Modify: `scripts/generate-agent-skills.mjs` (the `SKILLS` array — change `['scaffold-runner', 'scaffold-pipeline']` to `['scaffold-runner', 'scaffold-pipeline', 'work-beads']`)
- Modify: `src/core/skills/sync.ts` (append to `INSTALLABLE_SKILLS`)
- Create (generated): `content/skills/work-beads/{SKILL.md, agents-block.md, cursor.mdc}`
- Modify: `content/skills/work-beads/cursor.mdc` post-generation IF the renderer doesn't set `alwaysApply: true` — check `renderCursorMdc` in `packages/agent-integration/`; if it emits `alwaysApply: false`, add an option or per-skill flag there (nibble's lesson: work-beads must be always-applied for Cursor)
- Modify: `src/core/skills/sync.test.ts`, `tests/evals/skill-triggers.bats`

**Interfaces:**
- Consumes: Task 7's canonical file.
- Produces: work-beads auto-installs to `.claude/skills/` + `.agents/skills/` in every scaffold project on next sync.

- [ ] **Step 1: Add failing test to sync.test.ts**

```typescript
it('includes work-beads in INSTALLABLE_SKILLS', () => {
  expect(INSTALLABLE_SKILLS.map(s => s.name)).toContain('work-beads')
})
```

Run: `npx vitest run src/core/skills/sync.test.ts` → the new test FAILS.

- [ ] **Step 2: Register in both places**

In `sync.ts`:

```typescript
  {
    name: 'work-beads',
    description: 'End-to-end Beads ship loop: claim, worktree, build, verify, review, merge, close, report',
  },
```

In `generate-agent-skills.mjs`: add `'work-beads'` to the mapped array.

- [ ] **Step 3: Generate and verify**

Run: `node scripts/generate-agent-skills.mjs && node scripts/generate-agent-skills.mjs --check && npx vitest run src/core/skills/sync.test.ts`
Expected: three files generated under `content/skills/work-beads/`; `--check` clean; tests PASS.
Inspect `content/skills/work-beads/cursor.mdc`: if its frontmatter lacks `alwaysApply: true`, extend `renderCursorMdc` (in `packages/agent-integration/src/`) with a per-skill `alwaysApply` option driven from the SKILLS entry, regenerate, and add a unit test in that package mirroring its existing renderer tests.

- [ ] **Step 4: Add skill-trigger eval**

Open `tests/evals/skill-triggers.bats`, copy the existing pattern for scaffold-runner, and add a test asserting the work-beads description contains the trigger phrases `/work-beads`, `work the next`, and `pick up some open tasks`:

```bash
@test "work-beads skill description covers its trigger phrases" {
    desc=$(sed -n '/^description:/p' content/agent-skills/work-beads/SKILL.md)
    [[ "$desc" == *"/work-beads"* ]]
    [[ "$desc" == *"work the next"* ]]
    [[ "$desc" == *"pick up some open tasks"* ]]
}
```

Run: `npx bats tests/evals/skill-triggers.bats` → PASS.

- [ ] **Step 5: Full gate + commit**

```bash
make check-all
git add scripts/generate-agent-skills.mjs src/core/skills/sync.ts src/core/skills/sync.test.ts \
        content/skills/work-beads tests/evals/skill-triggers.bats packages/agent-integration
git commit -m "feat(skills): register and fan out work-beads to all platforms"
```

---

### Task 9: Slim the build prompts to bootstrap + handoff

**Files:**
- Modify: `content/pipeline/build/multi-agent-start.md`
- Modify: `content/pipeline/build/multi-agent-resume.md`
- Modify: `content/pipeline/build/single-agent-start.md`, `single-agent-resume.md`
- Modify: `content/pipeline/build/quick-task.md`, `new-enhancement.md`

**Interfaces:**
- Consumes: the work-beads skill name and its loop-contract wording (Task 7).
- Produces: build prompts whose execution loop is a handoff, not a duplicate.

- [ ] **Step 1: Edit `multi-agent-start.md`**

KEEP unchanged: frontmatter (but see Step 3), Pre-Flight Verification, Worktree-Specific Rules, Beads Detection (orchestrator materialization under `bd merge-slot` + completion signal, scoped claims). DELETE: the TDD Execution Loop section's per-task ship steps (PR creation, review, merge, close, between-task cleanup) — everything the skill now owns. REPLACE the deleted content with:

```markdown
## Execute the Ship Loop

From here, follow the **work-beads skill** exactly — it owns the per-bead loop
(claim → worktree → build with draft-PR-on-first-push → verify → review with
the 3-round cap → squash-merge → close → batch report):

- Claude Code: `.claude/skills/work-beads/SKILL.md`
- Other agents: `.agents/skills/work-beads/SKILL.md`

Loop until the completion check confirms all plan tasks are closed. Do not
re-derive the loop from memory; open the skill file and follow it. Your claims
stay scoped to materialized plan tasks (`bd ready --claim
--has-metadata-key plan_task_id`) as detected above.
```

- [ ] **Step 2: Apply the same pattern to the other five prompts**

- `multi-agent-resume.md`: keep its re-orientation steps (find your worktree, `scripts/agent-loop-status`-style position recovery via `gh pr view` + `bd show`); replace its loop text with the same "Execute the Ship Loop" block.
- `single-agent-start.md` / `single-agent-resume.md`: same block, plus one leading line: "Sequential variant: you work in the primary checkout on `<type>/<desc>` branches (no worktree, skip `setup-agent-worktree.sh`, skip merge-slot); every other step of the skill applies unchanged."
- `quick-task.md`, `new-enhancement.md`: in their ship/PR phase, replace inline PR/review/merge instructions with two sentences pointing at the work-beads skill's steps 2.6–2.8 (verify → review with 3-round cap → merge → close).

- [ ] **Step 3: Update D7 remnants in these six files**

While editing, replace any `bd-<id>/<desc>` branch-name or `[bd-<id>]` commit-prefix instruction with: branches `<type>/<short-desc>` (worktree workspace branches are `agent/<name>`), bead IDs in commit/PR bodies (`Closes <id>`).

- [ ] **Step 4: Validate**

Run: `make validate && make eval`
Expected: PASS — pay attention to `tests/evals/redundancy.bats` (the removed duplication should help, never hurt) and `after-this-step-references.bats`.

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/build
git commit -m "refactor(build): hand the ship loop off to the work-beads skill"
```

---

## Wave 3 — pipeline prompts, knowledge, presets

### Task 10: New `staging-environments` pipeline step

**Files:**
- Create: `content/pipeline/environment/staging-environments.md`
- Modify: `content/methodology/mvp.yml`, `deep.yml`, `custom-defaults.yml` (+ any overlay enumerating environment steps — run `grep -l 'dev-env-setup' content/methodology/*overlay*.yml` and add the step to each hit)

**Interfaces:**
- Consumes: `scaffold agent-ops install --component staging` (Task 3), config schema (Task 1), `staging-env.sh` exports (Task 5).
- Produces: pipeline step `staging-environments` (phase `environment`, order `315`).

- [ ] **Step 1: Write the step** — frontmatter exactly:

```yaml
---
name: staging-environments
description: Per-worktree Docker staging environments with deterministic port allocation for parallel agents
summary: "Installs the agent-ops staging scripts and generates a compose file so every agent worktree gets its own isolated stack — deterministic ports derived from the worktree path, no collisions, orphan reaping, and a protected shared QA stack."
phase: "environment"
order: 315
dependencies: [dev-env-setup]
outputs: [.scaffold/agent-ops.yaml, ops/compose/staging.yml, ops/compose/staging.env.example]
conditional: if-needed
knowledge-base: [per-worktree-environments]
reads: [tech-stack]
---
```

Body sections (write in the house style of `content/pipeline/environment/dev-env-setup.md` — read it first; include the **Mode Detection** and **Update Mode Specifics** blocks copied structurally from that file, adapted so update mode = "config or compose file already exists: reconcile services, re-run installer, never clobber local script modifications"):

1. **Purpose** — one paragraph: per-worktree isolation so N parallel agents never collide on ports or clobber the shared QA stack.
2. **Conditional check** — this step applies only when `docs/tech-stack.md` declares containerized services (databases, queues, app services run via Docker). If none: `scaffold skip staging-environments --reason "no containerized services"`.
3. **Write `.scaffold/agent-ops.yaml`** — enumerate the services from the tech stack; assign bands in order from 20000 (postgres-like stores first, then caches, then app services); choose shared-stack fixed ports that avoid the project's dev ports; set `worktree_setup_commands` from the dev-setup install commands; show the exact YAML shape from the spec §4.4.
4. **Run the installer** — `scaffold agent-ops install --component staging`, then verify with `scaffold agent-ops check`.
5. **Generate `ops/compose/staging.yml`** — one service per config entry; every `ports:` mapping uses the exported variables (`"${PORT_POSTGRES}:5432"`); network uses `${STAGING_SUBNET}` when non-empty; healthchecks required for stores.
6. **Document** — append a "Per-worktree staging" section to `docs/dev-setup.md`: engine pin (`docker-env.sh`), `make staging-up` from worktrees only, `make staging-down` when done, `make staging-prune`/`tc-reap` for hygiene, `make docker-doctor` for contention, the never-`docker system prune` rule.
7. **Quality Criteria** — measurable: config validates via `scaffold agent-ops check`; `staging-up`/`staging-down` round-trip green in a worktree; the shared stack is unreachable from a worktree; docs section present.

- [ ] **Step 2: Add to presets** — exact lines, placed in the Phase 3 block right after `dev-env-setup`:

- `mvp.yml`: `  staging-environments: { enabled: false }`
- `deep.yml`: `  staging-environments: { enabled: true, conditional: "if-needed" }`
- `custom-defaults.yml`: `  staging-environments: { enabled: true, conditional: "if-needed" }`
- Each overlay found by the grep: mirror what the overlay does for `dev-env-setup` (enable for service-ful types like web-app/multi-service/backend; disable for static/CLI types).

- [ ] **Step 3: Validate**

Run: `make validate && npx bats tests/evals/preset-exhaustiveness.bats tests/evals/pipeline-completeness.bats tests/evals/dependency-ordering.bats`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/environment/staging-environments.md content/methodology
git commit -m "feat(pipeline): add staging-environments step for per-worktree Docker isolation"
```

---

### Task 11: Rewrite the `git-workflow` prompt (D4 + D7 + installer)

**Files:**
- Modify: `content/pipeline/environment/git-workflow.md`

- [ ] **Step 1: Frontmatter changes** — replace `outputs` and `description`/`summary`:

```yaml
description: Configure git workflow with branching, PRs, local quality gates, and worktree tooling for parallel agents
summary: "Sets up your branching strategy, commit format, PR workflow with squash-merge, the agent-ops worktree scripts (setup, doctor, prune), and conflict-prevention rules so multiple AI agents work in parallel without conflicts. CI is deliberately deferred to launch; the quality gate is local (pre-commit + make check + MMR review)."
outputs: [docs/git-workflow.md, scripts/setup-agent-worktree.sh, .github/pull_request_template.md]
```

- [ ] **Step 2: Body changes**

- **Scripts**: replace the "write scripts/setup-agent-worktree.sh" instructions with: run `scaffold agent-ops install --component git` (idempotent; installs the five scripts + `agent-ops.mk`), then verify `scaffold agent-ops check`. If `.scaffold/agent-ops.yaml` doesn't exist yet, first write the minimal form (`project_name` + `worktree_setup_commands` from the dev-setup install commands).
- **CI section → deferral section**: delete all `.github/workflows/ci.yml` generation. Add a "Quality gates (CI deferred)" section for the generated doc: gate = pre-commit hooks + `make check` + agent self-review + `mmr review`; `.github/workflows/` is deliberately absent until a launch target is chosen; include a short "adding CI later" pointer (what to wire when the time comes). 
- **Branch naming (D7)**: task branches `<type>/<short-desc>` (types = conventional-commit set), kebab-case, ≤40 chars; worktree workspace branches `agent/<name>`; NO bead IDs in branch names or commit subjects — reference beads in the commit/PR body (`Closes <id>`). Delete the `bd-<task-id>/<desc>` alternative everywhere including Quality Criteria.
- **New generated-doc sections** (instruct the executing agent to include these in `docs/git-workflow.md`, content summarized from the knowledge entry): the single rule (one task → one branch → one PR → squash-merge → delete branch); the 8-step PR flow with `mmr review --pr` as step 5.5; rebase-never-merge (`--force-with-lease` only); conflict-prevention rules (single-writer surfaces, migration sequences, high-contention files, one open PR per agent); the primary-checkout invariant + `make doctor`/`doctor-fix`; crash recovery; cheat sheet table.
- **Hook**: add generation of a PostToolUse reminder in the target's `.claude/settings.json` (merge into existing JSON, never overwrite):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // empty' | grep -q 'gh pr create' && echo 'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on (3-round cap; see docs/git-workflow.md).' || true"
          }
        ]
      }
    ]
  }
}
```

- **CLAUDE.md sections**: keep updating Committing/PR Workflow, Task Closure, Parallel Sessions, Worktree Awareness, Code Review — with D7/D4 wording.

- [ ] **Step 3: Validate + commit**

Run: `make validate && make eval` → PASS.

```bash
git add content/pipeline/environment/git-workflow.md
git commit -m "feat(pipeline): git-workflow generates agent-ops tooling, defers CI, adopts nibble branch conventions"
```

---

### Task 12: Beads prompt gains the beads-workflow doc

**Files:**
- Modify: `content/pipeline/foundation/beads.md`

- [ ] **Step 1: Frontmatter** — add `docs/beads-workflow.md` to `outputs`.

- [ ] **Step 2: Body** — add a "Generate docs/beads-workflow.md" section instructing the doc to contain:

1. **The deferred-work rule** (verbatim): "If you decide not to do something now, it becomes a bead — immediately." A commit-body note, PR comment, TODO comment, or agent memory is not tracking; bare TODO/FIXME without an issue reference is forbidden.
2. **The create template**: `bd create "<imperative title>" -t task -p 2 -l <area> --parent <epic> --deps discovered-from:<id> -d "<what/why/where>; docs: <paths or none>"` — the `docs:` tail is required.
3. **Day-to-day commands**: `bd ready` (start here) / `bd list` / `bd show` / `bd update --status in_progress` / `bd close` (only after merged + verified) / `bd stats`.
4. **The bootstrap trap** (verbatim warning): never run `bd bootstrap`, `bd init --force`, or any reset on a checkout with a populated local Beads DB — it silently replaces local (usually ahead) state with the stale remote. Bootstrap is for fresh clones only. Before any reset: `make beads-snapshot`. Drive embedded storage only through `bd` subcommands, never a standalone CLI.
5. **Epics & phases**: `-t epic` + `--parent`; phase epics `blocks:` each other so `bd ready` surfaces the right phase.
6. **Relationship to git**: IDs out of branch names/commit subjects (D7); `Closes <id>` in bodies; close only after squash-merge is verified.

Also update this prompt's existing commit-convention wording: remove `[bd-<id>]` prefix instructions in favor of body references (D7).

- [ ] **Step 3: Validate + commit**

Run: `make validate && npx bats tests/evals/prompt-quality.bats` → PASS.

```bash
git add content/pipeline/foundation/beads.md
git commit -m "feat(pipeline): beads step generates docs/beads-workflow.md with defer rule and bootstrap trap"
```

---

### Task 13: dev-env-setup + automated-pr-review alignment

**Files:**
- Modify: `content/pipeline/environment/dev-env-setup.md`
- Modify: `content/pipeline/environment/automated-pr-review.md`

- [ ] **Step 1: dev-env-setup** — in the Key Commands table instructions, require every command row to carry an **Agent-safe** or **Ask-first** marker (agent-safe = runs unattended without destructive effect; ask-first = formatting sweeps, resets, destructive db commands), and add the agent-ops targets (`main-sync`, `prune-merged`, `doctor`, `doctor-fix`, `beads-snapshot`, plus staging targets when that step ran) to the table the prompt populates.

- [ ] **Step 2: automated-pr-review** — align to D8: the review entry point in generated projects is `mmr review --pr <N> --sync --format json` (not a scaffold wrapper); document the round budget (R1 all findings; R2+ P0/P1 only, beads for the rest; cap 3 → degraded-pass self-merge with beads + PR comment map), the P0 stop condition, and channel-auth surfacing.

- [ ] **Step 3: Validate + commit**

Run: `make validate && make eval` → PASS.

```bash
git add content/pipeline/environment/dev-env-setup.md content/pipeline/environment/automated-pr-review.md
git commit -m "feat(pipeline): agent-safe command marking and direct-mmr review policy"
```

---

### Task 14: Instruction-file architecture (claude-md-optimization + workflow-audit)

**Files:**
- Modify: `content/pipeline/consolidation/claude-md-optimization.md`
- Modify: `content/pipeline/consolidation/workflow-audit.md`

- [ ] **Step 1: claude-md-optimization** — restructure the target layout it produces:

- **AGENTS.md owns the binding operations core** — a section titled "Operations core (binding for every agent)" containing: the ship-loop summary (8 numbered steps ending in report), the standing authorization ("run this whole loop without asking permission; do not end your turn after opening a draft PR"), the parallel-safety hard rules (primary checkout is shared/read-only; one agent per module/migration-sequence/shared surface; one open PR per agent; staging-up from worktrees only), Beads rules (ready queue, defer=bead, never bootstrap), an optional **Project invariants** subsection (cross-cutting rules the pipeline fills from the PRD/tech-stack when the project declares any — e.g. "every capability must work across all N engines"; omit the subsection entirely when none), and `/work-beads` routing ("open `.agents/skills/work-beads/SKILL.md` and follow it exactly").
- **CLAUDE.md** keeps: Core Principles, project navigation table, Key Commands (with agent-safe/ask-first markers), an **error-recovery table** (situation → first commands → then; rows for: test failure, Docker contention, pre-commit failure, merge conflict, crashed mid-task, detached primary, review-channel auth failure), and a one-line pointer: "The binding operations core lives in AGENTS.md and applies to Claude Code sessions too."
- Other harness files (GEMINI.md etc., where the project has them) defer to AGENTS.md with a two-line pointer.
- Keep the ≤200-line target for CLAUDE.md and the tracking comment convention.

- [ ] **Step 2: workflow-audit** — add these cross-doc checks to its checklist: no `bd-<id>` branch/commit-prefix conventions anywhere; no `.github/workflows/` references presented as present-tense setup (deferral language only); Key Commands ↔ agent-ops.mk target parity; work-beads routing present in AGENTS.md; error-recovery table present in CLAUDE.md; beads-workflow doc referenced from AGENTS.md Beads section.

- [ ] **Step 3: Validate + commit**

Run: `make validate && make eval` → PASS.

```bash
git add content/pipeline/consolidation
git commit -m "feat(pipeline): AGENTS.md ops-core architecture and workflow-audit checks"
```

---

### Task 15: Knowledge entries

**Files:**
- Create: `content/knowledge/core/per-worktree-environments.md`
- Modify: `content/knowledge/execution/worktree-management.md`, `content/knowledge/execution/multi-agent-coordination.md`, `content/knowledge/core/git-workflow-patterns.md`, `content/knowledge/core/task-tracking.md`, `content/knowledge/core/claude-md-patterns.md`

- [ ] **Step 1: New entry** — `per-worktree-environments.md` with frontmatter (`name`, `description`, `volatility: low`, `sources` citing Docker Compose docs + this repo's spec, `last-reviewed: 2026-07-11`), body covering: the collision problem; deterministic slot derivation (`cksum(path) % 254 + 1`, port = band + offset, subnet `10.<O>.0.0/16`, compose project `<name>-wt-<hash>`); why deterministic beats runtime probing (up/down/migrate always agree); shared-stack protection (primary-only selection); lifecycle discipline (down after merge, reap orphans, testcontainer hygiene, single-engine pin, never `docker system prune`); when NOT to use it (no containerized services, single-agent projects).

- [ ] **Step 2: Updates** — add to each existing entry (keep each addition to one focused subsection; bump `last-reviewed`):
- `worktree-management.md`: the primary-checkout invariant + doctor/doctor-fix; squash-aware pruning with triage; duplicate-work preflight scanning.
- `multi-agent-coordination.md`: draft-PR-as-visible-claim layered on atomic claims; one-open-PR-per-agent; when merge-slot matters (3+ agents).
- `git-workflow-patterns.md`: D7 naming rationale (IDs in bodies, tooling-friendly subjects); D4 local-gates stance; squash-aware cleanup.
- `task-tracking.md`: defer=bead rule; `docs:` tail; bootstrap trap; close-after-merge.
- `claude-md-patterns.md`: AGENTS.md ops-core pattern; agent-safe command marking; error-recovery tables.

- [ ] **Step 3: Validate + commit**

Run: `make validate-knowledge && npx bats tests/evals/knowledge-injection.bats tests/evals/knowledge-quality.bats` → PASS.

```bash
git add content/knowledge
git commit -m "feat(knowledge): per-worktree environments entry + workflow hardening updates"
```

---

### Task 16: Raise the mvp floor + D7 sweep + regression eval

**Files:**
- Modify: `content/methodology/mvp.yml`
- Modify: any `content/` file still carrying old conventions
- Create: `tests/evals/retired-conventions.bats`

- [ ] **Step 1: mvp floor (D5)** — in `mvp.yml` change:

```yaml
  beads: { enabled: true, conditional: "if-needed" }        # was: enabled: false
  git-workflow: { enabled: true }                            # was: enabled: false
  materialize-plan-to-beads: { enabled: true, conditional: "if-needed" }  # was: enabled: false
```

(`staging-environments` stays `enabled: false` in mvp; `ai-memory-setup` stays disabled.)

Then verify the graceful-degrade path survives (spec §10 risk): `content/pipeline/foundation/beads.md` must keep its "Beads unavailable → markdown fallback" branch, and `tests/methodology-materialize-enablement.bats` + `tests/build-beads-materialize-integration.bats` must still pass with the new preset values: `npx bats tests/methodology-materialize-enablement.bats tests/build-beads-materialize-integration.bats`.

- [ ] **Step 2: Write the failing regression eval**

```bash
# tests/evals/retired-conventions.bats
#!/usr/bin/env bats
# D7 (spec 2026-07-10): bead IDs live in commit/PR bodies, never branch names
# or commit subjects. D4: generated projects defer CI.

@test "no bd-<id> branch-name convention remains in content/" {
    run grep -rn 'bd-<task-id>/\|bd-<id>/' content/
    [ "$status" -ne 0 ]
}

@test "no [bd-<id>] commit-prefix convention remains in content/" {
    run grep -rln '\[bd-<id>\]\|\[bd-<task-id>\]' content/
    [ "$status" -ne 0 ]
}

@test "no pipeline prompt outputs a GitHub Actions workflow" {
    run grep -rln 'workflows/ci.yml' content/pipeline/
    [ "$status" -ne 0 ]
}
```

Run: `npx bats tests/evals/retired-conventions.bats` → expect FAILURES listing the remaining files.

- [ ] **Step 3: Sweep** — fix every file the failing tests list (expect hits in `content/pipeline/planning/implementation-plan.md`, `finalization/implementation-playbook.md`, `finalization/materialize-plan-to-beads.md`, `content/knowledge/` entries, and any Wave-2/3 stragglers). Apply D7 wording per Global Constraints. In `implementation-playbook.md`, also route its execution-loop section to the work-beads skill (mirror Task 9's handoff block).

- [ ] **Step 4: Run everything**

Run: `npx bats tests/evals/retired-conventions.bats && make check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content tests/evals/retired-conventions.bats
git commit -m "feat(methodology): raise mvp floor to beads+worktrees; retire bd-id branch conventions"
```

---

### Task 17: Documentation, changelog, final gate

**Files:**
- Modify: `CHANGELOG.md`, `README.md`
- Modify: `docs/project-structure.md` (add `content/assets/` and `src/core/agent-ops/` rows)
- Modify: `CLAUDE.md` (this repo) — add `scaffold agent-ops install|check` to the Key Commands table

- [ ] **Step 1: CHANGELOG** — under the next version heading, document: new `scaffold agent-ops` command + asset bundle; new `work-beads` skill (auto-installs on skill sync); new `staging-environments` step; mvp preset now enables Beads/git-workflow/materialization (behavior change); generated projects no longer get CI workflows (deferral policy); `bd-<id>` branch/commit conventions retired (existing projects reconcile via `workflow-audit` re-run).

- [ ] **Step 2: README** — one short subsection under features: "Parallel-agent operations kit" (three sentences + the install command).

- [ ] **Step 3: Final gate**

Run: `make check-all`
Expected: ALL gates green. Fix anything red before committing.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md docs/project-structure.md CLAUDE.md
git commit -m "docs: document agent-ops kit, work-beads skill, and mvp floor change"
```

---

## Execution notes

- **Task order:** 1 → 2 → 3 (strict); 4, 5 parallelizable after 2; 6 after 4; 7 → 8 → 9 (strict, needs 4–6 merged for accurate command references); 10–15 after 3 (10 also needs 5); 16 after 9–15; 17 last.
- **Worktrees:** if multiple agents execute this plan, use `scripts/setup-agent-worktree.sh <name>` in THIS repo and coordinate via the wave boundaries above; Wave 1 and Wave 2/3 files barely overlap.
- **Review:** after each wave's PR, run the repo's mandatory review flow (`scaffold run review-pr`) per this repo's CLAUDE.md — note Scaffold's own repo still uses its wrapper; D8 applies to *generated* projects only.
