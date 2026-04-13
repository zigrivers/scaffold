import { dispatchChannel } from './dispatcher.js'
import type { JobStore } from './job-store.js'
import type { ChannelStatus } from '../types.js'

/** Focus areas for compensating passes, keyed by the channel being compensated */
const COMPENSATING_FOCUS: Record<string, string> = {
  codex: 'Focus your review on: implementation correctness, security vulnerabilities, API contract violations, input validation, and error handling. You are compensating for a missing Codex review.',
  gemini: 'Focus your review on: architectural patterns, design consistency, broad-context reasoning, separation of concerns, and dependency analysis. You are compensating for a missing Gemini review.',
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
    if (status === 'not_installed' || status === 'auth_failed' || status === 'timeout' || status === 'skipped') {
      const focus = COMPENSATING_FOCUS[name] ?? `Focus your review on areas typically covered by ${name}. You are compensating for a missing ${name} review.`
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
  for (const comp of compensatingChannels) {
    const compensatingPrompt = `${comp.focusPrompt}\n\n${prompt}`
    await dispatchChannel(store, jobId, comp.compensatingName, {
      command: 'claude -p',
      prompt: compensatingPrompt,
      flags: ['--output-format', 'json'],
      env: {},
      timeout,
      stderr: 'capture',
    })
  }
}
