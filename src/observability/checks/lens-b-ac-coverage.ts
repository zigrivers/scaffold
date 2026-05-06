import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'

const lensId = 'B-ac-coverage'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensBAcCoverage: LensFn = async (graph, _ledger, availability) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const testsAvailable = availability.tests.status === 'available'
  const testById = new Map(graph.tests.map((t) => [t.id, t]))

  // Structural sub-check: AC without ac_to_test edge → P1 (always)
  for (const ac of graph.acceptance_criteria) {
    const hasTest = graph.edges.some((e) => e.kind === 'ac_to_test' && e.from === ac.id)
    if (hasTest) continue
    findings.push({
      id: makeFindingId([lensId, 'no-edge', ac.id]),
      lens_id: lensId, severity: 'P1',
      title: `AC has no ac_to_test edge: ${ac.id}`,
      description: `Acceptance criterion ${ac.id} (story ${ac.story_id}) has no linked test.`,
      source_doc: ac.source_anchor,
      evidence: { kind: 'ac_not_covered', story_id: ac.story_id, ac_id: ac.id, missing_tests: [] },
      confidence: 'high',
      first_seen: now, last_seen: now,
      status: 'open',
      fix_hint: { kind: 'add_test', target: 'tests/', prompt: `Add a test exercising AC ${ac.id}.` },
    })
  }

  // Test-execution sub-check: only when tests adapter is available
  if (testsAvailable) {
    for (const e of graph.edges) {
      if (e.kind !== 'ac_to_test') continue
      const t = testById.get(e.to)
      if (!t) continue
      if (t.last_status === 'fail') {
        findings.push({
          id: makeFindingId([lensId, 'failing', e.from, t.id]),
          lens_id: lensId, severity: 'P0',
          title: `AC test failing: ${e.from}`,
          description: `Test "${t.name}" (${t.file_path}) for AC ${e.from} is currently failing.`,
          source_doc: '',
          evidence: { kind: 'rule_violation', rule_id: 'ac-test-failing', file: `file:${t.file_path}` },
          confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        })
      } else if (t.last_status === 'unknown') {
        findings.push({
          id: makeFindingId([lensId, 'unknown', e.from, t.id]),
          lens_id: lensId, severity: 'P1',
          title: `AC test status unknown: ${e.from}`,
          description: `Test "${t.name}" (${t.file_path}) exists but has not run in the audit window.`,
          source_doc: '',
          evidence: { kind: 'rule_violation', rule_id: 'ac-test-unknown', file: `file:${t.file_path}` },
          confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
        })
      }
    }
  }

  return findings
}
