import { describe, it, expect } from 'vitest'
import { resolveDispatchChannels } from '../../src/commands/review.js'

describe('resolveDispatchChannels (T1-A)', () => {
  const sampleChannels = {
    'ollama-base': { enabled: true, abstract: true, command: 'ollama run', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    qwen: { enabled: true, abstract: false, command: 'ollama run', flags: ['qwen'], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    deepseek: { enabled: true, abstract: false, command: 'ollama run', flags: ['deepseek'], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    disabled: { enabled: false, abstract: false, command: 'x', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
  }

  it('filters out channels with abstract: true from default resolution', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set())
    expect(names).not.toContain('ollama-base')
    expect(names).toContain('qwen')
    expect(names).toContain('deepseek')
  })

  it('throws when an abstract channel is explicitly requested via --channels', () => {
    expect(() => resolveDispatchChannels(sampleChannels, ['ollama-base', 'qwen'], new Set()))
      .toThrow('Channel "ollama-base" is abstract and cannot be dispatched')
  })

  it('throws when an explicitly requested channel does not exist', () => {
    expect(() => resolveDispatchChannels(sampleChannels, ['missing-channel', 'qwen'], new Set()))
      .toThrow('Channel "missing-channel" not found in config')
  })

  it('honors an explicitly provided empty channel list', () => {
    const names = resolveDispatchChannels(sampleChannels, [], new Set())
    expect(names).toEqual([])
  })

  it('respects channels_disabled set alongside abstract filter', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set(['qwen']))
    expect(names).not.toContain('qwen')
    expect(names).not.toContain('ollama-base')
    expect(names).toContain('deepseek')
  })

  it('excludes disabled channels', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set())
    expect(names).not.toContain('disabled')
  })
})
