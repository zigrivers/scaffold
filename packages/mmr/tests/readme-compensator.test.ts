import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('README documents compensator-by-reference (T1-G)', () => {
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf-8')

  it('documents defaults.compensator with a channel reference', () => {
    expect(readme).toMatch(/defaults:[\s\S]*compensator:[\s\S]*channel:/)
  })

  it('mentions channel_focus_map', () => {
    expect(readme).toMatch(/channel_focus_map/)
  })

  it('documents the implicit claude -p default', () => {
    expect(readme).toMatch(/claude -p/i)
    expect(readme).toMatch(/(when|if).*compensator.*(unset|omitted|absent)/i)
  })

  it('includes a fully-OSS compensator recipe', () => {
    expect(readme).toMatch(/(use|configure).*local.*compensator/i)
    expect(readme).toMatch(/ollama|qwen|deepseek|lm studio/i)
  })
})
