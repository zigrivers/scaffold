import { parseChannelOutput } from './parser.js'
import { reconcile, evaluateGate, deriveVerdict } from './reconciler.js'
import { formatJson } from '../formatters/json.js'
import { formatText } from '../formatters/text.js'
import { formatMarkdown } from '../formatters/markdown.js'
import type { JobMetadata, Severity, OutputFormat, ChannelResult, ReconciledResults, Finding, ChannelStatus } from '../types.js'
import { SEVERITY_ORDER } from '../types.js'
import type { JobStore } from './job-store.js'

export interface PipelineResult {
  results: ReconciledResults
  formatted: string
  exitCode: number
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
): PipelineResult {
  const channelFindings: Record<string, Finding[]> = {}
  const perChannel: Record<string, ChannelResult> = {}
  const startTimes: number[] = []
  const endTimes: number[] = []

  for (const [name, entry] of Object.entries(job.channels)) {
    if (entry.status !== 'completed') {
      const errorMsg = entry.status === 'failed' ? 'Channel failed'
        : entry.status === 'timeout' ? 'Channel timed out'
        : entry.status === 'auth_failed' ? 'Auth check failed'
        : entry.status === 'not_installed' ? 'CLI not found on PATH'
        : undefined
      perChannel[name] = {
        status: entry.status,
        elapsed: entry.elapsed ?? '0s',
        findings: [],
        error: errorMsg,
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
          const blockingCount = reconciledFindings.filter(f => SEVERITY_ORDER[f.severity] <= SEVERITY_ORDER[fixThreshold]).length
          return `Review blocked — ${blockingCount} finding(s) at or above ${fixThreshold}`
        })()

  const results: ReconciledResults = {
    job_id: job.job_id,
    verdict,
    fix_threshold: fixThreshold,
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
