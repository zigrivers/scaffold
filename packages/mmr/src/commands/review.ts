import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../config/loader.js'
import { JobStore } from '../core/job-store.js'
import { checkInstalled, checkAuth, checkHttpAuth } from '../core/auth.js'
import { assemblePrompt } from '../core/prompt.js'
import { dispatchChannel } from '../core/dispatcher.js'
import { dispatchHttpChannel } from '../core/http-dispatcher.js'
import { runResultsPipeline } from '../core/results-pipeline.js'
import { redactCommandString } from '../core/redact.js'
import { buildReviewAckStore } from '../core/ack-store.js'
import { classifyTrustMode } from '../core/trust-mode.js'
import { detectConfigChanges, type ConfigChangeReport } from '../core/diff-introspect.js'
import {
  getCompensatingChannels,
  dispatchCompensatingPasses,
  getCompensatorChannel,
  resolveCompensatorChannelName,
  resolveCompensatorOutputParser,
} from '../core/compensator.js'
import type { Severity, OutputFormat, ChannelStatus, ReconciledResults, ReviewControls } from '../types.js'
import { formatJson } from '../formatters/json.js'
import { formatText } from '../formatters/text.js'
import { formatMarkdown } from '../formatters/markdown.js'
import type { ChannelConfigParsed, MmrConfigParsed } from '../config/schema.js'
import { normalizeChannelName } from '../config/channel-aliases.js'
import {
  getSessionStore,
  resolveJobsDir,
  resolveSessionRoot,
  isValidSessionId,
  SESSION_ID_RULE,
  type SessionStore,
} from './sessions.js'

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
  session?: string
  round?: number
  'max-rounds'?: number
  maxRounds?: number
  acceptNewAcks?: boolean
  trustProjectAcks?: boolean
  trustProjectConfig?: boolean
  configBaseRef?: string
  sync?: boolean
  'dry-run'?: boolean
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
    return execFileSync(
      'git',
      ['diff', `${args.base}...${args.head}`],
      { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER },
    )
  }

  if (args.base) {
    return execFileSync('git', ['diff', `${args.base}...HEAD`], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
  }

  // Default: unstaged changes
  return execFileSync('git', ['diff'], { encoding: 'utf-8', maxBuffer: MAX_DIFF_BUFFER })
}

/** Stamp proposed config/ack changes onto an output object (trust transparency). */
function annotateProposedChanges(target: Record<string, unknown>, changes: ConfigChangeReport): void {
  if (changes.ack_files_changed.length > 0) target.proposed_acks = changes.ack_files_changed
  if (changes.config_file_changed) target.proposed_config_change = true
}

function formatReconciledResults(results: ReconciledResults, outputFormat: OutputFormat): string {
  if (outputFormat === 'text') return formatText(results)
  if (outputFormat === 'markdown') return formatMarkdown(results)
  return formatJson(results)
}

function buildMaxRoundsExceededResult(
  session: string,
  round: number,
  maxRounds: number,
  fixThreshold: Severity,
): ReconciledResults {
  return {
    job_id: `session-${session}`,
    verdict: 'needs-user-decision',
    fix_threshold: fixThreshold,
    advisory_count: 0,
    approved: false,
    summary: `max_rounds_exceeded: session="${session}" round=${round} > max_rounds=${maxRounds}`,
    reconciled_findings: [],
    per_channel: {},
    metadata: {
      channels_dispatched: 0,
      channels_completed: 0,
      channels_partial: 0,
      total_elapsed: '0s',
    },
  }
}

/**
 * Resolve the list of channels to dispatch.
 * - Filters out abstract channels from default resolution.
 * - Rejects explicit abstract channel requests with a clear error.
 * - Honors explicit --channels list when provided; otherwise enabled channels
 *   minus channels_disabled.
 */
export function resolveDispatchChannels(
  channels: Record<string, ChannelConfigParsed>,
  explicit: string[] | undefined,
  disabled: Set<string>,
): string[] {
  // Normalize aliases up front so every downstream decision (existence check,
  // abstract filter, disabled membership) operates on canonical names. This is
  // the single chokepoint — centralizing here means no caller can bypass alias
  // handling by passing the raw `disabled` set or an aliased `--channels` value.
  const normalizedDisabled = new Set([...disabled].map(normalizeChannelName))

  const isDispatchable = (name: string, explicitRequest = false): boolean => {
    const ch = channels[name]
    if (!ch) throw new Error(`Channel "${name}" not found in config`)
    if (ch.abstract === true) {
      if (explicitRequest) {
        throw new Error(`Channel "${name}" is abstract and cannot be dispatched`)
      }
      return false
    }
    return true
  }

  if (explicit !== undefined) {
    // Dedupe after normalization: an alias and its canonical (e.g. `agy` +
    // `antigravity`) collapse to one name, so `--channels=agy,antigravity` must
    // dispatch the channel once, not twice. `new Set` preserves first-seen order.
    return [...new Set(
      explicit
        .map(normalizeChannelName)
        .filter((name) => isDispatchable(name, true)),
    )]
  }
  return Object.entries(channels)
    .filter(([name, ch]) => ch.enabled && !normalizedDisabled.has(name) && !ch.abstract)
    .map(([name]) => name)
}

function resolveTemplateCriteria(
  config: ReturnType<typeof loadConfig>,
  template: string | undefined,
): string[] | undefined {
  return template && config.templates?.[template]
    ? config.templates[template].criteria
    : undefined
}

function buildChannelPrompt(channel: ChannelConfigParsed, prompt: string): string {
  const wrapper = channel.prompt_wrapper ?? '{{prompt}}'
  return wrapper === '{{prompt}}'
    ? prompt
    : wrapper.replaceAll('{{prompt}}', () => prompt)
}

function channelStatusFromAuthResult(status: string): ChannelStatus {
  return status === 'not_installed' ? 'not_installed'
    : status === 'failed' ? 'auth_failed'
      : status === 'timeout' ? 'timeout'
        : 'skipped'
}

export interface CompensatorAvailability {
  status: 'ok' | ChannelStatus
  auth: 'ok' | 'failed' | 'skipped'
  recovery?: string
}

export async function checkConfiguredCompensatorAvailability(
  config: MmrConfigParsed,
): Promise<CompensatorAvailability> {
  // undefined when no compensator is configured (default `claude -p` fallback).
  const compChannel = getCompensatorChannel(config)
  if (!compChannel) return { status: 'ok', auth: 'ok' }

  // HTTP compensator: probe over the wire (no install/command step).
  if (compChannel.kind === 'http') {
    const httpAuth = await checkHttpAuth(compChannel)
    if (httpAuth.status === 'ok') return { status: 'ok', auth: 'ok' }
    const httpStatus = channelStatusFromAuthResult(httpAuth.status)
    return {
      status: httpStatus,
      auth: httpStatus === 'skipped' ? 'skipped' : 'failed',
      recovery: redactCommandString(httpAuth.recovery) as string | undefined,
    }
  }

  // Subprocess compensator.
  if (!compChannel.command) {
    return { status: 'skipped', auth: 'skipped', recovery: 'Compensator channel has no command' }
  }
  const cmd = compChannel.command.split(' ')[0]
  const installed = await checkInstalled(cmd)
  if (!installed) {
    return { status: 'not_installed', auth: 'failed', recovery: `${cmd} not found on PATH` }
  }

  const authResult = await checkAuth(compChannel)
  if (authResult.status === 'ok') return { status: 'ok', auth: 'ok' }
  if ((authResult.status as string) === 'skipped') return { status: 'ok', auth: 'skipped' }

  const status = channelStatusFromAuthResult(authResult.status)
  return {
    status,
    auth: status === 'skipped' ? 'skipped' : 'failed',
    recovery: redactCommandString(authResult.recovery) as string | undefined,
  }
}

export const reviewCommand: CommandModule<object, ReviewArgs> = {
  command: 'review',
  describe: 'Dispatch a multi-model code review',
  builder: (yargs) =>
    yargs
      .option('diff', {
        type: 'string',
        requiresArg: true,
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
      .option('session', {
        type: 'string',
        describe: 'Session id (letters, digits, _ and -; reserved names like con/index/__proto__ are rejected)',
      })
      .option('round', {
        type: 'number',
        describe: 'One-based round counter within the session',
      })
      .option('max-rounds', {
        type: 'number',
        describe: 'Hard cap on rounds. Default 5 when --session is set without --max-rounds.',
      })
      .option('accept-new-acks', {
        type: 'boolean',
        default: false,
        describe: 'Trust ack files newly introduced in the diff under review',
      })
      .option('trust-project-acks', {
        type: 'boolean',
        default: false,
        describe: 'Trust working-tree project acks in non-Git or untrusted-HEAD modes',
      })
      .option('trust-project-config', {
        type: 'boolean',
        default: false,
        describe: 'Trust working-tree .mmr.yaml channel config in untrusted modes',
      })
      .option('config-base-ref', {
        type: 'string',
        describe: 'Load project .mmr.yaml and acks from this trusted Git ref instead of HEAD',
      })
      .option('sync', {
        type: 'boolean',
        describe: 'Run full review pipeline: dispatch, parse, reconcile, and output results with verdict',
        default: false,
      })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Resolve diff and assemble prompt without dispatching channels',
      })
      .check((argv) => {
        if (typeof argv.session === 'string' && !isValidSessionId(argv.session)) {
          throw new Error(`Invalid session id. Must match ${SESSION_ID_RULE}`)
        }
        if (typeof argv.round === 'number' && argv.round < 1) {
          throw new Error('round must be >= 1')
        }
        if (typeof argv.maxRounds === 'number' && argv.maxRounds < 1) {
          throw new Error('max-rounds must be >= 1')
        }
        return true
      })
      .middleware((argv) => {
        if (argv.session !== undefined && argv.maxRounds === undefined) {
          argv.maxRounds = 5
        }
      }),
  handler: async (args: ArgumentsCamelCase<ReviewArgs>) => {
    // 0. Classify the trust mode (§5 decision 1) and derive the project
    //    config/ack loading policy. The explicit --trust-project-config /
    //    --trust-project-acks opt-ins mean "honor the working-tree (diff)
    //    config/acks" and take precedence in ALL modes (they're an operator
    //    decision, not attacker-controllable); without them, base-ref mode
    //    loads from the trusted ref and untrusted-HEAD/non-git load nothing.
    const cwd = process.cwd()
    const trust = classifyTrustMode({ cwd, args })
    const baseRef = trust.trust_mode === 'base-ref' ? trust.base_ref : undefined
    const trustWorkingTreeConfig = args.trustProjectConfig === true
    const trustWorkingTreeAcks = args.trustProjectAcks === true
    // --accept-new-acks means "honor the ack files added in the diff", so it
    // must also LOAD the working-tree acks (not merely skip the gate) — else an
    // accepted new ack would be ratified but never applied (loaded from the
    // base ref, which doesn't have it). This loads the whole working-tree acks
    // dir, but in base-ref/PR review the working tree IS the head (= base +
    // the diff under review), so that's exactly "base acks + the accepted new
    // acks" — not arbitrary over-trust — and it reproduces in results/reconcile
    // via the persisted policy. The flag is an operator decision, not
    // attacker-controllable.
    const honorWorkingTreeAcks = trustWorkingTreeAcks || args.acceptNewAcks === true
    const refHint =
      trust.trust_mode === 'non-git'
        ? ' (non-git: no base ref to compare against).'
        : '; prefer --config-base-ref <ref> for a trusted source.'
    if (trustWorkingTreeConfig) {
      console.error(`[mmr] warning: --trust-project-config is honoring the working-tree .mmr.yaml${refHint}`)
    }
    if (trustWorkingTreeAcks) {
      console.error(`[mmr] warning: --trust-project-acks is honoring working-tree .mmr/acks/${refHint}`)
    }

    // 1. Load config per the trust policy: explicit opt-in → working tree;
    //    else base ref → git show; else skip project config entirely.
    const cliOverrides = {
      fix_threshold: args['fix-threshold'] as string | undefined,
      timeout: args.timeout,
      format: args.format,
    }
    const projectTrust = trustWorkingTreeConfig
      ? { trustProjectConfig: true }
      : baseRef !== undefined
        ? { configBaseRef: baseRef }
        : { skipProjectConfig: true }
    const config = loadConfig({ projectRoot: cwd, cliOverrides, ...projectTrust })
    // Defense-in-depth: the yargs `.check()` rejects invalid ids on the CLI
    // path, but the handler is also invoked directly by programmatic callers
    // and tests that bypass `.check()`, so validate here too before any I/O.
    if (args.session !== undefined && !isValidSessionId(args.session)) {
      console.error(`Invalid session id: ${args.session} - must match ${SESSION_ID_RULE}`)
      process.exitCode = 1
      return
    }
    const configCap = config.defaults.loop_control?.max_rounds_default ?? 5
    const maxRounds = args['max-rounds'] ?? args.maxRounds ?? configCap
    // Persist the EFFECTIVE policy (not the raw flags) so `mmr results`/
    // `reconcile` rebuild the ack store the same way: base-ref mode → base ref;
    // untrusted mode → only the working-tree trust opt-ins that actually applied.
    const reviewControls: ReviewControls = {
      max_rounds: maxRounds,
      accept_new_acks: args.acceptNewAcks === true,
      trust_project_acks: honorWorkingTreeAcks,
      trust_project_config: trustWorkingTreeConfig,
      config_base_ref: baseRef,
    }
    if ((args.round ?? 1) > maxRounds) {
      const outputFormat = (args.format ?? config.defaults.format ?? 'json') as OutputFormat
      const results = buildMaxRoundsExceededResult(
        args.session ?? 'default',
        args.round ?? 1,
        maxRounds,
        config.defaults.fix_threshold as Severity,
      )
      console.log(formatReconciledResults(results, outputFormat))
      process.exitCode = 3
      return
    }

    // 2. Resolve diff input
    const diff = resolveDiff(args)
    if (!diff.trim()) {
      console.error('No diff content found. Provide --diff, --pr, --staged, or --base/--head.')
      process.exit(1)
    }

    // 2a. In base-ref mode, a diff that proposes new project config/acks must
    //     not be auto-applied: force needs-user-decision unless the caller
    //     opts in (--trust-project-config for .mmr.yaml, --accept-new-acks for
    //     ack files). The reviewed content is loaded from the trusted base ref,
    //     so these surface the *proposed* changes for a human to ratify.
    const diffChanges = detectConfigChanges(diff)
    // The gate opt-outs are the same explicit flags that honor the working-tree
    // config/acks above: passing --trust-project-config / --accept-new-acks both
    // applies the proposed change AND ratifies it (no needs-user-decision).
    const blockingConfigChange =
      baseRef !== undefined && diffChanges.config_file_changed && !trustWorkingTreeConfig
    // Bypassed by EITHER ack opt-in: --accept-new-acks (accept the diff's acks)
    // or --trust-project-acks (trust all working-tree acks, which implies the
    // new ones) — aligned with honorWorkingTreeAcks so the gate matches loading.
    const blockingAckChange =
      baseRef !== undefined && diffChanges.ack_files_changed.length > 0 && !honorWorkingTreeAcks

    // 2b. Trust gate — UNCONDITIONAL (before dry-run, job creation, and
    //     dispatch), so it can't be bypassed by omitting --sync or using
    //     --dry-run. A base-ref diff proposing project config/acks short-
    //     circuits to needs-user-decision (exit 2) until a human ratifies.
    if (blockingConfigChange || blockingAckChange) {
      const outputFormat = (args.format ?? config.defaults.format ?? 'json') as OutputFormat
      const reason =
        blockingConfigChange && blockingAckChange
          ? 'the diff proposes project config (.mmr.yaml) and ack changes'
          : blockingConfigChange
            ? 'the diff proposes a project config change (.mmr.yaml)'
            : 'the diff proposes project ack changes (.mmr/acks/)'
      const decision: Record<string, unknown> = {
        verdict: 'needs-user-decision',
        fix_threshold: config.defaults.fix_threshold,
        reconciled_findings: [],
        advisory_count: 0,
        approved: false,
        summary:
          `Needs user decision — ${reason}. Re-run with ` +
          '--trust-project-config (.mmr.yaml) / --accept-new-acks (acks) to proceed.',
        trust_mode: trust.trust_mode,
      }
      annotateProposedChanges(decision, diffChanges)
      console.log(outputFormat === 'json' ? JSON.stringify(decision, null, 2) : String(decision.summary))
      // exitCode + return (not process.exit) for consistency with the early
      // guards and so the handler stays unit-testable without mocking exit.
      process.exitCode = 2
      return
    }

    let sessionLink: { store: SessionStore; id: string } | undefined
    if (args.session !== undefined) {
      sessionLink = { store: getSessionStore(), id: args.session }
    }

    // 3. Determine enabled channels — channels_disabled applies to the default list only;
    //    explicit --channels args override it (users know what they're asking for).
    //    Abstract channels are always filtered out.
    const disabledSet = new Set(config.channels_disabled ?? [])
    const channelNames = resolveDispatchChannels(config.channels, args.channels, disabledSet)

    if (channelNames.length === 0) {
      console.error('No channels enabled. Configure channels or pass --channels.')
      process.exit(1)
    }

    const templateCriteria = resolveTemplateCriteria(config, args.template)
    const prompt = assemblePrompt({
      diff,
      reviewCriteria: config.review_criteria,
      templateCriteria,
      focus: args.focus,
    })

    // 4. Auth-check each channel
    const validChannels: string[] = []
    const authResults: Record<string, { status: string; recovery?: string }> = {}

    for (const name of channelNames) {
      const chConfig = config.channels[name]
      if (!chConfig) {
        authResults[name] = { status: 'skipped', recovery: `Channel "${name}" not found in config` }
        continue
      }
      if (chConfig.abstract) {
        authResults[name] = { status: 'skipped', recovery: `Channel "${name}" is abstract and cannot run directly` }
        continue
      }

      // HTTP channels have no command/install step — probe over the wire.
      if (chConfig.kind === 'http') {
        const authResult = await checkHttpAuth(chConfig)
        authResults[name] = {
          ...authResult,
          recovery: redactCommandString(authResult.recovery) as string | undefined,
        }
        if (authResult.status === 'ok') {
          validChannels.push(name)
        }
        continue
      }

      if (!chConfig.command) {
        authResults[name] = { status: 'skipped', recovery: `Channel "${name}" is missing command` }
        continue
      }

      const cmd = chConfig.command.split(' ')[0]
      const installed = await checkInstalled(cmd)
      if (!installed) {
        authResults[name] = { status: 'not_installed', recovery: `${cmd} not found on PATH` }
        continue
      }

      const authResult = await checkAuth(chConfig)
      // auth.recovery is user-configurable and can embed a token; redact before
      // it's stored, printed in --dry-run, or surfaced in the no-channels error.
      authResults[name] = {
        ...authResult,
        recovery: redactCommandString(authResult.recovery) as string | undefined,
      }
      if (authResult.status === 'ok') {
        validChannels.push(name)
      }
    }

    if (args['dry-run']) {
      console.log('=== DRY RUN - no channels will be dispatched ===')
      console.log(`Channels that would dispatch: ${validChannels.join(', ') || '(none)'}`)
      for (const [name, status] of Object.entries(authResults)) {
        if (!validChannels.includes(name)) {
          console.log(`  ${name}: ${status.status}${status.recovery ? ` — ${status.recovery}` : ''}`)
        }
      }
      for (const name of validChannels) {
        const ch = config.channels[name]
        console.log(`\n--- Assembled prompt for ${name} ---`)
        console.log(buildChannelPrompt(ch, prompt))
      }
      if (validChannels.length === 0) {
        process.exitCode = 1
      }
      return
    }

    if (validChannels.length === 0) {
      console.error('No channels passed auth check:')
      for (const [name, result] of Object.entries(authResults)) {
        console.error(`  ${name}: ${result.status}${result.recovery ? ` — ${result.recovery}` : ''}`)
      }
      process.exit(1)
    }

    // 5. Create job
    const jobsDir = resolveJobsDir()
    const store = new JobStore(jobsDir)
    const job = store.createJob({
      fix_threshold: config.defaults.fix_threshold as Severity,
      format: config.defaults.format as OutputFormat,
      channels: channelNames,
      session_id: args.session,
      round: args.round,
      review_controls: reviewControls,
      // Persist trust context so the pipeline re-surfaces it on every run.
      trust_mode: trust.trust_mode,
      ...(diffChanges.ack_files_changed.length > 0 ? { proposed_acks: diffChanges.ack_files_changed } : {}),
      ...(diffChanges.config_file_changed ? { proposed_config_change: true } : {}),
    })
    if (sessionLink) {
      try {
        sessionLink.store.addJob(sessionLink.id, job.job_id, args.round ?? 1)
      } catch (err) {
        // Linking failed after the job dir was created. Remove the orphaned job
        // so the auto-link invariant holds: a job that records a session_id is
        // always present in that session's jobs[] array (never half-linked).
        // The invariant covers in-process failures; abrupt termination (SIGKILL,
        // OOM) between createJob and addJob can still leave a half-linked job,
        // but its job.json carries session_id so it remains traceable.
        // Guard the cleanup so a failed rmSync can't mask the original error.
        try {
          fs.rmSync(store.getJobDir(job.job_id), { recursive: true, force: true })
        } catch {
          // best-effort cleanup; fall through to report the original failure
        }
        console.error(
          `Failed to link job ${job.job_id} to session ${sessionLink.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        )
        // Set the exit code and return rather than process.exit(1): it lets
        // stderr flush, and keeps the handler unit-testable without mocking
        // process.exit. Returning aborts before channel dispatch, as intended.
        process.exitCode = 1
        return
      }
    }

    // Record skipped/auth-failed channels in job metadata
    for (const name of channelNames) {
      if (!validChannels.includes(name)) {
        const authStatus = authResults[name]
        const channelStatus = channelStatusFromAuthResult(authStatus?.status ?? 'skipped')
        store.updateChannel(job.job_id, name, {
          status: channelStatus,
          auth: channelStatus === 'skipped' ? 'skipped' : 'failed',
          recovery: authStatus?.recovery,
        })
      }
    }

    // 7. Save prompt + diff to job store
    store.savePrompt(job.job_id, prompt)
    store.saveDiff(job.job_id, diff)

    // 8. Dispatch channels
    if (config.defaults.parallel) {
      const dispatches: Promise<void>[] = []
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        if (chConfig.kind === 'http') {
          store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
          dispatches.push(
            dispatchHttpChannel(store, job.job_id, name, {
              channel: chConfig,
              prompt: buildChannelPrompt(chConfig, prompt),
              timeout: chConfig.timeout ?? config.defaults.timeout,
            }),
          )
          continue
        }
        if (!chConfig.command) {
          store.updateChannel(job.job_id, name, {
            status: 'skipped',
            recovery: `Channel "${name}" is missing command`,
          })
          continue
        }
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        dispatches.push(
          dispatchChannel(store, job.job_id, name, {
            command: chConfig.command,
            prompt: buildChannelPrompt(chConfig, prompt),
            flags: chConfig.flags,
            env: chConfig.env,
            timeout: chConfig.timeout ?? config.defaults.timeout,
            stderr: chConfig.stderr === 'passthrough' ? 'passthrough'
              : chConfig.stderr === 'suppress' ? 'suppress'
                : 'capture',
            promptDelivery: chConfig.prompt_delivery,
            cwd: chConfig.cwd,
          }),
        )
      }
      await Promise.all(dispatches)
    } else {
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        if (chConfig.kind === 'http') {
          store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
          await dispatchHttpChannel(store, job.job_id, name, {
            channel: chConfig,
            prompt: buildChannelPrompt(chConfig, prompt),
            timeout: chConfig.timeout ?? config.defaults.timeout,
          })
          continue
        }
        if (!chConfig.command) {
          store.updateChannel(job.job_id, name, {
            status: 'skipped',
            recovery: `Channel "${name}" is missing command`,
          })
          continue
        }
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        await dispatchChannel(store, job.job_id, name, {
          command: chConfig.command,
          prompt: buildChannelPrompt(chConfig, prompt),
          flags: chConfig.flags,
          env: chConfig.env,
          timeout: chConfig.timeout ?? config.defaults.timeout,
          stderr: chConfig.stderr === 'passthrough' ? 'passthrough'
            : chConfig.stderr === 'suppress' ? 'suppress'
              : 'capture',
          promptDelivery: chConfig.prompt_delivery,
          cwd: chConfig.cwd,
        })
      }
    }

    // 8b. Dispatch compensating passes for unavailable channels
    const completedJob1 = store.loadJob(job.job_id)
    const channelStatuses = Object.fromEntries(
      Object.entries(completedJob1.channels).map(([n, ch]) => [n, ch.status]),
    ) as Record<string, ChannelStatus>
    const compensating = getCompensatingChannels(
      channelStatuses,
      resolveCompensatorChannelName(config),
    )

    if (compensating.length > 0) {
      const compensatorAvailability = await checkConfiguredCompensatorAvailability(config)
      if (compensatorAvailability.status === 'ok') {
        // Kind-aware: the compensator may be a subprocess or an http channel.
        const compensatorOutputParser = resolveCompensatorOutputParser(config)
        // Register compensating channels in job.json so loadJob can discover them
        for (const comp of compensating) {
          store.registerChannel(job.job_id, comp.compensatingName, {
            status: 'dispatched',
            auth: 'ok',
            output_parser: compensatorOutputParser,
          })
        }
        await dispatchCompensatingPasses(store, job.job_id, prompt, compensating, config)
      } else {
        for (const comp of compensating) {
          store.registerChannel(job.job_id, comp.compensatingName, {
            status: compensatorAvailability.status,
            auth: compensatorAvailability.auth,
            recovery: compensatorAvailability.recovery,
            output_parser: 'default',
          })
        }
      }
    }

    // 9. Output results
    if (args.sync) {
      // --sync: full results pipeline (dispatch -> parse -> reconcile -> format -> exit)
      const completedJob = store.loadJob(job.job_id)
      const outputFormat = (args.format ?? completedJob.format ?? 'json') as OutputFormat
      // User-scope acks always load; project-scope acks (working tree) load
      // only when explicitly trusted, so an untrusted PR checkout can't commit
      // acks to self-suppress its own findings. The trust-mode thread adds the
      // trusted default path (project acks from a git base ref). The pipeline
      // fails safe if the acks tree is unreadable.
      const ackStore = buildReviewAckStore({
        trustProjectAcks: honorWorkingTreeAcks,
        userRoot: resolveSessionRoot(),
        configBaseRef: baseRef,
        cwd,
      })
      const { results, formatted, exitCode } = runResultsPipeline(store, completedJob, outputFormat, false, {
        ackStore,
      })
      // runResultsPipeline already stamped trust_mode/proposed_* onto results
      // from the job (persisted at createJob), so results and `formatted` carry
      // the trust context — and `mmr results`/`reconcile` reproduce it.
      store.saveResults(job.job_id, results)
      console.log(formatted)
      process.exit(exitCode)
    } else {
      // Default: dispatch summary only
      const completedJob = store.loadJob(job.job_id)
      const result: Record<string, unknown> = {
        job_id: job.job_id,
        status: completedJob.status,
        trust_mode: trust.trust_mode,
        channels: Object.fromEntries(
          channelNames.map((name) => [
            name,
            completedJob.channels[name]?.status ?? authResults[name]?.status ?? 'skipped',
          ]),
        ),
        valid_channels: validChannels,
      }
      // Surface opted-into proposed changes for transparency (the blocking case
      // already short-circuited to needs-user-decision before dispatch).
      annotateProposedChanges(result, diffChanges)
      console.log(JSON.stringify(result, null, 2))
    }
  },
}
