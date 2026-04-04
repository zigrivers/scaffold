import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { parseChannelOutput } from '../core/parser.js'
import { reconcile, evaluateGate } from '../core/reconciler.js'
import { formatJson } from '../formatters/json.js'
import { formatText } from '../formatters/text.js'
import { formatMarkdown } from '../formatters/markdown.js'
import type { Severity, OutputFormat, ChannelResult, ReconciledResults, Finding } from '../types.js'

interface ResultsArgs {
  'job-id': string
  format?: string
  raw?: boolean
}

export const resultsCommand: CommandModule<object, ResultsArgs> = {
  command: 'results <job-id>',
  describe: 'Collect and reconcile results from a completed review job',
  builder: (yargs) =>
    yargs
      .positional('job-id', {
        type: 'string',
        demandOption: true,
        describe: 'Job ID (e.g. mmr-abc123)',
      })
      .option('format', {
        type: 'string',
        describe: 'Output format',
        choices: ['json', 'text', 'markdown'],
      })
      .option('raw', {
        type: 'boolean',
        describe: 'Include raw channel output in results',
        default: false,
      }),
  handler: (args: ArgumentsCamelCase<ResultsArgs>) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    // 1. Load job
    let job
    try {
      job = store.loadJob(args['job-id'] as string)
    } catch {
      console.error(`Job not found: ${args['job-id']}`)
      process.exit(2)
    }

    // Check all channels done
    const incompleteChannels = Object.entries(job.channels)
      .filter(([, entry]) => !['completed', 'failed', 'timeout', 'auth_failed', 'skipped'].includes(entry.status))
      .map(([name]) => name)

    if (incompleteChannels.length > 0) {
      console.error(`Channels still running: ${incompleteChannels.join(', ')}`)
      console.error('Wait for completion or use `mmr status` to check progress.')
      process.exit(1)
    }

    // 2. Parse each channel's output
    const channelFindings: Record<string, Finding[]> = {}
    const perChannel: Record<string, ChannelResult> = {}
    const startTimes: number[] = []
    const endTimes: number[] = []

    for (const [name, entry] of Object.entries(job.channels)) {
      if (entry.status !== 'completed') {
        perChannel[name] = {
          status: entry.status,
          elapsed: entry.elapsed ?? '0s',
          findings: [],
          error: entry.status === 'failed' ? 'Channel failed' : undefined,
        }
        continue
      }

      // Try to load and parse channel output
      let raw: string
      let findings: Finding[] = []
      try {
        const output = store.loadChannelOutput(job.job_id, name)
        raw = JSON.stringify(output)
        const config = { output_parser: 'default' }
        // We don't have access to the channel config parser name from job metadata,
        // so we parse the raw JSON output directly
        const parsed = parseChannelOutput(raw, config.output_parser)
        findings = parsed.findings
      } catch {
        // Fall back: no parseable output
        raw = ''
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
        raw_output: args.raw ? raw : undefined,
      }
    }

    // 3. Reconcile findings
    const reconciledFindings = reconcile(channelFindings)

    // 4. Evaluate gate
    const fixThreshold = job.fix_threshold as Severity
    const gatePassed = evaluateGate(reconciledFindings, fixThreshold)

    // 5. Build ReconciledResults
    const totalElapsed = startTimes.length > 0 && endTimes.length > 0
      ? `${((Math.max(...endTimes) - Math.min(...startTimes)) / 1000).toFixed(1)}s`
      : '0s'

    const completedCount = Object.values(job.channels)
      .filter((ch) => ch.status === 'completed').length
    const partialCount = Object.values(job.channels)
      .filter((ch) => ['failed', 'timeout'].includes(ch.status)).length

    const results: ReconciledResults = {
      job_id: job.job_id,
      gate_passed: gatePassed,
      fix_threshold: fixThreshold,
      reconciled_findings: reconciledFindings,
      per_channel: perChannel,
      metadata: {
        channels_dispatched: Object.keys(job.channels).length,
        channels_completed: completedCount,
        channels_partial: partialCount,
        total_elapsed: totalElapsed,
      },
    }

    // 6. Format output
    const outputFormat = (args.format ?? job.format ?? 'json') as OutputFormat
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

    // 7. Save results + output to stdout
    store.saveResults(job.job_id, results)
    console.log(formatted)

    // Exit codes: 0 = gate passed, 1 = gate failed
    process.exit(gatePassed ? 0 : 1)
  },
}
