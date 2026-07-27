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
// Instead we measure the real config-write path against a baseline that does
// the same filesystem work minus the serialization, interleaved in the same
// process. Contention inflates both arms together, so the ratio holds steady
// while absolute time moves.
//
// Ceiling calibration, measured on this path at SAMPLES=200:
//   clean, isolated ................................ 1.59 - 1.69
//   clean, full parallel suite ..................... 1.65
//   clean, 2x-core CPU oversubscription ............ 1.20 - 1.22
//   ONE redundant write in atomicWriteFileSync ..... 2.17 - 2.37   <- caught
//   three redundant writes in atomicWriteFileSync .. 2.74 - 3.30   <- caught
//   two extra doc.toString() passes, no extra IO ... 1.76          <- NOT caught
//
// That last row is the honest limit of this check. The path's cost is dominated
// by its filesystem work, not its serialization, so the ratio is sensitive to
// regressions that add IO and comparatively blunt to ones that only add CPU.
// Tripling the serialization was still cheaper than adding a single write.
//
// Clean readings are indistinguishable isolated vs. under the full parallel
// suite (1.65 either way), which is the point of the change. Heavy CPU
// oversubscription pushes the ratio DOWN, not up: the syscall-bound baseline
// absorbs scheduling latency worse than the subject arm does.
//
// 2.0 is placed to catch the weakest regression that could be constructed here
// — one extra write, i.e. doubling the writes the path performs, at 2.17. That
// leaves ~18% headroom over the noisiest clean reading (1.69), roughly 6x the
// observed run-to-run spread. A looser ceiling was tried first and was worse on
// both counts: at 3.0 a doubled write path passed silently and even a tripled
// one straddled the line (2.74 - 3.30), failing only on some runs.
//
// Because bareConfigWrite mirrors the subject's syscalls, the ratio reduces to
// 1 + (serialization cost / IO cost). That removes the syscall-count mismatch
// the earlier bare write+rename baseline had, but it does NOT make the result
// storage-independent: serialization is a large fraction of the baseline arm
// here, so a runner with much faster temp-dir IO (tmpfs) shrinks the
// denominator and raises the ratio without any regression — the residual risk.
// The logged absolute medians are the triage signal when the ceiling is
// breached: a real regression raises the config-write median, an unusual
// runner lowers the bare-write one.
const RATIO_CEILING = 2
// 200 rather than 50: at 50 the run-to-run spread was wide enough that one
// measured regression landed at 2.84 on one run and 3.46 on another, straddling
// the ceiling. 200 tightens both medians; the test still runs in ~0.2s.
const SAMPLES = 200

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
 * the I/O removes that mismatch, leaving the serialization work as the only
 * difference between the arms (see the residual-risk note in the header).
 */
function bareConfigWrite(target: string, scaffoldDir: string): void {
  if (!fs.existsSync(target)) throw new Error(`baseline target missing: ${target}`)
  const content = fs.readFileSync(target, 'utf8')
  if (!fs.existsSync(scaffoldDir)) fs.mkdirSync(scaffoldDir, { recursive: true })
  const tmpPath = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, target)
}

function typicalResult(deployTarget: string): AdoptionResult {
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
      config: { renderingStrategy: 'ssr', deployTarget },
    } as DetectedConfig,
  } as AdoptionResult
}

describe('atomic config write performance', () => {
  it('writes a typical config.yml within 2x the same write without serialization', () => {
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
      // Two configs differing in one leaf value. Alternating them means every
      // timed iteration must genuinely rewrite the file, so a "content
      // unchanged, skip the write" short-circuit cannot silently turn the
      // subject arm into a no-op (see the assertion after the loop).
      const results = [typicalResult('serverless'), typicalResult('container')]
      const subjectConfigPath = path.join(subjectDir, '.scaffold', 'config.yml')

      // Prime the subject so every timed iteration takes the same branch
      // (config exists -> read + reparse), and reuse the config it produces as
      // the baseline payload so both arms move identical bytes.
      const payloads = results.map((r) => {
        writeOrUpdateConfig(subjectDir, r)
        return fs.readFileSync(subjectConfigPath, 'utf8')
      })
      expect(payloads[0], 'the two configs must differ or the no-op check below is vacuous').not.toBe(
        payloads[1],
      )
      const payload = payloads[0]

      const baselineScaffoldDir = path.join(baselineDir, '.scaffold')
      fs.mkdirSync(baselineScaffoldDir, { recursive: true })
      const baselineTarget = path.join(baselineScaffoldDir, 'config.yml')
      fs.writeFileSync(baselineTarget, payload, 'utf8')

      const subjectTimings: number[] = []
      const baselineTimings: number[] = []

      // Interleaved so any drift in machine load hits both arms equally.
      let lastIndex = 0
      for (let i = 0; i < SAMPLES; i++) {
        lastIndex = i % results.length
        const result = results[lastIndex]
        subjectTimings.push(elapsedMs(() => writeOrUpdateConfig(subjectDir, result)))
        baselineTimings.push(elapsedMs(() => bareConfigWrite(baselineTarget, baselineScaffoldDir)))
      }

      // Pin the subject arm to real work. Without this, a short-circuit in
      // writeOrUpdateConfig collapses the subject median, drops the ratio, and
      // passes green while measuring nothing — the same decoupling from product
      // code this test was rewritten to fix. Verified: injecting an early
      // `if (fs.existsSync(configPath)) return` drove the subject median to
      // 0.004ms and ratio to 0.02, and without this assertion the test passed.
      // Because the loop alternates configs, the file must match whichever ran
      // last; a no-op leaves the other one behind and fails here.
      expect(
        fs.readFileSync(subjectConfigPath, 'utf8'),
        'subject arm stopped writing the expected config — the timing below measures nothing',
      ).toBe(payloads[lastIndex])

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
