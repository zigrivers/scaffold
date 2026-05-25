import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('README v3.28 documentation', () => {
  const readme = fs.readFileSync(
    path.join(__dirname, '..', 'README.md'),
    'utf-8',
  )

  it('documents channel extends:', () => {
    expect(readme).toMatch(/extends:/)
    expect(readme).toMatch(/abstract:/)
  })

  it('documents mmr config init --with-examples', () => {
    expect(readme).toMatch(/--with-examples/)
  })

  it('documents mmr config channels show', () => {
    expect(readme).toMatch(/mmr config channels show claude/)
  })

  it('documents mmr review --dry-run', () => {
    expect(readme).toMatch(/--dry-run/)
  })

  it('includes a local-model example using ollama run', () => {
    expect(readme).toMatch(/ollama run/)
  })
})
