import { describe, it, expectTypeOf } from 'vitest'
import type {
  Verdict,
  EngineOutput,
  Finding,
  Snapshot,
  ReplayEvent,
  AvailabilityMap,
  AdapterStatus,
  FindingsSummary,
  Event,
  EventType,
  ActiveAgent,
} from './types'

describe('engine types', () => {
  it('Verdict enum has exactly three values', () => {
    expectTypeOf<Verdict>().toEqualTypeOf<'pass' | 'degraded-pass' | 'blocked'>()
  })

  it('EventType enum has exactly eight values', () => {
    expectTypeOf<EventType>().toEqualTypeOf<
      | 'task_claimed'
      | 'task_completed'
      | 'decision_recorded'
      | 'blocker_hit'
      | 'blocker_resolved'
      | 'pr_opened'
      | 'progress_heartbeat'
      | 'finding_acknowledged'
    >()
  })

  it('FindingsSummary.by_severity_status has all four severities', () => {
    expectTypeOf<FindingsSummary['by_severity_status']>().toMatchTypeOf<{
      P0: { open: number; acknowledged: number; skipped: number }
      P1: { open: number; acknowledged: number; skipped: number }
      P2: { open: number; acknowledged: number; skipped: number }
      P3: { open: number; acknowledged: number; skipped: number }
    }>()
  })

  it('EngineOutput has schema_version "1.0"', () => {
    expectTypeOf<EngineOutput['schema_version']>().toEqualTypeOf<'1.0'>()
  })
})
