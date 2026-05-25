import { describe, it, expect } from 'vitest'
import {
  validateSourceUrl,
  assertSafeSourceUrl,
  isAllowlistedSource,
} from './source-url-validator.js'

describe('validateSourceUrl', () => {
  it('accepts public https URLs', () => {
    const r = validateSourceUrl('https://owasp.org/Top10/')
    expect(r.ok).toBe(true)
  })

  it('accepts public http URLs', () => {
    const r = validateSourceUrl('http://example.com/x')
    expect(r.ok).toBe(true)
  })

  it('rejects file:// URLs', () => {
    const r = validateSourceUrl('file:///etc/passwd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/protocol/)
  })

  it('rejects localhost', () => {
    const r = validateSourceUrl('http://localhost:8080/health')
    expect(r.ok).toBe(false)
  })

  it('rejects 127.0.0.1', () => {
    const r = validateSourceUrl('http://127.0.0.1/x')
    expect(r.ok).toBe(false)
  })

  it('rejects 10.0.0.0/8 private', () => {
    const r = validateSourceUrl('http://10.0.0.1/x')
    expect(r.ok).toBe(false)
  })

  it('rejects 192.168.0.0/16 private', () => {
    const r = validateSourceUrl('http://192.168.1.1/x')
    expect(r.ok).toBe(false)
  })

  it('rejects 169.254.0.0/16 link-local', () => {
    const r = validateSourceUrl('http://169.254.169.254/latest/meta-data/')
    expect(r.ok).toBe(false)
  })

  it('rejects 172.16.0.0/12 private', () => {
    const r = validateSourceUrl('http://172.20.0.1/x')
    expect(r.ok).toBe(false)
  })

  it('accepts 8.8.8.8 (public IP)', () => {
    const r = validateSourceUrl('http://8.8.8.8/')
    expect(r.ok).toBe(true)
  })

  it('rejects unparseable URL', () => {
    const r = validateSourceUrl('not a url')
    expect(r.ok).toBe(false)
  })

  it('rejects ftp:// scheme', () => {
    const r = validateSourceUrl('ftp://example.com/x')
    expect(r.ok).toBe(false)
  })

  // Round-4 F-001: IPv6 hardening
  it('rejects IPv6 loopback [::1]', () => {
    expect(validateSourceUrl('http://[::1]/').ok).toBe(false)
  })

  it('rejects IPv6 link-local [fe80::1]', () => {
    expect(validateSourceUrl('http://[fe80::1]/').ok).toBe(false)
  })

  it('rejects IPv6 ULA [fd00::1]', () => {
    expect(validateSourceUrl('http://[fd00::1]/').ok).toBe(false)
  })

  it('rejects IPv6 ULA [fc00::1]', () => {
    expect(validateSourceUrl('http://[fc00::1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 loopback [::ffff:127.0.0.1]', () => {
    expect(validateSourceUrl('http://[::ffff:127.0.0.1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 private [::ffff:10.0.0.1]', () => {
    expect(validateSourceUrl('http://[::ffff:10.0.0.1]/').ok).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 link-local [::ffff:169.254.169.254]', () => {
    expect(validateSourceUrl('http://[::ffff:169.254.169.254]/').ok).toBe(false)
  })

  it('accepts public IPv6 [2606:4700:4700::1111] (Cloudflare)', () => {
    expect(validateSourceUrl('http://[2606:4700:4700::1111]/').ok).toBe(true)
  })

  it('rejects IPv6 unspecified [::]', () => {
    expect(validateSourceUrl('http://[::]/').ok).toBe(false)
  })
})

describe('assertSafeSourceUrl', () => {
  it('throws on a blocked URL', () => {
    expect(() => assertSafeSourceUrl('http://127.0.0.1/')).toThrow(/refusing to fetch/)
  })

  it('returns the URL on success', () => {
    const url = assertSafeSourceUrl('https://owasp.org/Top10/#section')
    expect(url.hostname).toBe('owasp.org')
  })
})

describe('isAllowlistedSource', () => {
  const allowlist = {
    hosts: ['owasp.org', 'ietf.org/rfc', 'anthropic.com/docs'],
    github_repos: ['modelcontextprotocol/specification'],
  }

  it('matches a bare hostname', () => {
    expect(isAllowlistedSource(new URL('https://owasp.org/Top10/'), allowlist)).toBe(true)
  })

  it('matches a subdomain of a bare hostname', () => {
    expect(isAllowlistedSource(new URL('https://docs.owasp.org/x'), allowlist)).toBe(true)
  })

  it('matches a host+path-prefix entry', () => {
    expect(isAllowlistedSource(new URL('https://ietf.org/rfc/rfc6749.html'), allowlist)).toBe(true)
  })

  it('rejects a host+path-prefix when path is wrong', () => {
    expect(isAllowlistedSource(new URL('https://ietf.org/about/'), allowlist)).toBe(false)
  })

  it('matches a curated github repo', () => {
    expect(
      isAllowlistedSource(
        new URL('https://github.com/modelcontextprotocol/specification/blob/main/spec.md'),
        allowlist,
      ),
    ).toBe(true)
  })

  it('rejects a github repo not in the allowlist', () => {
    expect(
      isAllowlistedSource(new URL('https://github.com/some-random/repo'), allowlist),
    ).toBe(false)
  })

  it('rejects a non-allowlisted host', () => {
    expect(isAllowlistedSource(new URL('https://stackoverflow.com/q/1'), allowlist)).toBe(false)
  })
})
