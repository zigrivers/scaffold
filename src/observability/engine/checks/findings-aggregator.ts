import type { Finding, FindingsSummary, Event, Severity } from '../types.js'
import { severityRank } from '../types.js'

interface AckEntry { status: 'acknowledged' | 'open'; ts: string; note?: string }

function buildAckMap(events: Event[]): Map<string, AckEntry> {
  const out = new Map<string, AckEntry>()
  for (const e of events) {
    if (e.type !== 'finding_acknowledged') continue
    const p = e.payload as { finding_id: string; status: 'acknowledged' | 'open'; note?: string }
    const prev = out.get(p.finding_id)
    if (!prev || prev.ts < e.ts) out.set(p.finding_id, { status: p.status, ts: e.ts, note: p.note })
  }
  return out
}

function emptyByStatus(): { open: number; acknowledged: number; skipped: number } {
  return { open: 0, acknowledged: 0, skipped: 0 }
}

export function aggregate(
  rawFindings: Finding[], events: Event[], fixThreshold: Severity,
): { findings: Finding[]; summary: FindingsSummary } {
  const acks = buildAckMap(events)

  const findings = rawFindings.map((f) => {
    if (f.status === 'skipped') return f
    const ack = acks.get(f.id)
    if (!ack) return { ...f }
    return { ...f, status: ack.status, ack_note: ack.note }
  })

  const by_severity: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  const by_severity_status: FindingsSummary['by_severity_status'] = {
    P0: emptyByStatus(), P1: emptyByStatus(), P2: emptyByStatus(), P3: emptyByStatus(),
  }
  let blocking = 0
  let acknowledged = 0
  const skippedLensIds = new Set<string>()

  for (const f of findings) {
    by_severity[f.severity]++
    by_severity_status[f.severity][f.status]++
    if (f.status === 'open' && severityRank(f.severity) <= severityRank(fixThreshold)) blocking++
    if (f.status === 'skipped') skippedLensIds.add(f.lens_id)
    // Count acknowledged only when driven by a ledger event (not pre-existing status)
    const ack = acks.get(f.id)
    if (ack && ack.status === 'acknowledged' && f.status === 'acknowledged') acknowledged++
  }

  const summary: FindingsSummary = {
    total: findings.length,
    by_severity,
    by_severity_status,
    blocking,
    acknowledged,
    skipped_lenses: skippedLensIds.size,
  }
  return { findings, summary }
}
