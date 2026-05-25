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

  // Round-9 F-001: broader public-IP classifier
  it('rejects CGNAT range (100.64.0.0/10)', () => {
    expect(validateSourceUrl('http://100.64.0.1/').ok).toBe(false)
    expect(validateSourceUrl('http://100.127.255.254/').ok).toBe(false)
  })

  it('accepts 100.63.x.x and 100.128.x.x (boundaries outside CGNAT)', () => {
    expect(validateSourceUrl('http://100.63.0.1/').ok).toBe(true)
    expect(validateSourceUrl('http://100.128.0.1/').ok).toBe(true)
  })

  it('rejects IPv4 benchmark range (198.18.0.0/15)', () => {
    expect(validateSourceUrl('http://198.18.0.1/').ok).toBe(false)
    expect(validateSourceUrl('http://198.19.255.254/').ok).toBe(false)
  })

  it('rejects IPv4 TEST-NET ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)', () => {
    expect(validateSourceUrl('http://192.0.2.1/').ok).toBe(false)
    expect(validateSourceUrl('http://198.51.100.1/').ok).toBe(false)
    expect(validateSourceUrl('http://203.0.113.1/').ok).toBe(false)
  })

  it('rejects IPv4 multicast (224.0.0.0/4) and reserved (240.0.0.0/4)', () => {
    expect(validateSourceUrl('http://224.0.0.1/').ok).toBe(false)
    expect(validateSourceUrl('http://239.255.255.255/').ok).toBe(false)
    expect(validateSourceUrl('http://240.0.0.1/').ok).toBe(false)
    expect(validateSourceUrl('http://255.255.255.255/').ok).toBe(false)
  })

  it('rejects 0.0.0.0/8 (this network)', () => {
    expect(validateSourceUrl('http://0.0.0.0/').ok).toBe(false)
    expect(validateSourceUrl('http://0.1.2.3/').ok).toBe(false)
  })

  it('rejects 192.0.0.0/24 (IETF protocol assignments)', () => {
    expect(validateSourceUrl('http://192.0.0.1/').ok).toBe(false)
  })

  it('accepts 8.8.8.8, 1.1.1.1, 93.184.216.34 (globally routable)', () => {
    expect(validateSourceUrl('http://8.8.8.8/').ok).toBe(true)
    expect(validateSourceUrl('http://1.1.1.1/').ok).toBe(true)
    expect(validateSourceUrl('http://93.184.216.34/').ok).toBe(true)
  })

  it('rejects IPv6 multicast [ff02::1]', () => {
    expect(validateSourceUrl('http://[ff02::1]/').ok).toBe(false)
  })

  it('rejects IPv6 documentation [2001:db8::1]', () => {
    expect(validateSourceUrl('http://[2001:db8::1]/').ok).toBe(false)
  })

  it('rejects IPv6 6to4 anycast [2002::1]', () => {
    expect(validateSourceUrl('http://[2002::1]/').ok).toBe(false)
  })

  it('accepts Cloudflare public IPv6 [2606:4700::6810:84e5]', () => {
    expect(validateSourceUrl('http://[2606:4700::6810:84e5]/').ok).toBe(true)
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
