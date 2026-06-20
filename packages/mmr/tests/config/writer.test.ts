import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setChannelEnabled, setConfigValue, coerceScalar } from '../../src/config/writer.js'

describe('config writer', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-writer-'))
    file = path.join(dir, '.mmr.yaml')
  })
  afterEach(() => fs.rmSync(dir, { recursive: true }))

  it('disables a channel while preserving comments and key order', () => {
    fs.writeFileSync(file, [
      'version: 1',
      'channels:',
      '  grok:',
      '    # second-opinion reviewer',
      '    enabled: true',
    ].join('\n') + '\n')
    setChannelEnabled(file, 'grok', false)
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).toContain('# second-opinion reviewer')
    expect(out).toMatch(/grok:[\s\S]*enabled: false/)
  })

  it('coerces string values to typed scalars', () => {
    expect(coerceScalar('false')).toBe(false)
    expect(coerceScalar('true')).toBe(true)
    expect(coerceScalar('300')).toBe(300)
    expect(coerceScalar('P1')).toBe('P1')
  })

  it('writes a typed boolean, not the string "false"', () => {
    fs.writeFileSync(file, 'version: 1\n')
    setConfigValue(file, 'channels.grok.enabled', 'false')
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).toMatch(/enabled: false\b/)
    expect(out).not.toContain('"false"')
  })

  it('creates the file when missing and create is implied', () => {
    setConfigValue(file, 'channels.codex.enabled', 'true')
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toMatch(/enabled: true/)
  })

  it('refuses multi-document files', () => {
    fs.writeFileSync(file, 'version: 1\n---\nversion: 2\n')
    expect(() => setConfigValue(file, 'a.b', '1')).toThrow(/multi-document/)
  })

  it('accepts a single document that begins with a --- marker', () => {
    fs.writeFileSync(file, '---\nversion: 1\nchannels:\n  grok:\n    enabled: true\n')
    expect(() => setChannelEnabled(file, 'grok', false)).not.toThrow()
    expect(fs.readFileSync(file, 'utf-8')).toMatch(/enabled: false/)
  })

  it('prunes a channel from channels_disabled when enabling', () => {
    fs.writeFileSync(file, 'version: 1\nchannels_disabled:\n  - grok\n  - gemini\n')
    setChannelEnabled(file, 'grok', true)
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).not.toMatch(/-\s*grok/)
    expect(out).toMatch(/-\s*gemini/)
  })

  it('prunes an alias entry when enabling the canonical channel', () => {
    fs.writeFileSync(file, 'version: 1\nchannels_disabled:\n  - agy\n  - gemini\n')
    setChannelEnabled(file, 'antigravity', true)
    const out = fs.readFileSync(file, 'utf-8')
    expect(out).not.toMatch(/-\s*agy/)
    expect(out).toMatch(/-\s*gemini/)
  })

  it('leaves no temp file behind after an atomic write', () => {
    fs.writeFileSync(file, 'version: 1\n')
    setChannelEnabled(file, 'codex', false)
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'))
    expect(leftovers).toEqual([])
  })

  it('treats a channel name containing a dot as a single key', () => {
    fs.writeFileSync(file, 'version: 1\n')
    setChannelEnabled(file, 'my-bot.v2', false)
    const out = fs.readFileSync(file, 'utf-8')
    // The dotted name is one key under channels, not nested maps.
    expect(out).toMatch(/['"]?my-bot\.v2['"]?:/)
    expect(out).not.toMatch(/my-bot:\s*\n\s+v2:/)
  })
})
