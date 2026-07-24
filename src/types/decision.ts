import type { DepthLevel, StepStatus } from './enums.js'
import type { VerificationLevel } from './state.js'

export interface DecisionEntry {
  id: string
  prompt: string
  decision: string
  at: string
  completed_by: string
  step_completed: boolean
  category?: string
  tags?: string[]
  review_status?: 'pending' | 'approved' | 'rejected'
  depth?: DepthLevel
}

/**
 * D3 verification audit record — appended to .scaffold/decisions.jsonl by
 * `scaffold adopt --apply`. Append-only, pure audit, no runtime readers; the
 * decisions reader skips any line carrying an `event` field. Schema is pinned
 * by the R1 design (Global Constraints).
 */
export interface VerificationAuditRecord {
  ts: string
  actor: string
  event: 'verification-reversal' | 'partial-artifacts'
  step_slug: string
  from_status: StepStatus | null
  from_verification: VerificationLevel | null
  to_status: StepStatus
  to_verification: VerificationLevel
  evidence: {
    outputs_present: string[]
    outputs_missing: string[]
    detect_checks: Array<{ kind: 'path' | 'cmd'; target: string; passed: boolean }>
  }
  reason: string
  plan_key: string
}
