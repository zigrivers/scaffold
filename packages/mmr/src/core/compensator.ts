import { dispatchChannel } from './dispatcher.js'
import type { JobStore } from './job-store.js'
import type { MmrConfigParsed, OutputParserConfig } from '../config/schema.js'
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
}

/** Channels that should NOT be compensated (e.g., claude can't compensate for itself) */
const SKIP_COMPENSATION = new Set(['claude'])

export interface CompensatingChannel {
  /** Name of the original channel being compensated */
  originalChannel: string
  /** Name used for the compensating dispatch (e.g., "compensating-codex") */
  compensatingName: string
  /** Focus prompt to prepend */
  focusPrompt: string
}

export interface CompensatorDispatch {
  command: string
  flags: string[]
  env: Record<string, string>
  stderr: 'capture' | 'suppress' | 'passthrough'
  output_parser: string | OutputParserConfig
}

export function resolveCompensatorDispatch(
  config: MmrConfigParsed,
  _originalChannel: string,
): CompensatorDispatch {
  const compConfig = config.defaults.compensator
  if (!compConfig) {
    return {
      command: 'claude -p',
      flags: ['--output-format', 'json'],
      env: {},
      stderr: 'capture',
      output_parser: 'default',
    }
  }

  const channelName = compConfig.channel
  const channelConfig = config.channels[channelName]
  if (!channelConfig) {
    throw new Error(`Compensator channel "${channelName}" not found in config`)
  }
  if (!channelConfig.command) {
    throw new Error(`Compensator channel "${channelName}" has no command`)
  }

  return {
    command: channelConfig.command,
    flags: channelConfig.flags,
    env: channelConfig.env,
    stderr: channelConfig.stderr,
    output_parser: channelConfig.output_parser,
  }
}

/**
 * Determine which channels need compensating passes.
 * Returns a list of compensating channel descriptors.
 */
export function getCompensatingChannels(
  channelStatuses: Record<string, ChannelStatus>,
): CompensatingChannel[] {
  const compensating: CompensatingChannel[] = []

  for (const [name, status] of Object.entries(channelStatuses)) {
    if (SKIP_COMPENSATION.has(name)) continue
    if (
      status === 'not_installed'
      || status === 'auth_failed'
      || status === 'timeout'
      || status === 'skipped'
      || status === 'failed'
    ) {
      const focus = COMPENSATING_FOCUS[name]
        ?? `Focus your review on areas typically covered by ${name}.`
        + ` You are compensating for a missing ${name} review.`
      compensating.push({
        originalChannel: name,
        compensatingName: `compensating-${name}`,
        focusPrompt: focus,
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
  timeout: number,
): Promise<void> {
  await Promise.all(
    compensatingChannels.map((comp) => {
      const compensatingPrompt = `${comp.focusPrompt}\n\n${prompt}`
      return dispatchChannel(store, jobId, comp.compensatingName, {
        command: 'claude -p',
        prompt: compensatingPrompt,
        flags: ['--output-format', 'json'],
        env: {},
        timeout,
        stderr: 'capture',
      })
    }),
  )
}
