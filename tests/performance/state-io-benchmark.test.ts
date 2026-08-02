import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateManager } from '../../src/state/state-manager.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { BUDGET_STATE_READ_MS, BUDGET_STATE_WRITE_MS } from './budgets.js'
import { perOpStatsMs } from './measure.js'

describe('State I/O Performance', () => {
  let tmpDir: string
  let stateManager: StateManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-perf-'))
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    stateManager = new StateManager(tmpDir, () => [])
    // Initialize with 36 steps (realistic pipeline)
    const steps = Array.from({ length: 36 }, (_, i) => ({ slug: `step-${i}`, produces: [`docs/step-${i}.md`] }))
    stateManager.initializeState({
      enabledSteps: steps,
      scaffoldVersion: '2.0.0',
      methodology: 'deep',
      initMode: 'greenfield',
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads state within budget (p95)', () => {
    // A load that threw, or that returned a stub, would be the cheapest way to
    // pass a timing budget. Prove the read is real before timing it.
    expect(Object.keys(stateManager.loadState().steps)).toHaveLength(36)

    const stats = perOpStatsMs(() => { stateManager.loadState() })
    console.log(`State read ${stats.summary}`)
    expect(stats.p95).toBeLessThan(BUDGET_STATE_READ_MS)
  })

  it('writes state within budget (p95)', () => {
    const state = stateManager.loadState()

    stateManager.saveState({ ...state })
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'state.json'))).toBe(true)

    const stats = perOpStatsMs(() => { stateManager.saveState({ ...state }) })
    console.log(`State write ${stats.summary}`)
    expect(stats.p95).toBeLessThan(BUDGET_STATE_WRITE_MS)
  })
})
