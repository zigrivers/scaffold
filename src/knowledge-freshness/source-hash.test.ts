import { describe, it, expect, vi } from 'vitest'
import { fetchAndHash } from './source-hash.js'
import type { Resolver } from './source-url-validator.js'

// Stub resolver: every public hostname resolves to a single public IP.
// Tests that want to exercise DNS-rebinding rejection inject a different
// resolver that returns a private IP.
const publicResolver: Resolver = async () => ['93.184.216.34']

describe('fetchAndHash', () => {
  it('returns a sha256:-prefixed hex digest of the response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('hello world', { status: 200 }) as Response,
    )
    const { hash, body } = await fetchAndHash('https://example.org/anything', { resolver: publicResolver })
    expect(hash).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
    expect(body).toBe('hello world')
  })

  it('throws on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }) as Response)
    await expect(fetchAndHash('https://example.org/down', { resolver: publicResolver })).rejects.toThrow(/503/)
  })

  // Round-4 F-002: redirect validation
  it('follows a redirect to a public URL and hashes the final body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', {
        status: 302, headers: { Location: 'https://example.org/final' },
      }) as Response)
      .mockResolvedValueOnce(new Response('hello world', { status: 200 }) as Response)
    const { hash } = await fetchAndHash('https://example.org/start', { resolver: publicResolver })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(hash).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('rejects a redirect that targets a private network (SSRF via 302)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', {
      status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
    }) as Response)
    await expect(
      fetchAndHash('https://example.org/looks-fine', { resolver: publicResolver }),
    ).rejects.toThrow(/refusing to fetch/)
  })

  it('rejects a redirect chain ending in localhost', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', {
        status: 302, headers: { Location: 'https://b.example.org/' },
      }) as Response)
      .mockResolvedValueOnce(new Response('', {
        status: 302, headers: { Location: 'http://localhost:8080/' },
      }) as Response)
    await expect(
      fetchAndHash('https://a.example.org/', { resolver: publicResolver }),
    ).rejects.toThrow(/refusing to fetch/)
  })

  it('errors when a 3xx response is missing a Location header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 302 }) as Response)
    await expect(
      fetchAndHash('https://example.org/x', { resolver: publicResolver }),
    ).rejects.toThrow(/no Location header/)
  })

  it('errors after exceeding the redirect-hop limit', async () => {
    // 6 consecutive redirects → 1 initial + 5 follow-ups = 6 fetches, then bail.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('', { status: 302, headers: { Location: 'https://hop.example.org/' } }) as Response,
    )
    await expect(fetchAndHash('https://example.org/start', { resolver: publicResolver })).rejects.toThrow(/exceeded/)
  })

  // Round-5 F-001: DNS-rebinding guard
  it('rejects a hostname that resolves to a private IPv4 (DNS-rebinding)', async () => {
    const rebindingResolver: Resolver = async () => ['127.0.0.1']
    await expect(
      fetchAndHash('https://attacker.example/', { resolver: rebindingResolver }),
    ).rejects.toThrow(/DNS-rebinding/)
  })

  it('rejects a hostname that resolves to a private IPv6 (DNS-rebinding)', async () => {
    const rebindingResolver: Resolver = async () => ['fe80::1']
    await expect(
      fetchAndHash('https://attacker.example/', { resolver: rebindingResolver }),
    ).rejects.toThrow(/DNS-rebinding/)
  })
})
