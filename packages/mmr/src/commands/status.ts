import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { TERMINAL_STATUSES } from '../types.js'

interface StatusArgs {
  'job-id': string
}

export const statusCommand: CommandModule<object, StatusArgs> = {
  command: 'status <job-id>',
  describe: 'Check the status of a review job',
  builder: (yargs) =>
    yargs.positional('job-id', {
      type: 'string',
      demandOption: true,
      describe: 'Job ID (e.g. mmr-abc123)',
    }),
  handler: (args: ArgumentsCamelCase<StatusArgs>) => {
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)

    let job
    try {
      job = store.loadJob(args['job-id'] as string)
    } catch {
      console.error(`Job not found: ${args['job-id']}`)
      process.exit(2)
    }

    const channelStatuses: Record<string, { status: string; elapsed?: string }> = {}
    let allComplete = true
    let anyFailed = false

    for (const [name, entry] of Object.entries(job.channels)) {
      const elapsed = entry.started_at && entry.completed_at
        ? `${((new Date(entry.completed_at).getTime() - new Date(entry.started_at).getTime()) / 1000).toFixed(1)}s`
        : entry.started_at
          ? 'running'
          : undefined

      channelStatuses[name] = { status: entry.status, elapsed }

      if (!TERMINAL_STATUSES.has(entry.status)) {
        allComplete = false
      }
      if (['failed', 'timeout', 'auth_failed', 'not_installed'].includes(entry.status)) {
        anyFailed = true
      }
    }

    const output = {
      job_id: job.job_id,
      status: job.status,
      channels: channelStatuses,
    }

    console.log(JSON.stringify(output, null, 2))

    // Exit codes: 0 = all complete, 1 = still running, 2 = at least one failed
    if (!allComplete) {
      process.exit(1)
    }
    if (anyFailed) {
      process.exit(2)
    }
    process.exit(0)
  },
}
