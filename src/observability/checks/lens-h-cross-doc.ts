import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'

const lensId = 'H-cross-doc'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensHCrossDoc: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // Features without stories
  if (graph.features.length > 0) {
    for (const feat of graph.features) {
      if (feat.priority !== 'must' && feat.priority !== 'should') continue
      const covered = graph.edges.some((e) => e.kind === 'feature_to_story' && e.from === feat.id)
      if (covered) continue
      findings.push({
        id: makeFindingId([lensId, 'feature-no-story', feat.id]),
        lens_id: lensId, severity: 'P1',
        title: `feature has no story: ${feat.title}`,
        description: `Feature ${feat.id} (priority: ${feat.priority}) has no feature_to_story edge.`,
        source_doc: feat.source_anchor,
        evidence: { kind: 'orphan_node', graph_query: `feature_to_story.from = ${feat.id}`, node_id: feat.id },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'edit_doc', target: 'docs/user-stories.md', prompt: `Add a story covering feature "${feat.title}".` },
      })
    }

  }

  // Orphan stories — only check when features exist (otherwise there's nothing to link to)
  if (graph.features.length > 0) {
    for (const s of graph.stories) {
      const inbound = graph.edges.some((e) => e.kind === 'feature_to_story' && e.to === s.id)
      if (inbound) continue
      if (s.feature_id) {
        const featureExists = graph.features.some((f) => f.id === s.feature_id)
        if (!featureExists) {
          findings.push({
            id: makeFindingId([lensId, 'orphan-story', s.id]),
            lens_id: lensId, severity: 'P1',
            title: `orphan story: ${s.title}`,
            description: `Story ${s.id} references feature ${s.feature_id} which does not exist in the PRD.`,
            source_doc: s.source_anchor,
            evidence: { kind: 'orphan_node', graph_query: `feature_to_story.to = ${s.id}`, node_id: s.id },
            confidence: 'high', first_seen: now, last_seen: now, status: 'open',
          })
        }
      } else {
        findings.push({
          id: makeFindingId([lensId, 'orphan-story-untagged', s.id]),
          lens_id: lensId, severity: 'P1',
          title: `orphan story (no feature tag): ${s.title}`,
          description: `Story ${s.id} has no feature_id and no inbound feature_to_story edge.`,
          source_doc: s.source_anchor,
          evidence: { kind: 'orphan_node', graph_query: `feature_to_story.to = ${s.id}`, node_id: s.id },
          confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
        })
      }
    }
  }

  // Plan covers stories — must=P0, should=P1
  for (const s of graph.stories) {
    if (s.priority === 'could' || s.priority === 'wont') continue
    const hasPlan = graph.edges.some((e) => e.kind === 'story_to_plan_task' && e.from === s.id)
    const hasPlaybook = graph.edges.some((e) => e.kind === 'playbook_task_to_story' && e.to === s.id)
    if (hasPlan || hasPlaybook) continue
    findings.push({
      id: makeFindingId([lensId, 'story-not-covered', s.id]),
      lens_id: lensId,
      severity: s.priority === 'must' ? 'P0' : 'P1',
      title: `story not covered by plan or playbook: ${s.title}`,
      description: `Story ${s.id} (priority: ${s.priority}) has no plan task or playbook task.`,
      source_doc: s.source_anchor,
      evidence: { kind: 'orphan_node', graph_query: `story_to_plan_task.from = ${s.id} OR playbook_task_to_story.to = ${s.id}`, node_id: s.id },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'docs/implementation-plan.md', prompt: `Add a plan task tracing back to story ${s.id}.` },
    })
  }

  // Playbook tracks plan — when playbook exists, every plan task should be linked
  if (graph.playbook_tasks.length > 0) {
    for (const p of graph.plan_tasks) {
      const linked = graph.edges.some((e) => e.kind === 'plan_task_to_playbook' && e.from === p.id)
      if (linked) continue
      findings.push({
        id: makeFindingId([lensId, 'plan-orphan', p.id]),
        lens_id: lensId, severity: 'P2',
        title: `plan task not in playbook: ${p.title}`,
        description: `Plan task ${p.id} has no corresponding playbook task.`,
        source_doc: p.source_anchor,
        evidence: { kind: 'orphan_node', graph_query: `plan_task_to_playbook.from = ${p.id}`, node_id: p.id },
        confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }

  // Decisions integrity — supersedes targeting non-existent decisions
  const decisionIds = new Set(graph.decisions.map((d) => d.id))
  for (const e of graph.edges) {
    if (e.kind !== 'decision_supersedes') continue
    if (!decisionIds.has(e.to)) {
      findings.push({
        id: makeFindingId([lensId, 'supersedes-missing', e.from, e.to]),
        lens_id: lensId, severity: 'P0',
        title: `decision supersedes non-existent decision`,
        description: `${e.from} supersedes ${e.to}, but ${e.to} does not exist.`,
        source_doc: 'decisions.jsonl',
        evidence: { kind: 'doc_disagreement', left_doc: 'decisions.jsonl', right_doc: 'decisions.jsonl', conflict: `${e.from} -> ${e.to} (missing)` },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }

  // Unresolved globs from edge builder
  for (const u of graph.unresolved_globs) {
    findings.push({
      id: makeFindingId([lensId, 'unresolved-glob', u.decision_id, u.glob]),
      lens_id: lensId, severity: 'P2',
      title: `decision affects glob with no matching files: ${u.glob}`,
      description: `Decision ${u.decision_id} declares affects: ${u.glob} but no files match.`,
      source_doc: 'decisions.jsonl',
      evidence: { kind: 'doc_disagreement', left_doc: 'decisions.jsonl', right_doc: 'filesystem', conflict: u.glob },
      confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'decisions.jsonl', prompt: `Update the affects glob for decision ${u.decision_id}.` },
    })
  }

  return findings
}
