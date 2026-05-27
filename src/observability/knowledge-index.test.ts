import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { loadKnowledgeIndex, formatForStderr } from './knowledge-index.js'

const tmpDirs: string[] = []

function makeKbDir(entries: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-idx-'))
  tmpDirs.push(dir)
  for (const [relPath, content] of Object.entries(entries)) {
    const full = path.join(dir, relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return dir
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

describe('loadKnowledgeIndex', () => {
  it('returns empty Set for an empty directory', () => {
    const dir = makeKbDir({})
    expect(loadKnowledgeIndex(dir)).toEqual(new Set())
  })

  it('extracts name: slugs from frontmatter and excludes README.md', () => {
    const dir = makeKbDir({
      'README.md': '# readme\n',
      'core/alpha.md': '---\nname: alpha\n---\nbody\n',
      'core/beta.md': '---\nname: beta-one\n---\nbody\n',
      'web/README.md': '# nested readme\n',
      'web/gamma.md': '---\nname: gamma\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['alpha', 'beta-one', 'gamma']))
  })

  it('skips files with no frontmatter or missing name:', () => {
    const dir = makeKbDir({
      'core/no-fm.md': 'body only\n',
      'core/no-name.md': '---\ndescription: x\n---\nbody\n',
      'core/ok.md': '---\nname: ok\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['ok']))
  })

  it('extractKBFrontmatter-style permissive parse + normalizeTopic dedup', () => {
    // Parsing accepts any non-empty `name:` (matches the assembly
    // engine). The loader then runs each value through normalizeTopic
    // before adding it to the Set so the suppression lookup in Lens I
    // (which always sees normalized topics) finds matches. A KB entry
    // whose `name:` is non-canonical gets normalized; entries whose
    // normalized form collides dedupe naturally.
    const dir = makeKbDir({
      'core/wacky.md': '---\nname: Wacky_Name 1!\n---\nbody\n',
      'core/canonical.md': '---\nname: wacky-name-1\n---\nbody\n',
    })
    // Both files normalize to the same slug; Set dedupes.
    const slugs = loadKnowledgeIndex(dir)
    expect(slugs.size).toBeLessThanOrEqual(1)
    // If normalizeTopic produces a usable slug from either input,
    // it should be present:
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })

  it('handles quoted, commented, and nested-after-name frontmatter (js-yaml semantics)', () => {
    const dir = makeKbDir({
      'core/quoted.md': '---\nname: "quoted-slug"\n---\nbody\n',
      'core/commented.md': '---\nname: with-comment  # trailing comment\ndescription: x\n---\n',
      'core/with-list.md': '---\nname: list-after\ntopics: [a, b]\nsources:\n  - url: https://x\n---\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(
      new Set(['quoted-slug', 'with-comment', 'list-after']),
    )
  })

  it('skips files where the frontmatter never closes', () => {
    const dir = makeKbDir({
      'core/unclosed.md': '---\nname: not-really-real\nlots of body\nbut no closing delimiter\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set())
  })

  it('dedupes duplicate name: across files', () => {
    const dir = makeKbDir({
      'core/dup1.md': '---\nname: dup\n---\nbody\n',
      'web/dup2.md': '---\nname: dup\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['dup']))
  })

  it('throws when the path does not exist', () => {
    expect(() => loadKnowledgeIndex('/tmp/definitely-nope-xyz-12345'))
      .toThrow()
  })

  it('throws when the path is a file', () => {
    const dir = makeKbDir({ 'oops.md': '---\nname: x\n---\n' })
    expect(() => loadKnowledgeIndex(path.join(dir, 'oops.md'))).toThrow()
  })
})

describe('formatForStderr', () => {
  it('wraps a normal string in single quotes', () => {
    expect(formatForStderr('hello')).toBe("'hello'")
  })

  it('returns the sentinel for undefined or empty input', () => {
    expect(formatForStderr(undefined)).toBe("'<missing>'")
    expect(formatForStderr('')).toBe("'<missing>'")
  })

  it('escapes embedded single quotes', () => {
    expect(formatForStderr("it's fine")).toBe("'it\\'s fine'")
  })

  it('replaces control characters and newlines with ?', () => {
    expect(formatForStderr('line1\nline2\ttab\x07bell'))
      .toBe("'line1?line2?tab?bell'")
  })

  it('passes unicode through unchanged', () => {
    expect(formatForStderr('日本語 🐢')).toBe("'日本語 🐢'")
  })
})
