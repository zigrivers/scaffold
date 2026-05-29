import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MmrConfigSchema } from '../../src/config/schema.js'
import { loadConfig } from '../../src/config/loader.js'

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

describe('http channel loader — auth.check_endpoint requirement', () => {
  it('REJECTS an http channel whose endpoint does not end in /chat/completions and has no auth.check_endpoint', () => {
    expect(() => MmrConfigSchema.parse({
      version: 1,
      channels: {
        custom: {
          kind: 'http',
          endpoint: 'https://api.example.com/v2/predict',
          model: 'm',
          endpoint_convention: 'openai-chat',
        },
      },
    })).toThrow(/check_endpoint/)
  })

  it('accepts a non-standard endpoint when auth.check_endpoint is set', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        custom: {
          kind: 'http',
          endpoint: 'https://api.example.com/v2/predict',
          model: 'm',
          endpoint_convention: 'openai-chat',
          auth: { check_endpoint: 'https://api.example.com/health' },
        },
      },
    })
    expect(parsed.channels.custom.kind).toBe('http')
  })

  it('accepts a standard /chat/completions endpoint with no explicit auth (probe URL derivable)', () => {
    const parsed = MmrConfigSchema.parse({
      version: 1,
      channels: {
        groq: {
          kind: 'http',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          model: 'llama3-70b',
          endpoint_convention: 'openai-chat',
        },
      },
    })
    expect(parsed.channels.groq.kind).toBe('http')
    if (parsed.channels.groq.kind === 'http') {
      expect(parsed.channels.groq.auth.check_method).toBe('GET')
      expect(parsed.channels.groq.auth.check_status_ok).toEqual([200])
    }
  })
})

describe('loadConfig — full round-trip with kind injection + http (back-compat)', () => {
  it('resolves a legacy kind-less extends chain and accepts an http channel without rejecting it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-kind-rt-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-kind-home-'))
    try {
      fs.writeFileSync(
        path.join(dir, '.mmr.yaml'),
        [
          'version: 1',
          'channels:',
          '  base:',
          '    abstract: true',
          '    command: ollama run',
          '    auth:',
          '      check: "true"',
          '      failure_exit_codes: [1]',
          '      recovery: x',
          '  qwen:', // legacy: no kind, inherits command from base
          '    extends: base',
          '    flags: [qwen]',
          '  groq:',
          '    kind: http',
          '    endpoint: https://api.groq.com/openai/v1/chat/completions',
          '    model: llama3-70b',
          '    endpoint_convention: openai-chat',
          '    api_key_env: GROQ_API_KEY',
        ].join('\n'),
      )
      // Must NOT throw "must define command" — http is runnable via endpoint,
      // and the kind-less qwen inherits command from base + gets kind injected.
      const cfg = loadConfig({ projectRoot: dir, userHome: home })
      expect(cfg.channels.qwen.kind).toBe('subprocess')
      expect(cfg.channels.qwen.command).toBe('ollama run')
      expect(cfg.channels.groq.kind).toBe('http')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
