import { describe, it, expect, vi } from 'vitest'
import { buildZaiDispatcher, type ZaiFetch } from './zai.js'

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('zai provider — happy path', () => {
  it('POSTs to api.z.ai/api/paas/v4/chat/completions with bearer auth and the prompt as user message', async () => {
    const rawFetchMock = vi.fn<ZaiFetch>(async () => ok({
      choices: [{ message: { content: '{"verdict":"current"}' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({
      apiKey: 'sk-test-key',
      timeoutSec: 600,
      fetchImpl: fetchSpy,
    })
    const result = await dispatcher('the meta-prompt body')
    expect(result).toBe('{"verdict":"current"}')
    expect(rawFetchMock).toHaveBeenCalledWith(
      'https://api.z.ai/api/paas/v4/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
    )
    const sentBody = JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string)
    expect(sentBody).toEqual({
      model: 'glm-4.6',
      messages: [{ role: 'user', content: 'the meta-prompt body' }],
      // Thinking mode disabled so temperature: 0 takes effect and the model
      // goes straight to the JSON verdict (same rationale as the deepseek path).
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 8192,
      stream: false,
    })
  })

  it('uses the model from the override when set (allowlist member)', async () => {
    const rawFetchMock = vi.fn<ZaiFetch>(async () => ok({
      choices: [{ message: { content: 'response' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({
      apiKey: 'k',
      timeoutSec: 60,
      model: 'glm-4.5-air',
      fetchImpl: fetchSpy,
    })
    await dispatcher('x')
    expect(JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string).model).toBe('glm-4.5-air')
  })
})

describe('zai provider — error paths', () => {
  it('throws on non-2xx response with status + truncated body', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () =>
      new Response('{"error":{"message":"rate limited","type":"rate_limit_error"}}', { status: 429 }),
    ) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/HTTP 429.*rate limited/i)
  })

  it('throws on a 200 response that lacks choices[0].message.content', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    ) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/missing choices\[0\]\.message\.content/i)
  })

  it('throws a diagnostic error on a 200 response whose body is not JSON', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () =>
      new Response('not json at all', {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/response was not valid JSON.*not json at all/i)
  })

  it('rejects an unsupported model at construction time (not at fetch time)', () => {
    expect(() => buildZaiDispatcher({
      apiKey: 'k', timeoutSec: 60, model: 'gpt-4',
    })).toThrow(/unsupported Z\.ai model "gpt-4".*glm-4\.6.*glm-4\.5-air/i)
  })

  it('rejects construction when apiKey is empty', () => {
    expect(() => buildZaiDispatcher({ apiKey: '', timeoutSec: 60 })).toThrow(/ZAI_API_KEY is required/)
  })

  it('normalizes transport errors (DNS / reset / reject) → zai-prefixed message', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.z.ai')
    }) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/zai dispatcher: fetch failed.*ENOTFOUND/i)
  })

  it('unwraps err.cause when undici throws TypeError + cause', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.z.ai'), {
      code: 'ENOTFOUND',
    })
    const outer = new TypeError('fetch failed')
    ;(outer as Error & { cause?: unknown }).cause = cause
    const fetchSpy: ZaiFetch = vi.fn(async () => { throw outer }) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/zai dispatcher: fetch failed.*ENOTFOUND.*api\.z\.ai/i)
  })

  it('normalizes a body-read abort (headers OK, body hangs) → zai-prefixed', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'))
        },
      })
      return new Response(body, { status: 200 })
    }) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/zai dispatcher: fetch failed.*[Aa]bort/i)
  })

  it('throws a diagnostic error when the model returns empty content', async () => {
    const fetchSpy: ZaiFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 }),
    ) as unknown as ZaiFetch
    const dispatcher = buildZaiDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/model returned empty content/i)
  })
})
