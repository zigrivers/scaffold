import { describe, it, expect } from 'vitest'
import {
  renderSkillMd,
  renderAgentsBlock,
  renderCursorMdc,
  agentsBlockBegin,
  agentsBlockEnd,
} from '../src/render.js'
import { parseCanonicalSkill } from '../src/parse.js'
import type { CanonicalSkill } from '../src/types.js'

const SKILL: CanonicalSkill = {
  name: 'mmr-review',
  description: 'Run multi-model code review. Use when asked to review a PR or diff.',
  body: '# MMR\n\n<!-- lean:start -->\nLean: run `mmr review`.\n<!-- lean:end -->\n\n## Details\n\nFull body.',
  lean: 'Lean: run `mmr review`.',
  frontmatter: {},
}

// Build a minimal skill with a custom description (keeps the YAML-safety cases short).
const mk = (description: string): CanonicalSkill =>
  ({ name: 'x', description, body: 'b', lean: 'b', frontmatter: {} })

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

  it('passes through extra frontmatter fields (e.g. topics) and round-trips', () => {
    const skill: CanonicalSkill = {
      name: 'mmr',
      description: 'd',
      body: '# B\n\nbody',
      lean: 'body',
      frontmatter: { name: 'mmr', description: 'd', topics: ['code review', 'mmr'] },
    }
    const out = renderSkillMd(skill)
    expect(out).toContain('topics:')
    // round-trips: parsing the rendered SKILL.md recovers the topics
    expect(parseCanonicalSkill(out).frontmatter.topics).toEqual(['code review', 'mmr'])
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

  it('defaults alwaysApply to false when no options are passed', () => {
    const out = renderCursorMdc(SKILL, {})
    expect(out).toContain('alwaysApply: false')
  })

  it('emits alwaysApply: true when the skill opts in via options', () => {
    const out = renderCursorMdc(SKILL, { alwaysApply: true })
    expect(out).toContain('alwaysApply: true')
    expect(out).not.toContain('alwaysApply: false')
  })
})

describe('YAML safety', () => {
  it('double-quotes and escapes a description containing quotes and colons', () => {
    const s: CanonicalSkill = {
      name: 'x',
      description: 'Has a "quote" and a colon: here',
      body: 'b',
      lean: 'b',
      frontmatter: {},
    }
    const out = renderCursorMdc(s)
    expect(out).toContain('description: "Has a \\"quote\\" and a colon: here"')
  })

  it('quotes a YAML-ambiguous name so it round-trips as a string (not bool/null/number/date/hex)', () => {
    for (const name of ['true', 'false', 'null', 'no', '123', '2024-01-01', '0x1f']) {
      const out = renderSkillMd({ name, description: 'd', body: 'b', lean: 'b', frontmatter: {} })
      // the rendered frontmatter must parse back to the original string name
      expect(parseCanonicalSkill(out).name).toBe(name)
      // …and it must NOT be emitted as a bare unquoted scalar
      expect(out).not.toContain(`name: ${name}\n`)
    }
  })

  it('leaves a normal kebab name unquoted', () => {
    const out = renderSkillMd({ name: 'mmr-review', description: 'd', body: 'b', lean: 'b', frontmatter: {} })
    expect(out).toContain('name: mmr-review\n')
  })

  it('escapes other C0 control characters as \\xNN', () => {
    expect(renderSkillMd(mk(`a${String.fromCharCode(0)}b`))).toContain('description: "a\\x00b"')
  })

  it('escapes C1 control characters (U+0080–U+009F) as \\xNN', () => {
    expect(renderSkillMd(mk(`a${String.fromCharCode(0x85)}b`))).toContain('description: "a\\x85b"')
  })

  it('escapes Unicode line/paragraph separators (U+2028/U+2029) as \\uNNNN', () => {
    expect(renderSkillMd(mk(`a${String.fromCharCode(0x2028)}b`))).toContain('description: "a\\u2028b"')
  })

  it('escapes control characters (newline/tab/CR) so they cannot break the frontmatter', () => {
    const s: CanonicalSkill = {
      name: 'x',
      description: 'line one\nline two\twith tab',
      body: 'b',
      lean: 'b',
      frontmatter: {},
    }
    const out = renderSkillMd(s)
    expect(out).toContain('description: "line one\\nline two\\twith tab"')
    // the rendered frontmatter stays a single description line
    expect(out.split('\n').filter((l) => l.startsWith('description:'))).toHaveLength(1)
  })
})
