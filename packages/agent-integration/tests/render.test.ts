import { describe, it, expect } from 'vitest'
import {
  renderSkillMd,
  renderAgentsBlock,
  renderCursorMdc,
  agentsBlockBegin,
  agentsBlockEnd,
} from '../src/render.js'
import type { CanonicalSkill } from '../src/types.js'

const SKILL: CanonicalSkill = {
  name: 'mmr-review',
  description: 'Run multi-model code review. Use when asked to review a PR or diff.',
  body: '# MMR\n\n<!-- lean:start -->\nLean: run `mmr review`.\n<!-- lean:end -->\n\n## Details\n\nFull body.',
  lean: 'Lean: run `mmr review`.',
}

describe('renderSkillMd', () => {
  it('emits name + description frontmatter and the full body', () => {
    const out = renderSkillMd(SKILL)
    expect(out).toMatch(/^---\nname: mmr-review\ndescription: "Run multi-model code review/)
    expect(out).toContain('# MMR')
    expect(out).toContain('## Details')
    expect(out).toContain('Full body.')
  })

  it('strips the lean fence markers from the rendered SKILL.md', () => {
    const out = renderSkillMd(SKILL)
    expect(out).not.toContain('lean:start')
    expect(out).not.toContain('lean:end')
  })
})

describe('renderAgentsBlock', () => {
  it('wraps the lean body in a per-skill delimited block', () => {
    const out = renderAgentsBlock(SKILL)
    expect(out).toContain(agentsBlockBegin('mmr-review'))
    expect(out).toContain(agentsBlockEnd('mmr-review'))
    expect(out).toContain('Lean: run `mmr review`.')
    expect(out).not.toContain('Full body.')
  })

  it('gives each skill its own block name so blocks are independent', () => {
    expect(agentsBlockBegin('a')).not.toBe(agentsBlockBegin('b'))
  })
})

describe('renderCursorMdc', () => {
  it('emits description/globs/alwaysApply frontmatter and the lean body', () => {
    const out = renderCursorMdc(SKILL)
    expect(out).toContain('description: "Run multi-model code review')
    expect(out).toContain('globs:')
    expect(out).toContain('alwaysApply: false')
    expect(out).toContain('Lean: run `mmr review`.')
    expect(out).not.toContain('Full body.')
  })
})

describe('YAML safety', () => {
  it('double-quotes and escapes a description containing quotes and colons', () => {
    const s: CanonicalSkill = {
      name: 'x',
      description: 'Has a "quote" and a colon: here',
      body: 'b',
      lean: 'b',
    }
    const out = renderCursorMdc(s)
    expect(out).toContain('description: "Has a \\"quote\\" and a colon: here"')
  })
})
