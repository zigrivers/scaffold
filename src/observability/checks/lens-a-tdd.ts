import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'

const lensId = 'A-tdd'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensATdd: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (b) Detect skipped tests via last_status set during discovery
  for (const test of graph.tests) {
    if (test.last_status !== 'skip') continue

    const acEdge = graph.edges.find((e) => e.kind === 'ac_to_test' && e.to === test.id)
    const acId = acEdge?.from
    const storyId = acId ? graph.acceptance_criteria.find((a) => a.id === acId)?.story_id : undefined
    const story = storyId ? graph.stories.find((s) => s.id === storyId) : undefined
    const severity = story?.priority === 'must' ? 'P0' : 'P1'

    findings.push({
      id: makeFindingId([lensId, 'skip', test.file_path, test.name]),
      lens_id: lensId,
      severity,
      title: `skipped test: ${test.name}`,
      description: `Test "${test.name}" (${test.file_path}) is skipped.`,
      source_doc: 'docs/tdd-standards.md',
      evidence: { kind: 'rule_violation', rule_id: 'tdd-no-skip', file: `file:${test.file_path}` },
      confidence: 'high',
      first_seen: now, last_seen: now,
      status: 'open',
      fix_hint: { kind: 'add_test', target: test.file_path, prompt: `Re-enable test "${test.name}".` },
    })
  }

  // (c) AC without ac_to_test edge
  for (const ac of graph.acceptance_criteria) {
    const hasTest = graph.edges.some((e) => e.kind === 'ac_to_test' && e.from === ac.id)
    if (hasTest) continue
    const story = graph.stories.find((s) => s.id === ac.story_id)
    const severity = story?.priority === 'must' ? 'P1' : 'P2'
    findings.push({
      id: makeFindingId([lensId, 'no-test', ac.id]),
      lens_id: lensId,
      severity,
      title: `AC without test coverage: ${ac.id}`,
      description: `Acceptance criterion ${ac.id} has no linked test.`,
      source_doc: ac.source_anchor,
      evidence: { kind: 'ac_not_covered', story_id: ac.story_id, ac_id: ac.id, missing_tests: [] },
      confidence: 'medium',
      first_seen: now, last_seen: now,
      status: 'open',
      fix_hint: { kind: 'add_test', target: 'tests/', prompt: `Add a test exercising AC ${ac.id}.` },
    })
  }

  return findings
}
