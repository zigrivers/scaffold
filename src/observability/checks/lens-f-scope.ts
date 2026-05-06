import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'F-scope'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensFScope: LensFn = async (graph, ledger, availability) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) Feature without a story
  for (const feat of graph.features) {
    if (feat.priority !== 'must' && feat.priority !== 'should') continue
    const covered = graph.edges.some((e) => e.kind === 'feature_to_story' && e.from === feat.id)
    if (covered) continue
    findings.push({
      id: makeFindingId([lensId, 'feature-no-story', feat.id]),
      lens_id: lensId, severity: feat.priority === 'must' ? 'P0' : 'P1',
      title: `feature has no story: ${feat.title}`,
      description: `Feature ${feat.id} (priority: ${feat.priority}) has no covering story.`,
      source_doc: feat.source_anchor,
      evidence: { kind: 'orphan_node', graph_query: `feature_to_story.from = ${feat.id}`, node_id: feat.id },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'docs/user-stories.md', prompt: `Add a story for feature "${feat.title}".` },
    })
  }

  // (b) Story without plan or playbook
  for (const s of graph.stories) {
    if (s.priority !== 'must' && s.priority !== 'should') continue
    const hasPlan = graph.edges.some((e) => e.kind === 'story_to_plan_task' && e.from === s.id)
    const hasPlaybook = graph.edges.some((e) => e.kind === 'playbook_task_to_story' && e.to === s.id)
    if (hasPlan || hasPlaybook) continue
    findings.push({
      id: makeFindingId([lensId, 'no plan task', s.id]),
      lens_id: lensId, severity: s.priority === 'must' ? 'P0' : 'P1',
      title: `story has no plan task or playbook: ${s.title}`,
      description: `Story ${s.id} (priority: ${s.priority}) has no plan task or playbook task.`,
      source_doc: s.source_anchor,
      evidence: { kind: 'orphan_node', graph_query: `story_to_plan_task.from = ${s.id} OR playbook_task_to_story.to = ${s.id}`, node_id: s.id },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'docs/implementation-plan.md', prompt: `Add a plan task tracking story ${s.id}.` },
    })
  }

  // (c) Story planned but untouched — only when state adapter is available
  if (availability.state.status === 'available') {
    const config = loadObservabilityConfig(graph.cwd)
    const graceHours = config.lenses['F-scope']?.untouched_story_grace_hours ?? 168
    const graceCutoff = Date.now() - graceHours * 3_600_000
    const eventTimestamps = ledger.events.map((e) => new Date(e.ts).getTime()).filter(isFinite)
    const oldestEventTs = eventTimestamps.length > 0 ? Math.min(...eventTimestamps) : Date.now()
    if (oldestEventTs < graceCutoff) {
      const claimedTaskIds = new Set(
        ledger.events.filter((e) => e.type === 'task_claimed' && e.task_id).map((e) => e.task_id as string),
      )
      for (const s of graph.stories) {
        const planTasks = graph.plan_tasks.filter((p) => p.story_id === s.id)
        if (planTasks.length === 0) continue
        const allTodo = planTasks.every((p) => p.status === 'todo')
        if (!allTodo) continue
        const everClaimed = planTasks.some((p) => claimedTaskIds.has(p.id.replace(/^plan_task:/, '')))
        if (everClaimed) continue
        findings.push({
          id: makeFindingId([lensId, 'untouched', s.id]),
          lens_id: lensId, severity: 'P2',
          title: `story planned but untouched: ${s.title}`,
          description: `Story ${s.id} has plan tasks but none have been claimed.`,
          source_doc: s.source_anchor,
          evidence: { kind: 'orphan_node', graph_query: `task_claimed for story ${s.id}`, node_id: s.id },
          confidence: 'low', first_seen: now, last_seen: now, status: 'open',
        })
      }
    }
  }

  return findings
}
