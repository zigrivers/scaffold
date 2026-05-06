import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAudit } from '../../src/observability/engine/api'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/projects/audit-mvp')

describe('runAudit against the audit-mvp fixture', () => {
  it('trips one finding per Plan-3 lens (all 8)', async () => {
    const out = await runAudit({
      primaryRoot: FIXTURE, profile: 'fast', scope: 'all', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    for (const id of [
      'A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions', 'H-cross-doc',
    ]) {
      expect(lensIds.has(id), `expected ${id} to emit at least one finding`).toBe(true)
    }
    expect(out.verdict).toBe('blocked')
  })
})
