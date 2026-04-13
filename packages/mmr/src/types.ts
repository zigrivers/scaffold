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

export type JobStatus = 'dispatched' | 'running' | 'completed'

export type Verdict = 'pass' | 'degraded-pass' | 'blocked' | 'needs-user-decision'

export type Agreement = 'consensus' | 'majority' | 'unique'

export type Confidence = 'high' | 'medium' | 'low'

export type OutputFormat = 'json' | 'text' | 'markdown' | 'sarif'

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
  output_parser?: string
}

export interface ReconciledResults {
  job_id: string
  verdict: Verdict
  fix_threshold: Severity
  reconciled_findings: ReconciledFinding[]
  per_channel: Record<string, ChannelResult>
  metadata: {
    channels_dispatched: number
    channels_completed: number
    channels_partial: number
    total_elapsed: string
  }
}

// ChannelConfig and MmrConfig are derived from Zod schemas to prevent type drift.
// Import from config/schema.ts: MmrConfigParsed, ChannelConfigParsed
export type { MmrConfigParsed as MmrConfig, ChannelConfigParsed as ChannelConfig } from './config/schema.js'
