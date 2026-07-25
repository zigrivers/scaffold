import type { JournalEvent } from './types.js'

export interface MqStats {
  arrivalsLast24h: number
  landedTotal: number
  gateRuns: { green: number; red: number; timeout: number }
  medianGateSeconds: number | null
  flakesLast7d: number
  /** D12: gate_cached events — batches that skipped the gate entirely. */
  gateCacheHits: number
  gateCacheSecondsSaved: number
  /** D12/D14: poller full-gate runs, split by coverage instrumentation so the
   *  TIA recording overhead stays visible (spec §11). */
  fullGatePlain: { runs: number; medianSeconds: number | null }
  fullGateInstrumented: { runs: number; medianSeconds: number | null }
  /** D14: the most recent coverage-map recording, or null when none exists. */
  tiaLastRecorded: { at: string; tests: number; files: number } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  return sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
}

export function computeStats(events: JournalEvent[], now: Date): MqStats {
  const t = now.getTime()
  let arrivalsLast24h = 0
  let landedTotal = 0
  const gateRuns = { green: 0, red: 0, timeout: 0 }
  const gateSeconds: number[] = []
  let flakesLast7d = 0
  let gateCacheHits = 0
  let gateCacheSecondsSaved = 0
  const fullPlain: number[] = []
  const fullInstrumented: number[] = []
  let tiaLastRecorded: MqStats['tiaLastRecorded'] = null
  for (const e of events) {
    switch (e.type) {
    case 'enqueued':
      if (Date.parse(e.at) >= t - DAY_MS) arrivalsLast24h += 1
      break
    case 'pr_state':
      if (e.state === 'LANDED') landedTotal += 1
      break
    case 'gate_metrics':
      gateRuns[e.result] += 1
      gateSeconds.push(e.seconds)
      break
    case 'flake':
      if (Date.parse(e.at) >= t - 7 * DAY_MS) flakesLast7d += 1
      break
    case 'gate_cached':
      gateCacheHits += 1
      gateCacheSecondsSaved += e.savedSeconds
      break
    case 'full_gate_recorded':
      (e.instrumented ? fullInstrumented : fullPlain).push(e.seconds)
      break
    case 'tia_recorded':
      tiaLastRecorded = { at: e.at, tests: e.tests, files: e.files }
      break
    default:
      break
    }
  }
  gateSeconds.sort((a, b) => a - b)
  fullPlain.sort((a, b) => a - b)
  fullInstrumented.sort((a, b) => a - b)
  return {
    arrivalsLast24h,
    landedTotal,
    gateRuns,
    medianGateSeconds: median(gateSeconds),
    flakesLast7d,
    gateCacheHits,
    gateCacheSecondsSaved,
    fullGatePlain: { runs: fullPlain.length, medianSeconds: median(fullPlain) },
    fullGateInstrumented: { runs: fullInstrumented.length, medianSeconds: median(fullInstrumented) },
    tiaLastRecorded,
  }
}
