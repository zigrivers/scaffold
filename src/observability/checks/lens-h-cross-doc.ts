import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types.js'
import type { LensFn, LensContext } from '../engine/checks/runner.js'
import { dispatchLlm } from '../engine/llm-dispatcher.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'H-cross-doc'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensHCrossDoc: LensFn = async (graph, _ledger, _availability, _upstream, _enabled, context) => {
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
        fix_hint: {
          kind: 'edit_doc', target: 'docs/user-stories.md',
          prompt: `Add a story covering feature "${feat.title}".`,
        },
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
      evidence: {
        kind: 'orphan_node',
        graph_query: `story_to_plan_task.from = ${s.id} OR playbook_task_to_story.to = ${s.id}`,
        node_id: s.id,
      },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: {
        kind: 'edit_doc', target: 'docs/implementation-plan.md',
        prompt: `Add a plan task tracing back to story ${s.id}.`,
      },
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
        title: 'decision supersedes non-existent decision',
        description: `${e.from} supersedes ${e.to}, but ${e.to} does not exist.`,
        source_doc: 'decisions.jsonl',
        evidence: {
          kind: 'doc_disagreement', left_doc: 'decisions.jsonl', right_doc: 'decisions.jsonl',
          conflict: `${e.from} -> ${e.to} (missing)`,
        },
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
      fix_hint: {
        kind: 'edit_doc', target: 'decisions.jsonl',
        prompt: `Update the affects glob for decision ${u.decision_id}.`,
      },
    })
  }

  // Full-profile LLM-graded checks
  if (context?.profile === 'full') {
    const config = loadObservabilityConfig(context.cwd)
    const cmd = config.llm.dispatcher_command ?? 'claude -p'
    const timeoutMs = (config.llm.timeout_s ?? 60) * 1000

    const llmResults = await Promise.all([
      runTechStackVsPrd(graph, context, cmd, timeoutMs, now, makeFindingId),
      runPrdToStoriesCoverage(graph, context, cmd, timeoutMs, now, makeFindingId),
      runTerminologyDrift(graph, context, cmd, timeoutMs, now, makeFindingId),
    ])
    for (const batch of llmResults) findings.push(...batch)
  }

  return findings
}

type LlmFinding = { severity: string; title: string; description: string }

async function runTechStackVsPrd(
  graph: Parameters<LensFn>[0],
  _ctx: LensContext,
  cmd: string,
  timeoutMs: number,
  now: string,
  mkId: (parts: string[]) => string,
): Promise<Finding[]> {
  if (graph.features.length === 0 || graph.components.length === 0) return []

  const prdProse = graph.features
    .filter((f) => f.priority === 'must' || f.priority === 'should')
    .map((f) => `### ${f.title} (${f.priority})\n${f.prose ?? '(no prose)'}\n`)
    .join('\n')
  const techStackText = graph.components
    .map((c) => `- ${c.id}: ${c.package_or_url}${c.layer ? ` (layer: ${c.layer})` : ''}`)
    .join('\n')

  const prompt = `You are auditing two scaffold-pipeline planning documents for direct contradictions or soft tensions.

PRD features (priority: must/should only):
${prdProse}

Tech stack:
${techStackText}

Identify findings where the tech-stack contradicts (P0) or is in tension with (P2) the PRD's constraints.
Return ONLY a JSON object of the form:
{"findings": [{"severity": "P0"|"P2", "title": "<= 80 chars", "description": "<= 500 chars"}]}
Return {"findings": []} if there are no issues.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (!result.ok) return []
  const parsed = result.parsed as { findings?: unknown }
  if (!Array.isArray(parsed.findings)) return []
  return (parsed.findings as LlmFinding[])
    .filter((f) => f.severity === 'P0' || f.severity === 'P2')
    .map((f) => ({
      id: mkId([lensId, 'tech-stack-vs-prd', f.title]),
      lens_id: lensId, severity: f.severity as 'P0' | 'P2',
      title: f.title.slice(0, 80),
      description: f.description.slice(0, 500),
      source_doc: 'docs/plan.md',
      evidence: {
        kind: 'doc_disagreement' as const, left_doc: 'docs/plan.md', right_doc: 'docs/tech-stack.md',
        conflict: f.title,
      },
      confidence: 'medium' as const, first_seen: now, last_seen: now, status: 'open' as const,
    }))
}

async function runPrdToStoriesCoverage(
  graph: Parameters<LensFn>[0],
  _ctx: LensContext,
  cmd: string,
  timeoutMs: number,
  now: string,
  mkId: (parts: string[]) => string,
): Promise<Finding[]> {
  if (graph.features.length === 0 || graph.stories.length === 0) return []

  const featuresProse = graph.features
    .map((f) => `### ${f.title}\n${f.prose ?? '(no prose)'}\n`)
    .join('\n')
  const storiesList = graph.stories
    .map((s) => `- ${s.id}: ${s.title} (${s.priority})`)
    .join('\n')

  const prompt = `You are checking whether the user-stories cover the features described in the PRD's prose.

PRD features (with prose):
${featuresProse}

Existing user stories:
${storiesList}

Identify features that are described in PRD prose but have no covering story. Return ONLY a JSON object of the form:
{"findings": [{"severity": "P1", "title": "<= 80 chars", "description": "<= 500 chars"}]}
Return {"findings": []} if all PRD-prose features are covered.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (!result.ok) return []
  const parsed = result.parsed as { findings?: unknown }
  if (!Array.isArray(parsed.findings)) return []
  return (parsed.findings as LlmFinding[])
    .filter((f) => f.severity === 'P1')
    .map((f) => ({
      id: mkId([lensId, 'prd-feature-no-story-prose', f.title]),
      lens_id: lensId, severity: 'P1' as const,
      title: f.title.slice(0, 80),
      description: f.description.slice(0, 500),
      source_doc: 'docs/plan.md',
      evidence: {
        kind: 'doc_disagreement' as const, left_doc: 'docs/plan.md', right_doc: 'docs/user-stories.md',
        conflict: f.title,
      },
      confidence: 'medium' as const, first_seen: now, last_seen: now, status: 'open' as const,
    }))
}

async function runTerminologyDrift(
  graph: Parameters<LensFn>[0],
  _ctx: LensContext,
  cmd: string,
  timeoutMs: number,
  now: string,
  mkId: (parts: string[]) => string,
): Promise<Finding[]> {
  if (graph.features.length === 0 && graph.stories.length === 0) return []

  const docDigest = [
    graph.features.length > 0
      ? `## PRD features\n${graph.features.map((f) => `- ${f.title}: ${(f.prose ?? '').slice(0, 1000)}`).join('\n')}`
      : '',
    graph.stories.length > 0
      ? `## Stories\n${graph.stories.map((s) => `- ${s.id}: ${s.title}`).join('\n')}`
      : '',
    graph.rules.length > 0
      ? `## Standards rules\n${graph.rules.map((r) => `- ${r.id}: ${r.description}`).join('\n')}`
      : '',
    graph.tokens.length > 0
      ? `## Design tokens\n${graph.tokens.map((t) => `- ${t.id} (${t.category})`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const prompt = `Detect terminology drift across these scaffold-pipeline planning documents
— same concept named differently across docs (e.g. "user account" vs "profile" vs "user record").

${docDigest}

Return ONLY a JSON object of the form:
{"findings": [{"severity": "P2", "title": "<= 80 chars", "description": "<= 500 chars"}]}
Return {"findings": []} when terminology is internally consistent.`

  const result = await dispatchLlm({ prompt, command: cmd, timeoutMs })
  if (!result.ok) return []
  const parsed = result.parsed as { findings?: unknown }
  if (!Array.isArray(parsed.findings)) return []
  return (parsed.findings as LlmFinding[])
    .filter((f) => f.severity === 'P2')
    .map((f) => ({
      id: mkId([lensId, 'terminology-drift', f.title]),
      lens_id: lensId, severity: 'P2' as const,
      title: f.title.slice(0, 80),
      description: f.description.slice(0, 500),
      source_doc: 'docs/plan.md',
      evidence: {
        kind: 'doc_disagreement' as const, left_doc: 'multiple', right_doc: 'multiple',
        conflict: f.title,
      },
      confidence: 'low' as const, first_seen: now, last_seen: now, status: 'open' as const,
    }))
}
