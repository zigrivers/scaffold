import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { normalizeExternalInput, readInput } from '../core/normalize-input.js'
import { runResultsPipeline } from '../core/results-pipeline.js'
import { TERMINAL_STATUSES } from '../types.js'
import type { OutputFormat } from '../types.js'

interface ReconcileArgs {
  'job-id': string
  channel: string
  input: string
  format?: string
}

export const reconcileCommand: CommandModule<object, ReconcileArgs> = {
  command: 'reconcile <job-id>',
  describe: 'Inject external findings into a job and re-reconcile',
  builder: (yargs) =>
    yargs
      .positional('job-id', {
        type: 'string',
        demandOption: true,
        describe: 'Job ID (e.g. mmr-abc123)',
      })
      .option('channel', {
        type: 'string',
        demandOption: true,
        describe: 'Name for the external channel (e.g. superpowers). Stored in lowercase.',
      })
      .option('input', {
        type: 'string',
        demandOption: true,
        describe: 'Findings: file path, - for stdin, or inline JSON',
      })
      .option('format', {
        type: 'string',
        describe: 'Output format',
        choices: ['json', 'text', 'markdown'],
      }),
  handler: (args: ArgumentsCamelCase<ReconcileArgs>) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    // 1. Load job
    let job
    try {
      job = store.loadJob(args['job-id'] as string)
    } catch {
      console.error(`Job not found: ${args['job-id']}`)
      process.exit(5)
    }

    // 2. Verify all channels in terminal state
    const incompleteChannels = Object.entries(job.channels)
      .filter(([, entry]) => !TERMINAL_STATUSES.has(entry.status))
      .map(([name]) => name)

    if (incompleteChannels.length > 0) {
      console.error(`Channels still running: ${incompleteChannels.join(', ')}`)
      console.error('Wait for completion or use `mmr status` to check progress.')
      process.exit(1)
    }

    // 3. Validate raw channel name, then lowercase for case-insensitive safety
    const rawChannel = args.channel as string
    if (!/^[a-zA-Z0-9._-]+$/.test(rawChannel)) {
      console.error(`Invalid channel name: "${rawChannel}"`)
      process.exit(5)
    }
    const channelName = rawChannel.toLowerCase()

    const existingLower = Object.keys(job.channels).map(k => k.toLowerCase())
    if (existingLower.includes(channelName)) {
      console.error(`Channel '${channelName}' already exists in job ${job.job_id}`)
      process.exit(5)
    }

    // 4. Read input
    let rawInput: string
    try {
      rawInput = readInput(args.input as string)
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(5)
    }

    // 5. Normalize and validate (fully in memory before any writes)
    let normalized
    try {
      normalized = normalizeExternalInput(rawInput)
    } catch (err) {
      console.error(`Invalid input: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(5)
    }

    // 6. Commit sequence (only after validation)
    // Synthetic timestamps — injected channel has no actual runtime
    const now = new Date().toISOString()
    store.registerChannel(job.job_id, channelName, { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, channelName, normalized)
    store.updateChannel(job.job_id, channelName, {
      status: 'completed',
      started_at: now,
      completed_at: now,
    })

    // 7. Re-run pipeline
    const updatedJob = store.loadJob(job.job_id)
    const outputFormat = (args.format ?? job.format ?? 'json') as OutputFormat
    const { results, formatted, exitCode } = runResultsPipeline(store, updatedJob, outputFormat)

    // 8. Save and output
    store.saveResults(job.job_id, results)
    console.log(formatted)
    process.exit(exitCode)
  },
}
