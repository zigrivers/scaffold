import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  beadsBinaryCheck, beadsLiveCheck, beadsBackupCheck, beadsGuardCheck, hooksRegisteredCheck,
  gateTargetsCheck, queueDaemonCheck, queuePausedCheck, pipelineVerificationCheck, schedulerCheck,
} from './checks.js'
import { makeRunCmd, makeRunArgv } from './run.js'
import type { DoctorContext } from './types.js'

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'))
}

function ctxFor(root: string): DoctorContext {
  return { projectRoot: root, runCmd: makeRunCmd(root), runArgv: makeRunArgv(root) }
}

// --- hermetic PATH-shim helpers (new tests below) --------------------------
// Every temp dir created through these helpers is tracked and removed in
// afterEach so no fake `bd`/`jq`/hook script ever lingers on disk.
const trackedTmpDirs: string[] = []

afterEach(() => {
  for (const d of trackedTmpDirs) fs.rmSync(d, { recursive: true, force: true })
  trackedTmpDirs.length = 0
})

function newTmpRoot(): string {
  const d = tmpRoot()
  trackedTmpDirs.push(d)
  return d
}

function newBinDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-bin-'))
  trackedTmpDirs.push(d)
  return d
}

/** bd command shim: dispatches on the exact joined argv (`$*`), falls through to exit 0. */
function writeBdShim(bin: string, rules: Array<{ args: string; exit?: number; echo?: string; touch?: string }>): void {
  const lines = rules.map((r) => {
    const parts: string[] = []
    if (r.echo !== undefined) parts.push(`echo "${r.echo}"`)
    if (r.touch !== undefined) parts.push(`touch "${r.touch}"`)
    parts.push(`exit ${r.exit ?? 0}`)
    return `if [ "$*" = "${r.args}" ]; then ${parts.join('; ')}; fi`
  })
  fs.writeFileSync(path.join(bin, 'bd'), `${['#!/usr/bin/env bash', ...lines, 'exit 0'].join('\n')}\n`, { mode: 0o755 })
}

function writeNoopShim(bin: string, name: string): void {
  fs.writeFileSync(path.join(bin, name), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
}

/** Prepends `bin` to the real PATH — used when a check also needs other real binaries. */
function ctxWithBin(root: string, bin: string): DoctorContext {
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }
  return { projectRoot: root, runCmd: makeRunCmd(root, env), runArgv: makeRunArgv(root, env) }
}

/** PATH = bin ONLY (no fallback to the real PATH) — for tests that must prove a binary is absent
 *  or present regardless of what happens to be installed on the host machine. */
function ctxWithOnlyBin(root: string, bin: string): DoctorContext {
  const env = { ...process.env, PATH: bin }
  return { projectRoot: root, runCmd: makeRunCmd(root, env), runArgv: makeRunArgv(root, env) }
}

describe('doctor checks — not configured means skipped, never failed (D5)', () => {
  it('beads, hooks, gate, and queue checks skip on an empty project', () => {
    const ctx = ctxFor(tmpRoot())
    expect(beadsBinaryCheck.run(ctx).status).toBe('skip')
    expect(hooksRegisteredCheck.run(ctx).status).toBe('skip')
    expect(gateTargetsCheck.run(ctx).status).toBe('skip')
    expect(queueDaemonCheck.run(ctx).status).toBe('skip')
    expect(queuePausedCheck.run(ctx).status).toBe('skip')
    expect(pipelineVerificationCheck.run(ctx).status).toBe('skip')
  })
})

describe('queue/paused', () => {
  it('warns with the recorded reason when .mq/PAUSED exists', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.mq'))
    fs.writeFileSync(path.join(root, '.mq', 'PAUSED'), 'gate red on batch 7\n')
    const result = queuePausedCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('gate red on batch 7')
    expect(result.remediation).toContain('rm .mq/PAUSED')
  })
})

describe('gate/targets — resolve-only in R1 (G2)', () => {
  it('reports resolve-only wording and never claims execution', () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, 'Makefile'), 'check:\n\t@true\ncheck-affected:\n\t@true\n')
    const result = gateTargetsCheck.run(ctxFor(root))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('NOT executed')
  })

  it('warns when the targets do not resolve', () => {
    const root = tmpRoot()
    fs.writeFileSync(path.join(root, 'Makefile'), 'lint:\n\t@true\n')
    const result = gateTargetsCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('check')
  })
})

describe('beads/binary with a PATH shim', () => {
  it('warns below the 1.1.0 floor and passes at it', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-bin-'))
    const shim = path.join(bin, 'bd')
    fs.writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.0.9"\n', { mode: 0o755 })
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }
    const ctx: DoctorContext = { projectRoot: root, runCmd: makeRunCmd(root, env), runArgv: makeRunArgv(root, env) }
    expect(beadsBinaryCheck.run(ctx).status).toBe('warn')
    fs.writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.1.0"\n', { mode: 0o755 })
    expect(beadsBinaryCheck.run(ctx).status).toBe('ok')
  })

  it('errors when .beads/ exists but bd --version fails', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [{ args: '--version', exit: 1 }])
    const result = beadsBinaryCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('.beads/ exists but bd is not on PATH')
  })
})

describe('beads/live', () => {
  it('ok when bd info answers from the project database', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [{ args: 'info', exit: 0 }])
    const result = beadsLiveCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('bd info answers')
  })

  it('errors when bd info fails against an existing .beads/', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [{ args: 'info', exit: 1 }])
    const result = beadsLiveCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('bd info failed')
    expect(result.remediation).toContain('bd doctor --fix')
  })

  it('fix() probes bd doctor --help then delegates to bd doctor --fix', () => {
    const root = newTmpRoot()
    const bin = newBinDir()
    const marker = path.join(bin, 'fix-invoked')
    writeBdShim(bin, [
      { args: 'doctor --help', exit: 0 },
      { args: 'doctor --fix', exit: 0, touch: marker },
    ])
    const outcome = beadsLiveCheck.fix!(ctxWithBin(root, bin))
    expect(outcome.applied).toBe(true)
    expect(outcome.detail).toContain('bd doctor --fix completed')
    expect(fs.existsSync(marker)).toBe(true)
  })

  it('fix() degrades without invoking --fix when bd doctor is unsupported', () => {
    const root = newTmpRoot()
    const bin = newBinDir()
    const marker = path.join(bin, 'fix-invoked')
    writeBdShim(bin, [
      { args: 'doctor --help', exit: 1 },
      { args: 'doctor --fix', exit: 0, touch: marker },
    ])
    const outcome = beadsLiveCheck.fix!(ctxWithBin(root, bin))
    expect(outcome.applied).toBe(false)
    expect(outcome.detail).toContain('unsupported')
    expect(fs.existsSync(marker)).toBe(false)
  })
})

describe('beads/backup', () => {
  it('skips when .beads/ is absent', () => {
    const result = beadsBackupCheck.run(ctxFor(newTmpRoot()))
    expect(result.status).toBe('skip')
    expect(result.detail).toContain('not configured')
  })

  it('skips when bd is not on PATH', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const result = beadsBackupCheck.run(ctxWithOnlyBin(root, newBinDir()))
    expect(result.status).toBe('skip')
    expect(result.detail).toContain('bd not on PATH')
  })

  it('warns (not errors) when bd backup is unsupported by the installed bd', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [
      { args: '--version', echo: 'bd version 1.2.0', exit: 0 },
      { args: 'backup --help', exit: 1 },
    ])
    const result = beadsBackupCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('bd backup unsupported by installed bd')
    expect(result.detail).toContain('1.2.0')
  })

  it('warns when bd backup status --json fails', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [
      { args: 'backup --help', exit: 0 },
      { args: 'backup status --json', exit: 1 },
    ])
    const result = beadsBackupCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('backup may not be configured')
    expect(result.remediation).toContain('bd backup enable')
  })

  it('ok when bd backup status --json answers', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const bin = newBinDir()
    writeBdShim(bin, [
      { args: 'backup --help', exit: 0 },
      { args: 'backup status --json', exit: 0 },
    ])
    const result = beadsBackupCheck.run(ctxWithBin(root, bin))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('bd backup status answers')
  })
})

describe('beads/guard', () => {
  it('warns when installed but not registered in .claude/settings.json', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
    const result = beadsGuardCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('not registered')
  })

  it('warns when scripts/bd-guard.sh is not installed', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    const result = beadsGuardCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('not installed')
    expect(result.remediation).toContain('scaffold agent-ops install --component git')
  })

  it('warns when scripts/bd-guard.sh is not executable', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o644 })
    const result = beadsGuardCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('not executable')
  })

  function registeredGuardRoot(): string {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.beads'))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] }] },
    }))
    return root
  }

  it('fails open with a warning when jq is not on PATH', () => {
    const root = registeredGuardRoot()
    const result = beadsGuardCheck.run(ctxWithOnlyBin(root, newBinDir()))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('jq not found')
    expect(result.detail).toContain('fails open')
    expect(result.remediation).toContain('brew install jq')
  })

  it('ok when installed, registered, executable, and jq is present', () => {
    const root = registeredGuardRoot()
    const bin = newBinDir()
    writeNoopShim(bin, 'jq')
    const result = beadsGuardCheck.run(ctxWithOnlyBin(root, bin))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('armed')
  })
})

describe('hooks/registered', () => {
  it('errors when a registered hook script is missing on disk', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] }] },
    }))
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('scripts/bd-guard.sh')
  })

  it('errors when .claude/settings.json is not valid JSON', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not valid json')
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('not valid JSON')
  })

  it('skips (does not throw) when settings.json is valid JSON but null', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), 'null')
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('skip')
    expect(result.detail).toContain('no hooks')
  })

  it('warns when a registered hook script exists but is not executable', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] }] },
    }))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o644 })
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('not executable')
    expect(result.remediation).toContain('chmod +x')
  })

  it('skips when settings.json has hooks but none reference a scripts/*.sh file', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] },
    }))
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('skip')
    expect(result.detail).toContain('no script hooks registered')
  })

  it('ok when the registered hook script exists and is executable', () => {
    const root = newTmpRoot()
    fs.mkdirSync(path.join(root, '.claude'))
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/bd-guard.sh' }] }] },
    }))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.writeFileSync(path.join(root, 'scripts', 'bd-guard.sh'), '#!/bin/bash\n', { mode: 0o755 })
    const result = hooksRegisteredCheck.run(ctxFor(root))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('1 registered hook script(s) present and executable')
  })
})

describe('pipeline/verification', () => {
  it('errors when a completed step fails live verification (the beads case)', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.scaffold'))
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: deep\nplatforms: [claude-code]\n')
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'x')
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'deep', config_methodology: 'deep', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: {
        beads: {
          status: 'completed', source: 'pipeline', produces: ['.beads/', 'CLAUDE.md'], verification: 'declared',
        },
      },
      next_eligible: [], 'extra-steps': [],
    }))
    const result = pipelineVerificationCheck.run(ctxFor(root))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('beads')
  })

  it('reports a step as verified via an artifact_map mapping rather than missing (D10a)', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.scaffold'))
    fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'),
      'version: 2\nmethodology: deep\nplatforms: [claude-code]\n'
      + 'artifact_map:\n  coding-standards: CONTRIBUTING.md\n')
    fs.writeFileSync(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n')
    fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'deep', config_methodology: 'deep', 'init-mode': 'brownfield',
      created: '2026-01-01T00:00:00.000Z', in_progress: null,
      steps: {
        'coding-standards': {
          status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'], verification: 'declared',
        },
      },
      next_eligible: [], 'extra-steps': [],
    }))
    const result = pipelineVerificationCheck.run(ctxFor(root))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('1 completed step(s) verified')
  })
})

describe('scheduler/loaded — argv exec (no shell)', () => {
  // schedulerCheck reads the LaunchAgents/systemd-user directory under
  // os.homedir(), which resolves via $HOME on POSIX — override it (and
  // process.platform, to exercise both branches regardless of host OS)
  // for the duration of each call, always restoring afterward.
  function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      return fn()
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  }

  function withHome<T>(home: string, fn: () => T): T {
    const original = process.env['HOME']
    process.env['HOME'] = home
    try {
      return fn()
    } finally {
      if (original === undefined) delete process.env['HOME']
      else process.env['HOME'] = original
    }
  }

  it('macOS: a malicious label is a literal argv element — no shell injection — and reports ok when loaded', () => {
    const home = newTmpRoot()
    const agentsDir = path.join(home, 'Library', 'LaunchAgents')
    fs.mkdirSync(agentsDir, { recursive: true })
    // A crafted label containing a command substitution. Under the old
    // shell:true + string-interpolation implementation this would execute
    // `touch INJECTED` as a side effect of building the command string.
    const maliciousLabel = 'com.acme$(touch INJECTED).merge-poller'
    fs.writeFileSync(path.join(agentsDir, `${maliciousLabel}.plist`), '<plist/>')

    const bin = newBinDir()
    const capture = path.join(bin, 'captured-argv.txt')
    fs.writeFileSync(
      path.join(bin, 'launchctl'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${capture}"\nexit 0\n`,
      { mode: 0o755 },
    )

    const root = newTmpRoot()
    const result = withPlatform('darwin', () => withHome(home, () => schedulerCheck.run(ctxWithBin(root, bin))))

    expect(result.status).toBe('ok')
    expect(result.detail).toContain(maliciousLabel)
    expect(fs.existsSync(path.join(root, 'INJECTED'))).toBe(false)
    const captured = fs.readFileSync(capture, 'utf8').trim().split('\n')
    const uid = process.getuid?.() ?? 0
    expect(captured).toEqual(['print', `gui/${uid}/${maliciousLabel}`])
  })

  it('macOS: reports error with remediation when the launchd job is not loaded', () => {
    const home = newTmpRoot()
    const agentsDir = path.join(home, 'Library', 'LaunchAgents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(path.join(agentsDir, 'com.acme.merge-poller.plist'), '<plist/>')
    const bin = newBinDir()
    fs.writeFileSync(path.join(bin, 'launchctl'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 })

    const root = newTmpRoot()
    const result = withPlatform('darwin', () => withHome(home, () => schedulerCheck.run(ctxWithBin(root, bin))))
    expect(result.status).toBe('error')
    expect(result.remediation).toContain('launchctl bootstrap')
  })

  it('linux: a malicious timer is a literal argv element — no shell injection — and reports ok when active', () => {
    const home = newTmpRoot()
    const unitDir = path.join(home, '.config', 'systemd', 'user')
    fs.mkdirSync(unitDir, { recursive: true })
    const maliciousTimer = 'scaffold-acme$(touch INJECTED)-merge-poller.timer'
    fs.writeFileSync(path.join(unitDir, maliciousTimer), '[Timer]')

    const bin = newBinDir()
    const capture = path.join(bin, 'captured-argv.txt')
    fs.writeFileSync(
      path.join(bin, 'systemctl'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${capture}"\necho active\nexit 0\n`,
      { mode: 0o755 },
    )

    const root = newTmpRoot()
    const result = withPlatform('linux', () => withHome(home, () => schedulerCheck.run(ctxWithBin(root, bin))))

    expect(result.status).toBe('ok')
    expect(fs.existsSync(path.join(root, 'INJECTED'))).toBe(false)
    const captured = fs.readFileSync(capture, 'utf8').trim().split('\n')
    expect(captured).toEqual(['--user', 'is-active', maliciousTimer])
  })

  it('linux: reports warn with remediation when the timer is present but not active', () => {
    const home = newTmpRoot()
    const unitDir = path.join(home, '.config', 'systemd', 'user')
    fs.mkdirSync(unitDir, { recursive: true })
    fs.writeFileSync(path.join(unitDir, 'scaffold-acme-merge-poller.timer'), '[Timer]')
    const bin = newBinDir()
    fs.writeFileSync(path.join(bin, 'systemctl'), '#!/usr/bin/env bash\necho inactive\nexit 3\n', { mode: 0o755 })

    const root = newTmpRoot()
    const result = withPlatform('linux', () => withHome(home, () => schedulerCheck.run(ctxWithBin(root, bin))))
    expect(result.status).toBe('warn')
    expect(result.remediation).toContain('systemctl --user start')
  })
})
