import { parseChannelOutput } from './parser.js'
import { reconcile, evaluateGate, deriveVerdict } from './reconciler.js'
import { formatJson } from '../formatters/json.js'
import { formatText } from '../formatters/text.js'
import { formatMarkdown } from '../formatters/markdown.js'
import type {
  JobMetadata,
  Severity,
  OutputFormat,
  ChannelResult,
  ReconciledResults,
  ReconciledFinding,
  Finding,
  ChannelStatus,
} from '../types.js'
import { SEVERITY_ORDER } from '../types.js'
import type { JobStore } from './job-store.js'
import type { AckStore } from './ack-store.js'
import { normalizeLocationForKey } from './stable-id.js'

export interface PipelineResult {
  results: ReconciledResults
  formatted: string
  exitCode: number
}

export interface PipelineOptions {
  ackStore?: AckStore
}

export function isBlockingFinding(finding: ReconciledFinding, threshold: Severity): boolean {
  return finding.acknowledged !== true &&
    SEVERITY_ORDER[finding.severity] <= SEVERITY_ORDER[threshold]
}

export function isAdvisoryFinding(finding: ReconciledFinding, threshold: Severity): boolean {
  return finding.acknowledged === true ||
    SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[threshold]
}

/** Maximum chars of channel-log detail to embed in the per-channel error
 *  field. Keeps JSON output readable while preserving the head of any
 *  stderr / spawn-error message captured by the dispatcher. */
const ERROR_DETAIL_MAX_CHARS = 1_000

/**
 * Append the head of the channel's saved log to the base error message
 * when one exists. Quietly returns the base message if no log was
 * written or if reading it throws — the diagnostic should never mask
 * the underlying status.
 */
function appendLogDetail(
  baseMsg: string,
  store: JobStore,
  jobId: string,
  channel: string,
): string {
  let log: string | null = null
  try {
    log = store.loadChannelLog(jobId, channel)
  } catch {
    return baseMsg
  }
  if (!log) return baseMsg
  const trimmed = log.trim()
  if (trimmed.length === 0) return baseMsg
  const detail = trimmed.length > ERROR_DETAIL_MAX_CHARS
    ? `${trimmed.slice(0, ERROR_DETAIL_MAX_CHARS)}…`
    : trimmed
  return `${baseMsg}: ${detail}`
}

/**
 * Run the full results pipeline: parse channel outputs, reconcile findings,
 * derive verdict, format output.
 */
export function runResultsPipeline(
  store: JobStore,
  job: JobMetadata,
  outputFormat: OutputFormat,
  includeRaw = false,
  opts: PipelineOptions = {},
): PipelineResult {
  const channelFindings: Record<string, Finding[]> = {}
  const perChannel: Record<string, ChannelResult> = {}
  const startTimes: number[] = []
  const endTimes: number[] = []

  for (const [name, entry] of Object.entries(job.channels)) {
    if (entry.status !== 'completed') {
      const baseMsg = entry.status === 'failed' ? 'Channel failed'
        : entry.status === 'timeout' ? 'Channel timed out'
          : entry.status === 'auth_failed' ? 'Auth check failed'
            : entry.status === 'not_installed' ? 'CLI not found on PATH'
              : undefined
      // Pull captured stderr / spawn-error detail from the channel log
      // so callers see the actual failure reason (wrong flag, missing
      // binary path, exit code, etc.) instead of just "Channel failed".
      const errorMsg = baseMsg !== undefined
        ? appendLogDetail(baseMsg, store, job.job_id, name)
        : undefined
      perChannel[name] = {
        status: entry.status,
        elapsed: entry.elapsed ?? '0s',
        findings: [],
        error: errorMsg,
        recovery: entry.recovery,
      }
      continue
    }

    let raw = ''
    let findings: Finding[] = []
    try {
      const stored = store.loadChannelOutput(job.job_id, name)
      // saveChannelOutput writes JSON.stringify(output), so JSON.parse
      // recovers the original value (string or object).
      try {
        const decoded = JSON.parse(stored)
        raw = typeof decoded === 'string' ? decoded : stored
      } catch {
        raw = stored
      }
      const parserName = entry.output_parser ?? 'default'
      const parsed = parseChannelOutput(raw, parserName)
      findings = parsed.findings
    } catch {
      // Fall back: no parseable output
    }

    channelFindings[name] = findings

    const elapsed = entry.started_at && entry.completed_at
      ? `${((new Date(entry.completed_at).getTime() - new Date(entry.started_at).getTime()) / 1000).toFixed(1)}s`
      : '0s'

    if (entry.started_at) startTimes.push(new Date(entry.started_at).getTime())
    if (entry.completed_at) endTimes.push(new Date(entry.completed_at).getTime())

    perChannel[name] = {
      status: entry.status,
      elapsed,
      findings,
      raw_output: includeRaw ? raw : undefined,
      error: raw === '' ? 'Failed to load or parse channel output' : undefined,
    }
  }

  const reconciledFindings = reconcile(channelFindings)

  // Apply ack lookup (T2-D): stamp acknowledged/ack_match/ack_reason on matched
  // findings, preserving agreement/confidence/sources. isBlockingFinding and
  // isAdvisoryFinding already treat acknowledged findings as advisory-only, so
  // the gate (evaluateGate) skips them when computing the verdict.
  if (opts.ackStore) {
    try {
      for (const f of reconciledFindings) {
        // Only finding_key is required: AckStore.lookup's exact path is
        // key-only; the fuzzy fallback early-returns on an empty shingle.
        if (f.finding_key === undefined) continue
        const match = opts.ackStore.lookup({
          finding_key: f.finding_key,
          normalized_location: normalizeLocationForKey(f.location),
          shingle: f.description_shingle ?? [],
        })
        if (match) {
          f.acknowledged = true
          f.ack_match = match.match
          if (match.record.reason !== undefined) f.ack_reason = match.record.reason
        }
      }
    } catch {
      // Fail safe: if the ack store can't be read (e.g. a poisoned or
      // symlinked .mmr/acks tree makes lookup throw), apply no suppression.
      // Findings stay blocking, which is the safe direction for a gate.
    }
  }

  const fixThreshold = job.fix_threshold as Severity
  const completedChannels = Object.values(job.channels)
    .filter((ch) => ch.status === 'completed').length
  const gatePassed = completedChannels > 0
    ? evaluateGate(reconciledFindings, fixThreshold)
    : false

  const channelStatuses = Object.fromEntries(
    Object.entries(job.channels).map(([n, ch]) => [n, ch.status]),
  ) as Record<string, ChannelStatus>
  const verdict = deriveVerdict(gatePassed, channelStatuses)

  const totalElapsed = startTimes.length > 0 && endTimes.length > 0
    ? `${((Math.max(...endTimes) - Math.min(...startTimes)) / 1000).toFixed(1)}s`
    : '0s'

  const approved = verdict === 'pass' || verdict === 'degraded-pass'
  const summary = approved
    ? `Review passed${verdict === 'degraded-pass' ? ' (degraded — some channels unavailable)' : ''}`
    : verdict === 'needs-user-decision'
      ? 'No channels completed — manual review needed'
      : (() => {
        const blockingCount = reconciledFindings.filter((f) => isBlockingFinding(f, fixThreshold)).length
        return `Review blocked — ${blockingCount} finding(s) at or above ${fixThreshold}`
      })()

  const advisoryCount = reconciledFindings.filter((f) => isAdvisoryFinding(f, fixThreshold)).length

  const results: ReconciledResults = {
    job_id: job.job_id,
    verdict,
    fix_threshold: fixThreshold,
    advisory_count: advisoryCount,
    approved,
    summary,
    reconciled_findings: reconciledFindings,
    per_channel: perChannel,
    metadata: {
      channels_dispatched: Object.keys(job.channels).length,
      channels_completed: completedChannels,
      channels_partial: Object.values(job.channels)
        .filter((ch) => ['failed', 'timeout'].includes(ch.status)).length,
      total_elapsed: totalElapsed,
    },
  }

  // Re-surface trust context persisted on the job at review time (§5 decision
  // 1), so review --sync, `mmr results`, and `mmr reconcile` all carry it.
  if (job.trust_mode !== undefined) results.trust_mode = job.trust_mode
  if (job.proposed_acks !== undefined) results.proposed_acks = job.proposed_acks
  if (job.proposed_config_change !== undefined) results.proposed_config_change = job.proposed_config_change

  let formatted: string
  switch (outputFormat) {
  case 'text':
    formatted = formatText(results)
    break
  case 'markdown':
    formatted = formatMarkdown(results)
    break
  case 'json':
  default:
    formatted = formatJson(results)
    break
  }

  const exitCode = verdict === 'pass' || verdict === 'degraded-pass' ? 0
    : verdict === 'needs-user-decision' ? 3
      : 2

  return { results, formatted, exitCode }
}
