import { describe, it, expect, vi } from 'vitest'
import { fetchAndHash } from './source-hash.js'

describe('fetchAndHash', () => {
  it('returns a sha256:-prefixed hex digest of the response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('hello world', { status: 200 }) as Response,
    )
    const { hash, body } = await fetchAndHash('https://example.org/anything')
    expect(hash).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    expect(body).toBe('hello world')
  })

  it('throws on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }) as Response)
    await expect(fetchAndHash('https://example.org/down')).rejects.toThrow(/503/)
  })
})
