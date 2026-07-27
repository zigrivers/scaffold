// src/cli/commands/adopt.performance.test.ts
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeOrUpdateConfig } from './adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import type { DetectedConfig, WebAppConfig } from '../../types/config.js'

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
// Ceiling calibration, measured on this path (SAMPLES as set below):
//   clean, isolated, 8 runs ........................ 1.62 - 1.75
//   clean, full parallel suite ..................... within that range
//   clean, 2x-core CPU oversubscription ............ 1.20 - 1.22
//   three redundant writes in atomicWriteFileSync .. 2.74 - 3.30   <- always caught
//   ONE redundant write, 8 runs .................... 1.94 - 2.44   <- caught 7 of 8
//   two extra doc.toString() passes, no extra IO ... 1.76          <- NOT caught
//
// Read the last three rows as the real resolution of this check, not marketing.
// A path doing three redundant writes is caught every time. Doubling the writes
// sits right at the edge — one run in eight measured 1.94 and slipped under.
// A CPU-only regression is not caught at all: the path's cost is dominated by
// its filesystem work, so tripling the serialization was still cheaper than
// adding a single write. This test is a guard against IO-shaped regressions of
// roughly 1.5x and up; it is not a general performance monitor.
//
// Clean readings are the same isolated as under the full parallel suite, which
// is the point of the change. Heavy CPU oversubscription pushes the ratio DOWN,
// not up: the syscall-bound baseline absorbs scheduling latency worse than the
// subject arm does.
//
// 1.95 is where the two distributions are best separated: ~11% above the
// noisiest clean reading (1.75) and below all but one regressed reading. Looser
// ceilings were tried first and were worse on both counts — at 3.0 a doubled
// write path passed silently and even a tripled one straddled the line.
//
// Because bareConfigWrite mirrors the subject's syscalls, the ratio reduces to
// 1 + (serialization cost / IO cost). That removes the syscall-count mismatch
// the earlier bare write+rename baseline had, but it does NOT make the result
// storage-independent: serialization is a large fraction of the baseline arm
// here, so a runner with much faster temp-dir IO (tmpfs) shrinks the
// denominator and raises the ratio without any regression — the residual risk.
// The assertion message carries both absolute medians, which is the triage
// signal when the ceiling is breached: a real regression raises the
// config-write median, an unusual runner lowers the bare-write one. The
// deterministic call-count case below is what keeps that caveat affordable.
const RATIO_CEILING = 1.95
// 201 rather than 50: at 50 the run-to-run spread was wide enough that one
// measured regression landed at 2.84 on one run and 3.46 on another, straddling
// the ceiling. ~200 tightens both medians; the test still runs in ~0.2s. Going
// further (401) did not tighten it again — it only shifted the level as warm-up
// amortized — so 201 is where the sample count stops paying for itself.
//
// ODD on purpose. Priming writes results[0] then results[1], leaving the file
// at payloads[1]. An odd count makes the loop end on results[0], so the
// post-loop assertion expects a state the loop itself had to produce. With an
// even count it would expect payloads[1] — already true before the loop ran —
// and a subject that wrote nothing would still satisfy it.
const SAMPLES = 201

// SAMPLES is odd, so this is the true median — one central element, nothing to
// average. (It also degrades sanely to the upper-middle element for an even
// count, and both arms use the same estimator, so any bias cancels in the
// ratio.)
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

// `satisfies` rather than `as`: an `as` cast would let this fixture keep
// compiling if AdoptionResult or DetectedConfig gained a required field, and a
// silently incomplete fixture could send writeOrUpdateConfig down a cheaper
// branch than real usage — quietly weakening the very thing being measured.
function typicalResult(deployTarget: WebAppConfig['deployTarget']): AdoptionResult {
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
      // All four WebAppConfig fields. The `as` cast this replaced was hiding a
      // fixture missing `realtime` and `authFlow`, so the timed path was
      // serializing a smaller-than-real config — the drift `satisfies` exists
      // to prevent, caught the moment the cast came off.
      config: { renderingStrategy: 'ssr', deployTarget, realtime: 'none', authFlow: 'oauth' },
    } satisfies DetectedConfig,
    // Note the standing tradeoff `satisfies` buys: this fixture now tracks
    // WebAppConfig, so when the schema gains a field the fixture gains it too,
    // the subject arm serializes more, and the ratio drifts up. That is the
    // right default — the fixture stays realistic — but it means the ceiling is
    // calibrated against today's schema. If this starts failing after a config
    // schema change rather than a write-path change, the assertion message will
    // show the config-write median rising while the bare-write median holds:
    // recalibrate rather than hunt for a regression that is not there.
  } satisfies AdoptionResult
}

describe('atomic config write performance', () => {
  it('writes a typical config.yml within 1.95x the same write without serialization', () => {
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

      // No console.log of `detail` on green runs — it would print on every
      // suite run for no one's benefit. Every assertion below carries `detail`
      // in its message, so a breach reports both medians and the ratio.

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

  // The deterministic half of the guard, and the reason the timing check above
  // can afford its documented environmental caveat.
  //
  // Every review round raised the same objection to the ratio: it is a
  // wall-clock measurement, so an unusual runner can move it without any
  // product change. True, and the calibration comment says so. This case closes
  // the gap for the regression class that actually motivated the test —
  // redundant filesystem work — by counting syscalls instead of timing them.
  // It cannot flake: no clock, no storage speed, no scheduler.
  //
  // The two are complements. This one pins the shape of the IO exactly but is
  // blind to anything that does not change the call count; the ratio is fuzzier
  // but would notice a wholesale slowdown. A regression that slipped past the
  // 1.95 ceiling on a fast runner still has to get past this.
  it('performs exactly one write and one rename per config update', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-perf-calls-'))
    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    const renameSpy = vi.spyOn(fs, 'renameSync')

    try {
      const result = typicalResult('serverless')
      writeOrUpdateConfig(dir, result) // create branch
      writeSpy.mockClear()
      renameSpy.mockClear()

      writeOrUpdateConfig(dir, result) // update branch — the one that is timed

      expect(writeSpy, 'atomic config write should write the temp file exactly once').toHaveBeenCalledTimes(1)
      expect(renameSpy, 'atomic config write should rename exactly once').toHaveBeenCalledTimes(1)

      // The write must land on a temp path and be renamed onto the real one,
      // so a crash mid-write cannot leave a truncated config behind.
      const configPath = path.join(dir, '.scaffold', 'config.yml')
      const writtenPath = String(writeSpy.mock.calls[0][0])
      const from = String(renameSpy.mock.calls[0][0])
      const to = String(renameSpy.mock.calls[0][1])
      expect(writtenPath).not.toBe(configPath)
      expect(from).toBe(writtenPath)
      expect(to).toBe(configPath)
    } finally {
      writeSpy.mockRestore()
      renameSpy.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
