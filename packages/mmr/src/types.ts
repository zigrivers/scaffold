import type { OutputParserConfig } from './config/schema.js'

export type Severity = 'P0' | 'P1' | 'P2' | 'P3'

export const SEVERITY_ORDER: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

export type ChannelStatus =
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'timeout'
  | 'failed'
  | 'auth_failed'
  | 'not_installed'
  | 'skipped'

/** Intentional subset of ChannelStatus — represents aggregate job lifecycle, not individual channel states */
export type JobStatus = 'dispatched' | 'running' | 'completed'

export type Verdict = 'pass' | 'degraded-pass' | 'blocked' | 'needs-user-decision'

export type Agreement = 'consensus' | 'majority' | 'unique'

export type Confidence = 'high' | 'medium' | 'low'

export type OutputFormat = 'json' | 'text' | 'markdown'

export interface ReviewControls {
  max_rounds?: number
  accept_new_acks: boolean
  trust_project_acks: boolean
  trust_project_config: boolean
  config_base_ref?: string
}

export const TERMINAL_STATUSES: ReadonlySet<ChannelStatus> = new Set([
  'completed', 'timeout', 'failed', 'auth_failed', 'not_installed', 'skipped',
])

export interface Finding {
  id?: string
  category?: string
  severity: Severity
  location: string
  description: string
  suggestion: string
}

export interface ReconciledFinding extends Finding {
  confidence: Confidence
  sources: string[]
  agreement: Agreement
  /** Stable content-hashed identity (T2-A, §5 decision 2). */
  finding_key?: string
  /** Char-5-gram set of normalized description for cross-round fuzzy match. */
  description_shingle?: string[]
  /** True when this finding has been silenced via `mmr ack` (T2-D). */
  acknowledged?: boolean
  ack_reason?: string
  /** How the ack was resolved: exact key match or location-anchored Jaccard fallback. */
  ack_match?: 'exact' | 'fuzzy'
  /** Reserved for T2-C (v3.31): finding was auto-downgraded after repeat threshold. */
  auto_downgraded?: boolean
  /** Reserved for T2-C (v3.31): finding was auto-suppressed after repeat threshold. */
  auto_suppressed?: boolean
  /** Reserved for T2-C: how the cross-round repeat was matched. */
  repeat_match?: 'exact' | 'fuzzy'
}

export interface ChannelResult {
  status: ChannelStatus
  elapsed: string
  findings: Finding[]
  raw_output?: string
  error?: string
}

export interface JobMetadata {
  job_id: string
  status: JobStatus
  fix_threshold: Severity
  format: OutputFormat
  created_at: string
  channels: Record<string, ChannelJobEntry>
  /** Session linkage (T2-B). Optional; absent in legacy jobs. */
  session_id?: string
  /** One-based round counter within a session (T2-B). */
  round?: number
  /** Parsed review loop/security controls used for this invocation. */
  review_controls?: ReviewControls
}

export interface ChannelJobEntry {
  status: ChannelStatus
  auth: 'ok' | 'failed' | 'skipped'
  recovery?: string
  pid?: number
  started_at?: string
  completed_at?: string
  elapsed?: string
  findings_count?: number
  output_parser?: string | OutputParserConfig
}

export interface ReconciledResults {
  job_id: string
  verdict: Verdict
  fix_threshold: Severity
  advisory_count: number
  approved: boolean
  summary: string
  reconciled_findings: ReconciledFinding[]
  per_channel: Record<string, ChannelResult>
  metadata: {
    channels_dispatched: number
    channels_completed: number
    channels_partial: number
    total_elapsed: string
  }
  /** Trust mode under which this review ran (§5 decision 1). */
  trust_mode?: 'base-ref' | 'untrusted-head' | 'non-git'
  /** Ack-file paths added/modified by the diff under review. */
  proposed_acks?: string[]
  /** True when `.mmr.yaml` was added/modified by the diff under review. */
  proposed_config_change?: boolean
}

// ChannelConfig and MmrConfig are derived from Zod schemas to prevent type drift.
// Import from config/schema.ts: MmrConfigParsed, ChannelConfigParsed
export type { MmrConfigParsed as MmrConfig, ChannelConfigParsed as ChannelConfig } from './config/schema.js'
