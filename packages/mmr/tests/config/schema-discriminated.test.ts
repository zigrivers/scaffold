import { describe, it, expect } from 'vitest'
import { MmrConfigSchema } from '../../src/config/schema.js'

describe('ChannelConfigSchema — discriminated union on kind', () => {
  it('accepts a channel with no `kind` (back-compat — defaults to subprocess)', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        legacy: {
          command: 'claude -p',
          auth: { check: 'claude --help', failure_exit_codes: [1], recovery: 'claude login' },
        },
      },
    })
    expect(parsed.channels.legacy.kind).toBe('subprocess')
  })

  it('accepts an explicit kind: subprocess', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        c: {
          kind: 'subprocess',
          command: 'foo',
          auth: { check: 'foo --help', failure_exit_codes: [1], recovery: 'foo login' },
        },
      },
    })
    expect(parsed.channels.c.kind).toBe('subprocess')
  })

  it('accepts kind: http with required fields', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        groq: {
          kind: 'http',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          model: 'llama3-70b',
          endpoint_convention: 'openai-chat',
          api_key_env: 'GROQ_API_KEY',
        },
      },
    })
    expect(parsed.channels.groq.kind).toBe('http')
  })

  it('REJECTS endpoint_convention: generic (deferred to a future release per §5 decision 8)', () => {
    expect(() => MmrConfigSchema.parse({
      version: 1,
      channels: {
        x: { kind: 'http', endpoint: 'https://x', model: 'm', endpoint_convention: 'generic' },
      },
    })).toThrow()
  })

  it('REJECTS http channel missing endpoint', () => {
    expect(() => MmrConfigSchema.parse({
      version: 1,
      channels: {
        x: { kind: 'http', model: 'm', endpoint_convention: 'openai-chat' },
      },
    })).toThrow()
  })

  it('REJECTS http channel missing model', () => {
    expect(() => MmrConfigSchema.parse({
      version: 1,
      channels: {
        x: { kind: 'http', endpoint: 'https://x', endpoint_convention: 'openai-chat' },
      },
    })).toThrow()
  })

  it('accepts http channel with no api_key_env (anonymous endpoints exist)', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        local: {
          kind: 'http',
          endpoint: 'http://localhost:1234/v1/chat/completions',
          model: 'local-llm',
          endpoint_convention: 'openai-chat',
        },
      },
    })
    expect(parsed.channels.local.kind).toBe('http')
  })

  it('preserves back-compat fields (extends/abstract) on subprocess channels', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        base: { abstract: true, command: 'x', auth: { check: 'x', failure_exit_codes: [1], recovery: 'x' } },
      },
    })
    expect(parsed.channels.base.kind).toBe('subprocess')
    expect(parsed.channels.base.abstract).toBe(true)
  })
})
