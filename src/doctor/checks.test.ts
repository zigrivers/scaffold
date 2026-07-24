import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  beadsBinaryCheck, beadsGuardCheck, hooksRegisteredCheck, gateTargetsCheck,
  queueDaemonCheck, queuePausedCheck, pipelineVerificationCheck,
} from './checks.js'
import { makeRunCmd } from './run.js'
import type { DoctorContext } from './types.js'

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'))
}

function ctxFor(root: string): DoctorContext {
  return { projectRoot: root, runCmd: makeRunCmd(root) }
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
    const ctx: DoctorContext = {
      projectRoot: root,
      runCmd: makeRunCmd(root, { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` }),
    }
    expect(beadsBinaryCheck.run(ctx).status).toBe('warn')
    fs.writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.1.0"\n', { mode: 0o755 })
    expect(beadsBinaryCheck.run(ctx).status).toBe('ok')
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
})
