import { describe, it, expect } from 'vitest'
import { wrapInChrome, CHROME_VERSION } from './template.js'

describe('wrapInChrome', () => {
  const args = {
    title: 'MMR Reference',
    body: '<h2 id="intro">Intro</h2><p>hi</p>',
    headings: [{ depth: 2, text: 'Intro', id: 'intro' }],
    css: ':root{--bg:#fff}',
  }

  it('produces a full self-contained HTML doc', () => {
    const html = wrapInChrome(args)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<title>MMR Reference</title>')
    expect(html).toContain('<style>:root{--bg:#fff}</style>')
    expect(html).toContain('--bg')
    expect(html).toContain('data-chrome-version="' + CHROME_VERSION + '"')
    expect(html).toContain('scaffold:chrome v' + CHROME_VERSION)
  })

  it('builds a TOC from headings', () => {
    const html = wrapInChrome(args)
    expect(html).toContain('href="#intro"')
    expect(html).toContain('>Intro<')
  })

  it('has no external network references', () => {
    const html = wrapInChrome(args)
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toContain('<link rel="stylesheet"')
  })

  it('injects theme-init script in <head> to prevent FOUC', () => {
    const html = wrapInChrome(args)
    // Theme-init read-and-apply logic must be present
    expect(html).toContain("getItem('guide-theme')")
    // Must appear before </head> (i.e., inside the <head> block)
    const headEnd = html.indexOf('</head>')
    expect(headEnd).toBeGreaterThan(-1)
    const themeInitPos = html.indexOf("getItem('guide-theme')")
    expect(themeInitPos).toBeGreaterThan(-1)
    expect(themeInitPos).toBeLessThan(headEnd)
  })
})
