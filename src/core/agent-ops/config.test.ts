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

  it('leaves docker context unset when omitted', () => {
    const dir = tmpProject(`
project_name: myapp
docker:
  services:
    - name: postgres
      band: 20000
  shared_stack: {}
`)
    const cfg = loadAgentOpsConfig(dir)
    expect(cfg.docker).toBeDefined()
    expect(cfg.docker?.context).toBeUndefined()
  })

  it('keeps an explicitly provided docker context', () => {
    const dir = tmpProject(`
project_name: myapp
docker:
  context: colima
  services:
    - name: postgres
      band: 20000
  shared_stack: {}
`)
    expect(loadAgentOpsConfig(dir).docker?.context).toBe('colima')
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

  it('rejects non-integer shared_stack values', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  context: orbstack
  services:
    - name: postgres
      band: 20000
  shared_stack:
    postgres: "abc"
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/shared_stack/i)
  })

  it('rejects an empty docker section', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/docker/i)
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

  it('(b) rejects a shared_stack key that is not a valid service name', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  services:
    - name: postgres
      band: 20000
  shared_stack:
    "Has Space": 55432
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/shared_stack service name/i)
  })

  it('(c) rejects a shared_stack that is an array, not a mapping', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  services:
    - name: postgres
      band: 20000
  shared_stack:
    - 55432
    - 8001
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/shared_stack must be a mapping/i)
  })

  it('(d) rejects duplicate service names', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  services:
    - name: postgres
      band: 20000
    - name: postgres
      band: 21000
  shared_stack: {}
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/duplicate service name/i)
  })

  it('rejects a band that leaves no per-worktree headroom (band + 254 > 65535)', () => {
    const bad = tmpProject(`
project_name: myapp
docker:
  services:
    - name: postgres
      band: 65400
  shared_stack: {}
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/ceiling|65535/i)
  })

  it('accepts and preserves a dash-named service', () => {
    const dir = tmpProject(`
project_name: myapp
docker:
  services:
    - name: redis-cache
      band: 20000
  shared_stack:
    redis-cache: 6379
`)
    const cfg = loadAgentOpsConfig(dir)
    expect(cfg.docker?.services).toEqual([{ name: 'redis-cache', band: 20000 }])
    expect(cfg.docker?.shared_stack).toEqual({ 'redis-cache': 6379 })
  })
})

describe('defaultAgentOpsConfig', () => {
  it('sanitizes the project name', () => {
    expect(defaultAgentOpsConfig('/tmp/My App_2').project_name).toBe('my-app-2')
  })
})
