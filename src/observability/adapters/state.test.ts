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
    const rootState = JSON.stringify({ steps: { 'tech-stack': { status: 'completed' } } })
    writeFileSync(join(dir, '.scaffold/state.json'), rootState)
    writeFileSync(
      join(dir, '.scaffold/services/api/state.json'),
      JSON.stringify({ steps: { 'coding-standards': { status: 'in_progress' } } }),
    )
    const merged = await stateAdapter.readMergedState(dir)
    expect(merged.steps['tech-stack'].status).toBe('completed')
    expect(merged.steps['coding-standards@api'].status).toBe('in_progress')
  })
})

describe('state adapter — replayEvents', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-st-rep-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvents for completed and in_progress steps using state.json mtime', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: {
        'user-stories':       { status: 'completed',   source: 'pipeline' },
        'tech-stack':         { status: 'in_progress', source: 'pipeline' },
        'coding-standards':   { status: 'pending',     source: 'pipeline' },
      },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 })
    const slugs = events.map((e) => e.kind)
    expect(slugs).toContain('step_completed')
    expect(slugs).toContain('step_in_progress')
    expect(slugs).not.toContain('step_pending')
    expect(events[0].source).toBe('state')
    expect(events.find((e) => e.kind === 'step_completed')?.sort_id).toBe('state:user-stories:completed')
  })

  it('returns [] when state.json does not exist', async () => {
    expect(await stateAdapter.replayEvents(dir, { sinceHours: 24 })).toEqual([])
  })
})

describe('state adapter — replayEvents with real timestamps (Plan 6)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-st-rt-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('uses StepEntry.completed_at for step_completed events when available', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: {
        'user-stories': { status: 'completed', source: 'pipeline', completed_at: '2026-05-04T10:30:00.000Z' },
        'tech-stack': {
          status: 'in_progress', source: 'pipeline', in_progress_started_at: '2026-05-04T13:45:00.000Z',
        },
        'coding-standards': { status: 'pending', source: 'pipeline' },
      },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 * 365 })
    const completed = events.find((e) => e.kind === 'step_completed')
    const inProgress = events.find((e) => e.kind === 'step_in_progress')
    expect(completed?.ts).toBe('2026-05-04T10:30:00.000Z')
    expect(inProgress?.ts).toBe('2026-05-04T13:45:00.000Z')
  })

  it('falls back to file mtime when timestamps are absent', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0', methodology: 'deep',
      steps: { 'user-stories': { status: 'completed', source: 'pipeline' } },
    }))
    const events = await stateAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events).toHaveLength(1)
    expect(events[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
