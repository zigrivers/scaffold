import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../config/loader.js'
import { JobStore } from '../core/job-store.js'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { assemblePrompt } from '../core/prompt.js'
import { dispatchChannel } from '../core/dispatcher.js'
import { runResultsPipeline } from '../core/results-pipeline.js'
import { getCompensatingChannels, dispatchCompensatingPasses } from '../core/compensator.js'
import type { Severity, OutputFormat, ChannelStatus } from '../types.js'

interface ReviewArgs {
  diff?: string
  pr?: number
  staged?: boolean
  base?: string
  head?: string
  focus?: string
  'fix-threshold'?: string
  channels?: string[]
  timeout?: number
  template?: string
  format?: string
  sync?: boolean
}

/** 10MB buffer for large diffs (default is ~1MB which can throw) */
const MAX_DIFF_BUFFER = 10 * 1024 * 1024

/**
 * Resolve diff content from the various input modes.
 * Priority: --diff file/stdin > --pr > --staged > --base/--head > default (unstaged)
 */
function resolveDiff(args: ReviewArgs): string {
  if (args.diff !== undefined) {
    if (args.diff === '-') {
      return fs.readFileSync(0, 'utf-8')
    }
    return fs.readFileSync(args.diff, 'utf-8')
  }

  if (args.pr !== undefined) {
    return execFileSync('gh', ['pr', 'diff', String(args.pr)], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
  }

  if (args.staged) {
    return execFileSync('git', ['diff', '--cached'], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
  }

  if (args.base && args.head) {
    return execFileSync('git', ['diff', `${args.base}...${args.head}`], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
  }

  if (args.base) {
    return execFileSync('git', ['diff', `${args.base}...HEAD`], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
  }

  // Default: unstaged changes
  return execFileSync('git', ['diff'], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
}

export const reviewCommand: CommandModule<object, ReviewArgs> = {
  command: 'review',
  describe: 'Dispatch a multi-model code review',
  builder: (yargs) =>
    yargs
      .option('diff', {
        type: 'string',
        describe: 'Path to diff file, or - for stdin',
      })
      .option('pr', {
        type: 'number',
        describe: 'GitHub PR number (uses gh pr diff)',
      })
      .option('staged', {
        type: 'boolean',
        describe: 'Review staged changes (git diff --cached)',
      })
      .option('base', {
        type: 'string',
        describe: 'Base ref for git diff (e.g. main)',
      })
      .option('head', {
        type: 'string',
        describe: 'Head ref for git diff (default: HEAD)',
      })
      .option('focus', {
        type: 'string',
        describe: 'Free-text focus areas for this review',
      })
      .option('fix-threshold', {
        type: 'string',
        describe: 'Severity gate threshold (P0-P3)',
        choices: ['P0', 'P1', 'P2', 'P3'],
      })
      .option('channels', {
        type: 'array',
        string: true,
        describe: 'Channels to dispatch (overrides config)',
      })
      .option('timeout', {
        type: 'number',
        describe: 'Per-channel timeout in seconds',
      })
      .option('template', {
        type: 'string',
        describe: 'Named template from config',
      })
      .option('format', {
        type: 'string',
        describe: 'Output format',
        choices: ['json', 'text', 'markdown'],
      })
      .option('sync', {
        type: 'boolean',
        describe: 'Run full review pipeline: dispatch, parse, reconcile, and output results with verdict',
        default: false,
      }),
  handler: async (args: ArgumentsCamelCase<ReviewArgs>) => {
    // 1. Load config with CLI overrides
    const config = loadConfig({
      projectRoot: process.cwd(),
      cliOverrides: {
        fix_threshold: args['fix-threshold'] as string | undefined,
        timeout: args.timeout,
        format: args.format,
      },
    })

    // 2. Resolve diff input
    const diff = resolveDiff(args)
    if (!diff.trim()) {
      console.error('No diff content found. Provide --diff, --pr, --staged, or --base/--head.')
      process.exit(1)
    }

    // 3. Determine enabled channels
    const channelNames = args.channels ?? Object.entries(config.channels)
      .filter(([, ch]) => ch.enabled)
      .map(([name]) => name)

    if (channelNames.length === 0) {
      console.error('No channels enabled. Configure channels or pass --channels.')
      process.exit(1)
    }

    // 4. Auth-check each channel
    const validChannels: string[] = []
    const authResults: Record<string, { status: string; recovery?: string }> = {}

    for (const name of channelNames) {
      const chConfig = config.channels[name]
      if (!chConfig) {
        authResults[name] = { status: 'skipped', recovery: `Channel "${name}" not found in config` }
        continue
      }

      const cmd = chConfig.command.split(' ')[0]
      const installed = await checkInstalled(cmd)
      if (!installed) {
        authResults[name] = { status: 'not_installed', recovery: `${cmd} not found on PATH` }
        continue
      }

      const authResult = await checkAuth(chConfig)
      authResults[name] = authResult
      if (authResult.status === 'ok') {
        validChannels.push(name)
      }
    }

    if (validChannels.length === 0) {
      console.error('No channels passed auth check:')
      for (const [name, result] of Object.entries(authResults)) {
        console.error(`  ${name}: ${result.status}${result.recovery ? ` — ${result.recovery}` : ''}`)
      }
      process.exit(1)
    }

    // 5. Create job
    const jobsDir = path.join(os.homedir(), '.mmr', 'jobs')
    const store = new JobStore(jobsDir)
    const job = store.createJob({
      fix_threshold: config.defaults.fix_threshold as Severity,
      format: config.defaults.format as OutputFormat,
      channels: channelNames,
    })

    // Record skipped/auth-failed channels in job metadata
    for (const name of channelNames) {
      if (!validChannels.includes(name)) {
        const authStatus = authResults[name]
        const channelStatus: ChannelStatus = authStatus?.status === 'not_installed' ? 'not_installed'
          : authStatus?.status === 'failed' ? 'auth_failed'
          : authStatus?.status === 'timeout' ? 'timeout'
          : 'skipped'
        store.updateChannel(job.job_id, name, {
          status: channelStatus,
          auth: channelStatus === 'skipped' ? 'skipped' : 'failed',
          recovery: authStatus?.recovery,
        })
      }
    }

    // 6. Assemble prompt
    const templateCriteria = args.template && config.templates?.[args.template]
      ? config.templates[args.template].criteria
      : undefined

    const prompt = assemblePrompt({
      diff,
      reviewCriteria: config.review_criteria,
      templateCriteria,
      focus: args.focus,
    })

    // 7. Save prompt + diff to job store
    store.savePrompt(job.job_id, prompt)
    store.saveDiff(job.job_id, diff)

    // 8. Dispatch channels
    if (config.defaults.parallel) {
      const dispatches: Promise<void>[] = []
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        dispatches.push(
          dispatchChannel(store, job.job_id, name, {
            command: chConfig.command,
            prompt,
            flags: chConfig.flags,
            env: chConfig.env,
            timeout: chConfig.timeout ?? config.defaults.timeout,
            stderr: chConfig.stderr === 'passthrough' ? 'passthrough'
              : chConfig.stderr === 'suppress' ? 'suppress'
              : 'capture',
          }),
        )
      }
      await Promise.all(dispatches)
    } else {
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        await dispatchChannel(store, job.job_id, name, {
          command: chConfig.command,
          prompt,
          flags: chConfig.flags,
          env: chConfig.env,
          timeout: chConfig.timeout ?? config.defaults.timeout,
          stderr: chConfig.stderr === 'passthrough' ? 'passthrough'
            : chConfig.stderr === 'suppress' ? 'suppress'
            : 'capture',
        })
      }
    }

    // 8b. Dispatch compensating passes for unavailable channels
    const completedJob1 = store.loadJob(job.job_id)
    const channelStatuses = Object.fromEntries(
      Object.entries(completedJob1.channels).map(([n, ch]) => [n, ch.status]),
    ) as Record<string, ChannelStatus>
    const compensating = getCompensatingChannels(channelStatuses)

    if (compensating.length > 0) {
      // Register compensating channels in job.json so loadJob can discover them
      for (const comp of compensating) {
        store.registerChannel(job.job_id, comp.compensatingName, {
          status: 'dispatched',
          auth: 'ok',
          output_parser: 'default',
        })
      }
      await dispatchCompensatingPasses(store, job.job_id, prompt, compensating, config.defaults.timeout)
    }

    // 9. Output results
    if (args.sync) {
      // --sync: full results pipeline (dispatch -> parse -> reconcile -> format -> exit)
      const completedJob = store.loadJob(job.job_id)
      const outputFormat = (args.format ?? completedJob.format ?? 'json') as OutputFormat
      const { results, formatted, exitCode } = runResultsPipeline(store, completedJob, outputFormat)
      store.saveResults(job.job_id, results)
      console.log(formatted)
      process.exit(exitCode)
    } else {
      // Default: dispatch summary only
      const completedJob = store.loadJob(job.job_id)
      const result = {
        job_id: job.job_id,
        status: completedJob.status,
        channels: Object.fromEntries(
          channelNames.map((name) => [
            name,
            completedJob.channels[name]?.status ?? authResults[name]?.status ?? 'skipped',
          ]),
        ),
        valid_channels: validChannels,
      }
      console.log(JSON.stringify(result, null, 2))
    }
  },
}
