// src/cli/commands/adopt.performance.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeOrUpdateConfig } from './adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import type { DetectedConfig } from '../../types/config.js'

// Why a ratio and not a millisecond budget:
//
// This assertion used to take ONE sample of an inlined copy of the write and
// compare it against a fixed 50ms. Two problems. It never called product code,
// so a real regression in writeOrUpdateConfig could not fail it; and a single
// wall-clock sample under full-suite parallel load spikes to ~11ms (vs a 0.3ms
// median), so the only thing it reliably detected was scheduler contention.
//
// Instead we measure the real config-write path against a bare
// writeFileSync+rename baseline, interleaved in the same process. Contention
// inflates both arms together, so the ratio holds steady while absolute time
// doubles (see the calibration table below).
// A genuine slowdown in the config-write path (an added fsync, a second parse
// pass, a serialization change) moves the ratio and fails the test; a busy
// machine does not.
//
// Ceiling calibration, measured on this path:
//   clean, isolated ............................. 2.12 - 2.29
//   clean, full parallel suite ................... 2.41 - 2.48
//   clean, 2x-core synthetic CPU oversubscription . 1.42 - 1.66
//   three redundant writes in atomicWriteFileSync . 3.59 - 3.90
// Contention drives the ratio DOWN (both arms slow, the syscall-bound baseline
// disproportionately), so load can't push it through the ceiling. 3.0 sits
// above the noisiest clean reading and below the cheapest regression measured.
//
// The one assumption worth knowing: the ratio is a CPU-work-to-IO-work mix, so
// a machine with disproportionately fast temp-dir IO (tmpfs) shrinks the
// denominator and raises the ratio. If this ever fails on a new runner, the
// logged medians below say immediately which arm moved — a real regression
// raises the config-write median, a fast-tmpfs runner lowers the bare-write one.
const RATIO_CEILING = 3
const SAMPLES = 50

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function elapsedMs(fn: () => void): number {
  const start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function typicalResult(): AdoptionResult {
  return {
    mode: 'brownfield',
    artifactsFound: 0,
    detectedArtifacts: [],
    stepsCompleted: [],
    stepsRemaining: [],
    methodology: 'deep',
    errors: [],
    warnings: [],
    projectType: 'web-app',
    detectedConfig: {
      type: 'web-app',
      config: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
    } as DetectedConfig,
  } as AdoptionResult
}

describe('atomic config write performance', () => {
  it('writes a typical config.yml within 3x a bare atomic file write', () => {
    const subjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-perf-'))
    const baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-perf-base-'))
    const result = typicalResult()

    // The payload the baseline writes is the config the subject produces, so
    // both arms move the same number of bytes through the same syscalls.
    writeOrUpdateConfig(subjectDir, result)
    const payload = fs.readFileSync(
      path.join(subjectDir, '.scaffold', 'config.yml'),
      'utf8',
    )
    const baselineTarget = path.join(baselineDir, 'config.yml')

    const subjectTimings: number[] = []
    const baselineTimings: number[] = []

    // Interleaved so any drift in machine load hits both arms equally.
    for (let i = 0; i < SAMPLES; i++) {
      subjectTimings.push(elapsedMs(() => writeOrUpdateConfig(subjectDir, result)))
      baselineTimings.push(
        elapsedMs(() => {
          const tmpPath = `${baselineTarget}.${process.pid}.tmp`
          fs.writeFileSync(tmpPath, payload, 'utf8')
          fs.renameSync(tmpPath, baselineTarget)
        }),
      )
    }

    const subject = median(subjectTimings)
    const baseline = median(baselineTimings)
    const ratio = subject / baseline

    fs.rmSync(subjectDir, { recursive: true, force: true })
    fs.rmSync(baselineDir, { recursive: true, force: true })

    // Logged like the other perf checks in tests/performance/ so a drifting
    // ratio is visible before it crosses the ceiling.
    console.log(
      `config write median=${subject.toFixed(3)}ms ` +
        `bare write median=${baseline.toFixed(3)}ms ratio=${ratio.toFixed(2)}`,
    )

    expect(
      ratio,
      `config write median=${subject.toFixed(3)}ms, ` +
        `bare write median=${baseline.toFixed(3)}ms, ratio=${ratio.toFixed(2)} ` +
        `(ceiling ${RATIO_CEILING})`,
    ).toBeLessThan(RATIO_CEILING)
  })
})
