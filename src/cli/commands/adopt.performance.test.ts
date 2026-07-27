// src/cli/commands/adopt.performance.test.ts
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeOrUpdateConfig } from './adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import type { DetectedConfig, WebAppConfig } from '../../types/config.js'

// Why this file counts syscalls instead of measuring elapsed time.
//
// It used to assert that a config write completed "in under 50ms", from ONE
// wall-clock sample of an inlined copy of the write. That had two faults: it
// never called product code, so a real regression could not fail it; and a
// single sample under full-suite parallel load spikes to ~11ms against a 0.3ms
// median, so what it actually detected was scheduler contention.
//
// The first replacement kept a timing check but made it relative — the real
// writeOrUpdateConfig against an interleaved baseline doing the same syscalls
// without the serialization — on the theory that contention inflates both arms
// together. That held on one machine. It did not survive CI:
//
//   local:  config write median=0.30ms  bare write median=0.17ms  ratio=1.65
//   CI:     config write median=0.94ms  bare write median=0.19ms  ratio=5.04
//
// The baseline arm is the same on both (0.17 vs 0.19ms); the subject arm is 3x
// slower on CI. That runner has a much slower CPU relative to its disk, so the
// serialization half of the subject inflates while the syscall half does not.
// Any fixed ratio ceiling is therefore a property of the machine, not of the
// code — the same disease as the original 50ms budget, one level removed.
//
// So the timing assertion is gone, and this is the argument for removing it
// rather than re-tuning it. It was measured against injected regressions before
// being dropped, and it earned its place nowhere:
//
//   regression injected            timing ratio      call counting
//   ---------------------------    --------------    -------------
//   one redundant write            caught 7 of 8     caught 5 of 5
//   three redundant writes         caught            caught
//   CPU-only (2x doc.toString())   MISSED (1.76)     missed
//   no-op short-circuit            caught            caught
//   no regression, run on CI       FALSE FAILURE     passed
//
// The timing check caught nothing the deterministic checks miss, caught the one
// class they share less reliably, and supplied all of the flakiness. A test that
// reports the runner's CPU as a product regression is worse than no timing check
// at all: it trains readers to re-run instead of investigate.
//
// What is NOT covered, stated plainly:
//
// 1. A regression that makes this path slower without changing its I/O shape —
//    a slower YAML serializer, say. The timing check did not catch that either
//    (the CPU-only row above), so dropping it lost nothing real, but nothing
//    here guards it. That needs a benchmark with a per-machine baseline, which
//    is a different tool than a suite test.
//
// 2. The production write path. `writeOrUpdateConfig` has no non-test callers —
//    `applyAdoptionPlan` writes config through `writeInitializeConfig` in
//    project/adoption-apply.ts, and adopt.ts marks this helper "slated for
//    removal in R2". So these assertions guard the helper this test has always
//    targeted, not the code that runs in production. Worth re-pointing at
//    `writeInitializeConfig` (or retiring with the helper), but that changes
//    what the test covers rather than how it measures, so it is left as a
//    deliberate follow-up rather than folded in here.

// `satisfies` rather than `as`: an `as` cast would let this fixture keep
// compiling if AdoptionResult or DetectedConfig gained a required field, and a
// silently incomplete fixture could send writeOrUpdateConfig down a cheaper
// branch than real usage. When the cast came off, the fixture turned out to be
// missing WebAppConfig's `realtime` and `authFlow` already.
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
      config: { renderingStrategy: 'ssr', deployTarget, realtime: 'none', authFlow: 'oauth' },
    } satisfies DetectedConfig,
  } satisfies AdoptionResult
}

describe('atomic config write cost', () => {
  it('performs exactly one read, one write and one rename per config update', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-cost-'))
    const readSpy = vi.spyOn(fs, 'readFileSync')
    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    const renameSpy = vi.spyOn(fs, 'renameSync')

    try {
      writeOrUpdateConfig(dir, typicalResult('serverless')) // create branch — not under test

      // The spies patch the `fs` namespace object, so they only observe calls
      // made through it. If the implementation ever switches to named imports
      // (`import { writeFileSync } from 'node:fs'`) they would observe nothing.
      // The counts below would still fail in that case — 0 is not 1 — but they
      // would read as "the write path stopped writing" when the truth is "the
      // spies stopped seeing". This says which it is, before the counters are
      // cleared and the ambiguity sets in.
      expect(
        writeSpy,
        'fs spies are not intercepting — a count of 0 below would mean this, not a missing write',
      ).toHaveBeenCalled()

      readSpy.mockClear()
      writeSpy.mockClear()
      renameSpy.mockClear()

      // The measured update CHANGES the config. Re-writing an identical config
      // would pin the current behaviour so tightly that adding a legitimate
      // "skip the write when nothing changed" optimisation would fail this test
      // — penalising an improvement. A genuine change must always write.
      writeOrUpdateConfig(dir, typicalResult('container')) // update branch

      // These three counts are the cost of the path. A redundant write, a second
      // read-and-reparse, or a write-per-key loop each move one of them.
      // Verified against an injected regression: adding a single extra
      // fs.writeFileSync to atomicWriteFileSync fails this on 5 runs of 5, where
      // the timing check it replaced caught the same regression on 7 of 8.
      expect(readSpy, 'config update should read the existing config exactly once').toHaveBeenCalledTimes(1)
      expect(writeSpy, 'config update should write the temp file exactly once').toHaveBeenCalledTimes(1)
      expect(renameSpy, 'config update should rename exactly once').toHaveBeenCalledTimes(1)

      // The write must land on a temp path that is then renamed onto the real
      // one, so an interrupted write cannot leave a truncated config behind.
      const configPath = path.join(dir, '.scaffold', 'config.yml')
      const writtenPath = String(writeSpy.mock.calls[0][0])
      const renamedFrom = String(renameSpy.mock.calls[0][0])
      const renamedTo = String(renameSpy.mock.calls[0][1])
      expect(writtenPath, 'the write should go to a temp path, not the config itself').not.toBe(configPath)
      expect(renamedFrom).toBe(writtenPath)
      expect(renamedTo).toBe(configPath)
    } finally {
      readSpy.mockRestore()
      writeSpy.mockRestore()
      renameSpy.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // Counting calls proves the path is not doing extra work. This proves it is
  // still doing the work at all — that the counts above are not one write of
  // nothing. Without it a "content unchanged, skip the write" short-circuit
  // would drive the counts to zero and could be mistaken for an improvement.
  it('actually rewrites the config when the detected config changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-cost-rewrite-'))
    const configPath = path.join(dir, '.scaffold', 'config.yml')

    try {
      writeOrUpdateConfig(dir, typicalResult('serverless'))
      const first = fs.readFileSync(configPath, 'utf8')

      writeOrUpdateConfig(dir, typicalResult('container'))
      const second = fs.readFileSync(configPath, 'utf8')

      expect(first).toContain('deployTarget: serverless')
      expect(second).toContain('deployTarget: container')
      expect(
        second,
        'the update path stopped writing — the call counts above would be measuring nothing',
      ).not.toBe(first)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
