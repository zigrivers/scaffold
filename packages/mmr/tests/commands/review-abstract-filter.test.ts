import { describe, it, expect } from 'vitest'
import { resolveDispatchChannels } from '../../src/commands/review.js'
import type { ChannelConfigParsed } from '../../src/config/schema.js'

describe('resolveDispatchChannels (T1-A)', () => {
  const sampleChannels = {
    'ollama-base': { kind: 'subprocess' as const, enabled: true, abstract: true, command: 'ollama run', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    qwen: { kind: 'subprocess' as const, enabled: true, abstract: false, command: 'ollama run', flags: ['qwen'], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    deepseek: { kind: 'subprocess' as const, enabled: true, abstract: false, command: 'ollama run', flags: ['deepseek'], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    disabled: { kind: 'subprocess' as const, enabled: false, abstract: false, command: 'x', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    antigravity: { kind: 'subprocess' as const, enabled: true, abstract: false, command: 'agy', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    gemini: { kind: 'subprocess' as const, enabled: false, abstract: false, retired: true, command: 'gemini', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
  } satisfies Record<string, ChannelConfigParsed>

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

  it('resolves the agy alias to the canonical antigravity channel when explicitly requested', () => {
    const names = resolveDispatchChannels(sampleChannels, ['agy'], new Set())
    expect(names).toEqual(['antigravity'])
  })

  it('treats a canonical antigravity request the same as the alias', () => {
    const names = resolveDispatchChannels(sampleChannels, ['antigravity'], new Set())
    expect(names).toEqual(['antigravity'])
  })

  it('honors channels_disabled given as the agy alias (default resolution)', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set(['agy']))
    expect(names).not.toContain('antigravity')
    expect(names).toContain('qwen')
  })

  it('dedupes an alias + its canonical requested together (no double dispatch)', () => {
    const names = resolveDispatchChannels(sampleChannels, ['agy', 'antigravity'], new Set())
    expect(names).toEqual(['antigravity'])
  })

  it('dedupes a plainly repeated explicit channel', () => {
    const names = resolveDispatchChannels(sampleChannels, ['qwen', 'qwen'], new Set())
    expect(names).toEqual(['qwen'])
  })

  it('excludes a retired channel (gemini) from default resolution', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set())
    expect(names).not.toContain('gemini')
  })

  it('throws a migration hint when a retired channel is explicitly requested', () => {
    expect(() => resolveDispatchChannels(sampleChannels, ['gemini'], new Set()))
      .toThrow('Channel "gemini" is retired and cannot be dispatched — use "antigravity" instead.')
  })

  it('tolerates a retired channel named in channels_disabled (loads, no dispatch)', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set(['gemini']))
    expect(names).not.toContain('gemini')
    expect(names).toContain('qwen')
  })


  it('flattens and dedupes comma-separated channel lists', () => {
    const names = resolveDispatchChannels(sampleChannels, ['qwen,deepseek', 'agy', 'antigravity,qwen'], new Set())
    expect(names).toEqual(['qwen', 'deepseek', 'antigravity'])
  })

  it('throws a validation error when an unconfigured channel is explicitly requested', () => {
    const unconfiguredChannels = {
      ...sampleChannels,
      unconfigured: { kind: 'subprocess' as const, enabled: false, abstract: false, flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
    }
    expect(() => resolveDispatchChannels(unconfiguredChannels, ['unconfigured'], new Set()))
      .toThrow('Channel "unconfigured" is not fully configured (missing command or kind: http)')
  })
})
