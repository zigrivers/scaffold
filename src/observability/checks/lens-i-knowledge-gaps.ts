import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Finding, KnowledgeGapSignalPayload } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { scanLessonsForGaps, normalizeTopic } from './lens-i-lessons-scanner.js'

const lensId = 'I-knowledge-gaps'
const WINDOW_DAYS = 90
const MAX_SAMPLE_PROJECTS = 5
const MAX_EXAMPLE_EXCERPTS = 3

interface TimedSignal {
  payload: KnowledgeGapSignalPayload
  ts: string
}

interface Bucket {
  topic: string                  // normalized slug
  signals: TimedSignal[]
  realProjects: Set<string>      // project_id values excluding 'lessons'
  firstSeen: string
  lastSeen: string
}

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

function dedupeExcerpts(signals: TimedSignal[], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of signals) {
    const ex = s.payload.agent_excerpt
    if (!ex || seen.has(ex)) continue
    seen.add(ex)
    out.push(ex)
    if (out.length >= cap) break
  }
  return out
}

export const lensIKnowledgeGaps: LensFn = async (
  _graph, ledger, _availability, _upstream, _enabled, context,
) => {
  const findings: Finding[] = []
  const auditTs = new Date().toISOString()
  // Use parsed-ms comparison rather than lexical ISO string compare.
  // The validator accepts both UTC ('...Z') and offset ('...+05:00')
  // timestamps, and string-compare on those can misclassify around
  // the cutoff. Date.parse() normalizes to UTC ms.
  const cutoffMs = Date.now() - WINDOW_DAYS * 86400 * 1000

  // 1. Collect signals from the ledger (windowed)
  const ledgerSignals: TimedSignal[] = ledger.events
    .filter(e =>
      e.type === 'knowledge_gap_signal' && Date.parse(e.ts) >= cutoffMs,
    )
    .map(e => ({ payload: e.payload as KnowledgeGapSignalPayload, ts: e.ts }))

  // 2. Collect synthetic signals from tasks/lessons.md (resolved via context.cwd)
  const lessonsPath = context
    ? path.join(context.cwd, 'tasks', 'lessons.md')
    : null
  const lessonsSignals: TimedSignal[] = lessonsPath
    ? scanLessonsForGaps(lessonsPath).map(payload => ({ payload, ts: auditTs }))
    : []

  const allSignals = [...ledgerSignals, ...lessonsSignals]

  // 3. Bucket by normalized topic
  const buckets = new Map<string, Bucket>()
  for (const s of allSignals) {
    const topic = normalizeTopic(s.payload.topic)
    if (!topic) continue
    let bucket = buckets.get(topic)
    if (!bucket) {
      bucket = {
        topic,
        signals: [],
        realProjects: new Set(),
        firstSeen: s.ts,
        lastSeen: s.ts,
      }
      buckets.set(topic, bucket)
    }
    bucket.signals.push(s)
    if (s.payload.project_id !== 'lessons') {
      bucket.realProjects.add(s.payload.project_id)
    }
    // Parse ms for chronological comparison; keep the original ISO
    // string in the bucket for evidence output. This handles offset
    // timestamps consistently (UTC ms ordering is the same regardless
    // of which timezone the ISO string was written in).
    if (Date.parse(s.ts) < Date.parse(bucket.firstSeen)) bucket.firstSeen = s.ts
    if (Date.parse(s.ts) > Date.parse(bucket.lastSeen)) bucket.lastSeen = s.ts
  }

  // 4. Apply finding rules
  for (const bucket of buckets.values()) {
    const signalCount = bucket.signals.length
    const distinctProjectCount = bucket.realProjects.size

    let severity: 'P1' | 'P2' | null = null
    if (signalCount >= 5 && distinctProjectCount >= 3) severity = 'P1'
    else if (signalCount >= 3 && distinctProjectCount >= 2) severity = 'P2'
    if (!severity) continue

    const projectsSample = [...bucket.realProjects].slice(0, MAX_SAMPLE_PROJECTS)

    const titleSummary =
      `${signalCount} signals across ${distinctProjectCount} projects`
    findings.push({
      id: makeFindingId([lensId, bucket.topic]),
      lens_id: lensId,
      severity,
      title:
        `Knowledge base lacks coverage for "${bucket.topic}" — ${titleSummary}`,
      description:
        `Downstream agents have emitted ${signalCount} ` +
        `${signalCount === 1 ? 'signal' : 'signals'} ` +
        `for the topic "${bucket.topic}" across ${distinctProjectCount} distinct ` +
        `${distinctProjectCount === 1 ? 'project' : 'projects'} ` +
        `in the last ${WINDOW_DAYS} days. ` +
        'Consider adding a knowledge entry covering this topic.',
      source_doc: '',
      evidence: {
        kind: 'knowledge_gap',
        topic: bucket.topic,
        signal_count: signalCount,
        distinct_project_count: distinctProjectCount,
        distinct_projects: projectsSample,
        first_seen: bucket.firstSeen,
        last_seen: bucket.lastSeen,
        example_excerpts: dedupeExcerpts(bucket.signals, MAX_EXAMPLE_EXCERPTS),
      },
      confidence: severity === 'P1' ? 'high' : 'medium',
      first_seen: bucket.firstSeen,
      last_seen: bucket.lastSeen,
      status: 'open',
      fix_hint: {
        kind: 'edit_doc',
        target: `content/knowledge/<category>/${bucket.topic}.md`,
        prompt:
          `Propose a new knowledge entry for "${bucket.topic}". ` +
          `Evidence: ${signalCount} signals from ${distinctProjectCount} ` +
          `projects in the last ${WINDOW_DAYS} days.`,
      },
    })
  }

  return findings
}
