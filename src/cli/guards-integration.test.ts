import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const multiServiceConfig = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: a
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: none
        asyncMessaging: none
        deployTarget: container
        domain: none
`

// A valid v3 state — schema-version 3 skips v2→v3 migration entirely,
// avoiding "Cannot migrate: globalSteps is empty" when the overlay is absent
// in a temp project dir.
const validV3State = JSON.stringify({
  'schema-version': 3,
  'scaffold-version': '1.0.0',
  init_methodology: 'deep',
  config_methodology: 'deep',
  'init-mode': 'greenfield',
  created: '2024-01-01T00:00:00.000Z',
  in_progress: null,
  steps: {},
  next_eligible: [],
  'extra-steps': [],
})

function mkProjectWithConfig(configYaml: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), configYaml)
  fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), validV3State)
  return root
}

// ---------------------------------------------------------------------------
// Step-targeting commands: run, skip, complete
// These use guardStepCommand. Without --service, per-service steps exit 2.
// ---------------------------------------------------------------------------

describe('run rejects multi-service configs (per-service step without --service)', () => {
  beforeEach(() => { process.exitCode = 0 })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/run.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('complete rejects multi-service configs (per-service step without --service)', () => {
  beforeEach(() => { process.exitCode = 0 })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/complete.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('skip rejects multi-service configs (per-service step without --service)', () => {
  beforeEach(() => { process.exitCode = 0 })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/skip.js')
    await command.handler({ root, step: ['plan'], _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Step-less commands: next, status, dashboard, info, rework, reset
// These use guardSteplessCommand. Without --service, guard is a no-op →
// the command proceeds and exits 0.
// process.exit is mocked so commands can complete without terminating the test.
// ---------------------------------------------------------------------------

describe('next allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config (no --service required)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/next.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})

describe('status allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config (no --service required)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/status.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})

describe('rework allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config (no --service required)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/rework.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})

describe('reset allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config (no --service required)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/reset.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})

describe('info allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config (project-info branch)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/info.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })

  it('exits 0 on services[]-only config (step-info branch)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/info.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})

describe('dashboard allows multi-service configs (shows summary view without --service)', () => {
  beforeEach(() => {
    process.exitCode = 0
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('exits 0 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/dashboard.js')
    await command.handler({ root, 'no-open': true, 'json-only': false, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(0)
  })
})
