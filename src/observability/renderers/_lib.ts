import type { AdapterStatus, AvailabilityMap, Severity, Verdict } from '../engine/types.js'

export function severityBadge(s: Severity): string {
  return { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' }[s]
}

export function verdictToken(v: Verdict): string {
  return { pass: 'pass', 'degraded-pass': 'degraded-pass', blocked: 'blocked' }[v] ?? v
}

export function adapterGlyph(s: AdapterStatus): string {
  return s.status === 'available' ? '✓' : s.status === 'degraded' ? '~' : '—'
}

export function availabilityLine(a: AvailabilityMap): string {
  const ord: (keyof AvailabilityMap)[] = [
    'git', 'gh', 'pipeline_docs', 'tests', 'state', 'beads', 'mmr', 'audit_history',
  ]
  return ord.map((k) => `${k} ${adapterGlyph(a[k] as AdapterStatus)}`).join(' · ')
}
