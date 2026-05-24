import { describe, it, expect } from 'vitest'
import { OSS_RUNTIMES, exampleBlockFor } from '../../src/core/oss-examples.js'

describe('OSS_RUNTIMES catalog (T1-D)', () => {
  it('lists ollama, lms, llama-server, and local-ai-delegate', () => {
    const names = OSS_RUNTIMES.map((r) => r.id).sort()
    expect(names).toEqual(['llama-server', 'lms', 'local-ai-delegate', 'ollama'])
  })

  it('ollama probe runs `ollama list`', () => {
    const ollama = OSS_RUNTIMES.find((r) => r.id === 'ollama')
    expect(ollama).toBeDefined()
    expect(ollama?.probe.command).toBe('ollama')
    expect(ollama?.probe.args).toEqual(['list'])
  })

  it('each runtime has a 1000ms timeout per the design doc', () => {
    for (const r of OSS_RUNTIMES) {
      expect(r.probe.timeoutMs).toBe(1000)
    }
  })

  it('exampleBlockFor("ollama") produces a commented YAML block', () => {
    const block = exampleBlockFor('ollama')
    expect(block).toMatch(/^# example: ollama/m)
    expect(block).toMatch(/#\s+command: ollama run/m)
    expect(block).toMatch(/#\s+abstract: true/m)
  })

  it('exampleBlockFor returns examples for HTTP-only runtimes as commented-out stubs', () => {
    const lms = exampleBlockFor('lms')
    expect(lms).toMatch(/^# example: lms/m)
    expect(lms).toMatch(/v3\.30/i)
    const llama = exampleBlockFor('llama-server')
    expect(llama).toMatch(/^# example: llama-server/m)
    expect(llama).toMatch(/v3\.30/i)
  })
})
