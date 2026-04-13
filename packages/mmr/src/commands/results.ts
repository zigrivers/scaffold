import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { runResultsPipeline } from '../core/results-pipeline.js'
import { TERMINAL_STATUSES } from '../types.js'
import type { OutputFormat } from '../types.js'

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
      process.exit(5)
    }

    // Check all channels done
    const incompleteChannels = Object.entries(job.channels)
      .filter(([, entry]) => !TERMINAL_STATUSES.has(entry.status))
      .map(([name]) => name)

    if (incompleteChannels.length > 0) {
      console.error(`Channels still running: ${incompleteChannels.join(', ')}`)
      console.error('Wait for completion or use `mmr status` to check progress.')
      process.exit(1)
    }

    // 2. Run results pipeline (parse -> reconcile -> format)
    const outputFormat = (args.format ?? job.format ?? 'json') as OutputFormat
    const { results, formatted, exitCode } = runResultsPipeline(store, job, outputFormat, args.raw)
    store.saveResults(job.job_id, results)
    console.log(formatted)
    process.exit(exitCode)
  },
}
