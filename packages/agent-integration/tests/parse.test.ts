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

  it('rejects a name that is not kebab-case (could break the AGENTS.md markers)', () => {
    expect(() => parseCanonicalSkill('---\nname: Bad_Name\ndescription: d\n---\n\nb\n')).toThrow(/kebab/)
    expect(() => parseCanonicalSkill('---\nname: x-->y\ndescription: d\n---\n\nb\n')).toThrow(/kebab/)
  })

  it('strips a leading UTF-8 BOM before matching the frontmatter', () => {
    const md = String.fromCharCode(0xFEFF) + '---\nname: x\ndescription: d\n---\n\nbody\n'
    expect(md.charCodeAt(0)).toBe(0xFEFF) // the input really does start with a BOM
    expect(parseCanonicalSkill(md).name).toBe('x')
  })

  it('stops the intro at the first level-3 heading when there is no level-2', () => {
    const md = '---\nname: x\ndescription: d\n---\n\n# Title\n\nIntro.\n\n### Subsection\n\nDeep.\n'
    const lean = parseCanonicalSkill(md).lean
    expect(lean).toContain('Intro.')
    expect(lean).not.toContain('Deep.')
  })

  it('does not let a 3-backtick line close a 4-backtick block (nested fence)', () => {
    const md = [
      '---', 'name: x', 'description: d', '---', '',
      '# Title', '', 'Intro.', '',
      '````markdown', 'example with an inner fence:', '```', '## not a heading', '```', '````', '',
      '## Real Section', '', 'Deep.', '',
    ].join('\n')
    const lean = parseCanonicalSkill(md).lean
    expect(lean).toContain('Intro.')
    expect(lean).toContain('## not a heading')
    expect(lean).not.toContain('Deep.')
  })

  it('returns the full body when it opens with a heading (no intro to extract)', () => {
    const md = '---\nname: x\ndescription: d\n---\n\n## Section\n\nBody.\n'
    expect(parseCanonicalSkill(md).lean).toBe('## Section\n\nBody.')
  })

  it('does not treat a "## " line inside a code block as the intro boundary', () => {
    const md = [
      '---', 'name: x', 'description: d', '---', '',
      '# Title', '', 'Intro before code.', '',
      '```bash', '## this is a shell comment, not a heading', 'echo hi', '```', '',
      '## Real Section', '', 'Deep content.', '',
    ].join('\n')
    const lean = parseCanonicalSkill(md).lean
    expect(lean).toContain('Intro before code.')
    expect(lean).toContain('## this is a shell comment')
    expect(lean).not.toContain('Deep content')
  })

  it('does not treat a "---trailing" line as the closing frontmatter delimiter', () => {
    const md = '---\nname: x\ndescription: d\n---\n\n---notadelimiter here\nbody\n'
    const s = parseCanonicalSkill(md)
    expect(s.name).toBe('x')
    expect(s.body).toContain('---notadelimiter here')
  })

  it('recognizes an empty ATX heading ("##" with no text) as a section boundary', () => {
    const md = '---\nname: x\ndescription: d\n---\n\n# T\n\nIntro.\n\n##\n\nDeep.\n'
    const lean = parseCanonicalSkill(md).lean
    expect(lean).toContain('Intro.')
    expect(lean).not.toContain('Deep.')
  })

  it('tolerates CRLF line endings', () => {
    const s = parseCanonicalSkill('---\r\nname: x\r\ndescription: d\r\n---\r\n\r\nbody\r\n')
    expect(s.name).toBe('x')
    expect(s.body).toBe('body')
  })
})
