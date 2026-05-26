import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config/loader.js'
import { resolveCompensatorDispatch } from '../src/core/compensator.js'

describe('README documents compensator-by-reference (T1-G)', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf-8')

  function yamlBlockContaining(text: string): string {
    const blocks = [...readme.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1])
    const block = blocks.find((candidate) => candidate.includes(text))
    expect(block).toBeDefined()
    return block!
  }

  it('documents defaults.compensator with a channel reference', () => {
    const block = yamlBlockContaining('channel_focus_map:')
    expect(block).toContain('defaults:')
    expect(block).toContain('compensator:')
    expect(block).toContain('channel: qwen-local')
  })

  it('mentions channel_focus_map', () => {
    const block = yamlBlockContaining('channel_focus_map:')
    expect(block).toContain('codex: |')
    expect(block).toContain('gemini: |')
  })

  it('documents the implicit claude -p default', () => {
    expect(readme).toMatch(/claude -p/i)
    expect(readme).toMatch(/(when|if).*compensator.*(unset|omitted|absent)/i)
  })

  it('includes a fully-OSS compensator recipe', () => {
    const block = yamlBlockContaining('channel: qwen-coder')
    expect(block).toContain('command: ollama')
    expect(block).toContain('output_parser: default')
    expect(block).toContain('qwen-coder:')
    expect(block).toContain('flags: ["run", "qwen2.5-coder:32b", "--format", "json"]')
  })
})

describe('README compensator examples match loader and dispatch behavior', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-readme-compensator-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('rejects a documented compensator reference to an abstract template', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), `
version: 1
defaults:
  compensator:
    channel: ollama-base
channels:
  ollama-base:
    abstract: true
    command: ollama
`)

    expect(() =>
      loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') }),
    ).toThrow(/abstract|template|non-dispatchable/i)
  })

  it('dispatches the documented local compensator channel instead of the implicit claude fallback', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), `
version: 1
defaults:
  compensator:
    channel: qwen-coder
channels:
  ollama-base:
    abstract: true
    command: ollama
    output_parser: default
  qwen-coder:
    extends: ollama-base
    flags: ["run", "qwen2.5-coder:32b", "--format", "json"]
`)

    const config = loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') })
    const dispatch = resolveCompensatorDispatch(config)
    expect(dispatch.command).toBe('ollama')
    expect(dispatch.flags).toEqual(['run', 'qwen2.5-coder:32b', '--format', 'json'])
    expect(dispatch.output_parser).toBe('default')
  })
})
