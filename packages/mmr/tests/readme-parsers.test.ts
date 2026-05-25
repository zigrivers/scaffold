import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Documentation freshness check for the Task 8 README contract. Parser behavior
// itself is covered by parser and results-pipeline tests.
describe('README documents declarative parsers (T1-B)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf-8')

  function yamlBlockContaining(text: string): string {
    const blocks = [...readme.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => match[1])
    const block = blocks.find((candidate) => candidate.includes(text))
    expect(block).toBeDefined()
    return block!
  }

  it('documents the object form of output_parser', () => {
    const block = yamlBlockContaining('qwen-local:')
    expect(block).toContain('output_parser:')
    expect(block).toContain('kind: unwrap-jsonpath')
  })

  it('documents the regex-findings kind', () => {
    const block = yamlBlockContaining('my-linter:')
    expect(block).toContain('kind: regex-findings')
    expect(block).toContain('fields:')
  })

  it('includes an Ollama / OpenAI-chat envelope recipe', () => {
    const block = yamlBlockContaining('scripts/ollama-openai-chat.sh')
    expect(block).toContain('/v1/chat/completions')
    expect(block).toContain('$.choices[0].message.content')
  })
})
