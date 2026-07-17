import type { JournalEvent } from './types.js'

export interface MqStats {
  arrivalsLast24h: number
  landedTotal: number
  gateRuns: { green: number; red: number; timeout: number }
  medianGateSeconds: number | null
  flakesLast7d: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function computeStats(events: JournalEvent[], now: Date): MqStats {
  const t = now.getTime()
  let arrivalsLast24h = 0
  let landedTotal = 0
  const gateRuns = { green: 0, red: 0, timeout: 0 }
  const gateSeconds: number[] = []
  let flakesLast7d = 0
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
    default:
      break
    }
  }
  gateSeconds.sort((a, b) => a - b)
  const medianGateSeconds = gateSeconds.length === 0
    ? null
    : gateSeconds.length % 2 === 1
      ? gateSeconds[(gateSeconds.length - 1) / 2]
      : Math.round(
        (gateSeconds[gateSeconds.length / 2 - 1] + gateSeconds[gateSeconds.length / 2]) / 2,
      )
  return { arrivalsLast24h, landedTotal, gateRuns, medianGateSeconds, flakesLast7d }
}
