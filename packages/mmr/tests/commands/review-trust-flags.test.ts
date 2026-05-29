import { describe, it, expect } from 'vitest'
import yargs, { type Argv } from 'yargs'
import { reviewCommand } from '../../src/commands/review.js'

// Asserts the review builder registers the four trust flags. Invokes the
// builder directly (not the built dist, which CI does not produce) and reads
// the registered option keys, so the handler never runs.
describe('mmr review trust flags', () => {
  it('registers the four trust flags', () => {
    const built = (reviewCommand.builder as (y: Argv) => Argv)(yargs([]))
    const keys = Object.keys((built as unknown as { getOptions(): { key: Record<string, unknown> } }).getOptions().key)
    expect(keys).toEqual(
      expect.arrayContaining(['accept-new-acks', 'trust-project-config', 'trust-project-acks', 'config-base-ref']),
    )
  })
})
