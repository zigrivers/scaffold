import type { Dispatcher } from '../audit-runner.js'
import { DispatcherError } from './errors.js'

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
 * Fallback triggers on TRANSIENT dispatcher-level failures: transport
 * errors, timeouts, malformed/empty responses, and transient HTTP statuses
 * (429, 5xx, 408). It deliberately does NOT fall back on a PERMANENT primary
 * failure — a `DispatcherError` with `retryable: false` (bad/missing key →
 * 401/403, malformed request → 400). Those indicate the primary is
 * misconfigured; silently failing over would hide that and let the cron run
 * entirely on the fallback, never using the intended primary. Such errors are
 * re-thrown so the run fails loudly and the operator fixes the primary.
 *
 * Any non-`DispatcherError` (an unanticipated throw) is treated as retryable
 * so we never lose the safety net on an error shape we didn't classify.
 * Content-quality / verdict parsing happens downstream in the runner and is
 * out of scope by design.
 */
export function buildFallbackDispatcher(opts: BuildFallbackDispatcherOptions): Dispatcher {
  const { primary, secondary, primaryName, secondaryName } = opts
  return async (prompt) => {
    try {
      return await primary(prompt)
    } catch (primaryErr) {
      // Permanent primary failures (bad key, malformed request) must NOT be
      // swallowed by the fallback — surface them so the misconfiguration is
      // visible instead of the cron silently running on the secondary.
      if (primaryErr instanceof DispatcherError && !primaryErr.retryable) {
        throw primaryErr
      }
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
