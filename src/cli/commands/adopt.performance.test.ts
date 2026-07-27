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
//   clean, isolated ............................. 1.84 - 2.00
//   clean, full parallel suite ................... 2.04
//   three redundant writes in atomicWriteFileSync . 3.27 - 3.69
// Contention drives the ratio toward its floor of 1.0 (both arms slow
// together), so load cannot push it through the ceiling. 3.0 sits ~47% above
// the noisiest clean reading and below the cheapest regression measured.
//
// What this does and does not catch: it trips on a regression that roughly
// doubles the config-write path — an added fsync, a second parse pass, a
// redundant write. It will not notice a 20% slowdown, and it should not
// pretend to; at this magnitude that is below the measurement floor.
//
// Because bareConfigWrite mirrors the subject's syscalls, the ratio reduces to
// 1 + (serialization cost / IO cost). That removes the syscall-count mismatch
// the earlier bare write+rename baseline had, but it does NOT make the result
// storage-independent: serialization is roughly half the baseline arm here, so
// a runner with much faster temp-dir IO (tmpfs) shrinks the denominator and
// raises the ratio without any regression. That is the known residual risk.
// The logged absolute medians are the triage signal when the ceiling is
// breached: a real regression raises the config-write median, an unusual
// runner lowers the bare-write one.
const RATIO_CEILING = 3
const SAMPLES = 50

// Upper-middle element rather than the mean of the two central values. Both
// arms use it, so the slight upward bias cancels in the ratio.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function elapsedMs(fn: () => void): number {
  const start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

/**
 * The baseline arm: the same filesystem work writeOrUpdateConfig does, minus
 * the YAML parse/mutate/serialize it exists to perform.
 *
 * Deliberately mirrors the subject's syscall shape — existsSync, readFileSync,
 * existsSync, writeFileSync, renameSync. An asymmetric baseline (a bare
 * write+rename) leaves the ratio sensitive to the machine's CPU-to-IO cost
 * mix, which is what makes a fast tmpfs runner look like a regression. Matching
 * the I/O means both arms scale together with storage speed and the residual
 * difference is the serialization work alone.
 */
function bareConfigWrite(target: string, scaffoldDir: string): void {
  if (!fs.existsSync(target)) throw new Error(`baseline target missing: ${target}`)
  const content = fs.readFileSync(target, 'utf8')
  if (!fs.existsSync(scaffoldDir)) fs.mkdirSync(scaffoldDir, { recursive: true })
  const tmpPath = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, target)
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
    // Tracked as they are created so the finally below removes whatever
    // subset exists, even if the second mkdtemp itself throws.
    const created: string[] = []
    const mkTmp = (prefix: string): string => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
      created.push(dir)
      return dir
    }

    try {
      const subjectDir = mkTmp('adopt-perf-')
      const baselineDir = mkTmp('adopt-perf-base-')
      const result = typicalResult()

      // Prime the subject so every timed iteration takes the same branch
      // (config exists -> read + reparse), and reuse the config it produces as
      // the baseline payload so both arms move identical bytes.
      writeOrUpdateConfig(subjectDir, result)
      const payload = fs.readFileSync(
        path.join(subjectDir, '.scaffold', 'config.yml'),
        'utf8',
      )

      const baselineScaffoldDir = path.join(baselineDir, '.scaffold')
      fs.mkdirSync(baselineScaffoldDir, { recursive: true })
      const baselineTarget = path.join(baselineScaffoldDir, 'config.yml')
      fs.writeFileSync(baselineTarget, payload, 'utf8')

      const subjectTimings: number[] = []
      const baselineTimings: number[] = []

      // Interleaved so any drift in machine load hits both arms equally.
      for (let i = 0; i < SAMPLES; i++) {
        subjectTimings.push(elapsedMs(() => writeOrUpdateConfig(subjectDir, result)))
        baselineTimings.push(elapsedMs(() => bareConfigWrite(baselineTarget, baselineScaffoldDir)))
      }

      const subject = median(subjectTimings)
      const baseline = median(baselineTimings)
      const ratio = subject / baseline
      const detail =
        `config write median=${subject.toFixed(3)}ms, ` +
        `bare write median=${baseline.toFixed(3)}ms, ratio=${ratio.toFixed(2)} ` +
        `(ceiling ${RATIO_CEILING})`

      // Logged like the other perf checks in tests/performance/ so a drifting
      // ratio is visible before it crosses the ceiling.
      console.log(detail)

      // A zero denominator would make the ratio Infinity/NaN and report as a
      // regression. Sub-microsecond medians mean the baseline got faster, which
      // is never the failure this test exists to catch.
      expect(
        baseline,
        `baseline median measured as 0ms — timer resolution too coarse to compare. ${detail}`,
      ).toBeGreaterThan(0)

      expect(ratio, detail).toBeLessThan(RATIO_CEILING)
    } finally {
      // In finally so a failing assertion — the case this test exists for —
      // still cleans up instead of leaving adopt-perf-* dirs in $TMPDIR.
      for (const dir of created) fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
