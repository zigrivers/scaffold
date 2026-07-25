import { describe, expect, it } from 'vitest'
import { parseShell } from './parse-shell.js'

describe('parseShell', () => {
  it('splits a plain command on whitespace', () => {
    expect(parseShell('make check')).toEqual(['make', 'check'])
    expect(parseShell('  npx   vitest run  ')).toEqual(['npx', 'vitest', 'run'])
  })
  it('keeps a single-quoted value with spaces as one token, quotes stripped', () => {
    expect(parseShell('FOO=\'bar baz\' make check')).toEqual(['FOO=bar baz', 'make', 'check'])
  })
  it('keeps a double-quoted value with spaces as one token, quotes stripped', () => {
    expect(parseShell('run "a b c" end')).toEqual(['run', 'a b c', 'end'])
  })
  it('treats the other quote char as literal inside a quoted run', () => {
    expect(parseShell('echo "it\'s fine"')).toEqual(['echo', 'it\'s fine'])
  })
  it('does NOT expand substitutions or metacharacters — they stay literal tokens', () => {
    expect(parseShell('$(evil);rm')).toEqual(['$(evil);rm'])
    expect(parseShell('a `b` c')).toEqual(['a', '`b`', 'c'])
  })
  it('returns an empty array for an empty or whitespace-only string', () => {
    expect(parseShell('')).toEqual([])
    expect(parseShell('   ')).toEqual([])
  })
})
