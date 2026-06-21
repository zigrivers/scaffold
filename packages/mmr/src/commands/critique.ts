import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import { loadConfig } from '../config/loader.js'
import { JobStore } from '../core/job-store.js'
import { checkInstalled, checkAuth } from '../core/auth.js'
import { dispatchChannel } from '../core/dispatcher.js'
import { dispatchHttpChannel } from '../core/http-dispatcher.js'
import { redactCommandString } from '../core/redact.js'
import { assembleCritiquePrompt } from '../core/critique-prompt.js'
import { parseCritiqueOutput } from '../core/critique-parser.js'
import { reconcileCritique } from '../core/critique-reconciler.js'
import { formatCritiqueText, formatCritiqueJson } from '../formatters/critique.js'
import { resolveCritiqueInput } from '../core/critique-input.js'
import { resolveDispatchChannels } from './review.js'
import { resolveJobsDir } from './sessions.js'
import { normalizeChannelName } from '../config/channel-aliases.js'
import type {
  CritiqueItem, CritiqueReport, CritiqueChannelResult,
} from '../types/critique.js'
import type { ChannelStatus, OutputFormat } from '../types.js'
import type { ChannelConfigParsed } from '../config/schema.js'

interface CritiqueArgs {
  input?: string
  focus?: string
  channels?: string[]
  timeout?: number
  format?: string
  'dry-run'?: boolean
}

/** Apply a channel's prompt wrapper to the assembled prompt (mirrors review). */
function applyWrapper(wrapper: string | undefined, prompt: string): string {
  const w = wrapper ?? '{{prompt}}'
  return w === '{{prompt}}' ? prompt : w.replaceAll('{{prompt}}', () => prompt)
}

interface AuthInfo { status: string, recovery?: string }

function channelStatusFromAuth(status: string): ChannelStatus {
  return status === 'not_installed' ? 'not_installed'
    : status === 'failed' ? 'auth_failed'
      : status === 'timeout' ? 'timeout'
        : 'skipped'
}

/** Read a completed channel's raw stdout back from the job store. */
function readRawOutput(store: JobStore, jobId: string, name: string): string {
  const stored = store.loadChannelOutput(jobId, name)
  // dispatchChannel saves via JSON.stringify(stdout); unwrap to the raw string.
  try {
    const unwrapped = JSON.parse(stored)
    return typeof unwrapped === 'string' ? unwrapped : stored
  } catch {
    return stored
  }
}

export const critiqueCommand: CommandModule<object, CritiqueArgs> = {
  command: 'critique [input]',
  describe: 'Multi-model design/brainstorm critique of an artifact (advisory, no gate)',
  builder: (yargs) =>
    yargs
      .positional('input', { type: 'string', describe: 'Artifact file path, or - for stdin' })
      .option('focus', { type: 'string', describe: 'Free-text focus areas for this critique' })
      .option('channels', { type: 'array', string: true, describe: 'Channels to dispatch (overrides config)' })
      .option('timeout', { type: 'number', describe: 'Per-channel timeout in seconds' })
      .option('format', { type: 'string', choices: ['text', 'json'], describe: 'Output format (default text)' })
      .option('dry-run', { type: 'boolean', default: false, describe: 'Assemble the prompt without dispatching' })
      .example('mmr critique design.md', 'Critique a design doc')
      .example('mmr critique - --focus scaling', 'Critique stdin, focused on scaling'),
  handler: async (args: ArgumentsCamelCase<CritiqueArgs>) => {
    const started = Date.now()
    const cwd = process.cwd()

    let artifact: string
    let source: string
    try {
      ({ artifact, source } = resolveCritiqueInput(args.input))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
      return
    }

    const config = loadConfig({ projectRoot: cwd, cliOverrides: { timeout: args.timeout, format: args.format } })
    const disabled = new Set(config.channels_disabled ?? [])
    const explicit = args.channels?.map(normalizeChannelName)
    const channelNames = resolveDispatchChannels(config.channels, explicit, disabled)
    const basePrompt = assembleCritiquePrompt({ artifact, focus: args.focus })

    // Install + auth gate per channel.
    const authResults: Record<string, AuthInfo> = {}
    const valid: string[] = []
    for (const name of channelNames) {
      const ch = config.channels[name]
      if (ch.kind !== 'http' && !ch.command) {
        authResults[name] = { status: 'skipped', recovery: `Channel "${name}" is missing command` }
        continue
      }
      if (ch.kind !== 'http') {
        const installed = await checkInstalled(ch.command!.split(' ')[0])
        if (!installed) {
          authResults[name] = { status: 'not_installed', recovery: `${ch.command!.split(' ')[0]} not found on PATH` }
          continue
        }
      }
      const auth = await checkAuth(ch)
      authResults[name] = { status: auth.status, recovery: redactCommandString(auth.recovery) as string | undefined }
      if (auth.status === 'ok') valid.push(name)
    }

    if (args['dry-run']) {
      console.log('=== DRY RUN - no channels will be dispatched ===')
      console.log(`Artifact: ${source}`)
      console.log(`Channels that would dispatch: ${valid.join(', ') || '(none)'}`)
      for (const [name, info] of Object.entries(authResults)) {
        if (!valid.includes(name)) console.log(`  ${name}: ${info.status}${info.recovery ? ` — ${info.recovery}` : ''}`)
      }
      for (const name of valid) {
        console.log(`\n--- Assembled prompt for ${name} ---`)
        console.log(applyWrapper(config.channels[name].prompt_wrapper, basePrompt))
      }
      return
    }

    if (valid.length === 0) {
      console.error('No channels passed auth check:')
      for (const [name, info] of Object.entries(authResults)) {
        console.error(`  ${name}: ${info.status}${info.recovery ? ` — ${info.recovery}` : ''}`)
      }
      process.exit(1)
      return
    }

    // Create a job and dispatch (reuses the review engine's dispatchers).
    const store = new JobStore(resolveJobsDir())
    const job = store.createJob({
      fix_threshold: 'P2',
      format: (args.format ?? 'text') as OutputFormat,
      channels: channelNames,
    })
    store.savePrompt(job.job_id, basePrompt)
    for (const name of channelNames) {
      if (!valid.includes(name)) {
        const info = authResults[name]
        const status = channelStatusFromAuth(info?.status ?? 'skipped')
        store.updateChannel(job.job_id, name, {
          status, auth: status === 'skipped' ? 'skipped' : 'failed', recovery: info?.recovery,
        })
      }
    }

    const dispatchOne = (name: string): Promise<void> => {
      const ch: ChannelConfigParsed = config.channels[name]
      const prompt = applyWrapper(ch.prompt_wrapper, basePrompt)
      const timeout = ch.timeout ?? config.defaults.timeout
      if (ch.kind === 'http') {
        return dispatchHttpChannel(store, job.job_id, name, { channel: ch, prompt, timeout })
      }
      return dispatchChannel(store, job.job_id, name, {
        command: ch.command!, prompt, flags: ch.flags, env: ch.env, timeout,
        stderr: ch.stderr === 'passthrough' ? 'passthrough' : ch.stderr === 'suppress' ? 'suppress' : 'capture',
        promptDelivery: ch.prompt_delivery, cwd: ch.cwd,
      })
    }
    if (config.defaults.parallel) {
      await Promise.all(valid.map(dispatchOne))
    } else {
      for (const name of valid) await dispatchOne(name)
    }

    // Collect, parse, reconcile.
    const finalJob = store.loadJob(job.job_id)
    const channelItems: Record<string, CritiqueItem[]> = {}
    const perChannel: Record<string, CritiqueChannelResult> = {}
    let completed = 0
    for (const name of channelNames) {
      const status = finalJob.channels[name]?.status ?? 'skipped'
      if (status === 'completed') {
        const parsed = parseCritiqueOutput(readRawOutput(store, job.job_id, name))
        channelItems[name] = parsed.items
        perChannel[name] = {
          status, item_count: parsed.items.length,
          ...(parsed.summary ? { summary: parsed.summary } : {}),
        }
        completed += 1
      } else {
        const recovery = finalJob.channels[name]?.recovery
        perChannel[name] = { status, item_count: 0, ...(recovery ? { recovery } : {}) }
      }
    }

    const items = reconcileCritique(channelItems)
    const consensus = items.filter((i) => i.agreement === 'consensus').length
    const unique = items.filter((i) => i.agreement === 'unique').length
    const report: CritiqueReport = {
      kind: 'design-critique',
      job_id: job.job_id,
      artifact_source: source,
      items,
      per_channel: perChannel,
      summary: `${items.length} item(s) across ${completed} of ${valid.length} channel(s) — ` +
        `${consensus} consensus, ${unique} single-model`,
      metadata: {
        channels_dispatched: valid.length,
        channels_completed: completed,
        total_elapsed: `${Math.round((Date.now() - started) / 1000)}s`,
      },
    }
    store.saveResults(job.job_id, report as unknown as never)

    const format = (args.format ?? config.defaults.format) === 'json' ? 'json' : 'text'
    console.log(format === 'json' ? formatCritiqueJson(report) : formatCritiqueText(report))
    // Advisory: critique never gates. Always exit 0.
  },
}
