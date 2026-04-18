import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { StatePathResolver } from './state-path-resolver.js'

describe('StatePathResolver', () => {
  const root = '/fake/project'

  describe('root-scoped (no service)', () => {
    const resolver = new StatePathResolver(root)

    it('scaffoldDir is .scaffold/', () => {
      expect(resolver.scaffoldDir).toBe(path.join(root, '.scaffold'))
    })

    it('statePath is .scaffold/state.json', () => {
      expect(resolver.statePath).toBe(path.join(root, '.scaffold', 'state.json'))
    })

    it('lockPath is .scaffold/lock.json', () => {
      expect(resolver.lockPath).toBe(path.join(root, '.scaffold', 'lock.json'))
    })

    it('decisionsPath is .scaffold/decisions.jsonl', () => {
      expect(resolver.decisionsPath).toBe(path.join(root, '.scaffold', 'decisions.jsonl'))
    })

    it('reworkPath is .scaffold/rework.json', () => {
      expect(resolver.reworkPath).toBe(path.join(root, '.scaffold', 'rework.json'))
    })

    it('rootScaffoldDir equals scaffoldDir for root-scoped', () => {
      expect(resolver.rootScaffoldDir).toBe(resolver.scaffoldDir)
    })

    it('isServiceScoped is false', () => {
      expect(resolver.isServiceScoped).toBe(false)
    })

    it('serviceName is undefined', () => {
      expect(resolver.serviceName).toBeUndefined()
    })
  })

  describe('service-scoped', () => {
    const resolver = new StatePathResolver(root, 'api')

    it('scaffoldDir is .scaffold/services/api/', () => {
      expect(resolver.scaffoldDir).toBe(path.join(root, '.scaffold', 'services', 'api'))
    })

    it('statePath is .scaffold/services/api/state.json', () => {
      expect(resolver.statePath).toBe(path.join(root, '.scaffold', 'services', 'api', 'state.json'))
    })

    it('lockPath is .scaffold/services/api/lock.json', () => {
      expect(resolver.lockPath).toBe(path.join(root, '.scaffold', 'services', 'api', 'lock.json'))
    })

    it('decisionsPath is .scaffold/services/api/decisions.jsonl', () => {
      expect(resolver.decisionsPath).toBe(path.join(root, '.scaffold', 'services', 'api', 'decisions.jsonl'))
    })

    it('reworkPath is .scaffold/services/api/rework.json', () => {
      expect(resolver.reworkPath).toBe(path.join(root, '.scaffold', 'services', 'api', 'rework.json'))
    })

    it('rootScaffoldDir is always .scaffold/ regardless of service', () => {
      expect(resolver.rootScaffoldDir).toBe(path.join(root, '.scaffold'))
    })

    it('isServiceScoped is true', () => {
      expect(resolver.isServiceScoped).toBe(true)
    })

    it('serviceName is api', () => {
      expect(resolver.serviceName).toBe('api')
    })
  })

  describe('empty string service', () => {
    const resolver = new StatePathResolver(root, '')

    it('treats empty string as root-scoped', () => {
      expect(resolver.scaffoldDir).toBe(path.join(root, '.scaffold'))
      expect(resolver.isServiceScoped).toBe(false)
    })
  })

  describe('ensureDir', () => {
    it('creates the scaffold directory recursively', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spr-test-'))
      const resolver = new StatePathResolver(tmpDir, 'my-service')
      resolver.ensureDir()
      expect(fs.existsSync(resolver.scaffoldDir)).toBe(true)
    })
  })
})
