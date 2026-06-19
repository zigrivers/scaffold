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

  // I1 — single-quoted and unquoted url= in meta-refresh content attribute
  it('extracts single-quoted url= target from meta-refresh content', () => {
    const html = "<html><head><meta http-equiv=\"refresh\" content=\"0; url='https://x.test/dest'\"></head></html>"
    const c = classifyRedirect(html, 'text/html', 'https://x.test/src')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/dest' })
  })

  it('extracts unquoted url= target from meta-refresh content', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=https://x.test/dest"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/src')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/dest' })
  })

  // I2 — always sniff body; text/plain that looks like HTML is treated as HTML
  it('treats text/plain body starting with <!doctype html as HTML (mislabeled stub)', () => {
    const stub = '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=https://x.test/real"></head></html>'
    const c = classifyRedirect(stub, 'text/plain', 'https://x.test/old')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/real' })
  })

  it('treats text/plain body starting with <meta http-equiv=refresh as HTML (mislabeled stub)', () => {
    const stub = '<meta http-equiv="refresh" content="0; url=https://x.test/real">'
    const c = classifyRedirect(stub, 'text/plain', 'https://x.test/old')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/real' })
  })

  it('accepts text/plain body that does not look like HTML', () => {
    expect(classifyRedirect('1.2.3', 'text/plain', 'https://x.test/VERSION')).toEqual({ kind: 'accept' })
    expect(classifyRedirect('just some plain text', 'text/plain', 'https://x.test/p')).toEqual({ kind: 'accept' })
  })

  it('accepts application/json body even when it does not look like HTML', () => {
    expect(classifyRedirect('{"version":"1"}', 'application/json', 'https://x.test/v.json')).toEqual({ kind: 'accept' })
  })

  // I3 — commented-out JS redirect should NOT trigger hasJsRedirect
  it('does not flag commented-out window.location as a JS redirect', () => {
    const html = '<html><head><!-- window.location = "/elsewhere"; --></head><body>real content here with enough text to pass the floor check</body></html>'
    // The comment contains a JS redirect but real content is present; either way it must not be unusable
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    // Should accept — commented-out code must not trigger the JS redirect path
    expect(c).toEqual({ kind: 'accept' })
  })

  it('does not flag noscript-wrapped window.location as unusable when page has no other redirect', () => {
    // A page with a noscript fallback that references window.location should not be flagged if there's real content
    const html = '<html><head></head><body>' + 'real content '.repeat(20) + '<noscript><!-- window.location.href = "/nojs" --></noscript></body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    expect(c).toEqual({ kind: 'accept' })
  })

  // I4 — boundary tests for near-zero delay threshold (NEAR_ZERO_DELAY_MAX_SEC = 1)
  it('classifies self-refresh with delay=1 as unusable (boundary: <= threshold)', () => {
    const html = '<html><head><meta http-equiv="refresh" content="1; url=/here"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c.kind).toBe('unusable')
  })

  it('accepts self-refresh with delay=2 as auto-reload (boundary: above threshold)', () => {
    const html = '<html><head><meta http-equiv="refresh" content="2; url=/here"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c).toEqual({ kind: 'accept' })
  })

  // m3 — meta-refresh to data: and file: scheme → unusable
  it('classifies meta-refresh to data: URL as unusable', () => {
    // Use a data: URL without embedded HTML angle-brackets so the meta tag parses cleanly
    const html = '<html><head><meta http-equiv="refresh" content="0; url=data:text/html;base64,PHRlc3Q+"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    expect(c.kind).toBe('unusable')
  })

  it('classifies meta-refresh to file: URL as unusable', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=file:///etc/passwd"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    expect(c.kind).toBe('unusable')
  })

  // m4 — malformed finalUrl falls back gracefully (no throw)
  it('does not throw when finalUrl is not a valid absolute URL', () => {
    const html = '<html><body>some content here</body></html>'
    // Should not throw; falls back gracefully
    expect(() => classifyRedirect(html, 'text/html', 'not-a-url')).not.toThrow()
  })

  // C2 — ReDoS timing test: JS-redirect path with pathological body
  it('completes the JS-redirect path quickly on a body with many unclosed <script opens (ReDoS guard)', () => {
    // Many "<script" opens with no closing tags, plus a window.location= to trigger hasJsRedirect
    // visibleTextLength must not catastrophically backtrack on this input
    const manyOpenScripts = '<script'.repeat(5000)
    const body = '<html><head>' + manyOpenScripts + '\nwindow.location="https://x.test/dest"\n</head><body></body></html>'
    const start = Date.now()
    classifyRedirect(body, 'text/html', 'https://x.test/p')
    expect(Date.now() - start).toBeLessThan(1000)
  })

  // N1 — HTML-comment blindness: commented-out meta-refresh and base href must be ignored
  it('N1a: accepts a page whose only meta-refresh is inside an HTML comment (not a real redirect)', () => {
    // The meta-refresh is commented out; there is real <body> content → should be accepted
    const html =
      '<html><head>' +
      '<!-- <meta http-equiv="refresh" content="0; url=https://other.test/"> -->' +
      '</head><body><p>Real content here with plenty of text to read.</p></body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://real.test/page')
    expect(c).toEqual({ kind: 'accept' })
  })

  it('N1b: resolves meta-refresh relative url= against real base, not a commented-out <base href>', () => {
    // The <base href> is commented out; a real near-zero meta-refresh uses a relative url=.
    // The target must be resolved against finalUrl, not the commented-out base.
    const html =
      '<html><head>' +
      '<!-- <base href="https://bad.test/"> -->' +
      '<meta http-equiv="refresh" content="0; url=real/">' +
      '</head><body></body></html>'
    const finalUrl = 'https://good.test/section/'
    const c = classifyRedirect(html, 'text/html', finalUrl)
    // Should follow to https://good.test/section/real/ (relative to finalUrl), NOT bad.test
    expect(c).toEqual({ kind: 'follow', target: 'https://good.test/section/real/' })
  })
})
