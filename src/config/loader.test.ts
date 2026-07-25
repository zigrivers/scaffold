// src/config/loader.test.ts

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig } from './loader.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-config-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function writeConfig(projectRoot: string, content: string): void {
  const dir = path.join(projectRoot, '.scaffold')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'config.yml'), content, 'utf8')
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('loadConfig', () => {
  it('loads a valid config.yml and returns typed ScaffoldConfig', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms:
  - claude-code
`)
    const { config, errors, warnings } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(warnings).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.version).toBe(2)
    expect(config?.methodology).toBe('deep')
    expect(config?.platforms).toEqual(['claude-code'])
  })

  it('returns CONFIG_MISSING error when config file does not exist', () => {
    const root = makeTmpDir()
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('CONFIG_MISSING')
    expect(errors[0].exitCode).toBe(1)
  })

  it('returns CONFIG_PARSE_ERROR for invalid YAML syntax', () => {
    const root = makeTmpDir()
    writeConfig(root, 'key: [unclosed bracket')
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('CONFIG_PARSE_ERROR')
  })

  it('returns CONFIG_EMPTY for empty config file', () => {
    const root = makeTmpDir()
    writeConfig(root, '')
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('CONFIG_EMPTY')
  })

  it('returns CONFIG_NOT_OBJECT when config is not an object', () => {
    const root = makeTmpDir()
    writeConfig(root, 'just a string')
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('CONFIG_NOT_OBJECT')
  })

  it('returns CONFIG_NOT_OBJECT when config is an array', () => {
    const root = makeTmpDir()
    writeConfig(root, '- item1\n- item2\n')
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('CONFIG_NOT_OBJECT')
  })

  it('returns FIELD_INVALID_METHODOLOGY for unknown methodology with fuzzy suggestion', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deap
platforms:
  - claude-code
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    const err = errors.find(e => e.code === 'FIELD_INVALID_METHODOLOGY')
    expect(err).toBeDefined()
    expect(err?.recovery).toContain('Did you mean "deep"?')
  })

  it('returns FIELD_INVALID_DEPTH for depth outside 1-5 range', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: custom
platforms:
  - claude-code
custom:
  steps:
    prd:
      depth: 9
`)
    const { config, errors } = loadConfig(root, ['prd'])
    expect(config).toBeNull()
    expect(errors.some(e => e.code === 'FIELD_INVALID_DEPTH')).toBe(true)
  })

  it('validates custom.steps entries match knownSteps', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: custom
platforms:
  - claude-code
custom:
  steps:
    unknown-step:
      enabled: true
`)
    const { config, errors } = loadConfig(root, ['prd', 'trd'])
    expect(config).toBeNull()
    expect(errors.some(e => e.code === 'FIELD_INVALID_VALUE')).toBe(true)
  })

  it('skips custom.steps validation when knownSteps is empty', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: custom
platforms:
  - claude-code
custom:
  steps:
    any-step:
      enabled: true
`)
    const { errors } = loadConfig(root, [])
    // When knownSteps is empty, skip cross-field validation
    expect(errors.filter(e => e.code === 'FIELD_INVALID_VALUE')).toHaveLength(0)
  })

  it('emits CONFIG_UNKNOWN_FIELD warning for unknown top-level fields without failing', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms:
  - claude-code
future_feature: some-value
`)
    const { config, errors, warnings } = loadConfig(root, [])
    expect(config).not.toBeNull()
    expect(errors).toHaveLength(0)
    expect(warnings.some(w => w.code === 'CONFIG_UNKNOWN_FIELD')).toBe(true)
    const warn = warnings.find(w => w.code === 'CONFIG_UNKNOWN_FIELD')
    expect(warn?.context?.field).toBe('future_feature')
  })

  it('preserves unknown fields in returned config object (forward compatibility)', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms:
  - claude-code
future_feature: some-value
`)
    const { config } = loadConfig(root, [])
    expect(config).not.toBeNull()
    expect((config as Record<string, unknown>)['future_feature']).toBe('some-value')
  })

  it('migrates v1 config: removes mixins and maps methodology names', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 1
methodology: classic
mixins:
  extra: true
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.version).toBe(2)
    expect(config?.methodology).toBe('deep')
    expect(Object.prototype.hasOwnProperty.call(config, 'mixins')).toBe(false)
  })

  it('migrates v1 config without version field', () => {
    const root = makeTmpDir()
    writeConfig(root, `
methodology: classic-lite
mixins: {}
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config?.version).toBe(2)
    expect(config?.methodology).toBe('mvp')
  })

  it('auto-adds platforms to migrated v1 config if missing', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 1
methodology: classic
`)
    const { config } = loadConfig(root, [])
    expect(config?.platforms).toEqual(['claude-code'])
  })

  it('returns FIELD_WRONG_TYPE when version is an unexpected value', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 99
methodology: deep
platforms:
  - claude-code
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors.some(e => e.code === 'FIELD_WRONG_TYPE')).toBe(true)
  })

  it('returns error for invalid platform enum values (non-depth Zod failure)', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms:
  - not-a-valid-platform
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors.some(e => e.code === 'FIELD_INVALID_VALUE')).toBe(true)
  })

  it('returns error for malformed custom block (non-depth Zod failure)', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: custom
platforms:
  - claude-code
custom:
  steps:
    my-step:
      enabled: not-a-boolean
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts array-shape domain at root (backend)', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: [fintech]
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.project?.backendConfig?.domain).toEqual(['fintech'])
  })

  it('accepts array-shape domain on a service', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: api
      projectType: backend
      backendConfig:
        apiStyle: rest
        domain: [fintech]
`)
    const { config, errors } = loadConfig(root, [])
    expect(errors).toHaveLength(0)
    expect(config).not.toBeNull()
    expect(config?.project?.services?.[0]?.backendConfig?.domain).toEqual(['fintech'])
  })

  it('rejects empty-array domain with project.backendConfig.domain field path', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: []
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    const domainErrors = errors.filter(e =>
      e.code === 'FIELD_INVALID_VALUE'
      && e.context?.field === 'project.backendConfig.domain',
    )
    expect(domainErrors).toHaveLength(1)
  })

  it('rejects [\'none\'] array with project.backendConfig.domain field path', () => {
    const root = makeTmpDir()
    writeConfig(root, `
version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: backend
  backendConfig:
    apiStyle: rest
    domain: [none]
`)
    const { config, errors } = loadConfig(root, [])
    expect(config).toBeNull()
    const domainErrors = errors.filter(e =>
      e.code === 'FIELD_INVALID_VALUE'
      && e.context?.field === 'project.backendConfig.domain',
    )
    expect(domainErrors).toHaveLength(1)
  })

  describe('artifact_map validation (D10a)', () => {
    // NOTE: `platforms` is included in every fixture below even though the
    // task brief's literal snippets omitted it — loadConfig's Phase 4 treats
    // `platforms` as unconditionally required for version:2 configs
    // (independent of the Zod schema's `.default(['claude-code'])`), so a
    // fixture without it always fails with an unrelated FIELD_MISSING error.
    it('warns on an artifact_map entry for an unknown step', () => {
      const root = makeTmpDir()
      writeConfig(root, 'version: 2\nmethodology: deep\nplatforms: [claude-code]\n'
        + 'artifact_map:\n  not-a-step: CONTRIBUTING.md\n')
      const result = loadConfig(root, ['coding-standards', 'tech-stack'])
      expect(result.warnings.some(w => w.code === 'CONFIG_ARTIFACT_MAP_UNKNOWN_STEP')).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('errors on an absolute artifact_map target', () => {
      const root = makeTmpDir()
      writeConfig(root, 'version: 2\nmethodology: deep\nplatforms: [claude-code]\n'
        + 'artifact_map:\n  coding-standards: /etc/passwd\n')
      const result = loadConfig(root, ['coding-standards'])
      expect(result.errors.some(e => e.code === 'CONFIG_ARTIFACT_MAP_PATH_INVALID')).toBe(true)
    })

    it('errors on a traversal artifact_map target', () => {
      const root = makeTmpDir()
      writeConfig(root, 'version: 2\nmethodology: deep\nplatforms: [claude-code]\n'
        + 'artifact_map:\n  coding-standards: ../outside.md\n')
      const result = loadConfig(root, ['coding-standards'])
      expect(result.errors.some(e => e.code === 'CONFIG_ARTIFACT_MAP_PATH_INVALID')).toBe(true)
    })

    it('accepts a valid artifact_map entry', () => {
      const root = makeTmpDir()
      writeConfig(root, 'version: 2\nmethodology: deep\nplatforms: [claude-code]\n'
        + 'artifact_map:\n  coding-standards: CONTRIBUTING.md\n')
      const result = loadConfig(root, ['coding-standards'])
      expect(result.errors).toHaveLength(0)
      expect(result.config?.artifact_map).toEqual({ 'coding-standards': 'CONTRIBUTING.md' })
    })
  })
})
