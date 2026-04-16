import { describe, it, expect, beforeEach } from 'vitest'
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

function mkProjectWithConfig(configYaml: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'config.yml'), configYaml)
  fs.writeFileSync(path.join(root, '.scaffold', 'state.json'), JSON.stringify({
    'schema-version': 2,
  }))
  return root
}

describe('run rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/run.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('next rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/next.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('complete rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/complete.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('skip rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/skip.js')
    await command.handler({ root, step: ['plan'], _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('status rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/status.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('rework rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/rework.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('reset rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/reset.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('info rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config (project-info branch)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/info.js')
    await command.handler({ root, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })

  it('exits 2 on services[]-only config (step-info branch)', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/info.js')
    await command.handler({ root, step: 'plan', _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})

describe('dashboard rejects multi-service configs', () => {
  beforeEach(() => { process.exitCode = 0 })

  it('exits 2 on services[]-only config', async () => {
    const root = mkProjectWithConfig(multiServiceConfig)
    const { default: command } = await import('./commands/dashboard.js')
    await command.handler({ root, 'no-open': true, 'json-only': false, _: [], $0: 'scaffold' } as never)
    expect(process.exitCode).toBe(2)
  })
})
