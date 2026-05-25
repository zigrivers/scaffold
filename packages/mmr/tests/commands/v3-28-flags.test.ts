import { describe, it, expect } from 'vitest'
import yargs, { type CommandModule } from 'yargs'
import { reviewCommand } from '../../src/commands/review.js'
import { configCommand } from '../../src/commands/config.js'

function parse<T>(cmd: CommandModule<object, T>, argv: string[]): Record<string, unknown> {
  let captured: Record<string, unknown> | undefined
  const wrapped: CommandModule<object, T> = {
    ...cmd,
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

describe('v3.28 flag plumbing', () => {
  it('review --dry-run parses to boolean true', () => {
    const args = parse(reviewCommand, ['review', '--dry-run'])
    expect(args['dry-run']).toBe(true)
  })

  it('review without --dry-run defaults to false', () => {
    const args = parse(reviewCommand, ['review'])
    expect(args['dry-run']).toBe(false)
  })

  it('config init --with-examples parses to true', () => {
    const args = parse(configCommand, ['config', 'init', '--with-examples'])
    expect(args['with-examples']).toBe(true)
  })

  it('config channels show:claude --no-redact parses both flags', () => {
    const args = parse(configCommand, ['config', 'channels', 'show:claude', '--no-redact'])
    expect(args.action).toBe('channels')
    expect(args.name).toBe('show:claude')
    expect(args['no-redact']).toBe(true)
    expect(args.redact).toBe(false)
  })
})
