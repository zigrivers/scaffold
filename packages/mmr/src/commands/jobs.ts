import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../core/job-store.js'
import { loadConfig } from '../config/loader.js'

interface JobsArgs {
  action: string
}

function jobsList(): void {
  const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
  const store = new JobStore(jobsDir)
  const jobs = store.listJobs()

  const output = jobs.map((job) => ({
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    channels: Object.keys(job.channels).length,
  }))

  console.log(JSON.stringify(output, null, 2))
}

function jobsPrune(): void {
  const config = loadConfig({ projectRoot: process.cwd() })
  const retentionDays = config.defaults.job_retention_days

  const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
  const store = new JobStore(jobsDir)
  const pruned = store.pruneJobs(retentionDays)

  console.log(JSON.stringify({ pruned, retention_days: retentionDays }))
}

export const jobsCommand: CommandModule<object, JobsArgs> = {
  command: 'jobs <action>',
  describe: 'Manage review jobs',
  builder: (yargs) =>
    yargs.positional('action', {
      type: 'string',
      demandOption: true,
      describe: 'Jobs action',
      choices: ['list', 'prune'],
    }),
  handler: (args: ArgumentsCamelCase<JobsArgs>) => {
    switch (args.action) {
    case 'list':
      jobsList()
      break
    case 'prune':
      jobsPrune()
      break
    default:
      console.error(`Unknown jobs action: ${args.action}`)
      process.exit(1)
    }
  },
}
