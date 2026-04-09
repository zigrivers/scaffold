import { describe, it, expect } from 'vitest'
import { stripJsTsComments, matchesConfigExport } from './file-text-match.js'

describe('stripJsTsComments', () => {
  it('strips single-line comments', () => {
    expect(stripJsTsComments('const x = 1 // comment')).toBe('const x = 1 ')
  })

  it('strips block comments', () => {
    expect(stripJsTsComments('const x = /* c */ 1')).toBe('const x =  1')
  })

  it('strips JSDoc', () => {
    expect(stripJsTsComments('/** @param x */\nconst f = 1')).toContain('const f = 1')
  })

  it('does not strip // inside strings', () => {
    expect(stripJsTsComments('const url = "http://example.com"')).toContain('http://example.com')
  })

  it('blanks template literal contents', () => {
    expect(stripJsTsComments('const x = `output: "export"`')).toBe('const x = ``')
  })

  it('handles escaped backslashes before quote correctly', () => {
    // The string literal is: const path = "C:\\"  // comment
    // That's a string containing a single backslash, followed by // comment.
    // Before the fix, the \\ before " would confuse the escape tracker and
    // leave the comment stripper in a bad state.
    const input = 'const path = "C:\\\\" // comment'
    const output = stripJsTsComments(input)
    // The // comment should be stripped (it's outside the string)
    expect(output).toBe('const path = "C:\\\\" ')
  })
})

describe('matchesConfigExport', () => {
  it('matches a primitive export default directive', () => {
    const content = 'export default { output: \'export\' }'
    expect(matchesConfigExport(content, 'output', 'export')).toBe(true)
  })

  it('matches module.exports variant', () => {
    const content = 'module.exports = { output: "standalone" }'
    expect(matchesConfigExport(content, 'output', 'standalone')).toBe(true)
  })

  it('matches defineConfig() wrapper', () => {
    expect(matchesConfigExport(
      'export default defineConfig({ output: \'hybrid\' })',
      'output', 'hybrid',
    )).toBe(true)
  })

  it('does not match inside line comments', () => {
    const content = '// output: \'export\'\nexport default {}'
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })

  it('does not match inside template literals', () => {
    const content = 'const s = `output: \'export\'`\nexport default {}'
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })

  it('does not match dynamic expressions', () => {
    const content = 'export default { output: process.env.X ? \'export\' : undefined }'
    expect(matchesConfigExport(content, 'output', 'export')).toBe(false)
  })
})
