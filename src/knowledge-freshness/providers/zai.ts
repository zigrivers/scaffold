import { fetch as undiciFetch } from 'undici'
import { z } from 'zod'
import type { Dispatcher } from '../audit-runner.js'
import { DispatcherError, isRetryableHttpStatus, describeFetchError } from './errors.js'

/**
 * SECURITY: like the deepseek dispatcher (and decision #7's
 * anthropic-subprocess invariant), the Z.ai URL and the model-name
 * allowlist are HARDCODED. Project-local config can never redirect this
 * dispatcher at a different host or run an unsupported model. Future
 * contributors who feel tempted to read a URL from
 * `.scaffold/observability.yaml` here should re-read the parent design
 * doc's Resolved Decisions table first.
 *
 * Z.ai exposes an OpenAI-compatible chat-completions endpoint, so the
 * request/response shape mirrors the deepseek dispatcher exactly.
 */
export const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions'

/**
 * Hardcoded allowlist of Z.ai (GLM) model names. The override env var may
 * pick a value from this set — never arbitrary text.
 *
 * - `glm-4.6` (default): flagship reasoning model, 200K context window.
 *   The freshness audit embeds source documents in the prompt and produces
 *   a structured JSON verdict, so a strong reasoner with a large context
 *   window is the best fit.
 * - `glm-4.5-air`: lightweight, cost-optimized variant — the cheaper
 *   override tier, mirroring deepseek's flash/pro split.
 */
const ALLOWED_MODELS = ['glm-4.6', 'glm-4.5-air'] as const
export type ZaiModel = typeof ALLOWED_MODELS[number]
export const DEFAULT_ZAI_MODEL: ZaiModel = 'glm-4.6'

const MAX_TOKENS = 8192

/**
 * Minimal Zod schema for the Z.ai (OpenAI-compatible) response. We validate
 * only the path we actually consume — `choices[0].message.content`.
 */
const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
})

/** Test-injectable fetch. Production uses undici's fetch. */
export type ZaiFetch = typeof undiciFetch

export interface BuildZaiDispatcherOptions {
  apiKey: string
  timeoutSec: number
  /** Optional model override (must be in the allowlist). */
  model?: string
  /** Test-injectable fetch implementation. Default: undici's fetch. */
  fetchImpl?: ZaiFetch
}

export function buildZaiDispatcher(opts: BuildZaiDispatcherOptions): Dispatcher {
  const model = opts.model ?? DEFAULT_ZAI_MODEL
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new Error(
      `unsupported Z.ai model "${model}". Allowed values: ${ALLOWED_MODELS.join(', ')}. ` +
      'Set KNOWLEDGE_FRESHNESS_ZAI_MODEL to one of those, or unset it to use the default.',
    )
  }
  if (!opts.apiKey) {
    throw new Error('ZAI_API_KEY is required to use the zai provider')
  }
  const doFetch = opts.fetchImpl ?? undiciFetch
  const timeoutMs = opts.timeoutSec * 1000
  return async (prompt) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // GLM models default thinking ON; disable it so temperature: 0 takes
      // effect and the response goes straight to the structured verdict
      // (same rationale as the deepseek dispatcher).
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    })
    // EVERY step from doFetch through response-body read is wrapped in a
    // single try/catch that normalizes any thrown error — DNS failure,
    // connection reset, timeout abort (whether during headers or body
    // read), JSON parse failure, schema violation, empty content — into
    // a `zai dispatcher: …` prefixed Error so cron logs are actionable and
    // consistent with the deepseek path's error shape.
    try {
      const res = await doFetch(ZAI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      // Read the body as TEXT first so we can produce a useful diagnostic on
      // both non-2xx AND malformed-JSON responses.
      const rawText = await res.text()
      if (res.status < 200 || res.status >= 300) {
        // Classify so the fallback only fails over on transient failures
        // (429, 5xx, 408) and surfaces permanent ones (400/401/403/404)
        // instead of silently running the cron on the fallback provider.
        throw new DispatcherError(
          `zai dispatcher: HTTP ${res.status} from ${ZAI_URL}. ` +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
          { retryable: isRetryableHttpStatus(res.status) },
        )
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new DispatcherError(
          'zai dispatcher: response was not valid JSON. ' +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
          { retryable: true },
        )
      }
      const result = responseSchema.safeParse(parsed)
      if (!result.success) {
        throw new DispatcherError(
          'zai dispatcher: response missing choices[0].message.content. ' +
          `Truncated response: ${rawText.slice(0, 200)}`,
          { retryable: true },
        )
      }
      const content = result.data.choices[0].message.content
      // An empty-string content satisfies the zod schema but is useless to
      // the runner's JSON extractor — surface it with a clear message.
      if (content.trim() === '') {
        throw new DispatcherError(
          'zai dispatcher: model returned empty content. ' +
          `Truncated response: ${rawText.slice(0, 200)}`,
          { retryable: true },
        )
      }
      return content
    } catch (err) {
      // Re-throw our own classified errors verbatim (preserving the retryable
      // flag); wrap everything else (transport failures, abort errors, etc.)
      // as a retryable error with a consistent "zai dispatcher: …" prefix.
      if (err instanceof DispatcherError) throw err
      const reason = describeFetchError(err)
      throw new DispatcherError(`zai dispatcher: fetch failed: ${reason}`, { retryable: true })
    }
  }
}
