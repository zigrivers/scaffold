import { describe, it, expect, vi } from 'vitest'
import { checkOneUrl, checkUrlsForEntries } from './link-check.js'
import type { FetchImpl } from './link-check.js'

const allowResolver = async () => ['93.184.216.34']

describe('checkOneUrl', () => {
  it('returns ok for a 200 HEAD', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as FetchImpl
    const r = await checkOneUrl('https://example.com/a', { resolver: allowResolver, fetchImpl })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
  })

  it('falls back to GET-Range when HEAD returns 405', async () => {
    const calls: Array<{ method: string }> = []
    const fetchImpl = vi.fn(async (_url: string, init: Record<string, unknown>) => {
      calls.push({ method: String(init.method) })
      if (init.method === 'HEAD') return new Response(null, { status: 405 })
      return new Response('partial', { status: 206 })
    }) as unknown as FetchImpl
    const r = await checkOneUrl('https://example.com/a', { resolver: allowResolver, fetchImpl })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(206)
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET'])
  })

  it('fails on 404', async () => {
    const fetchImpl = vi.fn(async () => {
      // HEAD returns 404 → falls back to GET, which also returns 404.
      return new Response(null, { status: 404 })
    }) as unknown as FetchImpl
    const r = await checkOneUrl('https://example.com/missing', { resolver: allowResolver, fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })

  it('follows a 301 redirect', async () => {
    let hop = 0
    const fetchImpl = vi.fn(async () => {
      hop++
      if (hop === 1) return new Response(null, { status: 301, headers: { Location: 'https://example.com/b' } })
      return new Response(null, { status: 200 })
    }) as unknown as FetchImpl
    const r = await checkOneUrl('https://example.com/a', { resolver: allowResolver, fetchImpl })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
  })

  it('honors the operator skip list', async () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl
    const r = await checkOneUrl('https://flaky.example.com/x', {
      resolver: allowResolver, fetchImpl, skip: ['flaky.example.com'],
    })
    expect(r.skipped).toBe(true)
    expect(r.ok).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects SSRF targets via the validator', async () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl
    const r = await checkOneUrl('http://localhost/x', { resolver: allowResolver, fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/localhost|SSRF|blocked/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('checkUrlsForEntries', () => {
  it('aggregates ok=false when any URL fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/bad')) return new Response(null, { status: 404 })
      return new Response(null, { status: 200 })
    }) as unknown as FetchImpl
    const out = await checkUrlsForEntries([
      { file: 'a.md', sourceUrls: ['https://example.com/good', 'https://example.com/bad'] },
    ], { resolver: allowResolver, fetchImpl })
    expect(out.ok).toBe(false)
    expect(out.results.find((r) => r.url.endsWith('/bad'))?.ok).toBe(false)
  })
})
