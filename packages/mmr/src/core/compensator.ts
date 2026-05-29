import { dispatchChannel } from './dispatcher.js'
import { dispatchHttpChannel } from './http-dispatcher.js'
import type { JobStore } from './job-store.js'
import type { ChannelConfigParsed, MmrConfigParsed, OutputParserConfig } from '../config/schema.js'
import type { ChannelStatus } from '../types.js'

/** Focus areas for compensating passes, keyed by the channel being compensated */
const COMPENSATING_FOCUS: Record<string, string> = {
  codex:
    'Focus your review on: implementation correctness, security vulnerabilities,'
    + ' API contract violations, input validation, and error handling.'
    + ' You are compensating for a missing Codex review.',
  gemini:
    'Focus your review on: architectural patterns, design consistency,'
    + ' broad-context reasoning, separation of concerns, and dependency analysis.'
    + ' You are compensating for a missing Gemini review.',
  grok:
    'Focus your review on: an independent second-opinion pass over correctness'
    + ' and code quality — edge cases, logic errors, and risky assumptions other'
    + ' reviewers may have anchored past. You are compensating for a missing Grok review.',
}

export interface CompensatingChannel {
  /** Name of the original channel being compensated */
  originalChannel: string
  /** Name used for the compensating dispatch (e.g., "compensating-codex") */
  compensatingName: string
}

export interface CompensatorDispatch {
  command: string
  flags: string[]
  env: Record<string, string>
  timeout: number
  prompt_wrapper: string
  stderr: 'capture' | 'suppress' | 'passthrough'
  output_parser: string | OutputParserConfig
  prompt_delivery?: 'stdin' | 'prompt-file'
}

function defaultCompensatorDispatch(config: MmrConfigParsed): CompensatorDispatch {
  return {
    command: 'claude',
    flags: ['-p', '--output-format', 'json'],
    env: {},
    timeout: config.defaults.timeout,
    prompt_wrapper: '{{prompt}}',
    stderr: 'capture',
    output_parser: 'default',
  }
}

export function resolveCompensatorDispatch(config: MmrConfigParsed): CompensatorDispatch {
  const { defaults } = config
  const channelName = defaults.compensator?.channel
  if (!channelName) {
    return defaultCompensatorDispatch(config)
  }

  const channelConfig = getDispatchableCompensatorChannel(config, channelName)

  return {
    command: channelConfig.command,
    flags: channelConfig.flags,
    env: channelConfig.env,
    timeout: channelConfig.timeout ?? config.defaults.timeout,
    prompt_wrapper: channelConfig.prompt_wrapper ?? '{{prompt}}',
    stderr: channelConfig.stderr,
    output_parser: channelConfig.output_parser,
    prompt_delivery: channelConfig.prompt_delivery,
  }
}

export function resolveCompensatorChannelName(config: MmrConfigParsed): string {
  return config.defaults.compensator?.channel ?? 'claude'
}

/**
 * Resolve the configured compensator channel config (any kind), or undefined
 * when none is configured (the default `claude -p` subprocess fallback applies).
 * Throws only for a missing / abstract reference. Unlike
 * getDispatchableCompensatorChannel this does NOT require a `command`, so it is
 * safe for http compensators.
 */
export function getCompensatorChannel(config: MmrConfigParsed): ChannelConfigParsed | undefined {
  const channelName = config.defaults.compensator?.channel
  if (!channelName) return undefined
  const channelConfig = config.channels[channelName]
  if (!channelConfig) {
    throw new Error(`Compensator channel "${channelName}" not found in config`)
  }
  if (channelConfig.abstract) {
    throw new Error(`Compensator channel "${channelName}" is abstract and cannot be dispatched`)
  }
  return channelConfig
}

/** Output parser for the configured compensator channel (any kind); 'default' when none. */
export function resolveCompensatorOutputParser(config: MmrConfigParsed): string | OutputParserConfig {
  return getCompensatorChannel(config)?.output_parser ?? 'default'
}

export function getDispatchableCompensatorChannel(
  config: MmrConfigParsed,
  channelName: string,
): ChannelConfigParsed & { command: string } {
  const channelConfig = config.channels[channelName]
  if (!channelConfig) {
    throw new Error(`Compensator channel "${channelName}" not found in config`)
  }
  if (channelConfig.abstract) {
    throw new Error(`Compensator channel "${channelName}" is abstract and cannot be dispatched`)
  }
  if (!channelConfig.command) {
    throw new Error(`Compensator channel "${channelName}" has no command`)
  }
  return channelConfig as ChannelConfigParsed & { command: string }
}

function applyPromptWrapper(wrapper: string, prompt: string): string {
  return wrapper === '{{prompt}}'
    ? prompt
    : wrapper.replaceAll('{{prompt}}', () => prompt)
}

/**
 * Resolve the focus-area prompt prefix for a compensating pass.
 */
export function resolveCompensatorFocus(
  config: MmrConfigParsed,
  originalChannel: string,
): string {
  const override = config.defaults.compensator?.channel_focus_map?.[originalChannel]
  if (typeof override === 'string' && override.trim().length > 0) return override
  const builtin = COMPENSATING_FOCUS[originalChannel]
  if (builtin) return builtin
  return `Focus your review on areas typically covered by ${originalChannel}.`
    + ` You are compensating for a missing ${originalChannel} review.`
}

/**
 * Determine which channels need compensating passes.
 * Returns a list of compensating channel descriptors.
 */
export function getCompensatingChannels(
  channelStatuses: Record<string, ChannelStatus>,
  compensatorChannel: string,
): CompensatingChannel[] {
  const compensating: CompensatingChannel[] = []

  for (const [name, status] of Object.entries(channelStatuses)) {
    if (name === compensatorChannel) continue
    if (
      status === 'not_installed'
      || status === 'auth_failed'
      || status === 'timeout'
      || status === 'skipped'
      || status === 'failed'
    ) {
      compensating.push({
        originalChannel: name,
        compensatingName: `compensating-${name}`,
      })
    }
  }

  return compensating
}

/**
 * Dispatch compensating passes via claude CLI for unavailable channels.
 * Each compensating pass uses the same prompt but with a focused preamble.
 */
export async function dispatchCompensatingPasses(
  store: JobStore,
  jobId: string,
  prompt: string,
  compensatingChannels: CompensatingChannel[],
  config: MmrConfigParsed,
): Promise<void> {
  const compChannel = getCompensatorChannel(config)

  // HTTP compensator: route each pass through the HTTP dispatcher.
  if (compChannel && compChannel.kind === 'http') {
    await Promise.all(
      compensatingChannels.map((comp) => {
        const focus = resolveCompensatorFocus(config, comp.originalChannel)
        const compensatingPrompt = applyPromptWrapper(
          compChannel.prompt_wrapper ?? '{{prompt}}',
          `${focus}\n\n${prompt}`,
        )
        return dispatchHttpChannel(store, jobId, comp.compensatingName, {
          channel: compChannel,
          prompt: compensatingPrompt,
          timeout: compChannel.timeout ?? config.defaults.timeout,
        })
      }),
    )
    return
  }

  // Subprocess compensator (default `claude -p` or a configured command).
  const dispatch = resolveCompensatorDispatch(config)
  await Promise.all(
    compensatingChannels.map((comp) => {
      const focus = resolveCompensatorFocus(config, comp.originalChannel)
      const compensatingPrompt = applyPromptWrapper(dispatch.prompt_wrapper, `${focus}\n\n${prompt}`)
      return dispatchChannel(store, jobId, comp.compensatingName, {
        command: dispatch.command,
        prompt: compensatingPrompt,
        flags: dispatch.flags,
        env: dispatch.env,
        timeout: dispatch.timeout,
        stderr: dispatch.stderr,
        promptDelivery: dispatch.prompt_delivery,
      })
    }),
  )
}
