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
  | 'skipped'

export type JobStatus = 'dispatched' | 'running' | 'completed'

export type Agreement = 'consensus' | 'majority' | 'unique' | 'divergent'

export type Confidence = 'high' | 'medium' | 'low'

export type OutputFormat = 'json' | 'text' | 'markdown' | 'sarif'

export interface Finding {
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
}

export interface ReconciledResults {
  job_id: string
  gate_passed: boolean
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

export interface ChannelConfig {
  enabled: boolean
  command: string
  flags?: string[]
  env?: Record<string, string>
  auth: {
    check: string
    timeout: number
    failure_exit_codes: number[]
    recovery: string
  }
  prompt_wrapper?: string
  output_parser?: string
  stderr?: 'suppress' | 'capture' | 'passthrough'
  timeout?: number
}

export interface MmrConfig {
  version: number
  defaults: {
    fix_threshold: Severity
    timeout: number
    format: OutputFormat
    parallel: boolean
    job_retention_days: number
  }
  review_criteria?: string[]
  templates?: Record<string, { criteria?: string[] }>
  channels: Record<string, ChannelConfig>
}
