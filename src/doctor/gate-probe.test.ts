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
})
