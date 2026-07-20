# Brownfield R2 — Ops Last Mile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tier C of the brownfield-adoption design (spec: `docs/superpowers/specs/2026-07-19-brownfield-adoption-design.md`, D6–D9 + the R2 extensions): `scaffold sched` (launchd/systemd scheduler manager, first job post-merge-poller), the `gate` agent-ops component (generated `scripts/gate-check.sh` + `scripts/gate-check-affected.sh` satisfying the mq contract, seeded from ingestion-lite), `scaffold hooks install` (native Claude Code hook registration replacing the hand-run jq snippets), and `scaffold mq bootstrap` (arm-first guided first merge with a crash-safe journal state machine) — plus the R2 extensions: the adopt plan's ops-actions preview section, doctor's hook-reregistration and scheduler-reload `--fix` handlers as thin D8/D6 wrappers, and the content updates that point prompts at the new commands.

**Architecture:** Four new surfaces, all consuming existing seams. `src/sched/` holds platform backends (launchd, systemd) behind a `SchedBackend` interface with an injectable `Exec` seam (same dependency-injection style as `src/merge-queue/daemon.ts`'s `GhClient`/`GitOps` deps); plist/unit rendering is pure and golden-fixture-tested (the rumble plist). The gate component extends `AGENT_OPS_FILE_MAP` in `src/core/agent-ops/install.ts` with `seed: true` semantics (manifest tracks seeds in a separate list; `agent-ops check` reports them missing-only, never drifted) and a new ingestion-lite module reads `package.json` scripts + `.github/workflows/*.yml` to seed template vars. `src/core/hooks/install.ts` does the `.claude/settings.json` deep-merge in TypeScript with atomic writes and per-hook prerequisite reports. `scaffold mq bootstrap` lives in `src/merge-queue/bootstrap.ts` (pure reducers + an engine with injected deps) wired into `src/cli/commands/mq.ts`, journaling `bootstrap_intent`/`bootstrap_merged`/`bootstrap_armed` events through the existing `journal.ts` append/read path. R1 artifacts (doctor check registry in `src/doctor/`, the adopt plan renderer with its `plan_key`, the `verification: verified | declared | unverified` enum in state) EXIST when this plan starts — R2 consumes their interfaces and never rebuilds them.

**Tech Stack:** TypeScript (Node 20+, ESM, yargs CLI), vitest (co-located `*.test.ts`), bats-core for generated shell templates (`tests/*.bats`), `ulid` (already a dependency) for bootstrap ids, `js-yaml` (already a dependency) for workflow parsing. No new dependencies.

## Global Constraints

- **`scaffold sched` command surface is exactly `install | uninstall | status | list`** — no start/stop/restart in R2 (restart = `uninstall && install`; a paused queue is expressed via `.mq/PAUSED`, never scheduler state).
- **launchd (macOS):** gui-domain only (`gui/$UID/<label>`); absolute paths resolved at install time (node via the stable fnm alias dir or `process.execPath`, keg-only Homebrew openjdk prepended before `/usr/bin` when `/usr/bin/java` is a non-functional stub); explicit `EnvironmentVariables.PATH`; install = `launchctl bootout … || true` then `bootstrap`, then **verify via `launchctl print gui/$UID/<label>`** (file presence proves nothing); `StandardOutPath`/`StandardErrorPath` under `<project>/.mq/logs/`.
- **systemd (Linux):** user timer + service under `~/.config/systemd/user/`, `loginctl enable-linger` (best-effort, reported), verify via `systemctl --user is-active <unit>.timer`.
- **Bootstrap journal events:** `bootstrap_intent` / `bootstrap_merged` / `bootstrap_armed`, EACH carrying `bootstrapId` (ULID) + `pr` + `gatedHeadSha`; `bootstrap_merged` additionally carries `mergeCommitSha`. Reconciliation is a per-`bootstrapId` state machine; an aborted attempt is terminal for its id (a retry opens a new id); `bootstrap_intent` is written BEFORE the merge; the PR head is revalidated against the intent's gated SHA immediately before merging; on resume, GitHub's PR state is authoritative (intent-without-merged + GitHub MERGED ⇒ record the merge retroactively, never re-merge).
- **`GATE_PROBE=1`** in both generated gate scripts checks prerequisites (deps, functional runtimes, test-runner startup) and exits WITHOUT running the suite.
- **`seed: true` manifest semantics:** seeded files are project-owned after generation — `scaffold agent-ops check` reports them only if MISSING, never as drifted; re-install never overwrites an existing seed without `--force`.
- **`gate`, hooks, and sched are all excluded from `--component all`** (`all` stays `git`+`staging`); `gate` is an explicit opt-in component like `merge-queue`/`ci`. Hooks and sched are separate top-level commands, not components.
- **`scaffold hooks install` is Claude Code scope only** (`.claude/settings.json`); other harnesses get printed `--check` wiring guidance. No `--harness` flag in R2.

## R1 interfaces this plan consumes (do NOT rebuild)

| R1 artifact | Interface consumed (spec-pinned name) | Consumed by |
|---|---|---|
| Doctor framework | `src/cli/commands/doctor.ts` + `src/doctor/` check registry; each check declares `section`, `run()`, `severity`, `remediation`, optional `fix()` (spec §6.3) | Tasks 16, 17 |
| Adopt plan renderer | `plan_key` = sha256 over canonical JSON of the complete apply-action records (spec D1); R2 adds ops-action records to that key input (spec §6.1) | Task 18 |
| Verification module | `verification: verified \| declared \| unverified` enum in state (spec D3); `src/state/completion.ts` as the single verification path | Task 18 (read-only, via the renderer) |
| Brownfield preset | `content/methodology/brownfield.yml` (spec D11 R1 half) | Task 18 (plan resolution — already wired in R1) |

If any R1 file lives at a slightly different path, locate it with the grep given in the task and apply the change at the equivalent site — the *interface names* above are the contract.

---

### Task 1: sched core — types, exec seam, launchd plist renderer, rumble golden fixture

**Files:**
- Create: `src/sched/types.ts`
- Create: `src/sched/exec.ts`
- Create: `src/sched/backends/launchd.ts`
- Create: `src/sched/backends/launchd.test.ts`
- Create: `tests/fixtures/sched/rumble-merge-poller.plist`

**Interfaces:**
- Produces: `SchedJob { name, label, unitBase, programArguments, intervalSeconds, workingDirectory, stdoutPath, stderrPath, environment }`, `SchedBackend { platform, unitPaths(job), install(job), uninstall(job), status(job) }`, `SchedActionResult { ok, verified, messages }`, `SchedStatus { installed, loaded, lastRunAt, detail }`, `Exec = (cmd, args) => { status, stdout, stderr }`, `realExec`, `renderPlist(job: SchedJob): string`.
- Consumes: nothing (pure foundation).

**Steps:**

- [ ] Write the failing test `src/sched/backends/launchd.test.ts` (renderer half only for now):

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPlist } from './launchd.js'
import type { SchedJob } from '../types.js'

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'tests', 'fixtures', 'sched', 'rumble-merge-poller.plist',
)

/** The rumble plist — dogfood evidence from the 2026-07-19 adoption (spec §7:
 *  "The rumble plist becomes the golden test fixture"). */
export function rumbleJob(): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.rumble.merge-poller',
    unitBase: 'scaffold-rumble-merge-poller',
    programArguments: ['/Users/ken/rumble-pickleball/scripts/ops/post-merge-poller.sh'],
    intervalSeconds: 600,
    workingDirectory: '/Users/ken/rumble-pickleball',
    stdoutPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.out.log',
    stderrPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.err.log',
    environment: {
      PATH: '/Users/ken/.local/share/fnm/aliases/default/bin:/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    },
  }
}

describe('renderPlist', () => {
  it('reproduces the rumble golden fixture byte-for-byte', () => {
    expect(renderPlist(rumbleJob())).toBe(fs.readFileSync(FIXTURE, 'utf8'))
  })
  it('escapes XML special characters in strings', () => {
    const job = { ...rumbleJob(), label: 'com.a&b.<x>' }
    const out = renderPlist(job)
    expect(out).toContain('com.a&amp;b.&lt;x&gt;')
    expect(out).not.toContain('com.a&b.<x>')
  })
  it('renders StartInterval as an integer element', () => {
    expect(renderPlist(rumbleJob())).toContain('<key>StartInterval</key>\n  <integer>600</integer>')
  })
})
```

- [ ] Create the golden fixture `tests/fixtures/sched/rumble-merge-poller.plist` with EXACTLY this content (trailing newline after `</plist>`, two-space base indent, four-space member indent):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.rumble.merge-poller</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/ken/rumble-pickleball/scripts/ops/post-merge-poller.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
  <key>WorkingDirectory</key>
  <string>/Users/ken/rumble-pickleball</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/ken/.local/share/fnm/aliases/default/bin:/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.err.log</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

- [ ] Run: `npx vitest run src/sched/backends/launchd.test.ts` — expect FAILURE (module `./launchd.js` does not exist).
- [ ] Create `src/sched/types.ts`:

```ts
export interface SchedJob {
  /** CLI job name: `scaffold sched install <name>`. */
  name: string
  /** launchd reverse-DNS label, e.g. com.<project>.merge-poller. */
  label: string
  /** systemd unit basename, e.g. scaffold-<project>-merge-poller. */
  unitBase: string
  /** Absolute program path + args — resolved at INSTALL time (D6). */
  programArguments: string[]
  intervalSeconds: number
  workingDirectory: string
  /** Absolute log paths under <project>/.mq/logs/ (D6). */
  stdoutPath: string
  stderrPath: string
  /** Explicit environment — launchd/systemd inherit no shell init (rumble lesson). */
  environment: Record<string, string>
}

export interface SchedActionResult {
  ok: boolean
  /** True only when the post-install liveness check passed (launchctl print /
   *  systemctl is-active) — file presence proves nothing (spec D6). */
  verified: boolean
  messages: string[]
}

export interface SchedStatus {
  /** Unit/plist file exists on disk. */
  installed: boolean
  /** Job actually loaded per launchctl print / systemctl is-active. */
  loaded: boolean
  /** Heartbeat: mtime of the stdout log, ISO — null when the job never ran. */
  lastRunAt: string | null
  detail: string
}

export interface SchedBackend {
  platform: 'launchd' | 'systemd'
  unitPaths(job: SchedJob): string[]
  install(job: SchedJob): SchedActionResult
  uninstall(job: SchedJob): SchedActionResult
  status(job: SchedJob): SchedStatus
}
```

- [ ] Create `src/sched/exec.ts`:

```ts
import { execFileSync } from 'node:child_process'

export interface ExecResult {
  status: number
  stdout: string
  stderr: string
}

/** Injectable exec seam (same DI posture as the merge-queue daemon's deps):
 *  backends never call child_process directly, so tests fake launchctl/systemctl. */
export type Exec = (cmd: string, args: string[]) => ExecResult

export const realExec: Exec = (cmd, args) => {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000 })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number | null; stdout?: unknown; stderr?: unknown }
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    }
  }
}
```

- [ ] Create `src/sched/backends/launchd.ts` (renderer now; backend factory arrives in Task 3):

```ts
import type { SchedJob } from '../types.js'

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Pure plist rendering — golden-fixture-tested against the rumble plist.
 *  Key order is fixed; environment keys are sorted for determinism. */
export function renderPlist(job: SchedJob): string {
  const args = job.programArguments
    .map(a => `    <string>${xmlEscape(a)}</string>`)
    .join('\n')
  const env = Object.keys(job.environment)
    .sort()
    .map(k => `    <key>${xmlEscape(k)}</key>\n    <string>${xmlEscape(job.environment[k])}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(job.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartInterval</key>
  <integer>${job.intervalSeconds}</integer>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(job.workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(job.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(job.stderrPath)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`
}
```

- [ ] Run: `npx vitest run src/sched/backends/launchd.test.ts` — expect `Test Files  1 passed`, 3 tests passed. If the fixture comparison fails, fix the FIXTURE (or renderer) so they match byte-for-byte — the fixture is the contract.
- [ ] Commit: `git add -A && git commit -m "feat(sched): SchedJob types, exec seam, launchd plist renderer + rumble golden fixture"`

---

### Task 2: sched PATH / absolute-path resolver

**Files:**
- Create: `src/sched/path-resolver.ts`
- Create: `src/sched/path-resolver.test.ts`

**Interfaces:**
- Produces: `PathProbes { home, execPath, exists(p), javaWorks() }`, `defaultProbes()`, `fnmAliasBin(p)`, `openjdkBin(p)`, `homebrewBin(p)`, `nodeBinDir(p)`, `buildSchedPath(p): string`.
- Consumes: nothing.

**Note (spec ambiguity resolved):** D6 says openjdk is prepended "when the gate needs Java and `/usr/bin/java` is a stub". Whether a given gate needs Java is project-specific and unknowable at the host level, so the resolver prepends whenever `/usr/bin/java` is a NON-FUNCTIONAL stub AND Homebrew openjdk exists — an extra PATH entry is harmless when Java is unneeded, and the gate script's own runtime probe (Task 7) is the per-project check.

**Steps:**

- [ ] Write the failing test `src/sched/path-resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildSchedPath, fnmAliasBin, homebrewBin, nodeBinDir, openjdkBin, type PathProbes,
} from './path-resolver.js'

function probes(overrides: Partial<PathProbes> & { existing?: string[] }): PathProbes {
  const existing = new Set(overrides.existing ?? [])
  return {
    home: overrides.home ?? '/Users/ken',
    execPath: overrides.execPath ?? '/usr/local/nodes/v22/bin/node',
    exists: p => existing.has(p),
    javaWorks: overrides.javaWorks ?? (() => true),
  }
}

describe('path-resolver', () => {
  it('prefers the stable fnm alias dir over process.execPath', () => {
    const p = probes({ existing: ['/Users/ken/.local/share/fnm/aliases/default/bin'] })
    expect(fnmAliasBin(p)).toBe('/Users/ken/.local/share/fnm/aliases/default/bin')
    expect(nodeBinDir(p)).toBe('/Users/ken/.local/share/fnm/aliases/default/bin')
  })
  it('falls back to the execPath dir when no fnm alias exists', () => {
    const p = probes({ existing: [] })
    expect(fnmAliasBin(p)).toBeNull()
    expect(nodeBinDir(p)).toBe('/usr/local/nodes/v22/bin')
  })
  it('prepends Homebrew openjdk ONLY when /usr/bin/java is a stub', () => {
    const stub = probes({ existing: ['/opt/homebrew/opt/openjdk/bin'], javaWorks: () => false })
    expect(openjdkBin(stub)).toBe('/opt/homebrew/opt/openjdk/bin')
    const working = probes({ existing: ['/opt/homebrew/opt/openjdk/bin'], javaWorks: () => true })
    expect(openjdkBin(working)).toBeNull()
  })
  it('builds the rumble-shaped PATH: fnm alias, openjdk, brew, then system dirs', () => {
    const p = probes({
      existing: [
        '/Users/ken/.local/share/fnm/aliases/default/bin',
        '/opt/homebrew/opt/openjdk/bin',
        '/opt/homebrew/bin',
      ],
      javaWorks: () => false,
    })
    expect(buildSchedPath(p)).toBe(
      '/Users/ken/.local/share/fnm/aliases/default/bin:/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    )
  })
  it('omits absent optional dirs and never duplicates entries', () => {
    const p = probes({ existing: [], execPath: '/usr/bin/node' })
    expect(buildSchedPath(p)).toBe('/usr/bin:/bin:/usr/sbin:/sbin')
  })
})
```

- [ ] Run: `npx vitest run src/sched/path-resolver.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/sched/path-resolver.ts`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export interface PathProbes {
  home: string
  execPath: string
  exists(p: string): boolean
  /** FUNCTIONAL java test (`/usr/bin/java -version`), not `command -v` —
   *  macOS ships a stub that exists but fails at run time (rumble lesson). */
  javaWorks(): boolean
}

export function defaultProbes(): PathProbes {
  return {
    home: os.homedir(),
    execPath: process.execPath,
    exists: p => fs.existsSync(p),
    javaWorks: () => {
      try {
        execFileSync('/usr/bin/java', ['-version'], { stdio: 'ignore', timeout: 10_000 })
        return true
      } catch {
        return false
      }
    },
  }
}

/** Stable fnm alias bin — survives fnm version switches; launchd/systemd run
 *  no shell init, so the fnm hook never fires (rumble launchd PATH lesson). */
export function fnmAliasBin(p: PathProbes): string | null {
  const candidate = path.join(p.home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin')
  return p.exists(candidate) ? candidate : null
}

/** Keg-only Homebrew openjdk, prepended ONLY when /usr/bin/java is a
 *  non-functional stub (see Task 2 note — per-project need is probed by the
 *  generated gate script itself, not here). */
export function openjdkBin(p: PathProbes): string | null {
  if (p.javaWorks()) return null
  for (const c of ['/opt/homebrew/opt/openjdk/bin', '/usr/local/opt/openjdk/bin']) {
    if (p.exists(c)) return c
  }
  return null
}

export function homebrewBin(p: PathProbes): string | null {
  for (const c of ['/opt/homebrew/bin', '/usr/local/bin']) {
    if (p.exists(c)) return c
  }
  return null
}

/** Absolute node bin dir: fnm stable alias when present, else the running
 *  node's own directory (process.execPath is always absolute). */
export function nodeBinDir(p: PathProbes): string {
  return fnmAliasBin(p) ?? path.dirname(p.execPath)
}

export function buildSchedPath(p: PathProbes): string {
  const parts: string[] = [nodeBinDir(p)]
  const jdk = openjdkBin(p)
  if (jdk !== null) parts.push(jdk)
  const brew = homebrewBin(p)
  if (brew !== null) parts.push(brew)
  parts.push('/usr/bin', '/bin', '/usr/sbin', '/sbin')
  return [...new Set(parts)].join(':')
}
```

- [ ] Run: `npx vitest run src/sched/path-resolver.test.ts` — expect 5 tests passed.
- [ ] Commit: `git add -A && git commit -m "feat(sched): absolute-path resolver (fnm alias, java-stub-aware openjdk, homebrew)"`

---

### Task 3: launchd backend — install / uninstall / status behind the exec seam

**Files:**
- Modify: `src/sched/backends/launchd.ts`
- Modify: `src/sched/backends/launchd.test.ts`

**Interfaces:**
- Produces: `createLaunchdBackend(deps: { exec: Exec; home: string; uid: number }): SchedBackend`.
- Consumes: `Exec` (Task 1), `renderPlist` (Task 1), `SchedBackend`/`SchedJob` (Task 1).

**Steps:**

- [ ] Append the backend tests to `src/sched/backends/launchd.test.ts` (keep the Task 1 tests; add these imports at the top: `import os from 'node:os'`, `import { createLaunchdBackend } from './launchd.js'`, `import type { ExecResult } from '../exec.js'`):

```ts
interface Call { cmd: string; args: string[] }

function fakeExec(script: (call: Call) => ExecResult) {
  const calls: Call[] = []
  const exec = (cmd: string, args: string[]): ExecResult => {
    const call = { cmd, args }
    calls.push(call)
    return script(call)
  }
  return { calls, exec }
}

const OK: ExecResult = { status: 0, stdout: '', stderr: '' }
const FAIL: ExecResult = { status: 1, stdout: '', stderr: 'boom' }

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sched-launchd-'))
}

describe('createLaunchdBackend', () => {
  it('install writes the plist, boots out first (idempotent), bootstraps, then VERIFIES via launchctl print', () => {
    const home = tmpHome()
    const { calls, exec } = fakeExec(() => OK)
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = { ...rumbleJob(), stdoutPath: path.join(home, '.mq/logs/out.log'), stderrPath: path.join(home, '.mq/logs/err.log') }
    const res = be.install(job)
    expect(res.ok).toBe(true)
    expect(res.verified).toBe(true)
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.rumble.merge-poller.plist')
    expect(fs.readFileSync(plist, 'utf8')).toBe(renderPlist(job))
    expect(calls.map(c => [c.cmd, c.args[0]])).toEqual([
      ['launchctl', 'bootout'],
      ['launchctl', 'bootstrap'],
      ['launchctl', 'print'],
    ])
    expect(calls[0].args).toEqual(['bootout', 'gui/501/com.rumble.merge-poller'])
    expect(calls[1].args).toEqual(['bootstrap', 'gui/501', plist])
    expect(calls[2].args).toEqual(['print', 'gui/501/com.rumble.merge-poller'])
  })
  it('install tolerates bootout failure (not loaded yet) but fails when bootstrap fails', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'bootstrap' ? FAIL : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const res = be.install(rumbleJob())
    expect(res.ok).toBe(false)
    expect(res.messages.join('\n')).toMatch(/bootstrap failed/)
  })
  it('install fails verification when launchctl print reports the job absent', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'print' ? FAIL : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const res = be.install(rumbleJob())
    expect(res.ok).toBe(false)
    expect(res.verified).toBe(false)
    expect(res.messages.join('\n')).toMatch(/did not load/)
  })
  it('uninstall boots out and removes the plist', () => {
    const home = tmpHome()
    const { calls, exec } = fakeExec(() => OK)
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = rumbleJob()
    be.install(job)
    const plist = be.unitPaths(job)[0]
    expect(fs.existsSync(plist)).toBe(true)
    const res = be.uninstall(job)
    expect(res.ok).toBe(true)
    expect(fs.existsSync(plist)).toBe(false)
    expect(calls.filter(c => c.args[0] === 'bootout').length).toBe(2)
  })
  it('status reports installed/loaded and the stdout-log heartbeat', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'print' ? OK : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = { ...rumbleJob(), stdoutPath: path.join(home, 'out.log'), stderrPath: path.join(home, 'err.log') }
    be.install(job)
    fs.writeFileSync(job.stdoutPath, 'ran\n')
    const st = be.status(job)
    expect(st.installed).toBe(true)
    expect(st.loaded).toBe(true)
    expect(st.lastRunAt).not.toBeNull()
  })
  it('status distinguishes plist-present-but-NOT-loaded (file presence proves nothing)', () => {
    const home = tmpHome()
    let installed = false
    const { exec } = fakeExec(c => {
      if (c.args[0] === 'print') return installed ? OK : FAIL
      return OK
    })
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = rumbleJob()
    be.install(job) // print fails during install verify — plist still on disk
    const st = be.status(job)
    expect(st.installed).toBe(true)
    expect(st.loaded).toBe(false)
    expect(st.detail).toMatch(/NOT loaded/)
  })
})
```

- [ ] Run: `npx vitest run src/sched/backends/launchd.test.ts` — expect FAILURE (`createLaunchdBackend` not exported).
- [ ] Append the backend factory to `src/sched/backends/launchd.ts` (add imports `fs`, `path`, and the types):

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Exec } from '../exec.js'
import type { SchedActionResult, SchedBackend, SchedJob, SchedStatus } from '../types.js'
```

(keep `renderPlist` above, then add:)

```ts
export function createLaunchdBackend(deps: { exec: Exec; home: string; uid: number }): SchedBackend {
  const plistPath = (job: SchedJob): string =>
    path.join(deps.home, 'Library', 'LaunchAgents', `${job.label}.plist`)
  const domainTarget = (job: SchedJob): string => `gui/${deps.uid}/${job.label}`

  return {
    platform: 'launchd',
    unitPaths: job => [plistPath(job)],

    install(job): SchedActionResult {
      const messages: string[] = []
      fs.mkdirSync(path.dirname(plistPath(job)), { recursive: true })
      fs.mkdirSync(path.dirname(job.stdoutPath), { recursive: true })
      fs.mkdirSync(path.dirname(job.stderrPath), { recursive: true })
      fs.writeFileSync(plistPath(job), renderPlist(job))
      messages.push(`wrote ${plistPath(job)}`)
      // bootout || true — idempotent reload; "not loaded" is not an error (D6).
      deps.exec('launchctl', ['bootout', domainTarget(job)])
      const boot = deps.exec('launchctl', ['bootstrap', `gui/${deps.uid}`, plistPath(job)])
      if (boot.status !== 0) {
        messages.push(`launchctl bootstrap failed: ${(boot.stderr || boot.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // File presence proves nothing — verify the job actually loaded (D6).
      const print = deps.exec('launchctl', ['print', domainTarget(job)])
      if (print.status !== 0) {
        messages.push(
          `job did not load: launchctl print ${domainTarget(job)} failed — ` +
          'check the plist paths and Console.app for launchd errors',
        )
        return { ok: false, verified: false, messages }
      }
      messages.push(`verified loaded: launchctl print ${domainTarget(job)}`)
      return { ok: true, verified: true, messages }
    },

    uninstall(job): SchedActionResult {
      const messages: string[] = []
      deps.exec('launchctl', ['bootout', domainTarget(job)]) // ignore "not loaded"
      if (fs.existsSync(plistPath(job))) {
        fs.rmSync(plistPath(job))
        messages.push(`removed ${plistPath(job)}`)
      } else {
        messages.push('plist was not installed')
      }
      return { ok: true, verified: true, messages }
    },

    status(job): SchedStatus {
      const installed = fs.existsSync(plistPath(job))
      const loaded = deps.exec('launchctl', ['print', domainTarget(job)]).status === 0
      const lastRunAt = fs.existsSync(job.stdoutPath)
        ? fs.statSync(job.stdoutPath).mtime.toISOString()
        : null
      const detail = loaded
        ? 'loaded'
        : installed
          ? 'plist present but NOT loaded — run: scaffold sched install ' + job.name
          : 'not installed'
      return { installed, loaded, lastRunAt, detail }
    },
  }
}
```

- [ ] Run: `npx vitest run src/sched/backends/launchd.test.ts` — expect 9 tests passed (3 renderer + 6 backend).
- [ ] Commit: `git add -A && git commit -m "feat(sched): launchd backend — bootout||true, bootstrap, launchctl-print verification"`

---

### Task 4: systemd backend — unit/timer renderers + install / uninstall / status

**Files:**
- Create: `src/sched/backends/systemd.ts`
- Create: `src/sched/backends/systemd.test.ts`

**Interfaces:**
- Produces: `renderService(job): string`, `renderTimer(job): string`, `createSystemdBackend(deps: { exec: Exec; home: string; user: string }): SchedBackend`.
- Consumes: `Exec`, `SchedBackend`, `SchedJob` (Task 1).

**Steps:**

- [ ] Write the failing test `src/sched/backends/systemd.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSystemdBackend, renderService, renderTimer } from './systemd.js'
import type { ExecResult } from '../exec.js'
import type { SchedJob } from '../types.js'

function job(): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.rumble.merge-poller',
    unitBase: 'scaffold-rumble-merge-poller',
    programArguments: ['/home/ken/rumble/scripts/ops/post-merge-poller.sh'],
    intervalSeconds: 600,
    workingDirectory: '/home/ken/rumble',
    stdoutPath: '/home/ken/rumble/.mq/logs/post-merge-poller.out.log',
    stderrPath: '/home/ken/rumble/.mq/logs/post-merge-poller.err.log',
    environment: { PATH: '/usr/local/bin:/usr/bin:/bin' },
  }
}

interface Call { cmd: string; args: string[] }
const OK: ExecResult = { status: 0, stdout: '', stderr: '' }
const FAIL: ExecResult = { status: 1, stdout: '', stderr: 'nope' }

function fakeExec(script: (c: Call) => ExecResult) {
  const calls: Call[] = []
  const exec = (cmd: string, args: string[]): ExecResult => {
    const c = { cmd, args }
    calls.push(c)
    return script(c)
  }
  return { calls, exec }
}

describe('systemd renderers', () => {
  it('renders a oneshot service with WorkingDirectory, Environment, and append: log redirection', () => {
    const svc = renderService(job())
    expect(svc).toContain('[Service]')
    expect(svc).toContain('Type=oneshot')
    expect(svc).toContain('WorkingDirectory=/home/ken/rumble')
    expect(svc).toContain('Environment="PATH=/usr/local/bin:/usr/bin:/bin"')
    expect(svc).toContain('ExecStart="/home/ken/rumble/scripts/ops/post-merge-poller.sh"')
    expect(svc).toContain('StandardOutput=append:/home/ken/rumble/.mq/logs/post-merge-poller.out.log')
    expect(svc).toContain('StandardError=append:/home/ken/rumble/.mq/logs/post-merge-poller.err.log')
  })
  it('renders a timer firing every intervalSeconds, installed into timers.target', () => {
    const t = renderTimer(job())
    expect(t).toContain('[Timer]')
    expect(t).toContain('OnBootSec=60')
    expect(t).toContain('OnUnitActiveSec=600')
    expect(t).toContain('Unit=scaffold-rumble-merge-poller.service')
    expect(t).toContain('WantedBy=timers.target')
  })
})

describe('createSystemdBackend', () => {
  it('install writes both units, daemon-reloads, enables linger (best-effort), enables --now, and verifies is-active', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { calls, exec } = fakeExec(() => OK)
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    const res = be.install(job())
    expect(res.ok).toBe(true)
    expect(res.verified).toBe(true)
    const unitDir = path.join(home, '.config', 'systemd', 'user')
    expect(fs.existsSync(path.join(unitDir, 'scaffold-rumble-merge-poller.service'))).toBe(true)
    expect(fs.existsSync(path.join(unitDir, 'scaffold-rumble-merge-poller.timer'))).toBe(true)
    expect(calls.map(c => `${c.cmd} ${c.args.join(' ')}`)).toEqual([
      'systemctl --user daemon-reload',
      'loginctl enable-linger ken',
      'systemctl --user enable --now scaffold-rumble-merge-poller.timer',
      'systemctl --user is-active scaffold-rumble-merge-poller.timer',
    ])
  })
  it('reports linger failure as a message without failing the install', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { exec } = fakeExec(c => (c.cmd === 'loginctl' ? FAIL : OK))
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    const res = be.install(job())
    expect(res.ok).toBe(true)
    expect(res.messages.join('\n')).toMatch(/enable-linger failed/)
  })
  it('install fails when the timer is not active after enable', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { exec } = fakeExec(c => (c.args.includes('is-active') ? FAIL : OK))
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    const res = be.install(job())
    expect(res.ok).toBe(false)
    expect(res.verified).toBe(false)
  })
  it('uninstall disables the timer, removes both units, and daemon-reloads', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { calls, exec } = fakeExec(() => OK)
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    be.install(job())
    const res = be.uninstall(job())
    expect(res.ok).toBe(true)
    for (const p of be.unitPaths(job())) expect(fs.existsSync(p)).toBe(false)
    const cmdline = calls.map(c => `${c.cmd} ${c.args.join(' ')}`)
    expect(cmdline).toContain('systemctl --user disable --now scaffold-rumble-merge-poller.timer')
    expect(cmdline.filter(l => l === 'systemctl --user daemon-reload').length).toBe(2)
  })
})
```

- [ ] Run: `npx vitest run src/sched/backends/systemd.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/sched/backends/systemd.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { Exec } from '../exec.js'
import type { SchedActionResult, SchedBackend, SchedJob, SchedStatus } from '../types.js'

/** systemd quoting: each ExecStart argv element is double-quoted so paths with
 *  spaces survive; our values never contain double quotes (absolute paths). */
function execStart(job: SchedJob): string {
  return job.programArguments.map(a => `"${a}"`).join(' ')
}

export function renderService(job: SchedJob): string {
  const env = Object.keys(job.environment)
    .sort()
    .map(k => `Environment="${k}=${job.environment[k]}"`)
    .join('\n')
  return `[Unit]
Description=scaffold sched job ${job.name} (${job.label})

[Service]
Type=oneshot
WorkingDirectory=${job.workingDirectory}
${env}
ExecStart=${execStart(job)}
StandardOutput=append:${job.stdoutPath}
StandardError=append:${job.stderrPath}
`
}

export function renderTimer(job: SchedJob): string {
  return `[Unit]
Description=scaffold sched timer ${job.name} (${job.label})

[Timer]
OnBootSec=60
OnUnitActiveSec=${job.intervalSeconds}
Unit=${job.unitBase}.service

[Install]
WantedBy=timers.target
`
}

export function createSystemdBackend(deps: { exec: Exec; home: string; user: string }): SchedBackend {
  const unitDir = path.join(deps.home, '.config', 'systemd', 'user')
  const servicePath = (job: SchedJob): string => path.join(unitDir, `${job.unitBase}.service`)
  const timerPath = (job: SchedJob): string => path.join(unitDir, `${job.unitBase}.timer`)

  return {
    platform: 'systemd',
    unitPaths: job => [servicePath(job), timerPath(job)],

    install(job): SchedActionResult {
      const messages: string[] = []
      fs.mkdirSync(unitDir, { recursive: true })
      fs.mkdirSync(path.dirname(job.stdoutPath), { recursive: true })
      fs.mkdirSync(path.dirname(job.stderrPath), { recursive: true })
      fs.writeFileSync(servicePath(job), renderService(job))
      fs.writeFileSync(timerPath(job), renderTimer(job))
      messages.push(`wrote ${servicePath(job)}`, `wrote ${timerPath(job)}`)
      const reload = deps.exec('systemctl', ['--user', 'daemon-reload'])
      if (reload.status !== 0) {
        messages.push(`systemctl --user daemon-reload failed: ${(reload.stderr || reload.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // Linger keeps user timers running with no active session (D6); its
      // failure (e.g. no polkit authority) degrades, never blocks.
      const linger = deps.exec('loginctl', ['enable-linger', deps.user])
      if (linger.status !== 0) {
        messages.push(
          'loginctl enable-linger failed — the timer only runs while you are ' +
          'logged in; run manually: loginctl enable-linger ' + deps.user,
        )
      }
      const enable = deps.exec('systemctl', ['--user', 'enable', '--now', `${job.unitBase}.timer`])
      if (enable.status !== 0) {
        messages.push(`systemctl enable --now failed: ${(enable.stderr || enable.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // Verify the timer is ACTUALLY active — unit files on disk prove nothing.
      const active = deps.exec('systemctl', ['--user', 'is-active', `${job.unitBase}.timer`])
      if (active.status !== 0) {
        messages.push(`timer is not active after enable (systemctl --user is-active failed)`)
        return { ok: false, verified: false, messages }
      }
      messages.push(`verified active: systemctl --user is-active ${job.unitBase}.timer`)
      return { ok: true, verified: true, messages }
    },

    uninstall(job): SchedActionResult {
      const messages: string[] = []
      deps.exec('systemctl', ['--user', 'disable', '--now', `${job.unitBase}.timer`]) // ignore
      for (const p of [servicePath(job), timerPath(job)]) {
        if (fs.existsSync(p)) {
          fs.rmSync(p)
          messages.push(`removed ${p}`)
        }
      }
      deps.exec('systemctl', ['--user', 'daemon-reload'])
      return { ok: true, verified: true, messages }
    },

    status(job): SchedStatus {
      const installed = fs.existsSync(timerPath(job)) && fs.existsSync(servicePath(job))
      const loaded = deps.exec('systemctl', ['--user', 'is-active', `${job.unitBase}.timer`]).status === 0
      const lastRunAt = fs.existsSync(job.stdoutPath)
        ? fs.statSync(job.stdoutPath).mtime.toISOString()
        : null
      const detail = loaded
        ? 'active'
        : installed
          ? 'units present but timer NOT active — run: scaffold sched install ' + job.name
          : 'not installed'
      return { installed, loaded, lastRunAt, detail }
    },
  }
}
```

- [ ] Run: `npx vitest run src/sched/backends/systemd.test.ts` — expect 6 tests passed.
- [ ] Commit: `git add -A && git commit -m "feat(sched): systemd user timer backend with enable-linger and is-active verification"`

---

### Task 5: post-merge-poller job builder + job registry

**Files:**
- Create: `src/sched/jobs.ts`
- Create: `src/sched/jobs.test.ts`

**Interfaces:**
- Produces: `buildPostMergePollerJob(projectRoot, opts?: { intervalSeconds?: number; probes?: PathProbes }): SchedJob`, `SCHED_JOBS: Record<string, (projectRoot: string, opts?: { intervalSeconds?: number }) => SchedJob>`.
- Consumes: `loadAgentOpsConfig` (`src/core/agent-ops/config.ts` — `project_name`), `buildSchedPath`/`defaultProbes` (Task 2), `SchedJob` (Task 1). The poller script itself is installed by the existing `merge-queue` component (`scripts/ops/post-merge-poller.sh`).

**Steps:**

- [ ] Write the failing test `src/sched/jobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SCHED_JOBS, buildPostMergePollerJob } from './jobs.js'
import type { PathProbes } from './path-resolver.js'

function probes(): PathProbes {
  return {
    home: '/Users/ken',
    execPath: '/opt/node/bin/node',
    exists: () => false,
    javaWorks: () => true,
  }
}

function projectWithPoller(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-jobs-'))
  fs.mkdirSync(path.join(root, 'scripts', 'ops'), { recursive: true })
  fs.writeFileSync(path.join(root, 'scripts', 'ops', 'post-merge-poller.sh'), '#!/bin/bash\n')
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), `project_name: ${name}\n`)
  return root
}

describe('buildPostMergePollerJob', () => {
  it('builds the job with absolute paths, com.<project>.merge-poller label, and 600s default', () => {
    const root = projectWithPoller('rumble')
    const job = buildPostMergePollerJob(root, { probes: probes() })
    expect(job.name).toBe('post-merge-poller')
    expect(job.label).toBe('com.rumble.merge-poller')
    expect(job.unitBase).toBe('scaffold-rumble-merge-poller')
    expect(job.programArguments).toEqual([path.join(root, 'scripts', 'ops', 'post-merge-poller.sh')])
    expect(job.intervalSeconds).toBe(600)
    expect(job.workingDirectory).toBe(root)
    expect(job.stdoutPath).toBe(path.join(root, '.mq', 'logs', 'post-merge-poller.out.log'))
    expect(job.stderrPath).toBe(path.join(root, '.mq', 'logs', 'post-merge-poller.err.log'))
    expect(job.environment.PATH).toBe('/opt/node/bin:/usr/bin:/bin:/usr/sbin:/sbin')
  })
  it('honors an interval override', () => {
    const root = projectWithPoller('rumble')
    expect(buildPostMergePollerJob(root, { intervalSeconds: 300, probes: probes() }).intervalSeconds).toBe(300)
  })
  it('throws with the install remediation when the poller script is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-jobs-'))
    expect(() => buildPostMergePollerJob(root, { probes: probes() }))
      .toThrow(/agent-ops install --component merge-queue/)
  })
  it('registry exposes post-merge-poller', () => {
    expect(Object.keys(SCHED_JOBS)).toEqual(['post-merge-poller'])
  })
})
```

- [ ] Run: `npx vitest run src/sched/jobs.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/sched/jobs.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { loadAgentOpsConfig } from '../core/agent-ops/config.js'
import { buildSchedPath, defaultProbes, type PathProbes } from './path-resolver.js'
import type { SchedJob } from './types.js'

export interface JobBuildOpts {
  intervalSeconds?: number
  /** Test seam — production callers omit it. */
  probes?: PathProbes
}

/** D6 first job: run the local-poller gate executor on an interval. All paths
 *  are resolved ABSOLUTE at build (= install) time; the environment is explicit
 *  because launchd/systemd run no shell init. */
export function buildPostMergePollerJob(projectRoot: string, opts: JobBuildOpts = {}): SchedJob {
  const script = path.join(projectRoot, 'scripts', 'ops', 'post-merge-poller.sh')
  if (!fs.existsSync(script)) {
    throw new Error(
      `${script} not found — install it first: scaffold agent-ops install --component merge-queue`,
    )
  }
  const project = loadAgentOpsConfig(projectRoot).project_name
  const probes = opts.probes ?? defaultProbes()
  return {
    name: 'post-merge-poller',
    label: `com.${project}.merge-poller`,
    unitBase: `scaffold-${project}-merge-poller`,
    programArguments: [script],
    intervalSeconds: opts.intervalSeconds ?? 600,
    workingDirectory: projectRoot,
    stdoutPath: path.join(projectRoot, '.mq', 'logs', 'post-merge-poller.out.log'),
    stderrPath: path.join(projectRoot, '.mq', 'logs', 'post-merge-poller.err.log'),
    environment: { PATH: buildSchedPath(probes) },
  }
}

export const SCHED_JOBS: Record<string, (projectRoot: string, opts?: JobBuildOpts) => SchedJob> = {
  'post-merge-poller': (root, opts) => buildPostMergePollerJob(root, opts),
}
```

- [ ] Run: `npx vitest run src/sched/jobs.test.ts` — expect 4 tests passed.
- [ ] Commit: `git add -A && git commit -m "feat(sched): post-merge-poller job builder + job registry"`

---

### Task 6: `scaffold sched` CLI — install | uninstall | status | list

**Files:**
- Create: `src/sched/platform.ts`
- Create: `src/cli/commands/sched.ts`
- Create: `src/cli/commands/sched.test.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Produces: `pickSchedBackend(): SchedBackend` (darwin→launchd, linux→systemd, else throws), `schedHandler(argv: SchedArgs, overrides?: SchedOverrides)`, default-exported yargs `CommandModule`.
- Consumes: `createLaunchdBackend` (Task 3), `createSystemdBackend` (Task 4), `SCHED_JOBS` (Task 5), `realExec` (Task 1), `resolveOutputMode`/`createOutputContext` (existing CLI plumbing, same usage as `src/cli/commands/agent-ops.ts`).

**Steps:**

- [ ] Create `src/sched/platform.ts`:

```ts
import os from 'node:os'
import { realExec } from './exec.js'
import { createLaunchdBackend } from './backends/launchd.js'
import { createSystemdBackend } from './backends/systemd.js'
import type { SchedBackend } from './types.js'

/** Shared by `scaffold sched` and `scaffold mq bootstrap` (D9 arm step). */
export function pickSchedBackend(): SchedBackend {
  if (process.platform === 'darwin') {
    return createLaunchdBackend({
      exec: realExec,
      home: os.homedir(),
      uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    })
  }
  if (process.platform === 'linux') {
    return createSystemdBackend({ exec: realExec, home: os.homedir(), user: os.userInfo().username })
  }
  throw new Error(
    `scaffold sched: unsupported platform "${process.platform}" (launchd on macOS, systemd on Linux)`,
  )
}
```

- [ ] Write the failing test `src/cli/commands/sched.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { schedHandler, type SchedArgs } from './sched.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

function fakeJob(root: string): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.p.merge-poller',
    unitBase: 'scaffold-p-merge-poller',
    programArguments: [path.join(root, 'scripts/ops/post-merge-poller.sh')],
    intervalSeconds: 600,
    workingDirectory: root,
    stdoutPath: path.join(root, '.mq/logs/out.log'),
    stderrPath: path.join(root, '.mq/logs/err.log'),
    environment: { PATH: '/usr/bin:/bin' },
  }
}

function fakeBackend(overrides: Partial<SchedBackend> = {}): SchedBackend & { installs: SchedJob[] } {
  const installs: SchedJob[] = []
  return {
    installs,
    platform: 'launchd',
    unitPaths: () => ['/tmp/x.plist'],
    install: job => {
      installs.push(job)
      return { ok: true, verified: true, messages: ['installed'] }
    },
    uninstall: () => ({ ok: true, verified: true, messages: ['removed'] }),
    status: () => ({ installed: true, loaded: true, lastRunAt: null, detail: 'loaded' }),
    ...overrides,
  }
}

function argv(partial: Partial<SchedArgs>): SchedArgs {
  return { action: 'list', ...partial } as SchedArgs
}

describe('schedHandler', () => {
  it('install builds the named job (honoring --interval) and calls backend.install', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const be = fakeBackend()
    await schedHandler(argv({ action: 'install', job: 'post-merge-poller', interval: 120, root }), {
      backend: be,
      buildJob: (name, projectRoot, opts) => ({ ...fakeJob(projectRoot), name, intervalSeconds: opts.intervalSeconds ?? 600 }),
    })
    expect(be.installs.length).toBe(1)
    expect(be.installs[0].intervalSeconds).toBe(120)
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('install exits non-zero when the backend fails verification', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const be = fakeBackend({
      install: () => ({ ok: false, verified: false, messages: ['job did not load'] }),
    })
    await schedHandler(argv({ action: 'install', job: 'post-merge-poller', root }), {
      backend: be,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('rejects an unknown job with the registry names', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    await schedHandler(argv({ action: 'install', job: 'nope', root }), { backend: fakeBackend() })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('status exits 0 when loaded, 1 when not loaded', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const loaded = fakeBackend()
    await schedHandler(argv({ action: 'status', job: 'post-merge-poller', root }), {
      backend: loaded,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode ?? 0).toBe(0)
    const notLoaded = fakeBackend({
      status: () => ({ installed: true, loaded: false, lastRunAt: null, detail: 'plist present but NOT loaded' }),
    })
    await schedHandler(argv({ action: 'status', job: 'post-merge-poller', root }), {
      backend: notLoaded,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('list renders every registry job, tolerating unbuildable jobs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const info = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await schedHandler(argv({ action: 'list', root }), { backend: fakeBackend() })
    const out = info.mock.calls.map(c => String(c[0])).join('')
    info.mockRestore()
    expect(out).toContain('post-merge-poller')
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
})
```

- [ ] Run: `npx vitest run src/cli/commands/sched.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/cli/commands/sched.ts`:

```ts
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { pickSchedBackend } from '../../sched/platform.js'
import { SCHED_JOBS, type JobBuildOpts } from '../../sched/jobs.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

export interface SchedArgs {
  action: string
  job?: string
  interval?: number
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export interface SchedOverrides {
  backend?: SchedBackend
  buildJob?: (name: string, projectRoot: string, opts: JobBuildOpts) => SchedJob
}

export async function schedHandler(argv: SchedArgs, overrides: SchedOverrides = {}): Promise<void> {
  const outputMode = resolveOutputMode(argv)
  const output = createOutputContext(outputMode)
  const projectRoot = argv.root ?? process.cwd()

  let backend: SchedBackend
  try {
    backend = overrides.backend ?? pickSchedBackend()
  } catch (err) {
    output.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
    return
  }
  const buildJob =
    overrides.buildJob ??
    ((name: string, root: string, opts: JobBuildOpts): SchedJob => SCHED_JOBS[name](root, opts))

  const needJob = (): string | null => {
    const name = argv.job
    if (name === undefined || SCHED_JOBS[name] === undefined) {
      output.error(
        `sched ${argv.action}: unknown job "${name ?? ''}" — available: ${Object.keys(SCHED_JOBS).join(', ')}`,
      )
      process.exitCode = 1
      return null
    }
    return name
  }

  switch (argv.action) {
  case 'install': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, { intervalSeconds: argv.interval })
    } catch (err) {
      output.error(String(err instanceof Error ? err.message : err))
      process.exitCode = 1
      return
    }
    const res = backend.install(job)
    for (const m of res.messages) output.info(m)
    if (res.ok) {
      output.success(`sched: ${name} installed and verified (${backend.platform}, every ${job.intervalSeconds}s)`)
    } else {
      output.error(`sched: ${name} install FAILED — see messages above`)
      process.exitCode = 1
    }
    return
  }
  case 'uninstall': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, {})
    } catch (err) {
      output.error(String(err instanceof Error ? err.message : err))
      process.exitCode = 1
      return
    }
    const res = backend.uninstall(job)
    for (const m of res.messages) output.info(m)
    output.success(`sched: ${name} uninstalled`)
    return
  }
  case 'status': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, {})
    } catch (err) {
      output.error(String(err instanceof Error ? err.message : err))
      process.exitCode = 1
      return
    }
    const st = backend.status(job)
    if (argv.format === 'json') {
      output.result({ job: name, ...st })
    } else {
      output.info(`${name}: ${st.detail}`)
      output.info(`  unit: ${backend.unitPaths(job).join(', ')}`)
      output.info(`  last run: ${st.lastRunAt ?? 'never (no log yet)'}`)
    }
    if (!st.loaded) process.exitCode = 1
    return
  }
  case 'list': {
    for (const name of Object.keys(SCHED_JOBS)) {
      try {
        const st = backend.status(buildJob(name, projectRoot, {}))
        output.info(`${name}  ${st.loaded ? 'loaded' : st.installed ? 'installed (not loaded)' : 'not installed'}`)
      } catch (err) {
        output.info(`${name}  not installable: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return
  }
  default:
    output.error(`unknown sched action "${argv.action}"`)
    process.exitCode = 1
  }
}

const schedCommand: CommandModule<Record<string, unknown>, SchedArgs> = {
  command: 'sched <action> [job]',
  describe: 'Manage local scheduler jobs (launchd on macOS, systemd user timers on Linux)',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['install', 'uninstall', 'status', 'list'] as const,
        type: 'string',
        demandOption: true,
      })
      .positional('job', { type: 'string', describe: `Job name (${Object.keys(SCHED_JOBS).join(', ')})` })
      .option('interval', { type: 'number', describe: 'Run interval in seconds (install; default 600)' })
  },
  handler: async argv => schedHandler(argv),
}

export default schedCommand
```

- [ ] Register the command in `src/cli/index.ts` — Edit old string `import mqCommand from './commands/mq.js'` → new string:

```ts
import mqCommand from './commands/mq.js'
import schedCommand from './commands/sched.js'
```

then find the registration (`grep -n "command(mqCommand)" src/cli/index.ts`) and Edit old string `.command(mqCommand)` → new string:

```ts
.command(mqCommand)
    .command(schedCommand)
```

(match the file's existing chain indentation exactly — 4 spaces before `.command`).

- [ ] Run: `npx vitest run src/cli/commands/sched.test.ts` — expect 5 tests passed.
- [ ] Run: `npx tsc --noEmit -p tsconfig.json` — expect clean (no output). If the repo's TS gate is invoked differently, use `make ts-check`.
- [ ] Commit: `git add -A && git commit -m "feat(sched): scaffold sched CLI (install|uninstall|status|list) with platform dispatch"`

---

### Task 7: gate template — `gate-check.sh.tmpl` (full gate + GATE_PROBE mode)

**Files:**
- Create: `content/assets/agent-ops/gate/gate-check.sh.tmpl`
- Create: `tests/agent-ops-gate-check.bats`

**Interfaces:**
- Produces: template with markers `{{GATE_ENSURE_DEPS}}`, `{{GATE_RUNTIME_PROBES}}`, `{{GATE_PROBE_COMMANDS}}`, `{{GATE_FULL_COMMANDS}}` (resolved by `resolveSkillTemplate` at install time, Task 10).
- Consumes: nothing yet (installed by Task 10; probed by doctor's gate section and `mq bootstrap` preflight).

**Steps:**

- [ ] Write the failing bats test `tests/agent-ops-gate-check.bats`:

```bash
#!/usr/bin/env bats
# tests/agent-ops-gate-check.bats — generated full-gate seed (gate component).

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/scripts"
  render() { # $1=ensure_deps $2=runtime_probes $3=probe_cmds $4=full_cmds
    sed -e "s|{{GATE_ENSURE_DEPS}}|$1|g" \
        -e "s|{{GATE_RUNTIME_PROBES}}|$2|g" \
        -e "s|{{GATE_PROBE_COMMANDS}}|$3|g" \
        -e "s|{{GATE_FULL_COMMANDS}}|$4|g" \
      "$BATS_TEST_DIRNAME/../content/assets/agent-ops/gate/gate-check.sh.tmpl" \
      > "$TMP/scripts/gate-check.sh"
    chmod +x "$TMP/scripts/gate-check.sh"
  }
  render ":" "touch runtime-probed" "touch probe-cmds-ran" "touch full-ran"
}

teardown() { rm -rf "$TMP"; }

@test "GATE_PROBE=1 runs prerequisites but NOT the suite, and says so" {
  cd "$TMP"
  GATE_PROBE=1 run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/runtime-probed" ]
  [ -f "$TMP/probe-cmds-ran" ]
  [ ! -f "$TMP/full-ran" ]
  [[ "$output" == *"suite not run"* ]]
}

@test "full mode runs deps, runtime probes, then the full commands" {
  cd "$TMP"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/runtime-probed" ]
  [ -f "$TMP/full-ran" ]
}

@test "a failing full command fails the gate" {
  cd "$TMP"
  render ":" ":" ":" "false"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -ne 0 ]
}

@test "a failing runtime probe fails even probe mode (functional check, not command -v)" {
  cd "$TMP"
  render ":" "false" ":" "touch full-ran"
  GATE_PROBE=1 run "$TMP/scripts/gate-check.sh"
  [ "$status" -ne 0 ]
  [ ! -f "$TMP/full-ran" ]
}

@test "runs from the repo root regardless of caller cwd" {
  mkdir -p "$TMP/elsewhere"
  cd "$TMP/elsewhere"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/full-ran" ]
  [ ! -f "$TMP/elsewhere/full-ran" ]
}
```

- [ ] Run: `bats tests/agent-ops-gate-check.bats` — expect FAILURE (template missing).
- [ ] Create `content/assets/agent-ops/gate/gate-check.sh.tmpl`:

```bash
#!/usr/bin/env bash
# gate-check.sh — the FULL quality gate (`make check`).
# Seeded by: scaffold agent-ops install --component gate
#
# PROJECT-OWNED after generation (manifest seed:true): edit freely.
# `scaffold agent-ops check` reports this file only if it goes MISSING — never
# as drifted. Re-generating requires --force.
#
# Contract:
#   - Self-contained: installs dependencies before running (the merge queue and
#     the post-merge poller run it in FRESH worktrees with nothing installed).
#   - FUNCTIONAL runtime probes, never `command -v` (macOS /usr/bin/java is a
#     stub that exists but fails at run time — rumble lesson).
#   - GATE_PROBE=1: verify prerequisites (deps, runtimes, test-runner startup)
#     and exit WITHOUT running the suite. Used by `scaffold doctor` (gate
#     section) and `scaffold mq bootstrap` preflight.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- dependencies (self-contained on fresh worktrees) ------------------------
{{GATE_ENSURE_DEPS}}

# --- functional runtime probes ----------------------------------------------
{{GATE_RUNTIME_PROBES}}

if [ "${GATE_PROBE:-0}" = "1" ]; then
	# --- test-runner startup probes (no suite execution) --------------------
	{{GATE_PROBE_COMMANDS}}
	echo "gate-check: probe OK (prerequisites verified; suite not run)"
	exit 0
fi

# --- the full gate -----------------------------------------------------------
{{GATE_FULL_COMMANDS}}
```

- [ ] Run: `bats tests/agent-ops-gate-check.bats` — expect `1..5` with all `ok`.
- [ ] Run: `make lint` — ShellCheck must pass on the rendered form; the `.tmpl` extension keeps raw templates out of the lint sweep (same as the existing agent-ops templates — verify with `ls content/assets/agent-ops/merge-queue/`).
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): gate-check.sh seed template with GATE_PROBE mode"`

---

### Task 8: gate template — `gate-check-affected.sh.tmpl` (the mq contract)

**Files:**
- Create: `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`
- Create: `tests/agent-ops-gate-affected.bats`

**Interfaces:**
- Produces: template with markers `{{DEFAULT_BRANCH}}`, `{{GATE_ENSURE_DEPS}}`, `{{GATE_AFFECTED_INVOCATION}}`. Satisfies the contract in `content/knowledge/core/test-impact-analysis.md`: selects vs `${MQ_AFFECTED_BASE:-origin/<default>}` with a THREE-DOT diff; force-full on infra changes; excludes `.mq/quarantine.txt` ids from the merge gate; empty/unclassifiable diff ⇒ FULL run; `.mq-failed-tests.txt` is the optional flake-retry channel (documented in a comment; MAY, not MUST, per the knowledge entry).
- Consumes: `scripts/gate-check.sh` (Task 7 — the full-gate fallback and the GATE_PROBE delegate).

**Steps:**

- [ ] Write the failing bats test `tests/agent-ops-gate-affected.bats`:

```bash
#!/usr/bin/env bats
# tests/agent-ops-gate-affected.bats — generated affected-gate seed (mq contract).

setup() {
  TMP="$(mktemp -d)"
  cd "$TMP"
  git init -q -b main .
  git config user.email t@t.t
  git config user.name t
  mkdir -p scripts .mq
  sed -e 's|{{DEFAULT_BRANCH}}|main|g' \
      -e 's|{{GATE_ENSURE_DEPS}}|:|g' \
      -e 's|{{GATE_AFFECTED_INVOCATION}}|touch .affected-ran; printf "%s " "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}" > .exclude-args|g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/gate/gate-check-affected.sh.tmpl" \
    > scripts/gate-check-affected.sh
  chmod +x scripts/gate-check-affected.sh
  cat > scripts/gate-check.sh <<'EOF'
#!/usr/bin/env bash
if [ "${GATE_PROBE:-0}" = "1" ]; then touch .probe-delegated; exit 0; fi
touch .full-ran
EOF
  chmod +x scripts/gate-check.sh
  echo base > app.txt
  git add -A && git commit -qm base
  git checkout -qb feat
}

teardown() { rm -rf "$TMP"; }

@test "source change on the branch runs the affected selection" {
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "infra change (package.json) forces the FULL gate" {
  echo '{}' > package.json && git add -A && git commit -qm deps
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"infra change"* ]]
}

@test "empty diff against base forces the FULL gate, never zero tests" {
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [[ "$output" == *"empty diff"* ]]
}

@test "unresolvable base ref forces the FULL gate" {
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=origin/does-not-exist run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [[ "$output" == *"base ref"* ]]
}

@test "quarantined ids become --exclude args for the merge gate" {
  echo change >> app.txt && git commit -qam change
  printf 'tests/flaky.test.ts\n' > .mq/quarantine.txt
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  grep -q -- '--exclude tests/flaky.test.ts' .exclude-args
}

@test "GATE_PROBE=1 delegates to gate-check.sh probe mode without selecting" {
  echo change >> app.txt && git commit -qam change
  GATE_PROBE=1 MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .probe-delegated ]
  [ ! -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "uses a three-dot diff (base advancing does not force selection of base-side files)" {
  echo change >> app.txt && git commit -qam change
  git checkout -q main
  echo '{}' > package.json && git add -A && git commit -qm base-moved  # infra file lands on BASE
  git checkout -q feat
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  # two-dot would see base's package.json and force full; three-dot must not
  [ -f .affected-ran ]
  [ ! -f .full-ran ]
}
```

- [ ] Run: `bats tests/agent-ops-gate-affected.bats` — expect FAILURE (template missing).
- [ ] Create `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`:

```bash
#!/usr/bin/env bash
# gate-check-affected.sh — the AFFECTED-ONLY merge gate (`make check-affected`).
# Seeded by: scaffold agent-ops install --component gate
#
# PROJECT-OWNED after generation (manifest seed:true): edit freely.
# `scaffold agent-ops check` reports this file only if it goes MISSING.
#
# Satisfies the merge-queue contract (content/knowledge/core/test-impact-analysis.md):
#   - selects tests vs ${MQ_AFFECTED_BASE:-origin/{{DEFAULT_BRANCH}}} using a
#     THREE-DOT diff (base...HEAD) — never two-dot
#   - forces the FULL gate on infra changes (manifests, lockfiles, tool config,
#     workflows, shared test utils, env files, migrations, non-source data)
#   - excludes ids in .mq/quarantine.txt from the MERGE gate only (the
#     post-merge full gate still runs them — quarantine is a mute, not a delete)
#   - empty or unclassifiable diff ==> FULL run, never zero tests
#   - GATE_PROBE=1 delegates to gate-check.sh probe mode
#   - OPTIONAL flake-retry channel: on failure this script MAY write failing
#     test ids (one per line) to .mq-failed-tests.txt; wire your runner's
#     reporter to do so if you want the queue's cheap single-retry.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "${GATE_PROBE:-0}" = "1" ]; then
	GATE_PROBE=1 exec "$SCRIPT_DIR/gate-check.sh"
fi

full() {
	echo "gate-check-affected: falling back to FULL gate — $1" >&2
	exec "$SCRIPT_DIR/gate-check.sh"
}

BASE="${MQ_AFFECTED_BASE:-origin/{{DEFAULT_BRANCH}}}"
git rev-parse --verify --quiet "$BASE" >/dev/null || full "base ref $BASE not found"

# Three-dot: only the changes on THIS branch since it forked from base — a
# two-dot diff also counts base moving forward and over-selects after the
# queue advances the default branch mid-gate.
CHANGED="$(git diff --name-only "$BASE...HEAD")"
[ -n "$CHANGED" ] || full "empty diff against $BASE (cannot classify)"

# Force-full triggers (see the knowledge entry): when in doubt, add a glob — a
# false force-full costs minutes; a false narrow costs a landed regression.
is_force_full() {
	case "$1" in
	package.json|*/package.json|package-lock.json|pnpm-lock.yaml|yarn.lock|\
	pyproject.toml|uv.lock|Cargo.toml|Cargo.lock|go.mod|go.sum|\
	Makefile|tsconfig*.json|.swcrc|vitest.config.*|vite.config.*|playwright.config.*|\
	turbo.json|pytest.ini|.github/workflows/*|scripts/gate-check.sh|scripts/gate-check-affected.sh|\
	src/test-utils/*|conftest.py|.env*|migrations/*|*.sql|*.proto)
		return 0
		;;
	esac
	return 1
}
while IFS= read -r f || [ -n "$f" ]; do
	[ -n "$f" ] || continue
	if is_force_full "$f"; then full "infra change: $f"; fi
done <<EOF_CHANGED
$CHANGED
EOF_CHANGED

{{GATE_ENSURE_DEPS}}

# Quarantine: mute for the MERGE gate only (asymmetry is deliberate — the
# post-merge full gate does NOT read this list).
EXCLUDE_ARGS=()
if [ -f .mq/quarantine.txt ]; then
	while IFS= read -r id || [ -n "$id" ]; do
		[ -n "$id" ] || continue
		EXCLUDE_ARGS+=(--exclude "$id")
	done <.mq/quarantine.txt
fi

{{GATE_AFFECTED_INVOCATION}}
```

  Note the heredoc (`<<EOF_CHANGED`) instead of `<<<"$CHANGED"`: herestrings behave identically here, but the heredoc keeps the loop bash-3.2-safe and shellcheck-clean; `EXCLUDE_ARGS[@]+` expansion is the bash-3.2-safe empty-array idiom under `set -u`.

- [ ] Run: `bats tests/agent-ops-gate-affected.bats` — expect `1..7` with all `ok`.
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): gate-check-affected.sh seed template satisfying the mq contract"`

---

### Task 9: ingestion-lite — seed gate commands from package.json + workflows

**Files:**
- Create: `src/core/agent-ops/gate-ingest.ts`
- Create: `src/core/agent-ops/gate-ingest.test.ts`

**Interfaces:**
- Produces: `GateSeed { gateCommands, probeCommands, runtimeProbes, affectedInvocation, visualCommands, ensureDeps, sources }`, `ingestGateSeed(projectRoot: string): GateSeed`, `gateTemplateVars(seed: GateSeed): Record<string, string>`.
- Consumes: `js-yaml` (existing dependency) for `.github/workflows/*.yml` parsing.

**Steps:**

- [ ] Write the failing test `src/core/agent-ops/gate-ingest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gateTemplateVars, ingestGateSeed } from './gate-ingest.js'

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ingest-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return root
}

describe('ingestGateSeed', () => {
  it('classifies package.json scripts: lint/typecheck/test to the gate, visual/e2e excluded', () => {
    const root = project({
      'package.json': JSON.stringify({
        scripts: {
          lint: 'biome check .',
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          'test:visual': 'playwright test --grep @visual',
          e2e: 'playwright test',
        },
        devDependencies: { vitest: '^3.0.0' },
      }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.gateCommands).toEqual(['npm run lint', 'npm run typecheck', 'npm run test'])
    expect(seed.visualCommands).toEqual(['npm run test:visual', 'npm run e2e'])
    expect(seed.sources).toContain('package.json:scripts.lint')
  })
  it('detects vitest and emits the --changed affected invocation with quarantine expansion', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.affectedInvocation).toBe(
      'npx vitest run --changed "$BASE" ${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}',
    )
    expect(seed.probeCommands).toEqual(['npx vitest --version >/dev/null'])
  })
  it('falls back to the full gate when no affected-capable runner is detected', () => {
    const root = project({ 'package.json': JSON.stringify({ scripts: { test: 'mocha' } }) })
    expect(ingestGateSeed(root).affectedInvocation).toBe(
      'full "no affected-selection runner detected at seed time"',
    )
  })
  it('extracts additional test commands from workflow run: steps, deduplicated', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
      '.github/workflows/ci.yml': [
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: npm run test',
        '      - run: npx tsc --noEmit',
        '      - run: echo hello',
      ].join('\n'),
    })
    const seed = ingestGateSeed(root)
    expect(seed.gateCommands).toContain('npx tsc --noEmit')
    expect(seed.gateCommands.filter(c => c === 'npm run test').length).toBe(1)
    expect(seed.gateCommands).not.toContain('echo hello')
    expect(seed.sources.join('\n')).toContain('.github/workflows/ci.yml')
  })
  it('adds a functional java runtime probe when scripts mention java/emulators', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'firebase emulators:exec "vitest run"' }, devDependencies: { vitest: '^3' } }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.runtimeProbes.join('\n')).toContain('java -version')
  })
  it('non-node projects get a no-op ensureDeps and a fail-loud empty gate', () => {
    const root = project({})
    const seed = ingestGateSeed(root)
    expect(seed.ensureDeps).toBe(':')
    const vars = gateTemplateVars(seed)
    expect(vars.GATE_FULL_COMMANDS).toContain('no gate commands were detected')
    expect(vars.GATE_FULL_COMMANDS).toContain('exit 1')
  })
})

describe('gateTemplateVars', () => {
  it('maps every marker the two templates consume', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
    })
    const vars = gateTemplateVars(ingestGateSeed(root))
    for (const key of [
      'GATE_ENSURE_DEPS', 'GATE_RUNTIME_PROBES', 'GATE_PROBE_COMMANDS',
      'GATE_FULL_COMMANDS', 'GATE_AFFECTED_INVOCATION',
    ]) {
      expect(vars[key], key).toBeTypeOf('string')
      expect(vars[key].length, key).toBeGreaterThan(0)
    }
  })
})
```

- [ ] Run: `npx vitest run src/core/agent-ops/gate-ingest.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/core/agent-ops/gate-ingest.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

/** Ingestion-lite (spec D7 / D10-lite): seed the generated gate from what the
 *  project already runs — package.json scripts and CI workflow run: lines.
 *  Never invent; what cannot be classified is left out and the seed fails loud. */
export interface GateSeed {
  /** Commands the merge gate runs (lint, typecheck, unit — ordered). */
  gateCommands: string[]
  /** Test-runner startup probes for GATE_PROBE mode (no suite execution). */
  probeCommands: string[]
  /** Functional runtime checks that always run (node, java-not-stub). */
  runtimeProbes: string[]
  /** The affected-selection line for gate-check-affected.sh (or its full fallback). */
  affectedInvocation: string
  /** Environment-sensitive suites — EXCLUDED from the queue gate (rumble lesson). */
  visualCommands: string[]
  /** Self-contained dependency install ('[ -d node_modules ] || npm ci' or ':'). */
  ensureDeps: string
  /** Provenance lines, e.g. "package.json:scripts.test". */
  sources: string[]
}

const ENV_SENSITIVE_RE = /playwright|cypress|screenshot|visual|storybook|percy|chromatic|\be2e\b|end-to-end/i
const GATE_SCRIPT_ORDER = ['lint', 'typecheck', 'check', 'test'] as const
const WORKFLOW_CMD_RE = /^(npm|npx|yarn|pnpm|make|pytest|go test|cargo|bats)\b/
const WORKFLOW_TESTISH_RE = /test|lint|check|tsc|vitest|pytest|bats/i
const JAVA_RE = /\bjava\b|emulators:exec|firebase.*emulators/i

interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPackageJson(projectRoot: string): PackageJson | null {
  const p = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

function workflowRunLines(projectRoot: string): { file: string; run: string }[] {
  const dir = path.join(projectRoot, '.github', 'workflows')
  if (!fs.existsSync(dir)) return []
  const out: { file: string; run: string }[] = []
  for (const name of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const rel = path.posix.join('.github/workflows', name)
    let doc: unknown
    try {
      doc = yaml.load(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      continue // unparseable workflow — skip, never guess
    }
    const jobs = (doc as { jobs?: Record<string, { steps?: { run?: unknown }[] }> } | null)?.jobs
    if (!jobs || typeof jobs !== 'object') continue
    for (const job of Object.values(jobs)) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.run !== 'string') continue
        for (const line of step.run.split('\n')) {
          const cmd = line.trim()
          if (cmd !== '') out.push({ file: rel, run: cmd })
        }
      }
    }
  }
  return out
}

export function ingestGateSeed(projectRoot: string): GateSeed {
  const pkg = readPackageJson(projectRoot)
  const gateCommands: string[] = []
  const visualCommands: string[] = []
  const sources: string[] = []
  let mentionsJava = false

  const scripts = pkg?.scripts ?? {}
  const scriptNames = Object.keys(scripts)
  const ordered = [
    ...GATE_SCRIPT_ORDER.filter(n => scriptNames.includes(n)),
    ...scriptNames.filter(n => !(GATE_SCRIPT_ORDER as readonly string[]).includes(n)).sort(),
  ]
  for (const name of ordered) {
    const body = scripts[name]
    if (JAVA_RE.test(body)) mentionsJava = true
    const testish = /test|lint|typecheck|check|e2e/i.test(name)
    if (!testish) continue
    if (ENV_SENSITIVE_RE.test(name) || ENV_SENSITIVE_RE.test(body)) {
      visualCommands.push(`npm run ${name}`)
      sources.push(`package.json:scripts.${name} (environment-sensitive — excluded from the queue gate)`)
    } else {
      gateCommands.push(`npm run ${name}`)
      sources.push(`package.json:scripts.${name}`)
    }
  }

  for (const { file, run } of workflowRunLines(projectRoot)) {
    if (!WORKFLOW_CMD_RE.test(run) || !WORKFLOW_TESTISH_RE.test(run)) continue
    if (JAVA_RE.test(run)) mentionsJava = true
    if (ENV_SENSITIVE_RE.test(run)) {
      if (!visualCommands.includes(run)) {
        visualCommands.push(run)
        sources.push(`${file}: ${run} (environment-sensitive — excluded from the queue gate)`)
      }
    } else if (!gateCommands.includes(run)) {
      gateCommands.push(run)
      sources.push(`${file}: ${run}`)
    }
  }

  const hasVitest =
    pkg !== null &&
    (pkg.devDependencies?.vitest !== undefined || pkg.dependencies?.vitest !== undefined)

  const runtimeProbes: string[] = []
  if (pkg !== null) {
    runtimeProbes.push(
      'node --version >/dev/null 2>&1 || { echo "gate-check: node is not on PATH" >&2; exit 1; }',
    )
  }
  if (mentionsJava) {
    runtimeProbes.push(
      'java -version >/dev/null 2>&1 || { echo "gate-check: java is not functional (macOS stub?) — brew install openjdk" >&2; exit 1; }',
    )
  }

  return {
    gateCommands,
    probeCommands: hasVitest ? ['npx vitest --version >/dev/null'] : [],
    runtimeProbes,
    affectedInvocation: hasVitest
      ? 'npx vitest run --changed "$BASE" ${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}'
      : 'full "no affected-selection runner detected at seed time"',
    visualCommands,
    ensureDeps: pkg !== null ? '[ -d node_modules ] || npm ci' : ':',
    sources,
  }
}

/** Marker map for the two gate templates (Task 7 + Task 8). */
export function gateTemplateVars(seed: GateSeed): Record<string, string> {
  return {
    GATE_ENSURE_DEPS: seed.ensureDeps,
    GATE_RUNTIME_PROBES: seed.runtimeProbes.length > 0 ? seed.runtimeProbes.join('\n') : ':',
    GATE_PROBE_COMMANDS: seed.probeCommands.length > 0 ? seed.probeCommands.join('\n') : ':',
    GATE_FULL_COMMANDS:
      seed.gateCommands.length > 0
        ? seed.gateCommands.join('\n')
        : 'echo "gate-check: no gate commands were detected at seed time — add your test/lint commands here" >&2; exit 1',
    GATE_AFFECTED_INVOCATION: seed.affectedInvocation,
  }
}
```

- [ ] Run: `npx vitest run src/core/agent-ops/gate-ingest.test.ts` — expect 8 tests passed.
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): ingestion-lite gate seeding from package.json scripts + CI workflows"`

---

### Task 10: gate install plumbing — seed manifest semantics + FILE_MAP + Makefile targets

**Files:**
- Modify: `src/core/agent-ops/install.ts`
- Create: `src/core/agent-ops/install.gate.test.ts`

**Interfaces:**
- Produces: `AgentOpsComponent` gains `'gate'`; `AgentOpsFileSpec` gains `seed?: boolean`; `Manifest` gains `seeds: string[]`; `AgentOpsInstallOptions` gains `gateSeed?: GateSeed`; `AgentOpsInstallResult` gains `seedKept: string[]`; `AgentOpsCheckResult` unchanged shape (seeds feed `missing` only); `ensureGateMakeTargets(projectRoot: string, seed: GateSeed): string[]` (exported).
- Consumes: `GateSeed`/`gateTemplateVars` (Task 9), gate templates (Tasks 7–8), existing `AGENT_OPS_FILE_MAP` (`src/core/agent-ops/install.ts:17-113`), manifest read/write (`~115-160`), `ensureMakefileInclude` (`~223-233`), `resolveSkillTemplate`.

**Steps:**

- [ ] Write the failing test `src/core/agent-ops/install.gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkAgentOps, ensureGateMakeTargets, installAgentOps } from './install.js'
import { ingestGateSeed } from './gate-ingest.js'

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-gate-'))
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'vitest run', 'test:visual': 'playwright test' }, devDependencies: { vitest: '^3' } }),
  )
  return root
}

function install(root: string) {
  return installAgentOps(root, { components: ['gate'], gateSeed: ingestGateSeed(root) })
}

describe('gate component install', () => {
  it('generates both seed scripts executable, resolved from the ingestion seed', () => {
    const root = tmpProject()
    const res = install(root)
    expect(res.errors).toEqual([])
    const gc = path.join(root, 'scripts', 'gate-check.sh')
    const ga = path.join(root, 'scripts', 'gate-check-affected.sh')
    for (const p of [gc, ga]) {
      expect(fs.existsSync(p)).toBe(true)
      expect(fs.statSync(p).mode & 0o111).not.toBe(0)
      expect(fs.readFileSync(p, 'utf8')).not.toContain('{{')
    }
    expect(fs.readFileSync(gc, 'utf8')).toContain('npm run test')
    expect(fs.readFileSync(ga, 'utf8')).toContain('vitest run --changed')
  })
  it('records seeds in manifest.seeds (not files) and never overwrites an existing seed', () => {
    const root = tmpProject()
    install(root)
    const manifestPath = path.join(root, '.scaffold', 'agent-ops-manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      files: Record<string, string>
      seeds: string[]
    }
    expect(manifest.seeds.sort()).toEqual(['scripts/gate-check-affected.sh', 'scripts/gate-check.sh'])
    expect(manifest.files['scripts/gate-check.sh']).toBeUndefined()
    const gc = path.join(root, 'scripts', 'gate-check.sh')
    fs.writeFileSync(gc, '#!/bin/bash\n# project-customized\n')
    const second = install(root)
    expect(second.seedKept).toContain('scripts/gate-check.sh')
    expect(fs.readFileSync(gc, 'utf8')).toContain('project-customized')
  })
  it('agent-ops check reports a seed only when MISSING, never as drifted', () => {
    const root = tmpProject()
    install(root)
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'edited\n')
    let res = checkAgentOps(root)
    expect(res.modified).not.toContain('scripts/gate-check.sh')
    expect(res.missing).not.toContain('scripts/gate-check.sh')
    fs.rmSync(path.join(root, 'scripts', 'gate-check.sh'))
    res = checkAgentOps(root)
    expect(res.missing).toContain('scripts/gate-check.sh')
    expect(res.upToDate).toBe(false)
  })
  it('--force regenerates a seed from the current ingestion', () => {
    const root = tmpProject()
    install(root)
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'edited\n')
    const res = installAgentOps(root, { components: ['gate'], gateSeed: ingestGateSeed(root), force: true })
    expect(res.installed).toContain('scripts/gate-check.sh')
    expect(fs.readFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'utf8')).toContain('GATE_PROBE')
  })
  it('requires a gateSeed when the gate component is requested', () => {
    const root = tmpProject()
    expect(() => installAgentOps(root, { components: ['gate'] })).toThrow(/gateSeed/)
  })
})

describe('ensureGateMakeTargets', () => {
  it('appends thin check/check-affected targets when absent, plus check-visual when seeded', () => {
    const root = tmpProject()
    const added = ensureGateMakeTargets(root, ingestGateSeed(root))
    expect(added.sort()).toEqual(['check', 'check-affected', 'check-visual'])
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(mk).toContain('check:')
    expect(mk).toContain('\t./scripts/gate-check.sh')
    expect(mk).toContain('check-affected:')
    expect(mk).toContain('\t./scripts/gate-check-affected.sh')
    expect(mk).toContain('check-visual:')
    expect(mk).toContain('\tnpm run test:visual')
  })
  it('never duplicates an existing target (check: present ==> only the others append)', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'Makefile'), 'check: lint\n\t@echo custom\n')
    const added = ensureGateMakeTargets(root, ingestGateSeed(root))
    expect(added).not.toContain('check')
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(mk.match(/^check:/gm)?.length).toBe(1)
    expect(mk).toContain('@echo custom')
  })
  it('is idempotent', () => {
    const root = tmpProject()
    ensureGateMakeTargets(root, ingestGateSeed(root))
    const before = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(ensureGateMakeTargets(root, ingestGateSeed(root))).toEqual([])
    expect(fs.readFileSync(path.join(root, 'Makefile'), 'utf8')).toBe(before)
  })
})
```

- [ ] Run: `npx vitest run src/core/agent-ops/install.gate.test.ts` — expect FAILURE.
- [ ] Edit `src/core/agent-ops/install.ts`. The complete set of changes:

  1. Type + import changes at the top:

```ts
import { gateTemplateVars, type GateSeed } from './gate-ingest.js'

export type AgentOpsComponent = 'git' | 'staging' | 'merge-queue' | 'ci' | 'gate'

export interface AgentOpsFileSpec {
  dest: string
  component: AgentOpsComponent
  executable: boolean
  /** seed:true = generated ONCE, project-owned afterward: `agent-ops check`
   *  reports it only when missing (never drifted); re-install never overwrites
   *  without --force (spec D7). */
  seed?: boolean
}
```

  2. Add the gate entries to `AGENT_OPS_FILE_MAP` (after the `merge-queue/post-merge-poller.sh.tmpl` entry):

```ts
  'gate/gate-check.sh.tmpl': {
    dest: 'scripts/gate-check.sh',
    component: 'gate',
    executable: true,
    seed: true,
  },
  'gate/gate-check-affected.sh.tmpl': {
    dest: 'scripts/gate-check-affected.sh',
    component: 'gate',
    executable: true,
    seed: true,
  },
```

  3. Extend the options/result/manifest interfaces:

```ts
export interface AgentOpsInstallOptions {
  components: AgentOpsComponent[]
  force?: boolean
  /** Required when components includes 'gate' (Task 9 ingestion output). */
  gateSeed?: GateSeed
  /** Test override for content/assets/agent-ops */
  templateRoot?: string
}

export interface AgentOpsInstallResult {
  installed: string[]
  skippedModified: string[]
  /** Seed files that already existed — kept untouched (project-owned). */
  seedKept: string[]
  errors: string[]
}

interface Manifest {
  version: string
  files: Record<string, string>
  /** Dests generated with seed:true — presence-checked only, never hashed. */
  seeds: string[]
}
```

  4. `readManifest` gains the seeds default (backward-compatible with pre-R2 manifests):

```ts
function readManifest(projectRoot: string): Manifest {
  const p = path.join(projectRoot, MANIFEST_PATH)
  if (!fs.existsSync(p)) return { version: '', files: {}, seeds: [] }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<Manifest>
  return { version: raw.version ?? '', files: raw.files ?? {}, seeds: raw.seeds ?? [] }
}
```

  5. In `installAgentOps`: initialize `seedKept: []` in the result; guard the gate precondition right after `const manifest = readManifest(projectRoot)`:

```ts
  if (opts.components.includes('gate') && opts.gateSeed === undefined) {
    throw new Error('gate component requires a gateSeed — run ingestGateSeed(projectRoot) first')
  }
  const vars = {
    ...buildTemplateVars(config, projectRoot),
    ...(opts.gateSeed !== undefined ? gateTemplateVars(opts.gateSeed) : {}),
  }
```

  (replacing the existing `const vars = buildTemplateVars(config, projectRoot)` line), and replace the body of the per-file loop's overwrite guard with seed-aware logic:

```ts
    const destPath = path.join(projectRoot, spec.dest)
    if (spec.seed === true && fs.existsSync(destPath) && !opts.force) {
      // Project-owned seed: NEVER overwrite without --force, regardless of hash.
      result.seedKept.push(spec.dest)
      if (!manifest.seeds.includes(spec.dest)) manifest.seeds.push(spec.dest)
      continue
    }
    if (spec.seed !== true && fs.existsSync(destPath) && !opts.force) {
      // Overwrite only files we own (manifest entry exists) and that are
      // unmodified (manifest hash matches disk). A file with no manifest
      // entry is a pre-existing user file — never clobber it without force.
      const onDisk = sha256(fs.readFileSync(destPath))
      const recorded = manifest.files[spec.dest]
      if (!recorded || recorded !== onDisk) {
        result.skippedModified.push(spec.dest)
        continue
      }
    }
```

  and in the success branch of the try block, record seeds separately:

```ts
      if (spec.seed === true) {
        if (!manifest.seeds.includes(spec.dest)) manifest.seeds.push(spec.dest)
      } else {
        manifest.files[spec.dest] = sha256(resolved)
      }
      result.installed.push(spec.dest)
```

  6. After the existing `ensureMakefileInclude` call at the bottom of `installAgentOps`, add:

```ts
  if (opts.components.includes('gate') && opts.gateSeed !== undefined) {
    ensureGateMakeTargets(projectRoot, opts.gateSeed)
  }
```

  7. In `checkAgentOps`: after the existing files loop, add the seed presence check, and exclude seed dests from the unmanaged sweep:

```ts
  for (const dest of manifest.seeds) {
    if (!fs.existsSync(path.join(projectRoot, dest))) missing.push(dest)
  }
```

  and change the unmanaged loop's condition to also skip seeds:

```ts
    if (componentInstalled && !manifest.files[spec.dest] && !manifest.seeds.includes(spec.dest)) {
      unmanaged.push(spec.dest)
    }
```

  Also update `installedComponents` derivation so gate counts as installed via seeds:

```ts
  for (const spec of Object.values(AGENT_OPS_FILE_MAP)) {
    if (manifest.files[spec.dest] || manifest.seeds.includes(spec.dest)) {
      installedComponents.add(spec.component)
    }
  }
```

  8. Append the new exported function at the end of the file:

```ts
/** Thin, project-owned Makefile targets wiring the seeds into the mq contract
 *  (`make check` / `make check-affected`). Appended ONLY when absent — an
 *  existing target of the same name is always respected (D7). */
export function ensureGateMakeTargets(projectRoot: string, seed: GateSeed): string[] {
  const mkPath = path.join(projectRoot, 'Makefile')
  const body = fs.existsSync(mkPath) ? fs.readFileSync(mkPath, 'utf8') : ''
  const hasTarget = (name: string): boolean => new RegExp(`^${name}:`, 'm').test(body)
  const additions: string[] = []
  let out = body
  const sep = (): string => (out === '' || out.endsWith('\n') ? '' : '\n')
  if (!hasTarget('check')) {
    out += `${sep()}\ncheck: ## Full quality gate (seeded — scripts/gate-check.sh is project-owned)\n\t./scripts/gate-check.sh\n`
    additions.push('check')
  }
  if (!hasTarget('check-affected')) {
    out += `${sep()}\ncheck-affected: ## Affected-only merge gate (seeded — scripts/gate-check-affected.sh)\n\t./scripts/gate-check-affected.sh\n`
    additions.push('check-affected')
  }
  if (seed.visualCommands.length > 0 && !hasTarget('check-visual')) {
    out += `${sep()}\ncheck-visual: ## Environment-sensitive suites — EXCLUDED from the merge-queue gate\n\t${seed.visualCommands.join('\n\t')}\n`
    additions.push('check-visual')
  }
  if (out !== body) fs.writeFileSync(mkPath, out)
  return additions
}
```

- [ ] Run: `npx vitest run src/core/agent-ops/install.gate.test.ts` — expect 8 tests passed.
- [ ] Run: `npx vitest run src/core/agent-ops src/cli/commands/agent-ops.test.ts` — the pre-existing install/check tests must still pass (the `seeds: []`/`seedKept: []` additions are backward-compatible; fix any result-shape assertion that lists exact keys).
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): gate component with seed:true manifest semantics + thin Makefile targets"`

---

### Task 11: agent-ops CLI wiring for gate — classification report, excluded from `all`

**Files:**
- Modify: `src/cli/commands/agent-ops.ts`
- Modify: `src/cli/commands/agent-ops.test.ts`

**Interfaces:**
- Produces: `resolveComponents` accepts `'gate'` (single; `all` unchanged = `['git','staging']`); install handler runs `ingestGateSeed` when gate is requested, prints the classification with provenance, passes `gateSeed` through, and prints `seedKept` lines.
- Consumes: `ingestGateSeed` (Task 9), `installAgentOps` with `gateSeed` (Task 10).

**Note (spec ambiguity resolved):** D7's "prompted classification of environment-sensitive suites" is realized as: the CLI prints the full classification (gate vs excluded/visual, each line with its provenance) before writing, and the seeds are project-owned files reviewed before commit; the interactive prompt itself lives in the generation-layer content (Task 19's merge-throughput/tdd prompts direct the agent to confirm the classification with the user). The CLI stays non-interactive, consistent with every other `agent-ops install` path.

**Steps:**

- [ ] Add the failing tests to `src/cli/commands/agent-ops.test.ts` (append to the existing `resolveComponents — new components` describe block or add a sibling):

```ts
describe('resolveComponents — gate (R2)', () => {
  it('accepts gate individually', () => {
    expect(resolveComponents('gate')).toEqual(['gate'])
  })
  it('keeps gate OUT of all/default (explicit opt-in like merge-queue/ci)', () => {
    expect(resolveComponents('all')).toEqual(['git', 'staging'])
    expect(resolveComponents(undefined)).toEqual(['git', 'staging'])
  })
  it('names gate in the unknown-component error', () => {
    expect(() => resolveComponents('nope')).toThrow(/gate/)
  })
})
```

- [ ] Run: `npx vitest run src/cli/commands/agent-ops.test.ts` — expect FAILURE (gate rejected).
- [ ] Edit `src/cli/commands/agent-ops.ts`:

  1. Replace `resolveComponents`:

```ts
export function resolveComponents(raw: string | undefined): AgentOpsComponent[] {
  // 'all'/default stays git+staging on purpose: merge-queue, ci, and gate are
  // explicit opt-ins so upgrade re-installs never surprise existing projects
  // with workflows, merge guards, or generated gate scripts.
  if (raw === undefined || raw === 'all') return ['git', 'staging']
  if (raw === 'git' || raw === 'staging' || raw === 'merge-queue' || raw === 'ci' || raw === 'gate') {
    return [raw]
  }
  throw new Error(`unknown component "${raw}" (expected git, staging, merge-queue, ci, gate, or all)`)
}
```

  2. Import the ingestion at the top:

```ts
import { ingestGateSeed, type GateSeed } from '../../core/agent-ops/gate-ingest.js'
```

  3. In the handler's install path, replace the `installAgentOps` call block:

```ts
    let gateSeed: GateSeed | undefined
    if (components.includes('gate')) {
      gateSeed = ingestGateSeed(projectRoot)
      output.info('gate seed classification (ingestion-lite — review the generated scripts before committing):')
      for (const src of gateSeed.sources) output.info(`  ${src}`)
      if (gateSeed.gateCommands.length === 0) {
        output.warn('  no gate commands detected — the seed will fail loudly until you add your test/lint commands')
      }
      for (const v of gateSeed.visualCommands) {
        output.info(`  excluded from the queue gate (run via make check-visual): ${v}`)
      }
    }

    const result = installAgentOps(projectRoot, { components, force: argv.force, gateSeed })

    for (const f of result.installed) output.info(`installed ${f}`)
    for (const f of result.seedKept) {
      output.info(`seed kept (project-owned — use --force to regenerate from ingestion): ${f}`)
    }
    for (const f of result.skippedModified) {
      output.warn(`SKIPPED (locally modified or pre-existing — use --force to overwrite): ${f}`)
    }
    for (const e of result.errors) output.error(e)
```

  4. Update the `--component` option describe string to `'git | staging | merge-queue | ci | gate | all (default all = git+staging)'`.

- [ ] Run: `npx vitest run src/cli/commands/agent-ops.test.ts` — expect all tests passed (pre-existing + 3 new).
- [ ] End-to-end smoke (from the repo root, against a throwaway dir):

```bash
T="$(mktemp -d)" && mkdir -p "$T/.scaffold" \
  && printf 'project_name: demo\n' > "$T/.scaffold/agent-ops.yaml" \
  && printf '{"scripts":{"test":"vitest run"},"devDependencies":{"vitest":"^3"}}' > "$T/package.json" \
  && npx tsx src/cli/index.ts agent-ops install --component gate --root "$T" \
  && GATE_PROBE=1 bash "$T/scripts/gate-check-affected.sh" || true
```

  Expected: classification lines, `installed scripts/gate-check.sh`, `installed scripts/gate-check-affected.sh`; the probe delegation may fail on npm ci in the throwaway dir — the point is the scripts exist, are executable, and contain no `{{` markers (`grep -c '{{' "$T/scripts/"*.sh` → both 0). (If the repo invokes the CLI differently in dev, use `node dist/...` after `npm run build` or the repo's documented dev-run command.)
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): gate component CLI wiring — classification report, opt-in posture"`

---

### Task 12: hooks install core — `.claude/settings.json` deep-merge in TypeScript (D8)

**Files:**
- Create: `src/core/hooks/install.ts`
- Create: `src/core/hooks/install.test.ts`

**Interfaces:**
- Produces: `ClaudeSettings { hooks?: Record<string, HookEntry[]>; [k]: unknown }`, `HookEntry { matcher?, hooks: HookCommand[] }`, `HookCommand { type: 'command', command }`, `HookSpec { id, event, marker, entry, describe, prerequisite(projectRoot) }`, `HOOK_SPECS: HookSpec[]` (the four D8 hooks), `REVIEW_REMINDER_COMMAND`, `SETTINGS_PATH = '.claude/settings.json'`, `readSettings(projectRoot): ClaudeSettings`, `writeSettings(projectRoot, settings)` (atomic), `planHooks(projectRoot, settings): HookPlan` (pure), `applyHookPlan(settings, plan): ClaudeSettings` (pure), `installHooks(projectRoot): HooksInstallResult { added, alreadyPresent, skipped, settingsPath, changed }`.
- Consumes: nothing (foundation — the CLI in Task 13, the bootstrap arm step in Task 15, the doctor fix in Task 16, and the plan preview in Task 18 all consume this module).

**Semantics being replaced** (read `content/pipeline/environment/git-workflow.md:213-251` — the two jq snippets): create `.claude/settings.json` with `{}` when absent; append the hook entry to `hooks.PreToolUse` (`(.hooks.PreToolUse // []) + [entry]`) ONLY when a marker string (`bd-guard.sh` / `mq-guard.sh`) is not already present; never overwrite the file or drop unrelated entries (`bd setup claude` hooks and user hooks own entries there); bd-guard is gated on `[ -d .beads ] && [ -x scripts/bd-guard.sh ]`, mq-guard on `[ -x scripts/mq-guard.sh ]`. The TS version keeps exactly those merge semantics, adds the SessionStart `bd prime` and PostToolUse review-reminder hooks (spec D8), makes every skipped prerequisite an explicit report line (no more silent `-d .beads` no-op), and writes atomically (temp file + rename — a jq-to-temp-then-mv equivalent, minus the jq dependency).

**Steps:**

- [ ] Write the failing test `src/core/hooks/install.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  REVIEW_REMINDER_COMMAND, SETTINGS_PATH,
  applyHookPlan, installHooks, planHooks,
  type ClaudeSettings,
} from './install.js'

function project(opts: {
  beads?: boolean
  bdGuard?: boolean
  mqGuard?: boolean
  settings?: unknown
} = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-install-'))
  if (opts.beads === true) fs.mkdirSync(path.join(root, '.beads'))
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  if (opts.bdGuard === true) {
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
  }
  if (opts.mqGuard === true) {
    fs.writeFileSync(path.join(root, 'scripts', 'mq-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
  }
  if (opts.settings !== undefined) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      typeof opts.settings === 'string' ? opts.settings : JSON.stringify(opts.settings, null, 2),
    )
  }
  return root
}

function readBack(root: string): ClaudeSettings {
  return JSON.parse(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')) as ClaudeSettings
}

describe('installHooks (D8)', () => {
  it('registers all four hooks on a fully-provisioned project and creates the file', () => {
    const root = project({ beads: true, bdGuard: true, mqGuard: true })
    const res = installHooks(root)
    expect(res.added).toHaveLength(4)
    expect(res.skipped).toEqual([])
    expect(res.changed).toBe(true)
    const s = readBack(root)
    expect(s.hooks?.SessionStart?.[0].hooks[0].command).toBe('bd prime --hook-json')
    const preCommands = (s.hooks?.PreToolUse ?? []).map(e => e.hooks[0].command)
    expect(preCommands).toEqual(['scripts/bd-guard.sh', 'scripts/mq-guard.sh'])
    expect((s.hooks?.PreToolUse ?? []).every(e => e.matcher === 'Bash')).toBe(true)
    expect(s.hooks?.PostToolUse?.[0].hooks[0].command).toBe(REVIEW_REMINDER_COMMAND)
  })
  it('is idempotent — the second run changes nothing', () => {
    const root = project({ beads: true, bdGuard: true, mqGuard: true })
    installHooks(root)
    const before = fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')
    const res = installHooks(root)
    expect(res.changed).toBe(false)
    expect(res.added).toEqual([])
    expect(res.alreadyPresent).toHaveLength(4)
    expect(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')).toBe(before)
  })
  it('preserves pre-existing user hooks and unrelated settings keys (jq-parity)', () => {
    const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/my-custom-hook.sh' }] }
    const root = project({
      beads: true, bdGuard: true, mqGuard: true,
      settings: {
        permissions: { allow: ['Bash(npm:*)'] },
        hooks: {
          PreToolUse: [userHook],
          Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }],
        },
      },
    })
    installHooks(root)
    const s = readBack(root)
    expect(s['permissions']).toEqual({ allow: ['Bash(npm:*)'] })
    expect(s.hooks?.Stop?.[0].hooks[0].command).toBe('echo done')
    const preCommands = (s.hooks?.PreToolUse ?? []).map(e => e.hooks[0].command)
    expect(preCommands[0]).toBe('scripts/my-custom-hook.sh') // appended after, never replaced
    expect(preCommands).toContain('scripts/bd-guard.sh')
    expect(preCommands).toContain('scripts/mq-guard.sh')
  })
  it('detects an equivalent gh pr create reminder (automated-pr-review variant) by marker', () => {
    const root = project({
      settings: {
        hooks: {
          PostToolUse: [{
            matcher: 'Bash',
            hooks: [{
              type: 'command',
              command: "jq -r '.tool_input.command // empty' | grep -q 'gh pr create' && echo 'REVIEW REQUIRED' || true",
            }],
          }],
        },
      },
    })
    const res = installHooks(root)
    expect(res.alreadyPresent).toEqual(['PostToolUse: gh pr create review reminder (mmr review)'])
    expect(readBack(root).hooks?.PostToolUse).toHaveLength(1)
  })
  it('reports every skipped hook with its missing prerequisite (no silent no-op)', () => {
    const root = project({}) // no .beads, no guard scripts
    const res = installHooks(root)
    expect(res.added).toHaveLength(1) // only the reminder has no prerequisite
    expect(res.skipped).toHaveLength(3)
    const reasons = res.skipped.map(s => s.reason).join('\n')
    expect(reasons).toMatch(/\.beads\/ not found/)
    expect(reasons).toMatch(/mq-guard\.sh missing or not executable/)
  })
  it('bd-guard requires the script to be EXECUTABLE, mirroring the old [ -x ] gate', () => {
    const root = project({ beads: true })
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o644 })
    const res = installHooks(root)
    expect(res.skipped.map(s => s.reason).join('\n')).toMatch(/bd-guard\.sh missing or not executable/)
  })
  it('refuses to touch a malformed settings.json (never clobber)', () => {
    const root = project({ beads: true, bdGuard: true, settings: '{ not json' })
    expect(() => installHooks(root)).toThrow()
    expect(fs.readFileSync(path.join(root, SETTINGS_PATH), 'utf8')).toBe('{ not json')
  })
  it('writes atomically — no temp file left behind', () => {
    const root = project({ mqGuard: true })
    installHooks(root)
    expect(fs.readdirSync(path.join(root, '.claude'))).toEqual(['settings.json'])
  })
})

describe('planHooks / applyHookPlan (pure halves — reused read-only by the adopt plan preview)', () => {
  it('planHooks never mutates its inputs', () => {
    const root = project({ mqGuard: true })
    const settings: ClaudeSettings = { hooks: { PreToolUse: [] } }
    const snapshot = JSON.stringify(settings)
    planHooks(root, settings)
    expect(JSON.stringify(settings)).toBe(snapshot)
  })
  it('applyHookPlan returns a new object and leaves the input untouched', () => {
    const root = project({ mqGuard: true })
    const settings: ClaudeSettings = {}
    const next = applyHookPlan(settings, planHooks(root, settings))
    expect(settings.hooks).toBeUndefined()
    expect(next.hooks?.PreToolUse?.[0].hooks[0].command).toBe('scripts/mq-guard.sh')
  })
})
```

- [ ] Run: `npx vitest run src/core/hooks/install.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/core/hooks/install.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

/** .claude/settings.json — only the slice we manage is typed; every unknown
 *  key is preserved verbatim (never overwrite: git-workflow.md contract —
 *  `bd setup claude` hooks and user hooks own entries here too). */
export interface HookCommand {
  type: 'command'
  command: string
  [k: string]: unknown
}

export interface HookEntry {
  matcher?: string
  hooks: HookCommand[]
  [k: string]: unknown
}

export interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>
  [k: string]: unknown
}

export const SETTINGS_PATH = '.claude/settings.json'

/** The exact reminder command git-workflow.md registers (kept in sync with the
 *  "Configure the PostToolUse review-reminder hook" section of that step). */
export const REVIEW_REMINDER_COMMAND = [
  "jq -r '.tool_input.command // empty'",
  "| grep -q 'gh pr create'",
  "&& echo 'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on (3-round cap; see docs/git-workflow.md).'",
  '|| true',
].join(' ')

export interface HookSpec {
  id: string
  event: 'SessionStart' | 'PreToolUse' | 'PostToolUse'
  /** Substring marking an EQUIVALENT hook as already registered (the old
   *  `grep -q '<marker>'` semantics, scoped to this event's commands). */
  marker: string
  entry: HookEntry
  /** Human description used in report lines. */
  describe: string
  /** Null when installable; otherwise the explicit report line (D8: a missing
   *  prerequisite is REPORTED, never a silent no-op). */
  prerequisite: (projectRoot: string) => string | null
}

function executable(p: string): boolean {
  try {
    return (fs.statSync(p).mode & 0o111) !== 0
  } catch {
    return false
  }
}

export const HOOK_SPECS: HookSpec[] = [
  {
    id: 'bd-prime',
    event: 'SessionStart',
    marker: 'bd prime',
    entry: { hooks: [{ type: 'command', command: 'bd prime --hook-json' }] },
    describe: 'SessionStart: bd prime --hook-json (Beads context injection)',
    prerequisite: root =>
      fs.existsSync(path.join(root, '.beads'))
        ? null
        : 'skipped SessionStart bd prime: .beads/ not found — run the beads step (bd init) first',
  },
  {
    id: 'bd-guard',
    event: 'PreToolUse',
    marker: 'bd-guard.sh',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] },
    describe: 'PreToolUse: scripts/bd-guard.sh (Beads destructive-command guard)',
    prerequisite: root => {
      if (!fs.existsSync(path.join(root, '.beads'))) {
        return 'skipped PreToolUse bd-guard: .beads/ not found — run the beads step (bd init) first'
      }
      if (!executable(path.join(root, 'scripts', 'bd-guard.sh'))) {
        return 'skipped PreToolUse bd-guard: scripts/bd-guard.sh missing or not executable — run: scaffold agent-ops install --component git'
      }
      return null
    },
  },
  {
    id: 'mq-guard',
    event: 'PreToolUse',
    marker: 'mq-guard.sh',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/mq-guard.sh' }] },
    describe: 'PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)',
    prerequisite: root =>
      executable(path.join(root, 'scripts', 'mq-guard.sh'))
        ? null
        : 'skipped PreToolUse mq-guard: scripts/mq-guard.sh missing or not executable — run: scaffold agent-ops install --component merge-queue',
  },
  {
    id: 'pr-review-reminder',
    event: 'PostToolUse',
    marker: 'gh pr create',
    entry: { matcher: 'Bash', hooks: [{ type: 'command', command: REVIEW_REMINDER_COMMAND }] },
    describe: 'PostToolUse: gh pr create review reminder (mmr review)',
    // No prerequisite: the marker-equivalence check below dedupes against the
    // automated-pr-review step's own variant of this reminder.
    prerequisite: () => null,
  },
]

export interface HookPlanItem {
  spec: HookSpec
  action: 'add' | 'already-present' | 'skipped'
  reason?: string
}

export interface HookPlan {
  items: HookPlanItem[]
}

function eventHasMarker(settings: ClaudeSettings, event: string, marker: string): boolean {
  for (const entry of settings.hooks?.[event] ?? []) {
    for (const h of entry.hooks ?? []) {
      if (typeof h.command === 'string' && h.command.includes(marker)) return true
    }
  }
  return false
}

/** Pure planning half — reused read-only by the adopt plan's ops-actions
 *  preview (Task 18) so the plan can render exactly what install would do. */
export function planHooks(projectRoot: string, settings: ClaudeSettings): HookPlan {
  const items: HookPlanItem[] = []
  for (const spec of HOOK_SPECS) {
    const missing = spec.prerequisite(projectRoot)
    if (missing !== null) {
      items.push({ spec, action: 'skipped', reason: missing })
      continue
    }
    if (eventHasMarker(settings, spec.event, spec.marker)) {
      items.push({ spec, action: 'already-present' })
      continue
    }
    items.push({ spec, action: 'add' })
  }
  return { items }
}

/** Pure merge half: append-only into the per-event arrays, everything else
 *  untouched (the jq `(.hooks.X // []) + [entry]` semantics). */
export function applyHookPlan(settings: ClaudeSettings, plan: HookPlan): ClaudeSettings {
  const hooks: Record<string, HookEntry[]> = { ...(settings.hooks ?? {}) }
  let changed = false
  for (const item of plan.items) {
    if (item.action !== 'add') continue
    hooks[item.spec.event] = [...(hooks[item.spec.event] ?? []), item.spec.entry]
    changed = true
  }
  return changed ? { ...settings, hooks } : settings
}

export function readSettings(projectRoot: string): ClaudeSettings {
  const p = path.join(projectRoot, SETTINGS_PATH)
  if (!fs.existsSync(p)) return {}
  // Malformed JSON throws — NEVER clobber a file we cannot faithfully re-emit.
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${SETTINGS_PATH} is not a JSON object — refusing to modify it`)
  }
  return parsed as ClaudeSettings
}

/** Atomic write: temp file in the same directory + rename (no torn settings). */
export function writeSettings(projectRoot: string, settings: ClaudeSettings): void {
  const p = path.join(projectRoot, SETTINGS_PATH)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = path.join(path.dirname(p), `.settings.json.tmp-${process.pid}`)
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n')
  fs.renameSync(tmp, p)
}

export interface HooksInstallResult {
  /** describe lines of hooks registered by this run. */
  added: string[]
  /** describe lines of hooks whose marker was already present. */
  alreadyPresent: string[]
  /** One entry per hook whose prerequisite is missing (explicit, D8). */
  skipped: { hook: string; reason: string }[]
  settingsPath: string
  changed: boolean
}

/** The D8 primitive: idempotent deep-merge registration of the Claude Code
 *  hooks. Consumed by `scaffold hooks install` (Task 13), the bootstrap arm
 *  step (Task 15), and doctor's hook-reregistration fix (Task 16). */
export function installHooks(projectRoot: string): HooksInstallResult {
  const settings = readSettings(projectRoot)
  const plan = planHooks(projectRoot, settings)
  const next = applyHookPlan(settings, plan)
  const changed = plan.items.some(i => i.action === 'add')
  if (changed) writeSettings(projectRoot, next)
  return {
    added: plan.items.filter(i => i.action === 'add').map(i => i.spec.describe),
    alreadyPresent: plan.items.filter(i => i.action === 'already-present').map(i => i.spec.describe),
    skipped: plan.items
      .filter(i => i.action === 'skipped')
      .map(i => ({ hook: i.spec.describe, reason: i.reason ?? '' })),
    settingsPath: path.join(projectRoot, SETTINGS_PATH),
    changed,
  }
}
```

- [ ] Run: `npx vitest run src/core/hooks/install.test.ts` — expect 10 tests passed.
- [ ] Commit: `git add -A && git commit -m "feat(hooks): TS deep-merge hook registration — idempotent, atomic, prerequisite-reported (D8)"`

---

### Task 13: `scaffold hooks` CLI — install action, report lines, `--check` wiring guidance

**Files:**
- Create: `src/cli/commands/hooks.ts`
- Create: `src/cli/commands/hooks.test.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Produces: `hooksHandler(argv: HooksArgs, overrides?: HooksOverrides)`, default-exported yargs `CommandModule` (`hooks <action>`, action choices exactly `['install']` — Claude Code scope only in R2, no `--harness` flag).
- Consumes: `installHooks`/`HooksInstallResult` (Task 12), `resolveOutputMode`/`createOutputContext` (existing CLI plumbing, same usage as Task 6's sched command).

**Steps:**

- [ ] Write the failing test `src/cli/commands/hooks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hooksHandler } from './hooks.js'

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-cli-'))
}

describe('scaffold hooks', () => {
  it('install runs the D8 primitive and exits 0', async () => {
    const root = tmpRoot()
    await hooksHandler({ action: 'install', root }, {
      install: () => ({
        added: ['PostToolUse: gh pr create review reminder (mmr review)'],
        alreadyPresent: [],
        skipped: [],
        settingsPath: path.join(root, '.claude/settings.json'),
        changed: true,
      }),
    })
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('surfaces install errors (malformed settings.json) with exit 1', async () => {
    await hooksHandler({ action: 'install', root: tmpRoot() }, {
      install: () => {
        throw new Error('.claude/settings.json is not a JSON object — refusing to modify it')
      },
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('rejects unknown actions', async () => {
    await hooksHandler({ action: 'status', root: tmpRoot() })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('end-to-end: registers the reminder hook into a real settings file', async () => {
    const root = tmpRoot()
    await hooksHandler({ action: 'install', root })
    const settings = JSON.parse(
      fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { PostToolUse: unknown[] } }
    expect(JSON.stringify(settings.hooks.PostToolUse)).toContain('gh pr create')
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
})
```

- [ ] Run: `npx vitest run src/cli/commands/hooks.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/cli/commands/hooks.ts`:

```ts
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { installHooks, type HooksInstallResult } from '../../core/hooks/install.js'

export interface HooksArgs {
  action: string
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export interface HooksOverrides {
  install?: (projectRoot: string) => HooksInstallResult
}

export async function hooksHandler(argv: HooksArgs, overrides: HooksOverrides = {}): Promise<void> {
  const output = createOutputContext(resolveOutputMode(argv))
  const projectRoot = argv.root ?? process.cwd()
  if (argv.action !== 'install') {
    output.error(`unknown hooks action "${argv.action}" (expected: install)`)
    process.exitCode = 1
    return
  }
  const install = overrides.install ?? installHooks
  let res: HooksInstallResult
  try {
    res = install(projectRoot)
  } catch (err) {
    output.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
    return
  }
  if (argv.format === 'json') {
    output.result(res)
    return
  }
  for (const line of res.added) output.info(`registered ${line}`)
  for (const line of res.alreadyPresent) output.info(`already registered ${line}`)
  for (const s of res.skipped) output.warn(s.reason)
  output.success(
    res.changed
      ? `hooks: settings updated — ${res.settingsPath}`
      : 'hooks: nothing to do — all registrations current',
  )
  // D8: Claude Code scope only in R2; AGENTS.md-based harnesses get the
  // printed --check wiring guidance (a --harness flag is deferred, spec §12).
  output.info('Claude Code scope only. For AGENTS.md-based harnesses (Codex, Cursor, ...), wire the guards as pre-run checks instead:')
  output.info('  scripts/bd-guard.sh --check "<command>"   # before destructive bd commands')
  output.info('  scripts/mq-guard.sh --check "<command>"   # before any gh pr merge')
}

const hooksCommand: CommandModule<Record<string, unknown>, HooksArgs> = {
  command: 'hooks <action>',
  describe: 'Register the Claude Code agent hooks (.claude/settings.json deep-merge, idempotent)',
  builder: (yargs: Argv) => {
    return yargs.positional('action', {
      describe: 'Action to perform',
      choices: ['install'] as const,
      type: 'string',
      demandOption: true,
    })
  },
  handler: async argv => hooksHandler(argv),
}

export default hooksCommand
```

- [ ] Register the command in `src/cli/index.ts` — Edit old string:

```ts
import schedCommand from './commands/sched.js'
```

  new string:

```ts
import schedCommand from './commands/sched.js'
import hooksCommand from './commands/hooks.js'
```

  then Edit old string `.command(schedCommand)` → new string:

```ts
.command(schedCommand)
    .command(hooksCommand)
```

  (match the file's existing chain indentation exactly — 4 spaces before `.command`, same as the Task 6 registration).

- [ ] Run: `npx vitest run src/cli/commands/hooks.test.ts` — expect 4 tests passed.
- [ ] Run: `npx tsc --noEmit -p tsconfig.json` — expect clean.
- [ ] Commit: `git add -A && git commit -m "feat(hooks): scaffold hooks install CLI — report lines + AGENTS.md --check guidance"`

---

### Task 14: bootstrap journal events + per-`bootstrapId` state machine (pure half, D9)

**Files:**
- Modify: `src/merge-queue/types.ts`
- Create: `src/merge-queue/bootstrap.ts`
- Create: `src/merge-queue/bootstrap.test.ts`

**Interfaces:**
- Produces: `JournalEvent` union gains `bootstrap_intent` / `bootstrap_merged` / `bootstrap_armed` (each carrying `bootstrapId` + `pr` + `gatedHeadSha`; merged additionally `mergeCommitSha`); `BootstrapStage = 'intent' | 'merged' | 'armed'`; `BootstrapAttempt { bootstrapId, pr, gatedHeadSha, mergeCommitSha, stage, at }`; `reduceBootstrapAttempts(events): Map<string, BootstrapAttempt>`; `latestAttemptFor(events, pr): BootstrapAttempt | null`; `ResumeDecision` union; `planResume(attempt, gh): ResumeDecision`.
- Consumes: `JournalEvent` (`src/merge-queue/types.ts`). The existing `reduceState` (`src/merge-queue/state.ts`) must silently IGNORE the new event types (its switch has no default clause, so unmatched types fall through — verified by a regression test below).

**Steps:**

- [ ] Write the failing test `src/merge-queue/bootstrap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  latestAttemptFor, planResume, reduceBootstrapAttempts,
} from './bootstrap.js'
import { reduceState } from './state.js'
import type { JournalEvent } from './types.js'

const T1 = '2026-07-19T10:00:00.000Z'
const T2 = '2026-07-19T10:01:00.000Z'
const T3 = '2026-07-19T10:02:00.000Z'

function intent(id: string, pr = 41, sha = 'SHA-A', at = T1): JournalEvent {
  return { type: 'bootstrap_intent', bootstrapId: id, pr, gatedHeadSha: sha, at }
}
function merged(id: string, pr = 41, sha = 'SHA-A', mergeSha = 'M1', at = T2): JournalEvent {
  return { type: 'bootstrap_merged', bootstrapId: id, pr, gatedHeadSha: sha, mergeCommitSha: mergeSha, at }
}
function armed(id: string, pr = 41, sha = 'SHA-A', at = T3): JournalEvent {
  return { type: 'bootstrap_armed', bootstrapId: id, pr, gatedHeadSha: sha, at }
}

describe('reduceBootstrapAttempts (D9 state machine)', () => {
  it('folds intent → merged → armed per id, carrying pr, gated SHA, and merge SHA', () => {
    const attempts = reduceBootstrapAttempts([intent('01A'), merged('01A'), armed('01A')])
    expect(attempts.get('01A')).toEqual({
      bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
      mergeCommitSha: 'M1', stage: 'armed', at: T3,
    })
  })
  it('an intent-only id stays at stage intent with no merge SHA', () => {
    const a = reduceBootstrapAttempts([intent('01A')]).get('01A')
    expect(a?.stage).toBe('intent')
    expect(a?.mergeCommitSha).toBeNull()
  })
  it('keeps attempts for different ids separate (a stale attempt can never arm a new one)', () => {
    const attempts = reduceBootstrapAttempts([
      intent('01A', 41, 'SHA-A'), // aborted attempt: intent only
      intent('01B', 41, 'SHA-B', T2), merged('01B', 41, 'SHA-B', 'M2', T3),
    ])
    expect(attempts.get('01A')?.stage).toBe('intent')
    expect(attempts.get('01B')?.stage).toBe('merged')
  })
  it('latestAttemptFor picks the newest id for the PR (ULIDs sort lexicographically)', () => {
    const events = [intent('01A'), armed('01A'), intent('01B', 41, 'SHA-B', T2)]
    expect(latestAttemptFor(events, 41)?.bootstrapId).toBe('01B')
    expect(latestAttemptFor(events, 99)).toBeNull()
  })
})

describe('planResume (GitHub-authoritative reconciliation, D9)', () => {
  const base = {
    bootstrapId: '01A', pr: 41, gatedHeadSha: 'SHA-A',
    mergeCommitSha: null as string | null, stage: 'intent' as const, at: T1,
  }
  it('no attempt ⇒ fresh', () => {
    expect(planResume(null, { state: 'OPEN', headSha: 'SHA-A' })).toEqual({ kind: 'fresh' })
  })
  it('armed attempt ⇒ complete (idempotent no-op)', () => {
    const a = { ...base, stage: 'armed' as const }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('complete')
  })
  it('merged-without-armed ⇒ arm-and-verify (exactly what --finish surfaces)', () => {
    const a = { ...base, stage: 'merged' as const, mergeCommitSha: 'M1' }
    expect(planResume(a, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('arm-and-verify')
  })
  it('intent + GitHub MERGED ⇒ record-merge-then-arm (crash window; never re-merge)', () => {
    expect(planResume(base, { state: 'MERGED', headSha: 'SHA-A' }).kind).toBe('record-merge-then-arm')
  })
  it('intent + OPEN + head unchanged ⇒ rerun-merge under the SAME id', () => {
    expect(planResume(base, { state: 'OPEN', headSha: 'SHA-A' }).kind).toBe('rerun-merge')
  })
  it('intent + OPEN + head moved ⇒ aborted (terminal for the id; retry opens a new id)', () => {
    const d = planResume(base, { state: 'OPEN', headSha: 'SHA-NEW' })
    expect(d.kind).toBe('aborted')
    if (d.kind === 'aborted') expect(d.reason).toMatch(/head moved/)
  })
  it('intent + CLOSED ⇒ aborted', () => {
    expect(planResume(base, { state: 'CLOSED', headSha: 'SHA-A' }).kind).toBe('aborted')
  })
})

describe('journal compatibility', () => {
  it('reduceState ignores bootstrap events (queue state is unaffected)', () => {
    const events: JournalEvent[] = [
      { type: 'enqueued', pr: 7, at: T1 },
      intent('01A'), merged('01A'), armed('01A'),
    ]
    const state = reduceState(events)
    expect(state.entries.get(7)?.state).toBe('QUEUED')
    expect(state.entries.size).toBe(1)
  })
})
```

- [ ] Run: `npx vitest run src/merge-queue/bootstrap.test.ts` — expect FAILURE (module missing, event types unknown).
- [ ] Edit `src/merge-queue/types.ts` — extend the `JournalEvent` union. Edit old string:

```ts
  | {
      type: 'gate_metrics'; batchId: string; seconds: number
      result: 'green' | 'red' | 'timeout'; at: string
    }
```

  new string:

```ts
  | {
      type: 'gate_metrics'; batchId: string; seconds: number
      result: 'green' | 'red' | 'timeout'; at: string
    }
  // D9 bootstrap events: EVERY event carries bootstrapId (ULID) + pr + the
  // gated head SHA; bootstrap_merged additionally records the merge commit.
  | { type: 'bootstrap_intent'; bootstrapId: string; pr: number; gatedHeadSha: string; at: string }
  | {
      type: 'bootstrap_merged'; bootstrapId: string; pr: number; gatedHeadSha: string
      mergeCommitSha: string; at: string
    }
  | { type: 'bootstrap_armed'; bootstrapId: string; pr: number; gatedHeadSha: string; at: string }
```

- [ ] Create `src/merge-queue/bootstrap.ts` (pure half; the engine is appended in Task 15):

```ts
import type { JournalEvent } from './types.js'

export type BootstrapStage = 'intent' | 'merged' | 'armed'

export interface BootstrapAttempt {
  bootstrapId: string
  pr: number
  gatedHeadSha: string
  mergeCommitSha: string | null
  stage: BootstrapStage
  /** Timestamp of the id's latest journaled event. */
  at: string
}

/** Fold the journal into per-id bootstrap attempts (D9). Events for an id
 *  arrive strictly intent → merged → armed; later stages win. An id with only
 *  an intent is either in-flight or aborted — planResume decides which via
 *  GitHub's authoritative PR state, never the journal alone. */
export function reduceBootstrapAttempts(events: JournalEvent[]): Map<string, BootstrapAttempt> {
  const attempts = new Map<string, BootstrapAttempt>()
  for (const e of events) {
    if (e.type !== 'bootstrap_intent' && e.type !== 'bootstrap_merged' && e.type !== 'bootstrap_armed') {
      continue
    }
    const base: BootstrapAttempt = attempts.get(e.bootstrapId) ?? {
      bootstrapId: e.bootstrapId, pr: e.pr, gatedHeadSha: e.gatedHeadSha,
      mergeCommitSha: null, stage: 'intent', at: e.at,
    }
    if (e.type === 'bootstrap_merged') {
      if (base.stage !== 'armed') base.stage = 'merged'
      base.mergeCommitSha = e.mergeCommitSha
    } else if (e.type === 'bootstrap_armed') {
      base.stage = 'armed'
    }
    base.at = e.at
    attempts.set(e.bootstrapId, base)
  }
  return attempts
}

/** Latest attempt for a PR — ULIDs sort lexicographically in creation order,
 *  so the max bootstrapId is the newest attempt. */
export function latestAttemptFor(events: JournalEvent[], pr: number): BootstrapAttempt | null {
  const forPr = [...reduceBootstrapAttempts(events).values()].filter(a => a.pr === pr)
  if (forPr.length === 0) return null
  forPr.sort((a, b) => (a.bootstrapId < b.bootstrapId ? -1 : 1))
  return forPr[forPr.length - 1]
}

export type ResumeDecision =
  | { kind: 'fresh' }
  | { kind: 'complete'; attempt: BootstrapAttempt }
  | { kind: 'arm-and-verify'; attempt: BootstrapAttempt }
  | { kind: 'record-merge-then-arm'; attempt: BootstrapAttempt }
  | { kind: 'rerun-merge'; attempt: BootstrapAttempt }
  | { kind: 'aborted'; attempt: BootstrapAttempt; reason: string }

/** Reconcile the journaled attempt against GitHub's AUTHORITATIVE PR state
 *  (D9): intent-without-merged while GitHub says MERGED is the crash window
 *  between the merge API call and the journal write — record retroactively,
 *  never re-merge. An aborted attempt is terminal for its id. */
export function planResume(
  attempt: BootstrapAttempt | null,
  gh: { state: 'OPEN' | 'MERGED' | 'CLOSED'; headSha: string },
): ResumeDecision {
  if (attempt === null) return { kind: 'fresh' }
  if (attempt.stage === 'armed') return { kind: 'complete', attempt }
  if (attempt.stage === 'merged') return { kind: 'arm-and-verify', attempt }
  // stage === 'intent': did the crash hit the merge-API/journal window?
  if (gh.state === 'MERGED') return { kind: 'record-merge-then-arm', attempt }
  if (gh.state === 'CLOSED') {
    return {
      kind: 'aborted', attempt,
      reason: `PR #${attempt.pr} was closed without merging — attempt ${attempt.bootstrapId} is terminal; reopen the PR and re-run scaffold mq bootstrap`,
    }
  }
  if (gh.headSha !== attempt.gatedHeadSha) {
    return {
      kind: 'aborted', attempt,
      reason: `PR head moved (gated ${attempt.gatedHeadSha}, now ${gh.headSha}) — the gate no longer covers this head; attempt ${attempt.bootstrapId} is terminal, re-run scaffold mq bootstrap --pr ${attempt.pr} for a fresh gated attempt`,
    }
  }
  return { kind: 'rerun-merge', attempt }
}
```

- [ ] Run: `npx vitest run src/merge-queue/bootstrap.test.ts` — expect 12 tests passed.
- [ ] Run: `npx tsc --noEmit -p tsconfig.json` and `npx vitest run src/merge-queue` — the widened `JournalEvent` union must not disturb `reduceState`/`computeStats` (their switches have no default and no exhaustiveness sentinel, so unmatched types fall through). If `tsc` reports an exhaustiveness error in either, add explicit no-op cases `case 'bootstrap_intent': case 'bootstrap_merged': case 'bootstrap_armed': break` to that switch.
- [ ] Commit: `git add -A && git commit -m "feat(mq): bootstrap journal events + per-id state machine with GitHub-authoritative resume (D9)"`

---

### Task 15: bootstrap engine + `scaffold mq bootstrap` CLI + mq-guard message

**Files:**
- Modify: `src/merge-queue/bootstrap.ts` (append the engine)
- Modify: `src/merge-queue/bootstrap.test.ts` (append engine tests)
- Modify: `src/merge-queue/gh.ts` (add `mergeCommitSha`)
- Modify: `src/merge-queue/gh.test.ts` (cover it)
- Modify: `src/merge-queue/git.ts` (add `checkoutDetachedInGate`)
- Modify: `src/merge-queue/git.test.ts` (cover it)
- Modify: `src/merge-queue/daemon.test.ts` (extend `FakeGh`/`FakeGit` with the new interface methods)
- Modify: `src/cli/commands/mq.ts` + `src/cli/commands/mq.test.ts`
- Modify: `content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl` + `tests/agent-ops-merge-queue.bats`

**Interfaces:**
- Produces: `GhClient.mergeCommitSha(pr): string | null`; `GitOps.checkoutDetachedInGate(sha): string`; `BootstrapDeps { gh, git, runGate, config, mqDir, projectRoot, armHooks, armSched, smokeDaemon, runDoctor, gateTargetResolves, log, now, newId }`; `BootstrapOutcome { ok, bootstrapId, stage: 'preflight'|'arm'|'merge'|'verify'|'complete'|'aborted', messages }`; `runBootstrap(deps, { pr, finish? }): Promise<BootstrapOutcome>`; `gateTargetResolves(projectRoot, command): boolean` (exported from `src/cli/commands/mq.ts`); `mqHandler` gains an `overrides: MqOverrides = {}` second parameter (`MqOverrides { bootstrapDeps?: Partial<BootstrapDeps> }`); `MqArgs` gains `finish?: boolean`; mq action choices gain `'bootstrap'`.
- Consumes: Task 14's reducers/`planResume`; `installHooks` (Task 12); `pickSchedBackend` (Task 6) + `buildPostMergePollerJob` (Task 5); `runGate` (`src/merge-queue/gate.ts`); `appendEvent`/`readJournal` (`src/merge-queue/journal.ts`); `loadAgentOpsConfig`; `ulid`.

**Steps:**

- [ ] Add `mergeCommitSha` to `src/merge-queue/gh.ts`. In the `GhClient` interface, Edit old string:

```ts
  squashMerge(pr: number, expectedHead?: string): void
```

  new string:

```ts
  squashMerge(pr: number, expectedHead?: string): void
  /** OID of the merge commit for a MERGED PR; null while GitHub has not yet
   *  reported one (D9: bootstrap_merged records it). */
  mergeCommitSha(pr: number): string | null
```

  and in the returned client object, Edit old string:

```ts
    comment(pr, body) {
      gh(['pr', 'comment', String(pr), '--body', body])
    },
```

  new string:

```ts
    mergeCommitSha(pr) {
      const raw = JSON.parse(gh(['pr', 'view', String(pr), '--json', 'mergeCommit'])) as {
        mergeCommit: { oid: string } | null
      }
      return raw.mergeCommit?.oid ?? null
    },
    comment(pr, body) {
      gh(['pr', 'comment', String(pr), '--body', body])
    },
```

- [ ] Append a self-contained coverage block to `src/merge-queue/gh.test.ts` (uses the same `MQ_GH_CMD` seam `resolveGhBin` already honors; add imports `fs`/`os`/`path` from `node:fs`/`node:os`/`node:path` and `afterEach` from vitest if the file lacks them):

```ts
describe('mergeCommitSha (D9)', () => {
  afterEach(() => {
    delete process.env.MQ_GH_CMD
  })
  function fakeGhBin(mergeCommitJson: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-fake-'))
    const bin = path.join(dir, 'gh')
    fs.writeFileSync(bin, [
      '#!/bin/bash',
      'if [ "$1" = "--version" ]; then echo gh-fake; exit 0; fi',
      `printf '%s' '${mergeCommitJson}'`,
    ].join('\n'), { mode: 0o755 })
    return bin
  }
  it('returns the merge commit oid', () => {
    process.env.MQ_GH_CMD = fakeGhBin('{"mergeCommit":{"oid":"abc123"}}')
    const client = createGhClient(os.tmpdir())
    expect(client.mergeCommitSha(5)).toBe('abc123')
  })
  it('returns null while GitHub reports no merge commit yet', () => {
    process.env.MQ_GH_CMD = fakeGhBin('{"mergeCommit":null}')
    const client = createGhClient(os.tmpdir())
    expect(client.mergeCommitSha(5)).toBeNull()
  })
})
```

- [ ] Add `checkoutDetachedInGate` to `src/merge-queue/git.ts`. In the `GitOps` interface, Edit old string:

```ts
  ensureGateWorktree(): string
```

  new string:

```ts
  ensureGateWorktree(): string
  /** Detached checkout of an exact SHA in the gate worktree (bootstrap
   *  preflight runs the full gate there). Clears crashed-merge leftovers
   *  first, fetches the object when absent locally. Returns the gate dir. */
  checkoutDetachedInGate(sha: string): string
```

  and in the returned object, insert after the `ensureGateWorktree,` line — Edit old string:

```ts
    ensureGateWorktree,
    constructCandidate(batchId, prs, base) {
```

  new string:

```ts
    ensureGateWorktree,
    checkoutDetachedInGate(sha) {
      const gate = ensureGateWorktree()
      // Same crashed-build recovery as constructCandidate: leftovers must
      // never wedge the checkout.
      gitAllowFail(['merge', '--abort'], gate)
      gitAllowFail(['reset', '--hard'], gate)
      gitAllowFail(['clean', '-fd'], gate)
      if (!gitAllowFail(['cat-file', '-e', `${sha}^{commit}`], gate)) {
        gitAllowFail(['fetch', 'origin', sha])
      }
      git(['checkout', '--force', '--detach', sha], gate)
      return gate
    },
    constructCandidate(batchId, prs, base) {
```

- [ ] Append a self-contained real-repo test to `src/merge-queue/git.test.ts` (reuse the file's existing imports; the helper below is local to the new describe block to avoid name collisions):

```ts
describe('checkoutDetachedInGate (D9 bootstrap preflight)', () => {
  it('checks out the exact sha detached in the gate worktree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-bootstrap-'))
    const run = (args: string[], cwd = dir): string =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
    run(['init', '-b', 'main', dir], process.cwd())
    run(['config', 'user.name', 't'])
    run(['config', 'user.email', 't@t.invalid'])
    fs.writeFileSync(path.join(dir, 'a.txt'), '1\n')
    run(['add', 'a.txt'])
    run(['commit', '-m', 'c1'])
    const sha1 = run(['rev-parse', 'HEAD'])
    fs.writeFileSync(path.join(dir, 'a.txt'), '2\n')
    run(['commit', '-am', 'c2'])
    const ops = createGitOps(dir)
    const gate = ops.checkoutDetachedInGate(sha1)
    expect(gate).toBe(path.join(dir, '.mq', 'gate'))
    expect(run(['rev-parse', 'HEAD'], gate)).toBe(sha1)
    expect(fs.readFileSync(path.join(gate, 'a.txt'), 'utf8')).toBe('1\n')
  })
})
```

  (If `git.test.ts` does not already import `execFileSync`/`fs`/`os`/`path`, add those imports at the top.)

- [ ] Extend the daemon-test fakes so they still satisfy the widened interfaces. `grep -rn "implements GhClient\|implements GitOps" src tests` — as of this plan the only implementers are in `src/merge-queue/daemon.test.ts`. In `FakeGh`, add after the `squashMerge` method:

```ts
  mergeCommitSha(): string | null { return 'FAKE_MERGE_SHA' }
```

  In `FakeGit`, add after the `ensureGateWorktree` method:

```ts
  checkoutDetachedInGate(): string { return path.join(this.root, '.mq', 'gate') }
```

  (`FakeGit`'s `root` is a private constructor property — if the field is not accessible with `this.root`, mirror how `ensureGateWorktree` accesses it in that class.) If the grep surfaces other implementers (e.g. an e2e harness), give them the same two one-liners.

- [ ] Run: `npx vitest run src/merge-queue/gh.test.ts src/merge-queue/git.test.ts src/merge-queue/daemon.test.ts` — all green.
- [ ] Append the failing engine tests to `src/merge-queue/bootstrap.test.ts` (add imports at the top: `import fs from 'node:fs'`, `import os from 'node:os'`, `import path from 'node:path'`, `import { runBootstrap, type BootstrapDeps } from './bootstrap.js'`, `import { appendEvent, readJournal } from './journal.js'`, `import { defaultMergeQueueConfig } from './types.js'`, `import type { GhClient, PrInfo } from './gh.js'`, `import type { CandidateResult, GitOps } from './git.js'`, `import type { GateResult } from './gate.js'`):

```ts
function makeGh(script: {
  states?: PrInfo['state'][]
  heads?: string[]
  mergeSha?: string | null
}): GhClient & { merged: { pr: number; expectedHead?: string }[] } {
  const states = [...(script.states ?? ['OPEN'])]
  const heads = [...(script.heads ?? ['SHA-A'])]
  const next = <T>(arr: T[]): T => (arr.length > 1 ? arr.shift() as T : arr[0])
  const gh = {
    merged: [] as { pr: number; expectedHead?: string }[],
    viewPr(pr: number): PrInfo {
      return {
        number: pr, state: next(states), headSha: next(heads), mergedAt: null,
        additions: 0, deletions: 0, title: 't', body: '',
      }
    },
    squashMerge(pr: number, expectedHead?: string): void {
      gh.merged.push({ pr, expectedHead })
    },
    mergeCommitSha: (): string | null => script.mergeSha === undefined ? 'MERGESHA' : script.mergeSha,
    comment(): void { /* unused */ },
    listLabeled: (): number[] => [],
    postMergeRed: (): boolean => false,
  }
  return gh
}

function makeGit(root: string): GitOps & { checkouts: string[] } {
  const g = {
    checkouts: [] as string[],
    primaryRoot: (): string => root,
    defaultBranch: (): string => 'main',
    fetchOrigin(): void { /* no-op */ },
    originHeadSha: (): string => 'BASE',
    treeOf: (): string => 'TREE',
    ensureGateWorktree: (): string => path.join(root, '.mq', 'gate'),
    checkoutDetachedInGate(sha: string): string {
      g.checkouts.push(sha)
      return path.join(root, '.mq', 'gate')
    },
    constructCandidate(): CandidateResult { throw new Error('not used by bootstrap') },
    deleteCandidate(): void { /* unused */ },
    listCandidateRefs: (): string[] => [],
  }
  return g
}

interface Recorded {
  hooksArmed: number
  schedArmed: number
  smoked: number
  gates: string[]
}

function makeDeps(root: string, over: Partial<BootstrapDeps> = {}): { deps: BootstrapDeps; rec: Recorded } {
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  const rec: Recorded = { hooksArmed: 0, schedArmed: 0, smoked: 0, gates: [] }
  const ids = ['01A', '01B', '01C']
  const green: GateResult = { result: 'green', seconds: 3, logPath: '/dev/null', failedTests: [] }
  const deps: BootstrapDeps = {
    gh: makeGh({}),
    git: makeGit(root),
    runGate: opts => {
      rec.gates.push(opts.command)
      return green
    },
    config: defaultMergeQueueConfig(),
    mqDir: path.join(root, '.mq'),
    projectRoot: root,
    armHooks: () => {
      rec.hooksArmed += 1
      return { messages: ['hooks: registered PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)'] }
    },
    armSched: () => {
      rec.schedArmed += 1
      return { ok: true, messages: ['sched: verified loaded'] }
    },
    smokeDaemon: () => {
      rec.smoked += 1
      return { ok: true, detail: 'mq daemon --once cycle completed clean' }
    },
    runDoctor: () => ({ exitCode: 0, summary: 'healthy' }),
    gateTargetResolves: () => true,
    log: () => { /* silent */ },
    now: () => new Date('2026-07-19T12:00:00.000Z'),
    newId: () => ids.shift() ?? '01Z',
    ...over,
  }
  return { deps, rec }
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-bootstrap-'))
}

describe('runBootstrap (D9 engine)', () => {
  it('happy path: gate on head, arm-first, then intent → merge(match-head) → merged → armed', async () => {
    const root = tmpRoot()
    const gh = makeGh({})
    const { deps, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(out.stage).toBe('complete')
    expect(out.bootstrapId).toBe('01A')
    expect(rec.gates).toEqual([deps.config.full_gate_command]) // FULL gate in preflight
    expect(deps.git as ReturnType<typeof makeGit>).toMatchObject({ checkouts: ['SHA-A'] })
    expect(rec.hooksArmed).toBe(1)
    expect(rec.schedArmed).toBe(1)
    expect(gh.merged).toEqual([{ pr: 41, expectedHead: 'SHA-A' }])
    const events = readJournal(deps.mqDir)
    expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(events.every(e => 'bootstrapId' in e && e.bootstrapId === '01A')).toBe(true)
    expect(events.every(e => 'gatedHeadSha' in e && e.gatedHeadSha === 'SHA-A')).toBe(true)
    expect(events[1]).toMatchObject({ mergeCommitSha: 'MERGESHA', pr: 41 })
  })
  it('aborts when the head moves between intent and merge — id terminal, retry uses a new id', async () => {
    const root = tmpRoot()
    // viewPr call 1 (reconcile+preflight): SHA-A; call 2 (revalidation): SHA-NEW.
    const gh = makeGh({ heads: ['SHA-A', 'SHA-NEW'] })
    const { deps } = makeDeps(root, { gh })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('aborted')
    expect(gh.merged).toEqual([])
    expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent'])
    // Retry: fresh gh (head settled at SHA-NEW) reuses the journal — new id 01B.
    const { deps: deps2 } = makeDeps(root, {
      gh: makeGh({ heads: ['SHA-NEW'] }),
      newId: () => '01B',
    })
    const out2 = await runBootstrap(deps2, { pr: 41 })
    expect(out2.ok).toBe(true)
    expect(out2.bootstrapId).toBe('01B')
    const intents = readJournal(deps.mqDir).filter(e => e.type === 'bootstrap_intent')
    expect(intents.map(e => (e as { bootstrapId: string }).bootstrapId)).toEqual(['01A', '01B'])
  })
  it('crash window: intent journaled, GitHub reports MERGED ⇒ records retroactively, never re-merges', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    appendEvent(deps.mqDir, {
      type: 'bootstrap_intent', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', at: '2026-07-19T11:00:00.000Z',
    })
    const gh = makeGh({ states: ['MERGED'], mergeSha: 'RECOVERED' })
    const { deps: resumed, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(resumed, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(out.bootstrapId).toBe('00X')
    expect(gh.merged).toEqual([]) // never re-merged
    const events = readJournal(deps.mqDir)
    expect(events.map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(events[1]).toMatchObject({ bootstrapId: '00X', mergeCommitSha: 'RECOVERED' })
    expect(rec.hooksArmed).toBe(1) // idempotent re-arm on resume
  })
  it('--finish completes a merged-without-armed attempt without re-merging', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    appendEvent(deps.mqDir, {
      type: 'bootstrap_intent', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', at: '2026-07-19T11:00:00.000Z',
    })
    appendEvent(deps.mqDir, {
      type: 'bootstrap_merged', bootstrapId: '00X', pr: 41,
      gatedHeadSha: 'SHA-A', mergeCommitSha: 'M1', at: '2026-07-19T11:00:01.000Z',
    })
    const gh = makeGh({ states: ['MERGED'] })
    const { deps: resumed, rec } = makeDeps(root, { gh })
    const out = await runBootstrap(resumed, { pr: 41, finish: true })
    expect(out.ok).toBe(true)
    expect(out.stage).toBe('complete')
    expect(gh.merged).toEqual([])
    expect(rec.smoked).toBe(1)
    expect(readJournal(deps.mqDir).at(-1)).toMatchObject({ type: 'bootstrap_armed', bootstrapId: '00X' })
  })
  it('--finish with no unfinished attempt fails without side effects', async () => {
    const root = tmpRoot()
    const { deps, rec } = makeDeps(root)
    const out = await runBootstrap(deps, { pr: 41, finish: true })
    expect(out.ok).toBe(false)
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toEqual([])
  })
  it('a red preflight gate stops before arming or journaling anything', async () => {
    const root = tmpRoot()
    const red: GateResult = { result: 'red', seconds: 9, logPath: '/tmp/log', failedTests: [] }
    const { deps, rec } = makeDeps(root, { runGate: () => red })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('preflight')
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toEqual([])
  })
  it('unresolvable gate targets fail preflight with the gate-component remediation', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root, { gateTargetResolves: () => false })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.messages.join('\n')).toMatch(/agent-ops install --component gate/)
  })
  it('a failed daemon smoke leaves merged-without-armed and points at --finish', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root, { smokeDaemon: () => ({ ok: false, detail: 'exited 1' }) })
    const out = await runBootstrap(deps, { pr: 41 })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('verify')
    expect(out.messages.join('\n')).toMatch(/--finish/)
    expect(readJournal(deps.mqDir).map(e => e.type)).toEqual(['bootstrap_intent', 'bootstrap_merged'])
  })
  it('an armed attempt is a clean no-op', async () => {
    const root = tmpRoot()
    const { deps } = makeDeps(root)
    for (const type of ['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'] as const) {
      appendEvent(deps.mqDir, {
        type, bootstrapId: '00X', pr: 41, gatedHeadSha: 'SHA-A',
        ...(type === 'bootstrap_merged' ? { mergeCommitSha: 'M1' } : {}),
        at: '2026-07-19T11:00:00.000Z',
      } as never)
    }
    const { deps: again, rec } = makeDeps(root, { gh: makeGh({ states: ['MERGED'] }) })
    const out = await runBootstrap(again, { pr: 41 })
    expect(out.ok).toBe(true)
    expect(rec.hooksArmed).toBe(0)
    expect(readJournal(deps.mqDir)).toHaveLength(3)
  })
})
```

- [ ] Run: `npx vitest run src/merge-queue/bootstrap.test.ts` — engine tests FAIL (`runBootstrap` not exported).
- [ ] Append the engine to `src/merge-queue/bootstrap.ts`. Extend the imports at the top of the file to:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { appendEvent, readJournal } from './journal.js'
import type { GhClient } from './gh.js'
import type { GitOps } from './git.js'
import type { GateResult } from './gate.js'
import type { JournalEvent, MergeQueueConfig } from './types.js'
```

  then append after `planResume`:

```ts
export interface BootstrapDeps {
  gh: GhClient
  git: GitOps
  runGate: (opts: {
    cwd: string; command: string; timeoutMs: number; logPath: string
    env?: Record<string, string>; pidFile?: string
  }) => GateResult | Promise<GateResult>
  config: MergeQueueConfig
  mqDir: string
  projectRoot: string
  /** D8 primitive (idempotent) — arm the Claude Code hooks. */
  armHooks: () => { messages: string[] }
  /** D6 primitive — null when the scheduler is not part of this executor
   *  (gate_executor !== 'local-poller'). */
  armSched: (() => { ok: boolean; messages: string[] }) | null
  /** Post-merge daemon smoke (`mq daemon --once`). */
  smokeDaemon: () => { ok: boolean; detail: string }
  /** Closing doctor pass (advisory) — null when the doctor CLI is unavailable. */
  runDoctor: (() => { exitCode: number; summary: string }) | null
  gateTargetResolves: (command: string) => boolean
  log: (msg: string) => void
  now: () => Date
  /** ULID seam. */
  newId: () => string
}

export interface BootstrapOutcome {
  ok: boolean
  bootstrapId: string | null
  stage: 'preflight' | 'arm' | 'merge' | 'verify' | 'complete' | 'aborted'
  messages: string[]
}

/** D9: arm-first guided first merge. Order — preflight gate on the PR head →
 *  arm hooks/sched (nothing that needs the merge) → journaled squash-merge
 *  with head revalidation → daemon smoke + doctor → bootstrap_armed. A crash
 *  anywhere resumes via planResume with GitHub authoritative. */
export async function runBootstrap(
  deps: BootstrapDeps,
  opts: { pr: number; finish?: boolean },
): Promise<BootstrapOutcome> {
  const messages: string[] = []
  const say = (m: string): void => {
    messages.push(m)
    deps.log(m)
  }
  const at = (): string => deps.now().toISOString()

  const info = deps.gh.viewPr(opts.pr)
  const attempt = latestAttemptFor(readJournal(deps.mqDir), opts.pr)
  const decision = planResume(attempt, { state: info.state, headSha: info.headSha })

  const arm = (): boolean => {
    for (const m of deps.armHooks().messages) say(m)
    if (deps.armSched !== null) {
      const s = deps.armSched()
      for (const m of s.messages) say(m)
      if (!s.ok) {
        say('bootstrap: scheduler arm FAILED — fix it, then resume with: scaffold mq bootstrap --pr ' + String(opts.pr) + ' --finish')
        return false
      }
    } else {
      say('scheduler arm skipped (gate_executor is not local-poller)')
    }
    return true
  }

  const verifyAndArm = (a: { bootstrapId: string; gatedHeadSha: string }): BootstrapOutcome => {
    const smoke = deps.smokeDaemon()
    say(`daemon smoke: ${smoke.detail}`)
    if (!smoke.ok) {
      say(`bootstrap: the merge is recorded but the queue is NOT verified — finish with: scaffold mq bootstrap --pr ${opts.pr} --finish`)
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'verify', messages }
    }
    appendEvent(deps.mqDir, {
      type: 'bootstrap_armed', bootstrapId: a.bootstrapId, pr: opts.pr,
      gatedHeadSha: a.gatedHeadSha, at: at(),
    })
    if (deps.runDoctor !== null) {
      const d = deps.runDoctor()
      say(`closing doctor pass: ${d.summary} (exit ${d.exitCode})`)
    } else {
      say('closing doctor pass unavailable — run: scaffold doctor')
    }
    say('bootstrap complete — the queue is armed; from now on: scaffold mq enqueue --pr <N>')
    return { ok: true, bootstrapId: a.bootstrapId, stage: 'complete', messages }
  }

  const recordMerged = (a: { bootstrapId: string; gatedHeadSha: string }, mergeSha: string): void => {
    appendEvent(deps.mqDir, {
      type: 'bootstrap_merged', bootstrapId: a.bootstrapId, pr: opts.pr,
      gatedHeadSha: a.gatedHeadSha, mergeCommitSha: mergeSha, at: at(),
    })
  }

  const mergeAndFinish = (a: { bootstrapId: string; gatedHeadSha: string }): BootstrapOutcome => {
    // Revalidate IMMEDIATELY before merging: never merge an ungated head (D9).
    const fresh = deps.gh.viewPr(opts.pr)
    if (fresh.state === 'MERGED') {
      recordMerged(a, deps.gh.mergeCommitSha(opts.pr) ?? '')
      say(`PR #${opts.pr} is already MERGED on GitHub — recorded, never re-merged`)
      return verifyAndArm(a)
    }
    if (fresh.state === 'CLOSED') {
      say(`bootstrap ABORTED: PR #${opts.pr} was closed — attempt ${a.bootstrapId} is terminal`)
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'aborted', messages }
    }
    if (fresh.headSha !== a.gatedHeadSha) {
      say(`bootstrap ABORTED: PR head moved (gated ${a.gatedHeadSha}, now ${fresh.headSha}) — attempt ${a.bootstrapId} is terminal; re-run scaffold mq bootstrap --pr ${opts.pr} for a fresh gated attempt`)
      return { ok: false, bootstrapId: a.bootstrapId, stage: 'aborted', messages }
    }
    deps.gh.squashMerge(opts.pr, a.gatedHeadSha)
    const mergeSha = deps.gh.mergeCommitSha(opts.pr) ?? ''
    if (mergeSha === '') say('note: GitHub has not reported the merge commit SHA yet — recorded empty')
    recordMerged(a, mergeSha)
    say(`merged PR #${opts.pr} (bootstrap ${a.bootstrapId}, merge commit ${mergeSha === '' ? 'unknown' : mergeSha})`)
    return verifyAndArm(a)
  }

  switch (decision.kind) {
  case 'complete':
    say(`bootstrap ${decision.attempt.bootstrapId} already completed (armed) — nothing to do`)
    return { ok: true, bootstrapId: decision.attempt.bootstrapId, stage: 'complete', messages }
  case 'arm-and-verify':
    say(`resuming bootstrap ${decision.attempt.bootstrapId}: merge already journaled — re-arming idempotently`)
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    return verifyAndArm(decision.attempt)
  case 'record-merge-then-arm':
    // Crash window: the merge API call succeeded, the journal write did not.
    recordMerged(decision.attempt, deps.gh.mergeCommitSha(opts.pr) ?? '')
    say(`crash-window reconciliation: GitHub reports PR #${opts.pr} MERGED — merge recorded retroactively (never re-merged)`)
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    return verifyAndArm(decision.attempt)
  case 'rerun-merge':
    say(`resuming bootstrap ${decision.attempt.bootstrapId}: intent journaled, merge not — re-running the merge stage`)
    if (!arm()) return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'arm', messages }
    return mergeAndFinish(decision.attempt)
  case 'aborted':
    if (opts.finish === true) {
      say(decision.reason)
      return { ok: false, bootstrapId: decision.attempt.bootstrapId, stage: 'aborted', messages }
    }
    say(`prior attempt ${decision.attempt.bootstrapId} is terminal — starting a fresh attempt (${decision.reason})`)
    break
  case 'fresh':
    if (opts.finish === true) {
      say(`mq bootstrap --finish: no unfinished bootstrap attempt for PR #${opts.pr}`)
      return { ok: false, bootstrapId: null, stage: 'preflight', messages }
    }
    break
  }

  // ---- fresh attempt: preflight --------------------------------------------
  if (info.state !== 'OPEN') {
    say(`bootstrap preflight: PR #${opts.pr} is ${info.state}, not OPEN`)
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  if (!fs.existsSync(path.join(deps.projectRoot, '.scaffold', 'agent-ops.yaml'))) {
    say('bootstrap preflight: .scaffold/agent-ops.yaml not found — configure the queue first (merge-throughput step, or scaffold agent-ops install --component merge-queue)')
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  for (const cmd of [deps.config.gate_command, deps.config.full_gate_command]) {
    if (!deps.gateTargetResolves(cmd)) {
      say(`bootstrap preflight: gate command "${cmd}" does not resolve — install the gate component: scaffold agent-ops install --component gate`)
      return { ok: false, bootstrapId: null, stage: 'preflight', messages }
    }
  }
  const gatedHeadSha = info.headSha
  deps.git.fetchOrigin()
  const cwd = deps.git.checkoutDetachedInGate(gatedHeadSha)
  say(`preflight: running the FULL gate on PR head ${gatedHeadSha} (${deps.config.full_gate_command})`)
  const gate = await deps.runGate({
    cwd,
    command: deps.config.full_gate_command,
    timeoutMs: deps.config.gate_timeout_minutes * 60_000,
    logPath: path.join(deps.mqDir, 'logs', `bootstrap-${opts.pr}.log`),
  })
  if (gate.result !== 'green') {
    say(`bootstrap preflight: full gate ${gate.result} after ${gate.seconds}s — see ${gate.logPath}`)
    return { ok: false, bootstrapId: null, stage: 'preflight', messages }
  }
  say(`preflight: full gate green in ${gate.seconds}s`)

  // ---- arm-first: everything that does not require the merge (D9) ----------
  if (!arm()) return { ok: false, bootstrapId: null, stage: 'arm', messages }

  // ---- merge under bootstrap semantics -------------------------------------
  const bootstrapId = deps.newId()
  appendEvent(deps.mqDir, {
    type: 'bootstrap_intent', bootstrapId, pr: opts.pr, gatedHeadSha, at: at(),
  })
  return mergeAndFinish({ bootstrapId, gatedHeadSha })
}
```

  Note: the `JournalEvent` import becomes type-only usage inside the reducers — keep the single `import type { JournalEvent, MergeQueueConfig } from './types.js'` line (replacing Task 14's narrower import).

- [ ] Run: `npx vitest run src/merge-queue/bootstrap.test.ts` — expect 21 tests passed (12 pure + 9 engine).
- [ ] Wire the CLI in `src/cli/commands/mq.ts`:

  1. Extend the imports — Edit old string:

```ts
import { spawn } from 'node:child_process'
```

  new string:

```ts
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { ulid } from 'ulid'
```

  and Edit old string:

```ts
import { runGate } from '../../merge-queue/gate.js'
```

  new string:

```ts
import { runGate } from '../../merge-queue/gate.js'
import { runBootstrap, type BootstrapDeps } from '../../merge-queue/bootstrap.js'
import { installHooks } from '../../core/hooks/install.js'
import { pickSchedBackend } from '../../sched/platform.js'
import { buildPostMergePollerJob } from '../../sched/jobs.js'
```

  2. Extend `MqArgs` — Edit old string:

```ts
  foreground?: boolean
```

  new string:

```ts
  foreground?: boolean
  finish?: boolean
```

  3. Add the resolver helper and overrides type after the `MqArgs` interface:

```ts
export interface MqOverrides {
  /** Test seam for `mq bootstrap` — any subset of BootstrapDeps. */
  bootstrapDeps?: Partial<BootstrapDeps>
}

/** Preflight helper (D9): does the configured gate command RESOLVE?
 *  `make -n` for make targets (proves resolution, not health — doctor's
 *  GATE_PROBE covers health); `command -v` on the head word otherwise. */
export function gateTargetResolves(projectRoot: string, command: string): boolean {
  const words = command.trim().split(/\s+/)
  if (words.length === 0 || words[0] === '') return false
  try {
    if (words[0] === 'make') {
      execFileSync('make', ['-n', ...words.slice(1)], { cwd: projectRoot, stdio: 'ignore', timeout: 30_000 })
    } else {
      execFileSync('bash', ['-c', `command -v ${words[0]}`], { cwd: projectRoot, stdio: 'ignore', timeout: 30_000 })
    }
    return true
  } catch {
    return false
  }
}
```

  4. Change the handler signature — Edit old string:

```ts
export async function mqHandler(argv: MqArgs): Promise<void> {
```

  new string:

```ts
export async function mqHandler(argv: MqArgs, overrides: MqOverrides = {}): Promise<void> {
```

  5. Add the bootstrap case before `case 'daemon': {` — Edit old string:

```ts
  case 'daemon': {
```

  new string:

```ts
  case 'bootstrap': {
    const pr = needPr()
    if (pr === null) return
    const o = overrides.bootstrapDeps ?? {}
    const config = o.config ?? loadAgentOpsConfig(primary).merge_queue
    // Spawn the scaffold CLI itself for the smoke/doctor passes: the spec pins
    // those command surfaces (exit codes), so the CLI is the stable seam.
    const cli = (args: string[], timeoutMs: number): number => {
      const r = spawnSync(process.execPath, [process.argv[1], ...args], {
        cwd: primary, stdio: 'ignore', timeout: timeoutMs,
      })
      return r.status ?? 2
    }
    const deps: BootstrapDeps = {
      gh: o.gh ?? createGhClient(primary),
      git: o.git ?? git,
      runGate: o.runGate ?? runGate,
      config,
      mqDir: o.mqDir ?? mqDir,
      projectRoot: o.projectRoot ?? primary,
      armHooks: o.armHooks ?? ((): { messages: string[] } => {
        const r = installHooks(primary)
        return {
          messages: [
            ...r.added.map(l => `hooks: registered ${l}`),
            ...r.alreadyPresent.map(l => `hooks: already registered ${l}`),
            ...r.skipped.map(s => `hooks: ${s.reason}`),
          ],
        }
      }),
      armSched: o.armSched !== undefined
        ? o.armSched
        : config.gate_executor === 'local-poller'
          ? (): { ok: boolean; messages: string[] } => {
            try {
              const res = pickSchedBackend().install(buildPostMergePollerJob(primary))
              return { ok: res.ok, messages: res.messages.map(m => `sched: ${m}`) }
            } catch (err) {
              return { ok: false, messages: [`sched: ${err instanceof Error ? err.message : String(err)}`] }
            }
          }
          : null,
      smokeDaemon: o.smokeDaemon ?? ((): { ok: boolean; detail: string } => {
        const status = cli(['mq', 'daemon', '--once', '--root', primary], 300_000)
        return status === 0
          ? { ok: true, detail: 'mq daemon --once cycle completed clean' }
          : { ok: false, detail: `mq daemon --once exited ${status}` }
      }),
      runDoctor: o.runDoctor !== undefined
        ? o.runDoctor
        : (): { exitCode: number; summary: string } => {
          const status = cli(['doctor'], 300_000)
          return {
            exitCode: status,
            summary: status === 0
              ? 'healthy'
              : status === 1
                ? 'warnings — run scaffold doctor for detail'
                : 'errors — run scaffold doctor for detail',
          }
        },
      gateTargetResolves: o.gateTargetResolves ?? (cmd => gateTargetResolves(primary, cmd)),
      log: o.log ?? (m => output.info(m)),
      now: o.now ?? ((): Date => new Date()),
      newId: o.newId ?? ((): string => ulid()),
    }
    const outcome = await runBootstrap(deps, { pr, finish: argv.finish })
    if (outcome.ok) {
      output.success(`mq bootstrap: ${outcome.stage} (attempt ${outcome.bootstrapId ?? '—'})`)
    } else {
      output.error(`mq bootstrap stopped at ${outcome.stage} — see messages above`)
      process.exitCode = 1
    }
    return
  }
  case 'daemon': {
```

  6. In the builder, Edit old string:

```ts
        choices: ['enqueue', 'daemon', 'status', 'eject', 'stats'] as const,
```

  new string:

```ts
        choices: ['enqueue', 'daemon', 'status', 'eject', 'stats', 'bootstrap'] as const,
```

  and Edit old string:

```ts
      .option('pr', { type: 'number', describe: 'PR number (enqueue / eject / status filter)' })
```

  new string:

```ts
      .option('pr', { type: 'number', describe: 'PR number (enqueue / eject / bootstrap / status filter)' })
      .option('finish', {
        type: 'boolean', default: false,
        describe: 'Resume an unfinished bootstrap attempt (never starts a new one)',
      })
```

  and update the command describe — Edit old string:

```ts
  describe: 'Local batching merge queue: enqueue PRs, run the daemon, inspect status',
```

  new string:

```ts
  describe: 'Local batching merge queue: enqueue PRs, run the daemon, inspect status, bootstrap the first merge',
```

- [ ] Update + extend `src/cli/commands/mq.test.ts`. Edit the stale test title — old string:

```ts
  it('declares the five actions', () => {
```

  new string:

```ts
  it('declares the mq command surface (bootstrap included)', () => {
```

  then append a new describe block (add `import type { BootstrapDeps } from '../../merge-queue/bootstrap.js'`, `import type { GhClient, PrInfo } from '../../merge-queue/gh.js'`, `import type { CandidateResult, GitOps } from '../../merge-queue/git.js'` at the top):

```ts
describe('scaffold mq bootstrap (CLI wiring)', () => {
  function opsYaml(root: string): void {
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  }
  function fakeDeps(root: string): Partial<BootstrapDeps> {
    const gh: GhClient = {
      viewPr: (pr: number): PrInfo => ({
        number: pr, state: 'OPEN', headSha: 'SHA-A', mergedAt: null,
        additions: 0, deletions: 0, title: 't', body: '',
      }),
      squashMerge: (): void => { /* recorded via journal assertions */ },
      mergeCommitSha: (): string | null => 'M1',
      comment: (): void => { /* unused */ },
      listLabeled: (): number[] => [],
      postMergeRed: (): boolean => false,
    }
    const git: GitOps = {
      primaryRoot: () => root,
      defaultBranch: () => 'main',
      fetchOrigin: (): void => { /* no-op */ },
      originHeadSha: () => 'BASE',
      treeOf: () => 'TREE',
      ensureGateWorktree: () => path.join(root, '.mq', 'gate'),
      checkoutDetachedInGate: () => path.join(root, '.mq', 'gate'),
      constructCandidate: (): CandidateResult => { throw new Error('unused') },
      deleteCandidate: (): void => { /* unused */ },
      listCandidateRefs: (): string[] => [],
    }
    return {
      gh, git,
      runGate: () => ({ result: 'green' as const, seconds: 1, logPath: '/dev/null', failedTests: [] }),
      armHooks: () => ({ messages: [] }),
      armSched: null,
      smokeDaemon: () => ({ ok: true, detail: 'clean' }),
      runDoctor: null,
      gateTargetResolves: () => true,
      newId: () => '01TEST',
    }
  }
  it('bootstrap journals intent → merged → armed and exits 0', async () => {
    const root = scratchRepo()
    opsYaml(root)
    await mqHandler({ action: 'bootstrap', pr: 41, root }, { bootstrapDeps: fakeDeps(root) })
    const types = readJournal(path.join(root, '.mq')).map(e => e.type)
    expect(types).toEqual(['bootstrap_intent', 'bootstrap_merged', 'bootstrap_armed'])
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('bootstrap --finish with no attempt exits 1', async () => {
    const root = scratchRepo()
    opsYaml(root)
    await mqHandler({ action: 'bootstrap', pr: 41, finish: true, root }, { bootstrapDeps: fakeDeps(root) })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('bootstrap without --pr exits 1', async () => {
    const root = scratchRepo()
    await mqHandler({ action: 'bootstrap', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('parses "mq bootstrap --pr 7 --finish" under strict mode', async () => {
    let seen: { action?: string; pr?: number; finish?: boolean } = {}
    await yargs(['mq', 'bootstrap', '--pr', '7', '--finish'])
      .command({ ...mqCommand, handler: a => { seen = { action: String(a.action), pr: a.pr as number, finish: a.finish as boolean } } })
      .strict()
      .fail(false)
      .parseAsync()
    expect(seen).toEqual({ action: 'bootstrap', pr: 7, finish: true })
  })
})
```

- [ ] Run: `npx vitest run src/cli/commands/mq.test.ts` — all tests green (pre-existing + 4 new).
- [ ] Update the guard message (D9: point first-time installers at `mq bootstrap`, never the env-var bypass). In `content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl`, Edit old string:

```
	printf '%s\n' "mq-guard: direct 'gh pr merge' is routed through the merge queue on this project. Enqueue instead: scaffold mq enqueue --pr <N> (or: make mq-enqueue PR=<N>). The queue batch-tests against latest {{DEFAULT_BRANCH}} and lands green PRs for you; watch with: scaffold mq status." >&2
```

  new string:

```
	printf '%s\n' "mq-guard: direct 'gh pr merge' is routed through the merge queue on this project. Enqueue instead: scaffold mq enqueue --pr <N> (or: make mq-enqueue PR=<N>). The queue batch-tests against latest {{DEFAULT_BRANCH}} and lands green PRs for you; watch with: scaffold mq status. First queue-installing PR (queue not armed yet)? Run the guided first merge: scaffold mq bootstrap --pr <N>." >&2
```

  (The line is tab-indented inside the `if` block — preserve the leading tab.)

- [ ] Append the guard-message test to `tests/agent-ops-merge-queue.bats` (after the `"mq-guard prints no override recipe on block"` test):

```bash
@test "mq-guard block message points first-time installers at mq bootstrap" {
  run "$TMP/mq-guard.sh" --check 'gh pr merge 11 --squash'
  [ "$status" -eq 2 ]
  [[ "$output" == *"scaffold mq bootstrap"* ]]
  [[ "$output" != *"MQ_DIRECT_MERGE_OK"* ]]
}
```

- [ ] Run: `bats tests/agent-ops-merge-queue.bats` — all `ok` (pre-existing + 1 new).
- [ ] Run: `npx tsc --noEmit -p tsconfig.json` — expect clean.
- [ ] Commit: `git add -A && git commit -m "feat(mq): scaffold mq bootstrap — arm-first journaled first merge + guard pointer (D9)"`

---

### Task 16: doctor `--fix` R2 wrappers — hook-reregistration + scheduler-reload (D5)

**Files:**
- Create: `src/doctor/fixes/ops-fixes.ts`
- Create: `src/doctor/fixes/ops-fixes.test.ts`
- Modify: the R1 hooks + scheduler checks in `src/doctor/` (registration edit, located by grep)

**Interfaces:**
- Produces: `OpsFixResult { ok, messages }`, `fixHookRegistration(projectRoot, deps?): OpsFixResult`, `fixSchedulerReload(projectRoot, deps?): OpsFixResult` — both THIN wrappers over the D8/D6 primitives (spec D5: "never duplicated logic").
- Consumes: `installHooks` (Task 12), `pickSchedBackend` (Task 6), `buildPostMergePollerJob` (Task 5), and the R1 doctor check registry. The spec pins each check's shape as `{section, run(), severity, remediation, fix?()}` (§6.3); R1 built that registry in `src/doctor/` — consume it, do not rebuild it. If R1's concrete file/type names differ, apply the registration edit at the equivalent site per this plan's R1-interfaces rule (the interface names are the contract).

**Steps:**

- [ ] Write the failing test `src/doctor/fixes/ops-fixes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixHookRegistration, fixSchedulerReload } from './ops-fixes.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

const JOB: SchedJob = {
  name: 'post-merge-poller',
  label: 'com.p.merge-poller',
  unitBase: 'scaffold-p-merge-poller',
  programArguments: ['/p/scripts/ops/post-merge-poller.sh'],
  intervalSeconds: 600,
  workingDirectory: '/p',
  stdoutPath: '/p/.mq/logs/post-merge-poller.out.log',
  stderrPath: '/p/.mq/logs/post-merge-poller.err.log',
  environment: { PATH: '/usr/bin:/bin' },
}

function backend(ok: boolean): SchedBackend & { installed: SchedJob[] } {
  const installed: SchedJob[] = []
  return {
    installed,
    platform: 'launchd',
    unitPaths: () => ['/units/x.plist'],
    install: job => {
      installed.push(job)
      return { ok, verified: ok, messages: ok ? ['verified loaded'] : ['job did not load'] }
    },
    uninstall: () => ({ ok: true, verified: true, messages: [] }),
    status: () => ({ installed: true, loaded: ok, lastRunAt: null, detail: '' }),
  }
}

describe('fixHookRegistration (thin D8 wrapper)', () => {
  it('reports registrations and prerequisite skips from the primitive', () => {
    const res = fixHookRegistration('/p', {
      install: () => ({
        added: ['PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)'],
        alreadyPresent: [],
        skipped: [{ hook: 'bd-prime', reason: 'skipped SessionStart bd prime: .beads/ not found — run the beads step (bd init) first' }],
        settingsPath: '/p/.claude/settings.json',
        changed: true,
      }),
    })
    expect(res.ok).toBe(true)
    expect(res.messages.join('\n')).toContain('registered PreToolUse: scripts/mq-guard.sh')
    expect(res.messages.join('\n')).toContain('.beads/ not found')
  })
  it('reports already-current when nothing changed', () => {
    const res = fixHookRegistration('/p', {
      install: () => ({
        added: [], alreadyPresent: ['PostToolUse: gh pr create review reminder (mmr review)'],
        skipped: [], settingsPath: '/p/.claude/settings.json', changed: false,
      }),
    })
    expect(res.ok).toBe(true)
    expect(res.messages).toEqual(['all hook registrations already current'])
  })
  it('maps a primitive throw (malformed settings.json) to ok:false', () => {
    const res = fixHookRegistration('/p', {
      install: () => {
        throw new Error('.claude/settings.json is not a JSON object — refusing to modify it')
      },
    })
    expect(res.ok).toBe(false)
    expect(res.messages[0]).toContain('refusing to modify')
  })
})

describe('fixSchedulerReload (thin D6 wrapper)', () => {
  it('reload = backend.install — bootout||true + bootstrap + verify make it idempotent', () => {
    const be = backend(true)
    const res = fixSchedulerReload('/p', { backend: be, buildJob: () => JOB })
    expect(res.ok).toBe(true)
    expect(be.installed).toEqual([JOB])
    expect(res.messages).toEqual(['verified loaded'])
  })
  it('fails when the backend cannot verify the reload', () => {
    const res = fixSchedulerReload('/p', { backend: backend(false), buildJob: () => JOB })
    expect(res.ok).toBe(false)
    expect(res.messages.join('\n')).toContain('did not load')
  })
  it('fails cleanly when the job is not buildable (poller not installed)', () => {
    const res = fixSchedulerReload('/p', {
      backend: backend(true),
      buildJob: () => {
        throw new Error('post-merge-poller.sh not found — install it first: scaffold agent-ops install --component merge-queue')
      },
    })
    expect(res.ok).toBe(false)
    expect(res.messages[0]).toContain('agent-ops install --component merge-queue')
  })
})
```

- [ ] Run: `npx vitest run src/doctor/fixes/ops-fixes.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/doctor/fixes/ops-fixes.ts`:

```ts
import { installHooks, type HooksInstallResult } from '../../core/hooks/install.js'
import { buildPostMergePollerJob } from '../../sched/jobs.js'
import { pickSchedBackend } from '../../sched/platform.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

export interface OpsFixResult {
  ok: boolean
  messages: string[]
}

/** D5 R2 fix handler: hook re-registration — a THIN wrapper over the D8
 *  primitive (never duplicated logic). Safe to run repeatedly: installHooks
 *  only appends missing registrations and never rewrites existing entries. */
export function fixHookRegistration(
  projectRoot: string,
  deps: { install?: (projectRoot: string) => HooksInstallResult } = {},
): OpsFixResult {
  try {
    const res = (deps.install ?? installHooks)(projectRoot)
    const messages = [
      ...res.added.map(l => `registered ${l}`),
      ...res.skipped.map(s => s.reason),
    ]
    if (messages.length === 0) messages.push('all hook registrations already current')
    return { ok: true, messages }
  } catch (err) {
    return { ok: false, messages: [err instanceof Error ? err.message : String(err)] }
  }
}

/** D5 R2 fix handler: scheduler reload — a THIN wrapper over the D6 primitive.
 *  Reload = install: the backend's `bootout || true` + bootstrap + liveness
 *  verification make re-install the idempotent reload path (D6). */
export function fixSchedulerReload(
  projectRoot: string,
  deps: {
    backend?: SchedBackend
    buildJob?: (projectRoot: string) => SchedJob
  } = {},
): OpsFixResult {
  try {
    const backend = deps.backend ?? pickSchedBackend()
    const build = deps.buildJob ?? ((root: string): SchedJob => buildPostMergePollerJob(root))
    const res = backend.install(build(projectRoot))
    return { ok: res.ok && res.verified, messages: res.messages }
  } catch (err) {
    return { ok: false, messages: [err instanceof Error ? err.message : String(err)] }
  }
}
```

- [ ] Run: `npx vitest run src/doctor/fixes/ops-fixes.test.ts` — expect 6 tests passed.
- [ ] Register the fixes on the R1 checks. Locate them: `grep -rn "section" src/doctor --include="*.ts" | grep -iv test | grep -i "hooks\|sched"` (fall back to `grep -rln "hooks\|scheduler" src/doctor --include="*.ts"`). In the **hooks section check**, add the optional `fix` member the R1 registry shape declares (`{section, run(), severity, remediation, fix?()}`):

```ts
  fix: (ctx) => {
    const res = fixHookRegistration(ctx.projectRoot)
    return { applied: res.ok, detail: res.messages.join('; ') }
  },
```

  and in the **scheduler section check**:

```ts
  fix: (ctx) => {
    const res = fixSchedulerReload(ctx.projectRoot)
    return { applied: res.ok, detail: res.messages.join('; ') }
  },
```

  with `import { fixHookRegistration, fixSchedulerReload } from '../fixes/ops-fixes.js'` (adjust the relative path to each check file's location). The adapter closures above are the registration glue: R1's registry pins `fix?: (ctx: DoctorContext) => { applied: boolean; detail: string }` (R1 plan Task 7), while the R2 wrappers return `OpsFixResult { ok, messages }` — map `ok → applied` and `messages.join('; ') → detail` exactly as shown, and take `projectRoot` from the `DoctorContext` the registry passes.
- [ ] Update R1's `--fix` gating so these two fixes are eligible: R1 shipped with only the `bd doctor --fix` delegation enabled (spec D5 "release-staged"). Find the gate — `grep -rn "fix" src/cli/commands/doctor.ts src/doctor --include="*.ts" | grep -iv test | grep -i "delegat\|only\|R1\|stage"` — and remove/replace any allowlist that excludes checks carrying a `fix()` member, so `doctor --fix` now runs every registered `fix()` (still only idempotent safe fixes exist: bd delegation, hook re-registration, scheduler reload — all three never reset state or delete files).
- [ ] Run: `npx vitest run src/doctor` — the R1 doctor tests plus the 6 new wrapper tests all green. If an R1 test asserted that hooks/scheduler failures are report-only under `--fix`, update it to assert the fix now runs (that staging note was explicitly "fix handlers land in R2", spec D5).
- [ ] Commit: `git add -A && git commit -m "feat(doctor): R2 --fix wrappers — hook re-registration (D8) + scheduler reload (D6), thin over primitives"`

---

### Task 17: doctor gate section — upgrade resolve-only to the bounded `GATE_PROBE=1` probe

**Files:**
- Create: `src/doctor/gate-probe.ts`
- Create: `src/doctor/gate-probe.test.ts`
- Modify: the R1 gate check in `src/doctor/` (wiring edit, located by grep)

**Interfaces:**
- Produces: `GateProbeResult { ran, ok, detail }`, `runGateProbe(projectRoot, opts?: { timeoutMs? }): GateProbeResult`, `GATE_PROBE_TIMEOUT_MS = 120_000`.
- Consumes: the generated gate seeds (Tasks 7–8: both scripts honor `GATE_PROBE=1` — prerequisites only, suite never runs); the R1 gate check, which today reports `make -n` resolution AS resolution-only (spec D5: "`make -n` proves only that the targets resolve and is reported as exactly that, never as 'healthy'; the real check runs the generated gate script in a bounded probe mode").

**Steps:**

- [ ] Write the failing test `src/doctor/gate-probe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGateProbe } from './gate-probe.js'

function project(script?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-probe-'))
  if (script !== undefined) {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), script, { mode: 0o755 })
  }
  return root
}

const HONORS_PROBE = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'if [ "${GATE_PROBE:-0}" = "1" ]; then',
  '  echo "gate-check: probe OK (prerequisites verified; suite not run)"',
  '  exit 0',
  'fi',
  'touch suite-ran',
  '',
].join('\n')

describe('runGateProbe (D5 gate section, R2)', () => {
  it('reports ran:false when no generated gate script exists (resolve-only check stands)', () => {
    const res = runGateProbe(project())
    expect(res.ran).toBe(false)
    expect(res.ok).toBe(true)
    expect(res.detail).toMatch(/resolve-only/)
    expect(res.detail).toMatch(/--component gate/)
  })
  it('runs the script with GATE_PROBE=1 and never executes the suite', () => {
    const root = project(HONORS_PROBE)
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(true)
    expect(res.detail).toMatch(/prerequisites verified/)
    expect(fs.existsSync(path.join(root, 'suite-ran'))).toBe(false)
  })
  it('surfaces a failing probe with the output tail', () => {
    const root = project([
      '#!/usr/bin/env bash',
      'echo "gate-check: node is not on PATH" >&2',
      'exit 1',
      '',
    ].join('\n'))
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
    expect(res.detail).toContain('node is not on PATH')
  })
  it('bounds the probe with a timeout', () => {
    const root = project('#!/usr/bin/env bash\nsleep 30\n')
    const res = runGateProbe(root, { timeoutMs: 500 })
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
  })
})
```

- [ ] Run: `npx vitest run src/doctor/gate-probe.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/doctor/gate-probe.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export interface GateProbeResult {
  /** False when no generated gate script exists — the R1 resolve-only
   *  reporting stands unchanged in that case. */
  ran: boolean
  ok: boolean
  detail: string
}

export const GATE_PROBE_TIMEOUT_MS = 120_000

/** D5 (R2): the bounded execution probe for doctor's gate section. Runs the
 *  generated gate seed with GATE_PROBE=1 — dependency presence, functional
 *  runtimes, test-runner startup — WITHOUT executing the suite (the full gate
 *  stays behind `doctor --deep`). gate-check.sh is preferred; the affected
 *  script delegates its probe mode there anyway (Task 8). */
export function runGateProbe(
  projectRoot: string,
  opts: { timeoutMs?: number } = {},
): GateProbeResult {
  const script = ['scripts/gate-check.sh', 'scripts/gate-check-affected.sh']
    .map(rel => path.join(projectRoot, rel))
    .find(p => fs.existsSync(p))
  if (script === undefined) {
    return {
      ran: false,
      ok: true,
      detail: 'no generated gate script — resolve-only check applies (install: scaffold agent-ops install --component gate)',
    }
  }
  const res = spawnSync('bash', [script], {
    cwd: projectRoot,
    env: { ...process.env, GATE_PROBE: '1' },
    timeout: opts.timeoutMs ?? GATE_PROBE_TIMEOUT_MS,
    encoding: 'utf8',
  })
  const name = path.basename(script)
  if (res.status === 0) {
    return { ran: true, ok: true, detail: `GATE_PROBE=1 ${name}: prerequisites verified (suite not run)` }
  }
  const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ')
  return {
    ran: true,
    ok: false,
    detail: `GATE_PROBE=1 ${name} failed${res.signal !== null ? ` (${res.signal})` : ''}: ${tail}`,
  }
}
```

- [ ] Run: `npx vitest run src/doctor/gate-probe.test.ts` — expect 4 tests passed (the timeout test takes ~0.5s by design).
- [ ] Wire the probe into the R1 gate check. Locate it: `grep -rln "make -n\|resolve" src/doctor --include="*.ts" | grep -iv test` (the check whose `section` is the gate). In its `run()`, after the existing `make -n` resolution reporting, add:

```ts
    const probe = runGateProbe(projectRoot)
    if (probe.ran) {
      if (probe.ok) {
        // Upgrade: resolution + a PASSING bounded probe is a real health signal.
        // Report it as probed health, replacing the "resolves only" caveat.
      } else {
        // A failing probe is a gate-section failure with probe.detail as the
        // message and remediation "fix the reported prerequisite, then re-run
        // scaffold doctor" — severity per the section's existing failure tier.
      }
    }
    // probe.ran === false: keep the R1 resolve-only wording untouched.
```

  with `import { runGateProbe } from '../gate-probe.js'` (adjust the relative path). Express the two branches in the check's own result vocabulary (R1's finding/severity types) — the load-bearing behavior to preserve: a passing probe reports *probed* health (`probe.detail`), a failing probe fails the section with `probe.detail`, and absence of gate scripts leaves the R1 resolve-only report exactly as it was.
- [ ] Run: `npx vitest run src/doctor` — green. If the R1 gate-check tests pinned the resolve-only wording for projects WITH gate scripts, update those fixtures to expect the probed wording (`prerequisites verified`).
- [ ] Commit: `git add -A && git commit -m "feat(doctor): gate section runs the bounded GATE_PROBE=1 probe when gate seeds exist (D5)"`

---

### Task 18: adopt plan — ops-actions preview section joined into `plan_key` (§6.1 R2)

**Files:**
- Create: `src/project/adoption-ops-actions.ts`
- Create: `src/project/adoption-ops-actions.test.ts`
- Modify: the R1 adoption-plan builder + renderer (`src/project/adoption-plan*.ts`, located by grep)

**Interfaces:**
- Produces: `OpsActionRecord { action: 'install-component' | 'hooks-install' | 'sched-install' | 'bootstrap-merge-required', command, files, detail }`, `OpsProbes { schedUnitPaths? }`, `buildOpsActions(projectRoot, probes?): OpsActionRecord[]` (read-only, deterministic, stable-sorted), `renderOpsActionsSection(records): string[]`.
- Consumes: `AGENT_OPS_FILE_MAP` (`src/core/agent-ops/install.ts` — includes the Task 10 gate entries), `planHooks`/`readSettings` (Task 12), `readJournal` (`src/merge-queue/journal.ts`), `loadAgentOpsConfig`, `pickSchedBackend` (Task 6) + `buildPostMergePollerJob` (Task 5), and the R1 plan renderer's `plan_key` canonicalization (spec D1: sha256 over the canonical JSON of the complete apply-action records — from R2 onward that input includes the ops-action records, so no apply-relevant ops detail can change without changing the key).

**Steps:**

- [ ] Write the failing test `src/project/adoption-ops-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildOpsActions, renderOpsActionsSection } from './adoption-ops-actions.js'

function project(files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-actions-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return root
}

const QUEUE_YAML = 'project_name: p\nmerge_queue:\n  gate_executor: local-poller\n'

describe('buildOpsActions (§6.1 R2 preview)', () => {
  it('fresh repo: proposes git + staging installs and the hooks install — no queue actions', () => {
    const records = buildOpsActions(project())
    const keys = records.map(r => `${r.action}:${r.command}`)
    expect(keys).toContain('install-component:scaffold agent-ops install --component git')
    expect(keys).toContain('install-component:scaffold agent-ops install --component staging')
    expect(keys).toContain('hooks-install:scaffold hooks install')
    expect(keys.join('\n')).not.toMatch(/merge-queue|gate|sched|bootstrap/)
  })
  it('records carry EXACT file lists (spec: "with the exact file list")', () => {
    const records = buildOpsActions(project())
    const git = records.find(r => r.command.endsWith('--component git'))
    expect(git?.files.length).toBeGreaterThan(0)
    expect(git?.files).toContain('scripts/setup-agent-worktree.sh')
    expect(git?.files).toEqual([...(git?.files ?? [])].sort())
    const hooks = records.find(r => r.action === 'hooks-install')
    expect(hooks?.files).toEqual(['.claude/settings.json'])
    expect(hooks?.detail).toContain('gh pr create')
  })
  it('queue intent adds merge-queue + gate components, the sched install, and the bootstrap requirement', () => {
    const root = project({ '.scaffold/agent-ops.yaml': QUEUE_YAML })
    const records = buildOpsActions(root, {
      schedUnitPaths: () => ['/units/scaffold-p-merge-poller.timer'],
    })
    const keys = records.map(r => `${r.action}:${r.command}`)
    expect(keys).toContain('install-component:scaffold agent-ops install --component merge-queue')
    expect(keys).toContain('install-component:scaffold agent-ops install --component gate')
    expect(keys).toContain('sched-install:scaffold sched install post-merge-poller')
    const gate = records.find(r => r.command.endsWith('--component gate'))
    expect(gate?.files).toEqual(['scripts/gate-check-affected.sh', 'scripts/gate-check.sh'])
    const sched = records.find(r => r.action === 'sched-install')
    expect(sched?.files).toEqual(['/units/scaffold-p-merge-poller.timer'])
    const boot = records.find(r => r.action === 'bootstrap-merge-required')
    expect(boot?.command).toContain('scaffold mq bootstrap --pr')
    expect(boot?.files).toEqual(['.mq/journal.jsonl'])
  })
  it('gha-selfhosted queue intent proposes no sched install', () => {
    const root = project({
      '.scaffold/agent-ops.yaml': 'project_name: p\nmerge_queue:\n  gate_executor: gha-selfhosted\n',
    })
    const actions = buildOpsActions(root).map(r => r.action)
    expect(actions).not.toContain('sched-install')
    expect(actions).toContain('bootstrap-merge-required')
  })
  it('an already-armed queue omits the bootstrap requirement', () => {
    const root = project({
      '.scaffold/agent-ops.yaml': QUEUE_YAML,
      '.mq/journal.jsonl':
        '{"type":"bootstrap_armed","bootstrapId":"01A","pr":1,"gatedHeadSha":"S","at":"2026-07-19T00:00:00.000Z"}\n',
    })
    expect(buildOpsActions(root, { schedUnitPaths: () => [] }).map(r => r.action))
      .not.toContain('bootstrap-merge-required')
  })
  it('already-satisfied surfaces produce no records (component files present, hooks registered)', () => {
    const root = project()
    // Satisfy every git/staging dest and pre-register the only default-addable hook.
    const records = buildOpsActions(root)
    for (const r of records.filter(x => x.action === 'install-component')) {
      for (const f of r.files) {
        const p = path.join(root, f)
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, 'x\n')
      }
    }
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'grep gh pr create' }] }] },
    }))
    expect(buildOpsActions(root)).toEqual([])
  })
  it('is deterministic and stable-sorted (canonical plan_key input)', () => {
    const root = project({ '.scaffold/agent-ops.yaml': QUEUE_YAML })
    const probes = { schedUnitPaths: () => ['/u/t.timer'] }
    const a = buildOpsActions(root, probes)
    const b = buildOpsActions(root, probes)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const keys = a.map(r => `${r.action}:${r.command}`)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('renderOpsActionsSection', () => {
  it('renders every record with its command, detail, and file list', () => {
    const lines = renderOpsActionsSection([
      { action: 'hooks-install', command: 'scaffold hooks install', files: ['.claude/settings.json'], detail: 'registers: X' },
    ]).join('\n')
    expect(lines).toContain('## Ops actions')
    expect(lines).toContain('`scaffold hooks install`')
    expect(lines).toContain('.claude/settings.json')
    expect(lines).toContain('registers: X')
  })
  it('renders the empty state', () => {
    expect(renderOpsActionsSection([]).join('\n')).toContain('None — the ops surface is already installed')
  })
})
```

- [ ] Run: `npx vitest run src/project/adoption-ops-actions.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/project/adoption-ops-actions.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { AGENT_OPS_FILE_MAP, type AgentOpsComponent } from '../core/agent-ops/install.js'
import { loadAgentOpsConfig } from '../core/agent-ops/config.js'
import { planHooks, readSettings } from '../core/hooks/install.js'
import { buildPostMergePollerJob } from '../sched/jobs.js'
import { pickSchedBackend } from '../sched/platform.js'
import { readJournal } from '../merge-queue/journal.js'

/** One ops action the adopt plan previews (§6.1 R2). The canonical JSON of
 *  these records joins the plan_key input (D1), so any change to what apply
 *  would install — component, file list, command — forces re-approval. */
export interface OpsActionRecord {
  action: 'install-component' | 'hooks-install' | 'sched-install' | 'bootstrap-merge-required'
  command: string
  /** Exact files the action creates or edits (spec: "with the exact file list"). */
  files: string[]
  detail: string
}

export interface OpsProbes {
  /** Test seam: resolved scheduler unit paths for this machine. */
  schedUnitPaths?: (projectRoot: string) => string[]
}

function componentDests(component: AgentOpsComponent): string[] {
  return Object.values(AGENT_OPS_FILE_MAP)
    .filter(s => s.component === component)
    .map(s => s.dest)
    .sort()
}

/** Queue intent = the config declares merge_queue, or the guard is installed. */
function queueIntent(projectRoot: string): boolean {
  if (fs.existsSync(path.join(projectRoot, 'scripts', 'mq-guard.sh'))) return true
  const cfg = path.join(projectRoot, '.scaffold', 'agent-ops.yaml')
  if (!fs.existsSync(cfg)) return false
  try {
    const raw = yaml.load(fs.readFileSync(cfg, 'utf8'))
    return typeof raw === 'object' && raw !== null && 'merge_queue' in (raw as Record<string, unknown>)
  } catch {
    return false
  }
}

function defaultSchedUnitPaths(projectRoot: string): string[] {
  try {
    return pickSchedBackend().unitPaths(buildPostMergePollerJob(projectRoot))
  } catch {
    // Poller script not installed yet (or unsupported platform) — unit paths
    // resolve at install time; the record still previews the action itself.
    return []
  }
}

/** Read-only, deterministic preview of the R2 ops actions. NEVER writes. */
export function buildOpsActions(projectRoot: string, probes: OpsProbes = {}): OpsActionRecord[] {
  const records: OpsActionRecord[] = []
  const queue = queueIntent(projectRoot)

  const components: AgentOpsComponent[] = queue
    ? ['git', 'staging', 'merge-queue', 'gate']
    : ['git', 'staging']
  for (const component of components) {
    const missing = componentDests(component)
      .filter(dest => !fs.existsSync(path.join(projectRoot, dest)))
    if (missing.length === 0) continue
    records.push({
      action: 'install-component',
      command: `scaffold agent-ops install --component ${component}`,
      files: missing,
      detail: component === 'gate'
        ? 'generates the gate seeds (project-owned after generation; ingestion-lite classification shown at install)'
        : `${component} component files currently missing`,
    })
  }

  let hookAdds: string[] = []
  try {
    hookAdds = planHooks(projectRoot, readSettings(projectRoot))
      .items.filter(i => i.action === 'add')
      .map(i => i.spec.describe)
  } catch {
    hookAdds = [] // malformed settings.json — hooks install refuses; doctor reports it
  }
  if (hookAdds.length > 0) {
    records.push({
      action: 'hooks-install',
      command: 'scaffold hooks install',
      files: ['.claude/settings.json'],
      detail: `registers: ${hookAdds.join('; ')}`,
    })
  }

  if (queue && loadAgentOpsConfig(projectRoot).merge_queue.gate_executor === 'local-poller') {
    records.push({
      action: 'sched-install',
      command: 'scaffold sched install post-merge-poller',
      files: (probes.schedUnitPaths ?? defaultSchedUnitPaths)(projectRoot),
      detail: 'post-merge full-suite poller (600s default; launchd/systemd; the installer verifies the job actually loaded)',
    })
  }

  if (queue) {
    const armed = readJournal(path.join(projectRoot, '.mq'))
      .some(e => e.type === 'bootstrap_armed' || (e.type === 'pr_state' && e.state === 'LANDED'))
    if (!armed) {
      records.push({
        action: 'bootstrap-merge-required',
        command: 'scaffold mq bootstrap --pr <first-queue-PR>',
        files: ['.mq/journal.jsonl'],
        detail: 'the PR that installs the queue cannot ride it — bootstrap runs the arm-first guided first merge (full gate on the PR head, hooks/sched armed, journaled squash-merge with head revalidation, daemon smoke + doctor)',
      })
    }
  }

  records.sort((a, b) => `${a.action}:${a.command}`.localeCompare(`${b.action}:${b.command}`))
  return records
}

/** Markdown/human rendering of the preview section (appended to the plan). */
export function renderOpsActionsSection(records: OpsActionRecord[]): string[] {
  const lines: string[] = ['## Ops actions (executed only on --apply approval)']
  if (records.length === 0) {
    lines.push('', 'None — the ops surface is already installed.')
    return lines
  }
  for (const r of records) {
    lines.push('', `- **${r.action}** — \`${r.command}\``, `  ${r.detail}`)
    for (const f of r.files) lines.push(`  - ${f}`)
  }
  return lines
}
```

- [ ] Run: `npx vitest run src/project/adoption-ops-actions.test.ts` — expect 9 tests passed.
- [ ] Join the records into the R1 plan + `plan_key`. Locate the builder: `grep -rln "plan_key" src/project --include="*.ts" | grep -v test` (R1 architecture places it at `src/project/adoption-plan*.ts`). Apply three edits at the located sites:
  1. **Key input:** in the object whose canonical JSON is hashed into `plan_key` (D1's "complete apply-action records" — R1 hashes `{initialize, includes, steps, disabled}`-shaped records), add the field `ops_actions: buildOpsActions(projectRoot)` (computed once per render and reused for rendering, never recomputed between keying and rendering). Import: `import { buildOpsActions, renderOpsActionsSection } from './adoption-ops-actions.js'` (adjust relative path).
  2. **JSON output:** include the same `ops_actions` array verbatim in the plan's JSON payload.
  3. **Human/markdown output:** append `renderOpsActionsSection(opsActions)` lines after the disposition section (before the follow-up-commands footer).
- [ ] Append the key-sensitivity test to the R1 plan-key test file (locate: `grep -rln "plan_key" src/project --include="*.test.ts"`), using that file's existing plan-render helper (the one its other plan_key tests already call) against a tmp project:

```ts
  it('plan_key changes when an ops-action record changes (R2 §6.1)', () => {
    // Render once on a bare tmp project, then install a file that removes an
    // ops action (e.g. create scripts/setup-agent-worktree.sh so the git
    // component's missing-file list shrinks) and render again: the two keys
    // MUST differ, because ops-action records are part of the keyed records.
    // Prose/whitespace edits to the written markdown must NOT change the key
    // (covered by R1's existing tests, which still pass unchanged).
  })
```

  Implement the body with the file's own helper + fixture idioms (the comment above is the specification of the assertion; the two renders and `expect(keyA).not.toBe(keyB)` are the required outcome).
- [ ] Run: `npx vitest run src/project` — R1 plan tests + the new ones all green.
- [ ] Commit: `git add -A && git commit -m "feat(adopt): ops-actions preview section — records join plan_key (§6.1 R2)"`

---

### Task 19: content updates — jq snippets → `scaffold hooks install`, cron prose → `scaffold sched`, bootstrap pointer (+ bats)

**Files:**
- Modify: `content/pipeline/environment/git-workflow.md`
- Modify: `content/pipeline/environment/merge-throughput.md`
- Modify: `content/pipeline/foundation/tdd.md`
- Modify: `tests/beads-pipeline-content.bats`
- Modify: `tests/merge-throughput-content.bats`

**Interfaces:**
- Produces: the steps now instruct `scaffold hooks install` / `scaffold sched install post-merge-poller` / `scaffold mq bootstrap` / `scaffold agent-ops install --component gate` in place of the hand-run jq snippets and cron/launchd prose (spec §7, D8, D6, D9, D7); the merge-throughput/tdd prompts direct the agent to confirm the gate-seed classification with the user (D7's "prompted classification" — the CLI half was resolved non-interactive in Task 11's note, the prompt half lands here); Mode Detection / Update Mode blocks updated accordingly; bats assertions updated in the same task.
- Consumes: the shipped commands (Tasks 6, 13, 15). Existing test contracts that MUST keep passing: `tests/beads-pipeline-content.bats` ("git-workflow registers bd-guard as a PreToolUse hook") greps git-workflow.md for `bd-guard\.sh` and `PreToolUse`; `tests/merge-throughput-content.bats` greps merge-throughput.md for `gate_executor`, `setup-gh-runner`, the Mode Detection blocks, and git-workflow.md for `mq enqueue` / `mq-guard` — every replacement below preserves those strings.

**Steps:**

- [ ] `git-workflow.md` — replace instructions 3 and 4 (the two jq snippets, currently lines 213–251). Edit old string:

````markdown
3. **Register the Beads destructive-command guard** (only when the project
   uses Beads — skip entirely when `.beads/` is absent). `scripts/bd-guard.sh`
   (installed by the git component above) is a Claude Code PreToolUse hook
   that refuses `bd bootstrap`, destructive `bd init`, and `.beads` deletion
   while a populated database exists. Merge it into `.claude/settings.json` —
   never overwrite the file; `bd setup claude` hooks and the PR-review
   reminder hook also own entries there:
   ```bash
   if [ -d .beads ] && [ -x scripts/bd-guard.sh ]; then
     mkdir -p .claude
     [ -f .claude/settings.json ] || printf '{}\n' > .claude/settings.json
     if ! grep -q 'bd-guard.sh' .claude/settings.json; then
       tmp=$(mktemp)
       jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/bd-guard.sh"}]}])' \
         .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
     fi
   fi
   ```
   Codex, Cursor, and other harnesses have no PreToolUse hook: for them the
   guard is available as `scripts/bd-guard.sh --check "<command>"`, and the
   AGENTS.md Beads rules (see claude-md-optimization) carry the prose rule.

4. **Register the merge-queue guard** (only when the merge-queue component is
   installed — skip when `scripts/mq-guard.sh` is absent). Same merge
   discipline as bd-guard — never overwrite `.claude/settings.json`:
   ```bash
   if [ -x scripts/mq-guard.sh ]; then
     mkdir -p .claude
     [ -f .claude/settings.json ] || printf '{}\n' > .claude/settings.json
     if ! grep -q 'mq-guard.sh' .claude/settings.json; then
       tmp=$(mktemp)
       jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/mq-guard.sh"}]}])' \
         .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
     fi
   fi
   ```
   Other harnesses use `scripts/mq-guard.sh --check "<command>"`; the AGENTS.md
   operations core (claude-md-optimization) carries the prose rule ("enqueue,
   never `gh pr merge`").
````

  new string:

````markdown
3. **Register the agent hooks natively** — run the hook installer instead of
   hand-editing `.claude/settings.json`:
   ```bash
   scaffold hooks install
   ```
   One idempotent TypeScript deep-merge (atomic write, no jq dependency)
   registers every hook whose prerequisite exists, and prints an explicit
   report line for each one it skips:
   - SessionStart `bd prime --hook-json` — only when `.beads/` exists
   - PreToolUse `scripts/bd-guard.sh` (matcher `Bash`) — the Beads
     destructive-command guard that refuses `bd bootstrap`, destructive
     `bd init`, and `.beads` deletion while a populated database exists;
     only when `.beads/` exists AND the git component above installed the
     script
   - PreToolUse `scripts/mq-guard.sh` (matcher `Bash`) — the merge-queue
     routing guard; only when the merge-queue component is installed
   - PostToolUse `gh pr create` review reminder (see "Configure the
     PostToolUse review-reminder hook" below — the installer registers it
     and skips when an equivalent reminder is already present)
   It never overwrites the file and never drops existing entries
   (`bd setup claude` hooks and user hooks survive), so re-running is always
   safe. A missing prerequisite prints a report line instead of silently
   no-opping — install the prerequisite, then re-run `scaffold hooks
   install`.

4. **Wire the guards into non-Claude harnesses.** Codex, Cursor, and other
   AGENTS.md-based harnesses have no hook-registration surface: for them the
   guards run as pre-flight checks — `scripts/bd-guard.sh --check
   "<command>"` and `scripts/mq-guard.sh --check "<command>"` — and the
   AGENTS.md rules (see claude-md-optimization) carry the prose rules (the
   Beads durability rules; "enqueue, never `gh pr merge`").
   `scaffold hooks install` prints this wiring guidance too.
````

- [ ] `git-workflow.md` — update the PostToolUse section intro (keep the heading and the JSON block byte-for-byte; `automated-pr-review` cross-references both). Edit old string:

```markdown
### Configure the PostToolUse review-reminder hook
Merge (never overwrite) the following into the target project's
`.claude/settings.json`. If the file doesn't exist, create it with just
this content. If it exists, deep-merge into the `hooks.PostToolUse` array —
append this hook object only if an equivalent `gh pr create` reminder isn't
already present (e.g. from the `automated-pr-review` step); never replace
or drop unrelated existing hooks.
```

  new string:

```markdown
### Configure the PostToolUse review-reminder hook
`scaffold hooks install` (instruction 3 above) registers this hook: it
deep-merges into the `hooks.PostToolUse` array of the target project's
`.claude/settings.json`, creates the file when missing, appends the hook
object only if an equivalent `gh pr create` reminder isn't already present
(e.g. from the `automated-pr-review` step), and never replaces or drops
unrelated existing hooks. The registered hook, for reference (equivalence
is detected on the `gh pr create` trigger string):
```

- [ ] `git-workflow.md` — Expected Outputs. Edit old string:

```markdown
- .claude/settings.json — gains a PostToolUse reminder hook that fires after
  `gh pr create`, and, when the project uses Beads, a PreToolUse `bd-guard.sh`
  entry (merged, never overwritten); when the merge-queue component is
  installed, a PreToolUse `mq-guard.sh` entry as well (same merge discipline)
```

  new string:

```markdown
- .claude/settings.json — gains a PostToolUse reminder hook that fires after
  `gh pr create`, and, when the project uses Beads, a PreToolUse `bd-guard.sh`
  entry (merged, never overwritten); when the merge-queue component is
  installed, a PreToolUse `mq-guard.sh` entry as well (same merge discipline)
  — all registered via `scaffold hooks install`, never hand-merged
```

- [ ] `git-workflow.md` — scheduler mention in the quality-gates section. Edit old string:

```markdown
   local poller (`make post-merge-watch`, cron/launchd) when
```

  new string:

```markdown
   local poller (`make post-merge-watch`, scheduled by `scaffold sched
   install post-merge-poller`) when
```

- [ ] `git-workflow.md` — Mode Detection block. Edit old string:

```markdown
Update mode if docs/git-workflow.md exists. In update mode: preserve the
project's branch-naming and commit-format conventions, preserve worktree
directory naming, and keep any local customizations to the agent-ops
scripts intact — the installer already refuses to overwrite locally
modified files without `--force`; never pass `--force` in generation mode.
```

  new string:

```markdown
Update mode if docs/git-workflow.md exists. In update mode: preserve the
project's branch-naming and commit-format conventions, preserve worktree
directory naming, and keep any local customizations to the agent-ops
scripts intact — the installer already refuses to overwrite locally
modified files without `--force`; never pass `--force` in generation mode.
Re-run `scaffold hooks install` in update mode too — it is idempotent and
repairs missing hook registrations without touching user entries.
```

- [ ] `git-workflow.md` — Update Mode Specifics triggers. Edit old string:

```markdown
- **Triggers for update**: coding-standards.md changed commit format,
  Beads status changed (added or removed), new worktree patterns needed
  for parallel execution, `scaffold agent-ops check` reports a stale
  bundle version
```

  new string:

```markdown
- **Triggers for update**: coding-standards.md changed commit format,
  Beads status changed (added or removed), new worktree patterns needed
  for parallel execution, `scaffold agent-ops check` reports a stale
  bundle version, hook registrations missing from `.claude/settings.json`
  (repair: `scaffold hooks install`)
```

- [ ] `merge-throughput.md` — Expected Outputs. Edit old string:

```markdown
- docs/merge-queue.md — how the queue works (enqueue → batch → land/eject),
  ejection recovery, the pause-on-red runbook (fix forward vs revert decision
  tree), flake quarantine policy, calibration via `scaffold mq stats`, and the
  deliberate-direct-merge procedure (`MQ_DIRECT_MERGE_OK=1`, human-only)
```

  new string:

```markdown
- docs/merge-queue.md — how the queue works (enqueue → batch → land/eject),
  ejection recovery, the pause-on-red runbook (fix forward vs revert decision
  tree), flake quarantine policy, calibration via `scaffold mq stats`, the
  first-merge bootstrap (`scaffold mq bootstrap --pr <N>` — the PR that
  installs the queue), and the deliberate-direct-merge procedure
  (`MQ_DIRECT_MERGE_OK=1`, human-only)
```

  and Edit old string:

```markdown
- Registered mq-guard hook (via the git-workflow step's instruction 4)
```

  new string:

```markdown
- Registered mq-guard hook (via `scaffold hooks install` — git-workflow
  instruction 3)
```

- [ ] `merge-throughput.md` — quality criterion. Edit old string:

```markdown
  `local-poller` (poller scheduled via cron/launchd, no workflows)
```

  new string:

```markdown
  `local-poller` (poller scheduled via `scaffold sched install
  post-merge-poller`, verified loaded, no workflows)
```

- [ ] `merge-throughput.md` — Mode Detection block. Edit old string:

```markdown
Update mode if docs/merge-queue.md exists. In update mode: re-run
`scaffold agent-ops install --component merge-queue` (and `ci` per
gate_executor) to refresh stale bundle files (`scaffold agent-ops check`
reports drift), preserve the project's tuned `merge_queue:` config values, and
re-generate only runbook sections whose upstream contracts changed.
```

  new string:

```markdown
Update mode if docs/merge-queue.md exists. In update mode: re-run
`scaffold agent-ops install --component merge-queue` (and `ci` per
gate_executor) to refresh stale bundle files (`scaffold agent-ops check`
reports drift), re-run `scaffold hooks install` (idempotent) to repair hook
registrations, for `local-poller` confirm the scheduler job is still loaded
(`scaffold sched status post-merge-poller`; reinstall with `scaffold sched
install post-merge-poller` when it is not), preserve the project's tuned
`merge_queue:` config values, and re-generate only runbook sections whose
upstream contracts changed.
```

- [ ] `merge-throughput.md` — Update Mode Specifics triggers. Edit old string:

```markdown
- **Triggers for update**: `scaffold agent-ops check` reports a stale bundle,
  gate commands renamed in dev-env-setup, gate_executor switched
```

  new string:

```markdown
- **Triggers for update**: `scaffold agent-ops check` reports a stale bundle,
  gate commands renamed in dev-env-setup, gate_executor switched,
  `scaffold sched status post-merge-poller` reports not-loaded, hook
  registrations missing from `.claude/settings.json`
```

- [ ] `merge-throughput.md` — §2 component installs gain the gate seed + classification confirmation (D7). Edit old string:

````markdown
```bash
scaffold agent-ops install --component merge-queue
# unless gate_executor is local-poller:
scaffold agent-ops install --component ci
scaffold agent-ops check
```
````

  new string:

````markdown
```bash
scaffold agent-ops install --component merge-queue
# when make check / make check-affected do not exist yet — generates the
# gate seeds from ingestion-lite (package.json scripts + CI workflows):
scaffold agent-ops install --component gate
# unless gate_executor is local-poller:
scaffold agent-ops install --component ci
scaffold agent-ops check
```
The gate install prints its ingestion-lite classification (gate commands vs
environment-sensitive suites excluded to `make check-visual`) — CONFIRM that
classification with the user before committing the generated seeds. The seeds
are project-owned after generation (`agent-ops check` reports them only if
missing; `--force` regenerates from a fresh ingestion).
````

- [ ] `content/pipeline/foundation/tdd.md` — the two-gate criterion points at the gate seed with the same confirmation. Edit old string:

```markdown
- (mvp) Two-gate contract defined: `make check-affected` (fast, selection-based —
  the merge gate; falls back to full `make check` when it cannot classify a
  change) and `make check` (full, authoritative — post-merge and nightly, always
  uncached). Force-full-run triggers listed explicitly (lockfiles, tool config,
  shared test utils, global setup, env files, migrations)
```

  new string:

```markdown
- (mvp) Two-gate contract defined: `make check-affected` (fast, selection-based —
  the merge gate; falls back to full `make check` when it cannot classify a
  change) and `make check` (full, authoritative — post-merge and nightly, always
  uncached). Force-full-run triggers listed explicitly (lockfiles, tool config,
  shared test utils, global setup, env files, migrations). When the targets do
  not exist yet, seed them: `scaffold agent-ops install --component gate`
  generates `scripts/gate-check.sh` + `scripts/gate-check-affected.sh`
  satisfying this contract — CONFIRM its printed classification (gate commands
  vs environment-sensitive suites excluded to `make check-visual`) with the
  user before committing the seeds
```

- [ ] `merge-throughput.md` — §2 hook registration pointer. Edit old string:

```markdown
Then register the mq-guard hook per the git-workflow step's instruction 4.
```

  new string:

```markdown
Then register the mq-guard hook: run `scaffold hooks install` (idempotent;
skips hooks whose prerequisites are missing and reports why).
```

- [ ] `merge-throughput.md` — §3 local-poller scheduling prose. Edit old string:

```markdown
- `local-poller`: schedule `make post-merge-watch` every ~10 minutes via
  cron/launchd and document the schedule in docs/dev-setup.md.
```

  new string:

````markdown
- `local-poller`: install the scheduler job (launchd on macOS, systemd user
  timer on Linux; 600s default interval — `--interval <seconds>` to change;
  the installer verifies the job actually LOADED, because file presence
  proves nothing):
  ```bash
  scaffold sched install post-merge-poller
  scaffold sched status post-merge-poller
  ```
  Document it in docs/dev-setup.md: `scaffold sched status
  post-merge-poller` is the health check, and `scaffold doctor` reads the
  same heartbeat.
````

- [ ] `merge-throughput.md` — §4 runbook contents. Edit old string:

```markdown
bead, fix-SLA), calibration (`scaffold mq stats`), and the deliberate
direct-merge procedure (human-only). Close with a short **Alternatives**
```

  new string:

```markdown
bead, fix-SLA), calibration (`scaffold mq stats`), the first-merge bootstrap
(the queue-installing PR cannot ride the queue — `scaffold mq bootstrap --pr
<N>` runs the arm-first guided first merge, journals it, and the mq-guard
block message points at it), and the deliberate
direct-merge procedure (human-only). Close with a short **Alternatives**
```

- [ ] Update `tests/beads-pipeline-content.bats` — extend the existing registration assertion. Edit old string:

```bash
@test "git-workflow registers bd-guard as a PreToolUse hook (merge, never overwrite)" {
  G="$BATS_TEST_DIRNAME/../content/pipeline/environment/git-workflow.md"
  run grep -qE "bd-guard\.sh" "$G"; [ "$status" -eq 0 ]
  run grep -qE "PreToolUse" "$G"; [ "$status" -eq 0 ]
}
```

  new string:

```bash
@test "git-workflow registers bd-guard as a PreToolUse hook (merge, never overwrite)" {
  G="$BATS_TEST_DIRNAME/../content/pipeline/environment/git-workflow.md"
  run grep -qE "bd-guard\.sh" "$G"; [ "$status" -eq 0 ]
  run grep -qE "PreToolUse" "$G"; [ "$status" -eq 0 ]
  run grep -qE "scaffold hooks install" "$G"; [ "$status" -eq 0 ]
}
```

- [ ] Append the R2 content tests to `tests/merge-throughput-content.bats`:

```bash
# --- Brownfield R2: ops last mile (D6/D7/D8/D9 content) ---
@test "merge-throughput schedules the local poller via scaffold sched (no cron prose)" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  grep -q 'scaffold sched install post-merge-poller' "$F"
  grep -q 'scaffold sched status post-merge-poller' "$F"
  grep -q 'scaffold hooks install' "$F"
  grep -q 'mq bootstrap' "$F"
  ! grep -q 'cron/launchd' "$F"
}

@test "merge-throughput and tdd seed the gate component with a confirmed classification" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  T="$ROOT/content/pipeline/foundation/tdd.md"
  grep -q 'agent-ops install --component gate' "$F"
  grep -q 'CONFIRM' "$F"
  grep -q 'agent-ops install --component gate' "$T"
  grep -q 'check-visual' "$T"
}

@test "git-workflow registers hooks via scaffold hooks install (no jq registration snippets)" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  grep -q 'scaffold hooks install' "$F"
  ! grep -q "jq '.hooks.PreToolUse" "$F"
  ! grep -q 'cron/launchd' "$F"
}
```

  (The PostToolUse reference JSON keeps its `jq -r '.tool_input...'` runtime command — that is the hook's own body, not a registration snippet; the assertion above targets only the retired registration jq.)

- [ ] Run: `bats tests/beads-pipeline-content.bats tests/merge-throughput-content.bats` — all `ok` (pre-existing + 3 new; the pre-existing "tdd step defines the two-gate contract" test keeps passing — its four grep targets all survive the tdd.md edit).
- [ ] Run: `make validate` — frontmatter untouched, expect clean. Then sweep for stragglers: `grep -rn "cron/launchd\|instruction 4" content/pipeline content/knowledge content/agent-skills` — expect NO hits in `git-workflow.md`/`merge-throughput.md` (hits elsewhere, if any, are out of this task's scope only when they do not instruct manual hook/scheduler setup; anything still instructing the retired manual flow gets the same one-line replacement).
- [ ] Commit: `git add -A && git commit -m "docs(content): git-workflow + merge-throughput point at scaffold hooks/sched/mq bootstrap (spec §7)"`

---

### Task 20: full-suite verification — `make check-all` green

**Files:**
- No new files (fix-ups only, if any gate fails).

**Interfaces:**
- Consumes: everything shipped in Tasks 1–19.

**Steps:**

- [ ] Run: `npx vitest run src` — the FULL TypeScript suite green (sched, hooks, gate-ingest, agent-ops, merge-queue incl. bootstrap, doctor incl. fixes + gate-probe, project incl. ops-actions, plus all pre-existing suites).
- [ ] Run: `npx tsc --noEmit -p tsconfig.json` — clean.
- [ ] Run: `make check-all` — every gate green (ShellCheck, frontmatter validation, the bats suite incl. the new gate/guard/content tests, evals, TypeScript). Expected tail: each sub-gate reporting success and exit code 0.
- [ ] If any gate fails, fix the root cause and re-run `make check-all` until green — specifically watch for: (a) ShellCheck on the two gate templates (they are `.tmpl` and excluded from the sweep, but the bats-rendered copies must be clean); (b) eval-suite content checks over the edited steps (`tests/evals/` — block-placement and cross-reference lenses must still pass on git-workflow/merge-throughput); (c) any pre-existing test that pinned the mq action list or the `AgentOpsInstallResult` shape (Tasks 10, 11, 15 already include their known fix-ups).
- [ ] Verify the working tree is fully committed: `git status --short` — empty output (every task committed as it landed).
- [ ] Commit (only if fix-ups were needed): `git add -A && git commit -m "test: R2 full-suite fix-ups — make check-all green"`

---

## Spec coverage checklist (R2 / Tier C — verify before calling the plan complete)

| Spec item | Where |
|---|---|
| D6 `scaffold sched` (launchd gui-domain, bootout‖bootstrap + `launchctl print` verify, systemd user timer + linger + is-active, absolute paths/fnm/openjdk PATH, `.mq/logs/`, rumble golden fixture, install/uninstall/status/list) | Tasks 1–6 |
| D7 gate component (seeds satisfying the mq contract: three-dot diff vs `MQ_AFFECTED_BASE`, force-full infra globs, quarantine exclusion, empty-diff⇒full, `.mq-failed-tests.txt` note; `GATE_PROBE=1`; ingestion-lite from package.json + workflows; `seed:true` manifest semantics; thin Makefile targets; opt-in, excluded from `all`; prompted classification = CLI report (Task 11) + user-confirmation content in merge-throughput/tdd (Task 19)) | Tasks 7–11, 19 |
| D8 `scaffold hooks install` (TS deep-merge, idempotent, atomic, no jq; SessionStart bd prime / PreToolUse bd-guard + mq-guard / PostToolUse reminder; prerequisite report lines; `--check` guidance for AGENTS.md harnesses; Claude-Code-only scope; vitest merge-semantics coverage vs the git-workflow.md:213-251 jq semantics) | Tasks 12–13 (+19 content) |
| D9 `scaffold mq bootstrap` (arm-first ordering; `bootstrap_intent`/`bootstrap_merged`/`bootstrap_armed` each with bootstrapId + PR + gated SHA, merged adds merge-commit SHA; head revalidation immediately pre-merge; GitHub-authoritative crash-window reconciliation; `--finish`; per-id state machine, aborted = terminal; mq-guard message pointing at `mq bootstrap`) | Tasks 14–15 (+19 content) |
| D5 R2 `--fix` handlers (hook-reregistration + scheduler-reload as thin D8/D6 wrappers registered into the R1 `{section, run(), severity, remediation, fix?()}` registry) | Task 16 |
| D5 gate section GATE_PROBE upgrade (resolve-only → bounded probe when gate seeds exist; full gate stays behind `--deep`) | Task 17 |
| §6.1 R2 ops-actions preview (components/hooks/scheduler/bootstrap-merge with exact file lists; canonical records join `plan_key`) | Task 18 |
| §7 content updates (git-workflow jq → hooks install; merge-throughput cron → sched install; gate seeding + classification confirmation in merge-throughput/tdd; Mode Detection/Update Mode blocks; bats assertions updated in the same task) | Task 19 |
| Full gates green | Task 20 |
