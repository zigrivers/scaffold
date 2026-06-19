// src/knowledge-freshness/redirect-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyRedirect, SourceUnusableError } from './redirect-classifier.js'

const OWASP_STUB =
  '<!doctype html><html><head>' +
  '<meta http-equiv="refresh" content="0; url=./2025/en/">' +
  '<link rel="canonical" href="./2025/en/">' +
  '</head><body><p>Redirecting to OWASP Top 10:2025. ' +
  '<a href="./2025/en/">click here</a>.</p></body></html>'

describe('classifyRedirect', () => {
  it('follows a near-zero meta-refresh to a different URL', () => {
    const c = classifyRedirect(OWASP_STUB, 'text/html; charset=utf-8', 'https://owasp.org/Top10/')
    expect(c).toEqual({ kind: 'follow', target: 'https://owasp.org/Top10/2025/en/' })
  })

  it('follows a different-target meta-refresh regardless of a long delay', () => {
    const html = '<html><head><meta http-equiv="refresh" content="5; url=https://x.test/real"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/old')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/real' })
  })

  it('rejects a near-zero self/cyclic refresh as unusable', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=/here"></head><body>x</body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c.kind).toBe('unusable')
  })

  it('treats a target differing only by #fragment as cyclic', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=/here#a"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c.kind).toBe('unusable')
  })

  it('accepts a long-delay self-refresh (auto-reload) with content', () => {
    const html = '<html><head><meta http-equiv="refresh" content="300"></head><body>real dashboard content here</body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/dash')
    expect(c).toEqual({ kind: 'accept' })
  })

  it('rejects a meta-refresh to a non-http(s) scheme', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=javascript:alert(1)"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    expect(c.kind).toBe('unusable')
  })

  it('resolves the target against <base href> (itself resolved to absolute)', () => {
    const html = '<html><head><base href="/v2/"><meta http-equiv="refresh" content="0; url=real"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/section/page')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/v2/real' })
  })

  it('accepts a real page that also carries a long auto-reload tag', () => {
    const html = '<html><head><meta http-equiv="refresh" content="600"></head><body>' + 'lots of real content '.repeat(50) + '</body></html>'
    expect(classifyRedirect(html, 'text/html', 'https://x.test/p')).toEqual({ kind: 'accept' })
  })

  it('accepts a small legitimate HTML page with no redirect mechanism', () => {
    expect(classifyRedirect('<html><body>v3.2.1</body></html>', 'text/html', 'https://x.test/v')).toEqual({ kind: 'accept' })
  })

  it('accepts non-HTML sources unchanged (explicit content-type)', () => {
    expect(classifyRedirect('{"version":"1"}', 'application/json', 'https://x.test/v.json')).toEqual({ kind: 'accept' })
    expect(classifyRedirect('1.2.3', 'text/plain', 'https://x.test/VERSION')).toEqual({ kind: 'accept' })
  })

  it('classifies a missing/mislabeled content-type by sniffing an HTML-looking body', () => {
    const c = classifyRedirect(OWASP_STUB, null, 'https://owasp.org/Top10/')
    expect(c.kind).toBe('follow')
    const c2 = classifyRedirect(OWASP_STUB, 'text/plain', 'https://owasp.org/Top10/')
    expect(c2.kind).toBe('follow')
  })

  it('rejects a JS-only redirect with little content', () => {
    const html = '<html><head><script>window.location.replace("/elsewhere")</script></head><body></body></html>'
    expect(classifyRedirect(html, 'text/html', 'https://x.test/p').kind).toBe('unusable')
  })

  it('does not catastrophically backtrack on a pathological body (bounded time)', () => {
    const evil = '<html><head>' + '<meta '.repeat(20000) + '</head>'
    const start = Date.now()
    classifyRedirect(evil, 'text/html', 'https://x.test/p')
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('SourceUnusableError carries url and detail', () => {
    const e = new SourceUnusableError('https://x.test/p', 'because')
    expect(e.url).toBe('https://x.test/p')
    expect(e.detail).toBe('because')
    expect(e.name).toBe('SourceUnusableError')
  })
})
