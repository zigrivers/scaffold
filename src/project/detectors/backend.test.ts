import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectBackend } from './backend.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/backend')

describe('detectBackend', () => {
  it('detects Express + Postgres + JWT (high tier with routes dir)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'express-postgres'))
    const m = detectBackend(ctx)
    expect(m?.projectType).toBe('backend')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.apiStyle).toBe('rest')
    expect(m?.partialConfig.dataStore).toContain('relational')
    expect(m?.partialConfig.authMechanism).toBe('jwt')
  })

  it('Redis as cache (NOT primary): postgres + redis → dataStore is relational only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'fastapi-redis'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.dataStore).toEqual(['relational'])  // redis omitted
    expect(m?.partialConfig.apiStyle).toBe('rest')
  })

  it('Redis as sole datastore → key-value', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'cache-svc', dependencies: { express: '4', redis: '4' } },
      files: { 'src/index.ts': 'app.listen(3000)' },
      dirs: ['src/routes'],
    })
    const m = detectBackend(ctx)
    expect(m?.partialConfig.dataStore).toEqual(['key-value'])
  })

  it('Gin Go: detects via .Run( pattern', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'gin-go'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.apiStyle).toBe('rest')
  })

  it('NestJS + Apollo → graphql (overrides rest)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'nestjs'))
    const m = detectBackend(ctx)
    expect(m?.partialConfig.apiStyle).toBe('graphql')
  })

  it('Framework dep alone, no entry, no routes → low tier', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', devDependencies: { express: '4' } },
    })
    const m = detectBackend(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('Framework dep + entry with .listen( + no routes → medium', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', dependencies: { fastify: '4' } },
      files: { 'src/index.ts': 'fastify.listen({ port: 3000 })' },
    })
    const m = detectBackend(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('returns null when no framework dep present', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectBackend(ctx)).toBeNull()
  })
})
