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

  return findings
}
