/**
 * Error thrown by a provider dispatcher, carrying whether the failure is
 * worth failing over to a secondary provider.
 *
 * `retryable: false` marks a PERMANENT failure the fallback must NOT swallow
 * — a bad/missing API key (401/403) or a malformed request (400) cannot be
 * fixed by a second provider, and a silent failover would hide the
 * misconfiguration and let the cron "succeed" without ever using the
 * intended primary provider.
 */
export class DispatcherError extends Error {
  readonly retryable: boolean
  constructor(message: string, opts: { retryable: boolean }) {
    super(message)
    this.name = 'DispatcherError'
    this.retryable = opts.retryable
  }
}

/**
 * Classify an HTTP status from a provider's chat-completions endpoint as
 * retryable (worth failing over) or not.
 *
 * - 408 (Request Timeout) and 429 (Too Many Requests) are transient → retry.
 * - 5xx are server-side and transient → retry.
 * - Any other 4xx (400/401/403/404/…) is a permanent client error
 *   (bad key, malformed request, wrong endpoint) → do NOT retry; surface it.
 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return true
  if (status >= 500) return true
  if (status >= 400) return false
  return true
}
