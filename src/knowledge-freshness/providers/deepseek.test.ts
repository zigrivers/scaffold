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
