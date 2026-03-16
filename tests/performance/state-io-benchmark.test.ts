import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateManager } from '../../src/state/state-manager.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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

  it('reads state within 100ms (p95)', () => {
    const timings: number[] = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      stateManager.loadState()
      timings.push(performance.now() - start)
    }
    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(timings.length * 0.95)]
    console.log(`State read p95=${p95.toFixed(2)}ms`)
    expect(p95).toBeLessThan(100)
  })

  it('writes state within 100ms (p95)', () => {
    const state = stateManager.loadState()
    const timings: number[] = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      stateManager.saveState({ ...state })
      timings.push(performance.now() - start)
    }
    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(timings.length * 0.95)]
    console.log(`State write p95=${p95.toFixed(2)}ms`)
    expect(p95).toBeLessThan(100)
  })
})
