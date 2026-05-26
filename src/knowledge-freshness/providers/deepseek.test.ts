import { describe, it, expect, vi } from 'vitest'
import { buildDeepseekDispatcher, type DeepseekFetch } from './deepseek.js'

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('deepseek provider — happy path', () => {
  it('POSTs to api.deepseek.com/chat/completions with bearer auth and the prompt as user message', async () => {
    // Keep a separate reference to the raw vi.fn() result BEFORE casting to
    // DeepseekFetch, so we can read .mock.calls without an `as unknown as`
    // dive into vitest internals (round-6 grok finding).
    const rawFetchMock = vi.fn<DeepseekFetch>(async () => ok({
      choices: [{ message: { content: '{"verdict":"current"}' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'sk-test-key',
      timeoutSec: 600,
      fetchImpl: fetchSpy,
    })
    const result = await dispatcher('the meta-prompt body')
    expect(result).toBe('{"verdict":"current"}')
    // Verify the request shape exactly.
    expect(rawFetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
    )
    // Parse the JSON body to verify the request shape precisely.
    const sentBody = JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string)
    expect(sentBody).toEqual({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'the meta-prompt body' }],
      // Round-5 F-001: thinking mode is explicitly disabled so temperature: 0
      // takes effect and the model goes straight to the JSON verdict.
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 8192,
      stream: false,
    })
  })

  it('uses the model from KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL when set (allowlist member)', async () => {
    const rawFetchMock = vi.fn<DeepseekFetch>(async () => ok({
      choices: [{ message: { content: 'response' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'k',
      timeoutSec: 60,
      model: 'deepseek-v4-pro',
      fetchImpl: fetchSpy,
    })
    await dispatcher('x')
    expect(JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string).model).toBe('deepseek-v4-pro')
  })
})

describe('deepseek provider — error paths', () => {
  it('throws on non-2xx response with status + truncated body', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response('{"error":{"message":"rate limited","type":"rate_limit_error"}}', { status: 429 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/HTTP 429.*rate limited/i)
  })

  it('throws on a 200 response that lacks choices[0].message.content', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/missing choices\[0\]\.message\.content/i)
  })

  it('throws a diagnostic error on a 200 response whose body is not JSON', async () => {
    // Round-2 F-004: must NOT propagate a bare SyntaxError. The dispatcher
    // catches the parse failure and throws a message containing the
    // truncated body so cron logs are actionable.
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response('not json at all', {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/response was not valid JSON.*not json at all/i)
  })

  it('rejects an unsupported model at construction time (not at fetch time)', () => {
    expect(() => buildDeepseekDispatcher({
      apiKey: 'k', timeoutSec: 60, model: 'gpt-4',
    })).toThrow(/unsupported DeepSeek model "gpt-4".*deepseek-v4-flash.*deepseek-v4-pro/i)
  })

  it('rejects construction when apiKey is empty', () => {
    expect(() => buildDeepseekDispatcher({ apiKey: '', timeoutSec: 60 })).toThrow(/DEEPSEEK_API_KEY is required/)
  })

  it('normalizes transport errors (DNS / connection reset / fetch reject) into a deepseek-prefixed message (round-6 grok)', async () => {
    // The dispatcher must wrap the fetch call so raw undici / DOMException
    // errors don't leak to the cron logs unstyled. Mock a fetch that
    // rejects synchronously; assert the wrapped error has the diagnostic
    // prefix.
    const fetchSpy: DeepseekFetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.deepseek.com')
    }) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/deepseek dispatcher: fetch failed.*ENOTFOUND/i)
  })

  it('normalizes a body-read abort (headers OK, body hangs) into a deepseek-prefixed error (round-7 grok)', async () => {
    // The post-fetch phase (res.text(), JSON.parse, zod, content check) must
    // also be wrapped — a slow server that returns 200 headers fast then
    // hangs during body read causes the AbortSignal.timeout to fire after
    // headers but during streaming, and res.text() rejects with a raw
    // AbortError. The dispatcher's outer catch normalizes that into a
    // diagnostic message.
    const fetchSpy: DeepseekFetch = vi.fn(async () => {
      // Build a Response whose body rejects with a synthetic AbortError on
      // read, simulating the headers-fast-body-hangs scenario.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        },
      })
      return new Response(body, { status: 200 })
    }) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/deepseek dispatcher: fetch failed.*[Aa]bort/i)
  })

  it('throws a diagnostic error when the model returns empty content (round-6 grok)', async () => {
    // A 200 response with content === "" satisfies the zod schema but is
    // useless to the runner's JSON extractor. The dispatcher must surface
    // it with a clear message rather than handing back an empty string.
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/model returned empty content/i)
  })
})
