import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkHttpAuth, deriveProbeUrl } from '../../src/core/auth.js'
import type { HttpChannelParsed } from '../../src/config/schema.js'

describe('deriveProbeUrl', () => {
  it('replaces trailing /v1/chat/completions with /v1/models', () => {
    expect(deriveProbeUrl('https://api.groq.com/openai/v1/chat/completions')).toBe('https://api.groq.com/openai/v1/models')
  })

  it('replaces bare trailing /chat/completions with /models', () => {
    expect(deriveProbeUrl('https://localhost:1234/chat/completions')).toBe('https://localhost:1234/models')
  })

  it('returns undefined when endpoint does not end in /chat/completions', () => {
    expect(deriveProbeUrl('https://api.example.com/v2/predict')).toBeUndefined()
  })
})

const baseChannel: HttpChannelParsed = {
  kind: 'http',
  endpoint: 'https://api.example.com/v1/chat/completions',
  model: 'gpt-4',
  endpoint_convention: 'openai-chat',
  api_key_env: 'PROBE_KEY',
  api_key_header: 'Authorization',
  api_key_prefix: 'Bearer ',
  enabled: true,
  flags: [],
  env: {},
  prompt_wrapper: '{{prompt}}',
  output_parser: 'default',
  stderr: 'capture',
  abstract: false,
  auth: { check_method: 'GET', check_status_ok: [200], timeout: 5 },
}

describe('checkHttpAuth', () => {
  beforeEach(() => { process.env.PROBE_KEY = 'sk-probe-secret' })
  afterEach(() => { delete process.env.PROBE_KEY; vi.restoreAllMocks() })

  it('200 from probe URL → ok, with Authorization header carrying the key', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const result = await checkHttpAuth(baseChannel)
    expect(result.status).toBe('ok')
    const callUrl = fetchMock.mock.calls[0][0] as string
    expect(callUrl).toBe('https://api.example.com/v1/models')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-probe-secret')
    expect(init.method).toBe('GET')
  })

  it('401 from probe URL → failed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
    const result = await checkHttpAuth(baseChannel)
    expect(result.status).toBe('failed')
  })

  it('uses explicit auth.check_endpoint when set', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const c: HttpChannelParsed = { ...baseChannel, auth: { ...baseChannel.auth, check_endpoint: 'https://api.example.com/health' } }
    const result = await checkHttpAuth(c)
    expect(result.status).toBe('ok')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/health')
  })

  it('returns failed status when API key env var is unset', async () => {
    delete process.env.PROBE_KEY
    const result = await checkHttpAuth(baseChannel)
    expect(result.status).toBe('failed')
  })

  it('never leaks the key value in the result on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('forbidden sk-probe-secret', { status: 403 }))
    const c: HttpChannelParsed = { ...baseChannel, auth: { ...baseChannel.auth, recovery: 'set PROBE_KEY' } }
    const result = await checkHttpAuth(c)
    expect(result.status).toBe('failed')
    expect(JSON.stringify(result)).not.toContain('sk-probe-secret')
  })
})
