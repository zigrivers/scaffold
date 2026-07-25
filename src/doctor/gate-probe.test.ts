import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGateProbe } from './gate-probe.js'

function project(script?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-probe-'))
  if (script !== undefined) {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), script, { mode: 0o755 })
  }
  return root
}

const HONORS_PROBE = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'if [ "${GATE_PROBE:-0}" = "1" ]; then',
  '  echo "gate-check: probe OK (prerequisites verified; suite not run)"',
  '  exit 0',
  'fi',
  'touch suite-ran',
  '',
].join('\n')

describe('runGateProbe (D5 gate section, R2)', () => {
  it('reports ran:false when no generated gate script exists (resolve-only check stands)', () => {
    const res = runGateProbe(project())
    expect(res.ran).toBe(false)
    expect(res.ok).toBe(true)
    expect(res.detail).toMatch(/resolve-only/)
    expect(res.detail).toMatch(/--component gate/)
  })
  it('runs the script with GATE_PROBE=1 and never executes the suite', () => {
    const root = project(HONORS_PROBE)
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(true)
    expect(res.detail).toMatch(/prerequisites verified/)
    expect(fs.existsSync(path.join(root, 'suite-ran'))).toBe(false)
  })
  it('surfaces a failing probe with the output tail', () => {
    const root = project([
      '#!/usr/bin/env bash',
      'echo "gate-check: node is not on PATH" >&2',
      'exit 1',
      '',
    ].join('\n'))
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
    expect(res.detail).toContain('node is not on PATH')
  })
  it('bounds the probe with a timeout', () => {
    const root = project('#!/usr/bin/env bash\nsleep 30\n')
    const res = runGateProbe(root, { timeoutMs: 500 })
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
  })
  it('fails a non-executable gate script (make check runs it directly, needs +x) with remediation', () => {
    const root = project(HONORS_PROBE)
    fs.chmodSync(path.join(root, 'scripts', 'gate-check.sh'), 0o644)
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
    expect(res.detail).toMatch(/not executable/)
    expect(res.detail).toMatch(/chmod \+x scripts\/gate-check\.sh/)
    // The probe short-circuits before running the script — the suite never runs.
    expect(fs.existsSync(path.join(root, 'suite-ran'))).toBe(false)
  })
  it('catches a non-executable AFFECTED seed even when gate-check.sh is fine', () => {
    const root = project(HONORS_PROBE) // gate-check.sh present + executable
    // The affected seed is what the merge queue runs; a missing +x here would
    // pass a gate-check.sh-only probe but fail `make check-affected`.
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check-affected.sh'), HONORS_PROBE, { mode: 0o644 })
    const res = runGateProbe(root)
    expect(res.ran).toBe(true)
    expect(res.ok).toBe(false)
    expect(res.detail).toMatch(/gate-check-affected\.sh is not executable/)
    expect(res.detail).toMatch(/make check-affected/)
    expect(res.detail).toMatch(/chmod \+x scripts\/gate-check-affected\.sh/)
  })
})
