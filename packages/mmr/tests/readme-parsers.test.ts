import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Documentation freshness check for the Task 8 README contract. Parser behavior
// itself is covered by parser and results-pipeline tests.
describe('README documents declarative parsers (T1-B)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf-8')

  it('documents the object form of output_parser', () => {
    expect(readme).toMatch(/output_parser:\s*\n\s+kind:\s*unwrap-jsonpath/i)
  })

  it('documents the regex-findings kind', () => {
    expect(readme).toMatch(/regex-findings/)
    expect(readme).toMatch(/fields:/)
  })

  it('includes an Ollama / OpenAI-chat envelope recipe', () => {
    expect(readme).toMatch(/ollama/i)
    expect(readme).toMatch(/\$\.choices\[0\]\.message\.content/)
  })
})
