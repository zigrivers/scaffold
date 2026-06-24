/**
 * The fetch implementation used by the HTTP providers (zai/deepseek). A
 * neutral, provider-agnostic alias so shared call sites (e.g. the dispatcher
 * factory's test-injectable `fetchImpl`) don't have to borrow one provider's
 * name. Equal to undici's `fetch` type; `ZaiFetch`/`DeepseekFetch` are the
 * same type under provider-specific names. Uses a type-only `import()` so no
 * runtime dependency is added to this leaf module.
 */
export type ProviderFetch = typeof import('undici').fetch

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

/**
 * Pull a useful message out of a thrown fetch error. undici wraps
 * transport-layer failures (DNS, connection reset, TLS) in a
 * `TypeError: fetch failed` whose `cause` carries the actionable detail
 * (ENOTFOUND, ECONNRESET, etc.). Without unwrapping `cause`, cron logs would
 * lose that detail and show only "fetch failed" — useless for triage. Shared
 * by the zai and deepseek dispatchers so the unwrapping logic lives in one
 * place.
 */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as Error & { cause?: unknown }).cause
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: string }).code
    const tail = code ? `${code}: ${cause.message}` : cause.message
    return `${err.message} (${tail})`
  }
  if (typeof cause === 'string' && cause) {
    return `${err.message} (${cause})`
  }
  return err.message
}
