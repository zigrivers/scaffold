import { describe, it, expect } from 'vitest'
import { parseCanonicalSkill } from '../src/parse.js'

const VALID = `---
name: mmr-review
description: Run multi-model code review. Use when asked to review a PR/diff.
---

# MMR — Multi-Model Code Review

<!-- lean:start -->
Use \`mmr review --pr <n> --sync --format json\` to review a PR.
<!-- lean:end -->

## Details

Full progressive-disclosure body with lots of detail here.
`

describe('parseCanonicalSkill', () => {
  it('extracts name, description, and body', () => {
    const s = parseCanonicalSkill(VALID)
    expect(s.name).toBe('mmr-review')
    expect(s.description).toContain('Run multi-model code review')
    expect(s.body).toContain('# MMR — Multi-Model Code Review')
    expect(s.body).toContain('## Details')
  })

  it('takes the lean form from the lean fence when present', () => {
    const s = parseCanonicalSkill(VALID)
    expect(s.lean).toBe('Use `mmr review --pr <n> --sync --format json` to review a PR.')
  })

  it('falls back to the intro (before the first ## heading) when no lean fence', () => {
    const md = `---
name: x
description: d
---

# Title

Intro paragraph.

## Section

Deep content.
`
    const s = parseCanonicalSkill(md)
    expect(s.lean).toBe('# Title\n\nIntro paragraph.')
    expect(s.lean).not.toContain('Deep content')
  })

  it('falls back to the full body when there is no fence and no ## heading', () => {
    const md = `---
name: x
description: d
---

Just a body, no headings.
`
    const s = parseCanonicalSkill(md)
    expect(s.lean).toBe('Just a body, no headings.')
  })

  it('strips quotes from a quoted description', () => {
    const md = '---\nname: x\ndescription: "quoted: value"\n---\n\nbody\n'
    expect(parseCanonicalSkill(md).description).toBe('quoted: value')
  })

  it('throws when the frontmatter block is missing', () => {
    expect(() => parseCanonicalSkill('# no frontmatter\n')).toThrow(/frontmatter/i)
  })

  it('throws when name is missing', () => {
    expect(() => parseCanonicalSkill('---\ndescription: d\n---\n\nbody\n')).toThrow(/name/)
  })

  it('throws when description is missing', () => {
    expect(() => parseCanonicalSkill('---\nname: x\n---\n\nbody\n')).toThrow(/description/)
  })

  it('parses a YAML block-scalar description (real YAML, not line-splitting)', () => {
    const md = '---\nname: x\ndescription: >-\n  first line\n  second line\n---\n\nbody\n'
    expect(parseCanonicalSkill(md).description).toBe('first line second line')
  })

  it('parses a double-quoted description with an escaped backslash', () => {
    const md = '---\nname: x\ndescription: "a \\\\ b"\n---\n\nbody\n'
    expect(parseCanonicalSkill(md).description).toBe('a \\ b')
  })

  it('tolerates trailing whitespace after the --- delimiters', () => {
    const md = '---  \nname: x\ndescription: d\n---  \n\nbody\n'
    expect(parseCanonicalSkill(md).name).toBe('x')
  })

  it('throws on a lean fence opened but never closed', () => {
    const md = '---\nname: x\ndescription: d\n---\n\nbody <!-- lean:start --> oops\n'
    expect(() => parseCanonicalSkill(md)).toThrow(/lean:end/)
  })

  it('tolerates CRLF line endings', () => {
    const s = parseCanonicalSkill('---\r\nname: x\r\ndescription: d\r\n---\r\n\r\nbody\r\n')
    expect(s.name).toBe('x')
    expect(s.body).toBe('body')
  })
})
