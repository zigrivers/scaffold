import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { minimatch } from 'minimatch'
import type { Finding, Event } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'G-decisions'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

function decisionEventCoversFile(events: Event[], filePath: string): boolean {
  for (const e of events) {
    if (e.type !== 'decision_recorded') continue
    const { affects } = e.payload as { affects: string[] }
    if (affects.some((g) => minimatch(filePath, g))) return true
  }
  return false
}

function loadKeywords(cwd: string): string[] {
  const config = loadObservabilityConfig(cwd)
  const overridePath = (config.lenses['G-decisions'] as { keywords_file?: string } | undefined)?.keywords_file
  const bundledPath = join(dirname(fileURLToPath(import.meta.url)), 'data/decision-keywords.txt')
  const candidates = [
    overridePath ? join(cwd, overridePath) : null,
    bundledPath,
  ].filter((p): p is string => Boolean(p))
  for (const p of candidates) {
    try { return readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) } catch { /* try next */ }
  }
  return ['decided', 'chose', 'going with', 'will use']
}

export const lensGDecisions: LensFn = async (graph, ledger, _availability, upstreamFindings) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) Ledger events without doc entries
  const docKeys = new Set(graph.decisions.map((d) => d.key))
  const eventsByKey = new Map<string, Event>()
  for (const e of ledger.events) {
    if (e.type !== 'decision_recorded') continue
    const key = (e.payload as { key: string }).key
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
      fix_hint: { kind: 'record_decision', target: 'decisions.jsonl', prompt: `Record a decision for the unsanctioned dependency in ${filePath}.` },
    })
  }

  void loadKeywords(graph.cwd)  // referenced for future use; commit-scan deferred to Plan 5+

  return findings
}
