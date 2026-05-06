import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import type { Finding, Event, DocGraph } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { gitAdapter, type CommitInfo } from '../adapters/git.js'

const DECISION_KEYWORDS = [
  'decided', 'decision', 'adopt', 'migrate', 'deprecate', 'replace', 'switching to', 'switch to',
]
const DECISION_SCAN_HOURS = 7 * 24

function loadKeywords(): string[] {
  return DECISION_KEYWORDS
}

const lensId = 'G-decisions'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

function decisionEventCoversFile(events: Event[], filePath: string): boolean {
  for (const e of events) {
    if (e.type !== 'decision_recorded') continue
    const raw = (e.payload as { affects?: unknown }).affects
    const affects = Array.isArray(raw) ? raw.filter((g): g is string => typeof g === 'string') : []
    if (affects.some((g) => minimatch(filePath, g))) return true
  }
  return false
}

async function lensGDecisionsImpl(
  cwd: string,
  graph: DocGraph,
  ledger: { events: Event[] },
  availability: Parameters<LensFn>[2],
  upstreamFindings: Finding[],
): Promise<Finding[]> {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) Ledger events without doc entries
  const docKeys = new Set(graph.decisions.map((d) => d.key))
  const eventsByKey = new Map<string, Event>()
  for (const e of ledger.events) {
    if (e.type !== 'decision_recorded') continue
    const key = (e.payload as { key?: unknown }).key
    if (typeof key !== 'string' || !key) continue
    eventsByKey.set(key, e)
  }
  for (const [key] of eventsByKey) {
    if (docKeys.has(key)) continue
    findings.push({
      id: makeFindingId([lensId, 'event-no-doc', key]),
      lens_id: lensId, severity: 'P1',
      title: `decision event without doc entry: ${key}`,
      description: `decision_recorded event "${key}" has no matching entry in docs/decisions/ or decisions.jsonl.`,
      source_doc: '',
      evidence: { kind: 'doc_disagreement', left_doc: 'ledger', right_doc: 'docs/decisions/', conflict: key },
      confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'record_decision', target: 'docs/decisions/', prompt: `Document the "${key}" decision.` },
    })
  }

  // (b) Doc decisions without ledger events (only when ledger has decisions at all)
  if (eventsByKey.size > 0) {
    for (const d of graph.decisions) {
      if (eventsByKey.has(d.key)) continue
      findings.push({
        id: makeFindingId([lensId, 'doc-no-event', d.key]),
        lens_id: lensId, severity: 'P1',
        title: `doc without event: ${d.key}`,
        description: `Decision "${d.key}" is documented but never went through the ledger writer.`,
        source_doc: d.source_anchor,
        evidence: { kind: 'doc_disagreement', left_doc: d.source_anchor, right_doc: 'ledger', conflict: d.key },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }

  // (c) Cross-lens P0 — D-stack unsanctioned-dependency findings without covering decision
  for (const d of upstreamFindings) {
    if (d.lens_id !== 'D-stack') continue
    if (!/unsanctioned/i.test(d.title)) continue
    if (d.evidence.kind !== 'rule_violation') continue
    const filePath = d.evidence.file.replace(/^file:/, '')
    if (decisionEventCoversFile(ledger.events, filePath)) continue
    findings.push({
      id: makeFindingId([lensId, 'unsanctioned-dep-no-decision', filePath]),
      lens_id: lensId, severity: 'P0',
      title: `unsanctioned dep without recorded decision: ${filePath}`,
      description: `Lens D flagged ${filePath} as unsanctioned, but no decision_recorded event covers this path.`,
      source_doc: 'decisions.jsonl',
      evidence: { kind: 'rule_violation', rule_id: 'unsanctioned-dep-no-decision', file: `file:${filePath}` },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: {
        kind: 'record_decision', target: 'decisions.jsonl',
        prompt: `Record a decision for the unsanctioned dependency in ${filePath}.`,
      },
    })
  }

  // (d) Decision-keyword commit scan
  if (availability.git.status === 'available') {
    const keywords = loadKeywords()
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const keywordRe = new RegExp(`\\b(${escaped})\\b`, 'i')
    const eventKeys = new Set([...eventsByKey.keys(), ...graph.decisions.map((d) => d.key)])
    let recentCommits: CommitInfo[]
    try {
      recentCommits = await gitAdapter.recentCommits(cwd, { sinceHours: DECISION_SCAN_HOURS })
    } catch { recentCommits = [] }
    for (const c of recentCommits) {
      if (!keywordRe.test(c.subject)) continue
      const slug = c.subject.toLowerCase().replace(/[^\w\s-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 64)
      const covered = [...eventKeys].some((k) => slug.includes(k) || k.includes(slug.slice(0, 24)))
      if (covered) continue
      findings.push({
        id: makeFindingId([lensId, 'decision-keyword-commit', c.sha]),
        lens_id: lensId, severity: 'P2',
        title: `decision-keyword commit without matching event/doc: ${c.sha.slice(0, 7)}`,
        description: `Commit ${c.sha.slice(0, 7)} ("${c.subject.slice(0, 100)}") looks like a decision` +
          ' but has no matching ledger event or decisions-doc entry.',
        source_doc: 'decisions.jsonl',
        evidence: {
          kind: 'doc_disagreement', left_doc: 'git log', right_doc: 'decisions.jsonl',
          conflict: c.subject.slice(0, 100),
        },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
        fix_hint: {
          kind: 'record_decision', target: 'decisions.jsonl',
          prompt: `Record a decision for: "${c.subject.slice(0, 100)}".`,
        },
      })
    }
  }

  return findings
}

export function makeLensGDecisions(projectRoot: string): LensFn {
  return (graph, ledger, availability, upstreamFindings) =>
    lensGDecisionsImpl(projectRoot, graph, ledger, availability, upstreamFindings)
}

