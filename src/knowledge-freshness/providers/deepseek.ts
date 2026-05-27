import { fetch as undiciFetch } from 'undici'
import { z } from 'zod'
import type { Dispatcher } from '../audit-runner.js'

/**
 * SECURITY: like decision #7's anthropic-subprocess invariant, the
 * DeepSeek URL and the model-name allowlist are HARDCODED. Project-local
 * config can never redirect this dispatcher at a different host or run
 * an unsupported model. Future contributors who feel tempted to read a
 * URL from `.scaffold/observability.yaml` here should re-read the parent
 * design doc's Resolved Decisions table first.
 */
export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

/**
 * Hardcoded allowlist of DeepSeek model names. KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL
 * may override the default, but only to a value in this set — never to
 * arbitrary text. The previously-supported `deepseek-chat` and
 * `deepseek-reasoner` IDs are deprecated and intentionally excluded.
 */
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const
export type DeepseekModel = typeof ALLOWED_MODELS[number]
export const DEFAULT_DEEPSEEK_MODEL: DeepseekModel = 'deepseek-v4-flash'

const MAX_TOKENS = 8192

/**
 * Minimal Zod schema for the DeepSeek (OpenAI-compatible) response. We
 * validate only the path we actually consume — `choices[0].message.content`
 * — rather than the whole API surface. Replaces the previous inline
 * `as { choices?: … }` cast (round-2 F-003) so the response shape is
 * checked at parse time, not implicitly via optional-chaining-then-typeof.
 */
const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
})

/** Test-injectable fetch. Production uses undici's fetch. */
export type DeepseekFetch = typeof undiciFetch

export interface BuildDeepseekDispatcherOptions {
  apiKey: string
  timeoutSec: number
  /** Optional model override (must be in the allowlist). */
  model?: string
  /** Test-injectable fetch implementation. Default: undici's fetch. */
  fetchImpl?: DeepseekFetch
}

export function buildDeepseekDispatcher(opts: BuildDeepseekDispatcherOptions): Dispatcher {
  const model = opts.model ?? DEFAULT_DEEPSEEK_MODEL
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new Error(
      `unsupported DeepSeek model "${model}". Allowed values: ${ALLOWED_MODELS.join(', ')}. ` +
      'Set KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL to one of those, or unset it to use the default.',
    )
  }
  if (!opts.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required to use the deepseek provider')
  }
  const doFetch = opts.fetchImpl ?? undiciFetch
  const timeoutMs = opts.timeoutSec * 1000
  return async (prompt) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // Thinking mode defaults ON for v4 models and IGNORES temperature
      // (per https://api-docs.deepseek.com/guides/thinking_mode). The
      // audit prompt produces structured JSON via the runner's schema-
      // aware extractor — chain-of-thought reasoning before the JSON
      // wastes the output token budget and produces non-deterministic
      // text. Disable thinking so temperature: 0 actually takes effect
      // and the response goes straight to the verdict.
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    })
    // Timeout via AbortSignal.timeout — stable since Node 16.14 / 17.3
    // (verified at https://nodejs.org/api/globals.html#abortsignaltimeoutdelay).
    // The same pattern is already used in source-hash.ts and link-check.ts;
    // an earlier review-round claim that this method was unavailable on
    // 18.17 turned out to be a hallucination.
    //
    // EVERY step from doFetch through response-body read is wrapped in a
    // single try/catch that normalizes any thrown error — DNS failure,
    // connection reset, timeout abort (whether during headers or body
    // read), JSON parse failure, schema violation, empty content — into
    // a `deepseek dispatcher: …` prefixed Error so cron logs are
    // actionable and consistent with the anthropic path's error shape.
    try {
      const res = await doFetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      // Always read the body as TEXT first so we can produce a useful
      // diagnostic on both non-2xx AND malformed-JSON responses
      // (round-2 F-004: previously `await res.json()` propagated a raw
      // SyntaxError that masked the actual response body).
      const rawText = await res.text()
      if (res.status < 200 || res.status >= 300) {
        throw new Error(
          `deepseek dispatcher: HTTP ${res.status} from ${DEEPSEEK_URL}. ` +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
        )
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          'deepseek dispatcher: response was not valid JSON. ' +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
        )
      }
      const result = responseSchema.safeParse(parsed)
      if (!result.success) {
        throw new Error(
          'deepseek dispatcher: response missing choices[0].message.content. ' +
          `Truncated response: ${rawText.slice(0, 200)}`,
        )
      }
      const content = result.data.choices[0].message.content
      // Round-6 grok finding: an empty-string content satisfies the zod
      // schema but is useless to the runner's JSON extractor and produces
      // a confusing downstream parse error. Surface the empty-response
      // case with a clear message and the truncated body.
      if (content.trim() === '') {
        throw new Error(
          'deepseek dispatcher: model returned empty content. ' +
          `Truncated response: ${rawText.slice(0, 200)}`,
        )
      }
      return content
    } catch (err) {
      // Re-throw our own already-prefixed errors verbatim; wrap everything
      // else (transport failures, abort errors, etc.) so cron logs see a
      // consistent "deepseek dispatcher: …" prefix (round-7 grok finding:
      // the round-6 fix only covered the initial doFetch call, leaving
      // body-read aborts and stream errors unwrapped).
      if (err instanceof Error && err.message.startsWith('deepseek dispatcher: ')) throw err
      // Surface the underlying transport detail. undici's fetch rejects
      // with `TypeError: fetch failed` and stashes the actionable
      // ENOTFOUND/ECONNRESET/TLS detail in `err.cause` — without
      // unwrapping that, cron logs would show the unhelpful
      // "deepseek dispatcher: fetch failed: fetch failed" (PR #393 MMR
      // F-002).
      const reason = describeFetchError(err)
      throw new Error(`deepseek dispatcher: fetch failed: ${reason}`)
    }
  }
}

/**
 * Pull out a useful message from a thrown fetch error. undici wraps
 * transport-layer failures (DNS, connection reset, TLS) in a
 * `TypeError: fetch failed` whose `cause` carries the actionable detail
 * (ENOTFOUND, ECONNRESET, etc.). Without unwrapping `cause`, cron logs
 * would lose that detail and show only "fetch failed" — useless for
 * triage. We compose the outer message with the cause's `code` and
 * `message` when present.
 */
function describeFetchError(err: unknown): string {
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
