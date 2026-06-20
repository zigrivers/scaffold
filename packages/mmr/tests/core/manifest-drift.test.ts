import { describe, expect, it } from 'vitest'
import { REGISTERED_TOP_LEVEL } from '../../src/cli.js'
import { COMMAND_MANIFEST } from '../../src/core/manifest.js'

describe('command manifest drift', () => {
  it('covers every registered top-level CLI command', () => {
    for (const name of REGISTERED_TOP_LEVEL) {
      const covered = COMMAND_MANIFEST.some(
        (s) => s.command === name || s.command.startsWith(`${name} `),
      )
      expect(covered, `manifest missing an entry for '${name}'`).toBe(true)
    }
  })

  it('every manifest entry has a runnable mmr example and a summary', () => {
    for (const s of COMMAND_MANIFEST) {
      expect(s.example.startsWith('mmr '), `bad example for ${s.command}`).toBe(true)
      expect(s.summary.length).toBeGreaterThan(0)
    }
  })
})
