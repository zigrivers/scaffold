import type { JobStore } from './job-store.js'
import type { HttpChannelParsed } from '../config/schema.js'
import type { ChannelStatus } from '../types.js'

export interface DispatchHttpOptions {
  channel: HttpChannelParsed
  prompt: string
  /** Per-channel timeout in seconds. */
  timeout: number
}

/** Status-code → ChannelStatus mapping per §5 decision 8 / T1-C. */
function classifyStatus(status: number): ChannelStatus {
  if (status === 200) return 'completed'
  if (status === 401) return 'auth_failed'
  return 'failed'
}

/**
 * True when the channel's parser consumes JSON, so we request
 * `response_format: {type:'json_object'}`. `regex-findings` is a text scanner
 * (it runs a RegExp over prose output), so it must NOT force JSON.
 */
function impliesJsonOutput(parser: HttpChannelParsed['output_parser']): boolean {
  if (typeof parser === 'string') {
    return parser === 'default' || parser === 'gemini' || parser === 'doc-conformance'
  }
  return parser.kind === 'unwrap-jsonpath'
}

/**
 * Extract the assistant message from an openai-chat completion envelope so the
 * saved channel output matches what a subprocess channel writes (the model's
 * direct text), letting the existing parsers consume it unchanged. Falls back
 * to the raw body if the response is not the expected envelope shape.
 */
function extractOpenAiContent(body: string): string {
  try {
    const parsed = JSON.parse(body) as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = parsed?.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
  } catch {
    // Not JSON / not the expected shape — fall through to the raw body.
  }
  return body
}

/**
 * Dispatch a review prompt to an HTTP (openai-chat) channel.
 *
 * Security invariant (T1-C / §5 decision 1): the API key value read from
 * `process.env[api_key_env]` is used ONLY to build the request header. It is
 * NEVER persisted or logged. Failure diagnostics are SYNTHETIC strings derived
 * from the status code / error name — never the response body, because a
 * misconfigured or hostile endpoint can reflect the Authorization header back
 * in its body, and persisting that would leak the secret to disk.
 */
export async function dispatchHttpChannel(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchHttpOptions,
): Promise<void> {
  const { channel, prompt, timeout } = opts
  const startedAt = new Date().toISOString()
  store.updateChannel(jobId, channelName, { status: 'running', started_at: startedAt })

  const finalize = (status: ChannelStatus, logDetail?: string): void => {
    // Synthetic diagnostics only — surfaced by the results pipeline via the
    // channel log. NEVER the response body (secret-reflection risk).
    if (logDetail) store.saveChannelLog(jobId, channelName, logDetail)
    store.updateChannel(jobId, channelName, {
      status,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      output_parser: channel.output_parser,
    })
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(channel.headers ?? {}),
  }
  if (channel.api_key_env) {
    const value = process.env[channel.api_key_env]
    if (!value) {
      // Env-var name only — never the value (absent here anyway).
      finalize('auth_failed', `API key env var ${channel.api_key_env} not set`)
      return
    }
    headers[channel.api_key_header] = `${channel.api_key_prefix}${value}`
  }

  const body: Record<string, unknown> = {
    model: channel.model,
    messages: [{ role: 'user', content: prompt }],
  }
  if (impliesJsonOutput(channel.output_parser)) {
    body.response_format = { type: 'json_object' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeout * 1000))

  try {
    const res = await fetch(channel.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const status = classifyStatus(res.status)
    if (status === 'completed') {
      // Save the model's direct output (unwrapped from the envelope) so the
      // existing parsers consume it exactly like subprocess stdout.
      store.saveChannelOutput(jobId, channelName, extractOpenAiContent(await res.text()))
      finalize('completed')
    } else {
      finalize(status, `HTTP ${res.status}`)
    }
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'AbortError') {
      finalize('timeout', `request timed out after ${timeout}s`)
    } else {
      finalize('failed', 'request failed')
    }
  } finally {
    clearTimeout(timer)
  }
}
