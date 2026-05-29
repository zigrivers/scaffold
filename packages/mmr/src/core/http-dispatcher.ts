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

/** True when the channel's parser implies JSON output, so we ask for response_format. */
function impliesJsonOutput(parser: HttpChannelParsed['output_parser']): boolean {
  if (typeof parser !== 'string') return true // structured parsers (regex/jsonpath) consume JSON
  return parser === 'default' || parser === 'gemini' || parser === 'doc-conformance'
}

/**
 * Dispatch a review prompt to an HTTP (openai-chat) channel.
 *
 * Security invariant (T1-C / §5 decision 1): the API key value read from
 * `process.env[api_key_env]` is used ONLY to build the request header. It is
 * NEVER persisted to the job store or included in any error marker. On any
 * non-200 status we save a body-free marker (`{"error":"HTTP <code>"}`) because
 * a misconfigured or hostile endpoint can reflect the Authorization header back
 * in its response body — saving that body would leak the secret to disk.
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

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(channel.headers ?? {}),
  }
  if (channel.api_key_env) {
    const value = process.env[channel.api_key_env]
    if (!value) {
      // Env-var name only — never the value (which is absent here anyway).
      store.saveChannelOutput(
        jobId,
        channelName,
        JSON.stringify({ error: `API key env var ${channel.api_key_env} not set` }),
      )
      store.updateChannel(jobId, channelName, {
        status: 'auth_failed',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        output_parser: channel.output_parser,
      })
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

  let status: ChannelStatus
  try {
    const res = await fetch(channel.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    status = classifyStatus(res.status)
    if (status === 'completed') {
      store.saveChannelOutput(jobId, channelName, await res.text())
    } else {
      // Body-free marker: a misconfigured endpoint can echo the Authorization
      // header in its body, so we never persist the response body on failure.
      store.saveChannelOutput(jobId, channelName, JSON.stringify({ error: `HTTP ${res.status}` }))
    }
  } catch (err: unknown) {
    status = (err as { name?: string }).name === 'AbortError' ? 'timeout' : 'failed'
    // Generic marker only — the underlying error can carry request details
    // (including the header value) so we never serialize it.
    store.saveChannelOutput(jobId, channelName, JSON.stringify({ error: status }))
  } finally {
    clearTimeout(timer)
  }

  store.updateChannel(jobId, channelName, {
    status,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    output_parser: channel.output_parser,
  })
}
