import { describe, it, expect } from 'vitest'
import { MmrConfigSchema } from '../../src/config/schema.js'

/**
 * prompt_delivery controls how the dispatcher hands the prompt to a channel
 * process: 'stdin' (default — pipe to stdin, like claude/gemini/codex) or
 * 'prompt-file' (write to a temp file and pass its path, for CLIs such as
 * grok that require the prompt as an argument value and ignore stdin).
 */
describe('ChannelConfigSchema — prompt_delivery', () => {
  function parseChannel(channel: Record<string, unknown>) {
    return MmrConfigSchema.safeParse({
      version: 1,
      channels: { c1: channel },
    })
  }

  it('accepts prompt_delivery: "stdin"', () => {
    const result = parseChannel({ command: 'cat', prompt_delivery: 'stdin' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.c1.prompt_delivery).toBe('stdin')
    }
  })

  it('accepts prompt_delivery: "prompt-file"', () => {
    const result = parseChannel({ command: 'grok', prompt_delivery: 'prompt-file' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.c1.prompt_delivery).toBe('prompt-file')
    }
  })

  it('leaves prompt_delivery undefined when omitted (dispatcher defaults to stdin)', () => {
    const result = parseChannel({ command: 'cat' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.c1.prompt_delivery).toBeUndefined()
    }
  })

  it('rejects an unknown prompt_delivery value', () => {
    const result = parseChannel({ command: 'grok', prompt_delivery: 'carrier-pigeon' })
    expect(result.success).toBe(false)
  })
})
