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

  // F2: multi-line template literals must not reset `inTemplate` state at
  // line boundaries. Before the fix, a `//` on an interior template line was
  // sliced as a comment, destroying the closing backtick and corrupting
  // downstream regex matches.
  it('does not slice // inside a multi-line template literal', () => {
    // Template spans 3 lines; middle line has `//` which is NOT a comment.
    const input = 'const t = `line1\n// line2\nline3`'
    const output = stripJsTsComments(input)
    // After Step 3, the entire template collapses to ``.
    // The output should start with the declaration and end with the
    // collapsed template. Critically, nothing after the template start
    // should be sliced off.
    expect(output.startsWith('const t = ')).toBe(true)
    expect(output.endsWith('``')).toBe(true)
  })

  it('preserves multi-line template literals with embedded // patterns', () => {
    // A SQL-style template literal on 3 lines with `//` on the middle line.
    // Before the fix, line 2's `//` was misread as a line comment and the
    // closing backtick was sliced off.
    const input = 'const sql = `\nSELECT * FROM users // not a comment\nWHERE id = 1`'
    const output = stripJsTsComments(input)
    // Step 3 blanks the template to `` — assert the collapsed backticks survive.
    expect(output).toContain('``')
    // And the declaration prefix must be intact.
    expect(output.startsWith('const sql = ')).toBe(true)
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
