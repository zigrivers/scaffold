import { describe, it, expect } from 'vitest'
import yargs, { type CommandModule } from 'yargs'
import { reviewCommand } from '../../src/commands/review.js'
import { reconcileCommand } from '../../src/commands/reconcile.js'

/**
 * Argv-parsing tests: build a yargs parser using each command's builder,
 * substitute the handler so we can capture the parsed args, and assert.
 */
function parse<T>(command: CommandModule<object, T>, argv: string[]): Record<string, unknown> {
  let captured: Record<string, unknown> | undefined
  const wrapped: CommandModule<object, T> = {
    ...command,
    handler: (args) => { captured = args as unknown as Record<string, unknown> },
  }
  yargs(argv)
    .scriptName('mmr')
    .command(wrapped)
    .strict()
    .fail((msg, err) => { throw err ?? new Error(msg) })
    .exitProcess(false)
    .parseSync()
  if (!captured) throw new Error('handler not invoked')
  return captured
}

describe('review command argv parsing', () => {
  it('accepts "--diff -" (stdin) with a space separator', () => {
    const args = parse(reviewCommand, ['review', '--diff', '-', '--channels', 'claude'])
    expect(args.diff).toBe('-')
  })

  it('accepts "--diff=-" (equals separator)', () => {
    const args = parse(reviewCommand, ['review', '--diff=-', '--channels', 'claude'])
    expect(args.diff).toBe('-')
  })

  it('accepts a normal file path for --diff', () => {
    const args = parse(reviewCommand, ['review', '--diff', '/tmp/x.patch'])
    expect(args.diff).toBe('/tmp/x.patch')
  })
})

describe('reconcile command argv parsing', () => {
  it('accepts "--input -" (stdin) with a space separator', () => {
    const args = parse(reconcileCommand, [
      'reconcile', 'mmr-abc', '--channel', 'superpowers', '--input', '-',
    ])
    expect(args.input).toBe('-')
  })

  it('accepts "--input=-" (equals separator)', () => {
    const args = parse(reconcileCommand, [
      'reconcile', 'mmr-abc', '--channel', 'superpowers', '--input=-',
    ])
    expect(args.input).toBe('-')
  })
})
