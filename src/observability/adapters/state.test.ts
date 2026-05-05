import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stateAdapter } from './state.js'

describe('state adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-s-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no state.json exists', async () => {
    expect((await stateAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('readMergedState returns root state when services dir is absent', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0',
      methodology: 'deep',
      steps: { 'user-stories': { status: 'completed', source: 'pipeline', produces: ['docs/user-stories.md'] } },
    }))
    const merged = await stateAdapter.readMergedState(dir)
    expect(merged.steps['user-stories'].status).toBe('completed')
  })

  it('readMergedState merges service-scoped state under each service step', async () => {
    mkdirSync(join(dir, '.scaffold/services/api'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({ steps: { 'tech-stack': { status: 'completed' } } }))
    writeFileSync(
      join(dir, '.scaffold/services/api/state.json'),
      JSON.stringify({ steps: { 'coding-standards': { status: 'in_progress' } } }),
    )
    const merged = await stateAdapter.readMergedState(dir)
    expect(merged.steps['tech-stack'].status).toBe('completed')
    expect(merged.steps['coding-standards@api'].status).toBe('in_progress')
  })
})
