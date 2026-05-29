import { describe, it, expect } from 'vitest'
import { lintGuide } from './lint.js'

describe('lintGuide', () => {
  it('passes a guide with no embeds', () => {
    const r = lintGuide('# Hi\n\nplain markdown\n')
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('errors when an :::embed lacks a text-equivalent', () => {
    const md = ':::embed{src=partials/x.svg}\n:::\n'
    const r = lintGuide(md)
    expect(r.errors.some((e) => /text.equivalent/i.test(e))).toBe(true)
  })

  it('passes an :::embed that includes a text-equivalent', () => {
    const md = ':::embed{src=partials/x.svg}\n**Text equivalent:** a diagram.\n:::\n'
    expect(lintGuide(md).errors).toEqual([])
  })

  it('warns past 3 embeds', () => {
    const one = ':::embed{src=p.svg}\n**Text equivalent:** x\n:::\n\n'
    const r = lintGuide(one.repeat(4))
    expect(r.warnings.some((w) => /embed/i.test(w))).toBe(true)
  })
})
