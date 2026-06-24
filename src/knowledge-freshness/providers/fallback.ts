import type { Dispatcher } from '../audit-runner.js'

export interface BuildFallbackDispatcherOptions {
  /** Tried first for every prompt. */
  primary: Dispatcher
  /** Tried only when the primary throws. */
  secondary: Dispatcher
  /** Provider name for log/error messages (e.g. 'zai'). */
  primaryName: string
  /** Provider name for log/error messages (e.g. 'deepseek'). */
  secondaryName: string
}

/**
 * Compose two dispatchers into a primary→secondary fallback chain.
 *
 * Fallback is PER-CALL: each prompt independently tries the primary first
 * and only drops to the secondary when that specific call throws. There is
 * no cross-call latch — if the primary recovers, the next call uses it
 * again. This matches the audit's per-entry process model (each candidate
 * is a fresh `audit-run-entry` invocation).
 *
 * Fallback triggers on ANY dispatcher-level failure: the deepseek/zai
 * dispatchers already normalize transport errors, timeouts, non-2xx
 * responses, malformed JSON, and empty content into thrown Errors, so
 * catching here covers exactly the "primary failed to return usable text"
 * cases the operator wants to fall back on. Content-quality / verdict
 * parsing happens downstream in the runner and is out of scope by design.
 */
export function buildFallbackDispatcher(opts: BuildFallbackDispatcherOptions): Dispatcher {
  const { primary, secondary, primaryName, secondaryName } = opts
  return async (prompt) => {
    try {
      return await primary(prompt)
    } catch (primaryErr) {
      const primaryReason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      // Surface the fallback on stderr so cron logs record that the primary
      // failed and the secondary took over (stdout stays verdict-JSON only).
      console.error(
        `[fallback] ${primaryName} dispatch failed; retrying with ${secondaryName}. ` +
        `${primaryName} error: ${primaryReason}`,
      )
      try {
        return await secondary(prompt)
      } catch (secondaryErr) {
        const secondaryReason = secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr)
        throw new Error(
          `both providers failed. ${primaryName}: ${primaryReason} | ` +
          `${secondaryName}: ${secondaryReason}`,
        )
      }
    }
  }
}
