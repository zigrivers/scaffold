import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
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

import { findScaffoldKnowledgeRoot } from './knowledge-index.js'

describe('findScaffoldKnowledgeRoot', () => {
  it('returns null when no scaffold install lives above the start dir', () => {
    const dir = makeKbDir({})  // empty dir under os.tmpdir(); no package.json above it
    expect(findScaffoldKnowledgeRoot(dir)).toBeNull()
  })

  it('matches a parent whose package.json names @zigrivers/scaffold', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold', version: '0.0.0' }),
      'content/knowledge/README.md': '# readme\n',
      'content/knowledge/core/x.md': '---\nname: x\n---\n',
      'src/somewhere/cli.js': '// running module\n',
    })
    const start = path.join(root, 'src', 'somewhere')
    const result = findScaffoldKnowledgeRoot(start)
    expect(result).toBe(path.join(root, 'content', 'knowledge'))
  })

  it('does NOT match a parent whose package.json names something else', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: 'some-other-project', version: '1.0' }),
      'content/knowledge/core/x.md': '---\nname: x\n---\n',
      'src/cli.js': '',
    })
    const start = path.join(root, 'src')
    expect(findScaffoldKnowledgeRoot(start)).toBeNull()
  })

  it('does NOT match a parent that lacks content/knowledge/', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'src/cli.js': '',
    })
    const start = path.join(root, 'src')
    expect(findScaffoldKnowledgeRoot(start)).toBeNull()
  })

  it('walks up multiple parents (npm-global-style nesting)', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'content/knowledge/x.md': '---\nname: x\n---\n',
      'lib/node_modules/inner/dist/cli.js': '',
    })
    const start = path.join(root, 'lib', 'node_modules', 'inner', 'dist')
    expect(findScaffoldKnowledgeRoot(start)).toBe(path.join(root, 'content', 'knowledge'))
  })
})

import { validateKnowledgeRoot } from './knowledge-index.js'

describe('validateKnowledgeRoot', () => {
  it('fails when the path does not exist', () => {
    const result = validateKnowledgeRoot('/tmp/definitely-nope-xyz-99999')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/does not exist/i)
  })

  it('fails when the path is a file', () => {
    const dir = makeKbDir({ 'VERSION': '0.1.0\n' })
    const result = validateKnowledgeRoot(path.join(dir, 'VERSION'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/not a directory/i)
  })

  it('fails when VERSION marker is missing', () => {
    const dir = makeKbDir({ 'core/x.md': '---\nname: x\n---\n' })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/VERSION marker/i)
  })

  it('passes with VERSION marker and entries', () => {
    const dir = makeKbDir({
      'VERSION': '0.1.0\n',
      'core/x.md': '---\nname: x\n---\n',
      'web/y.md': '---\nname: y\n---\n',
    })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.index).toEqual(new Set(['x', 'y']))
  })

  it('passes with VERSION marker but EMPTY tree (freshly initialized KB)', () => {
    const dir = makeKbDir({ 'VERSION': '0.1.0\n' })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.index).toEqual(new Set())
  })

  it('fails for an enclosing dir of the KB (e.g. content/)', () => {
    // Simulates `--knowledge-root <repo>/content` — the recursive walk
    // would find <repo>/content/knowledge/core/*.md, but VERSION lives
    // ONLY at <repo>/content/knowledge/VERSION, not at <repo>/content/.
    const root = makeKbDir({
      'knowledge/VERSION': '0.1.0\n',
      'knowledge/core/x.md': '---\nname: x\n---\n',
      'tools/some-tool.md': '---\nname: some-tool\n---\n',
    })
    const result = validateKnowledgeRoot(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/VERSION marker/i)
  })
})

import { emitOnceForAudit } from './knowledge-index.js'

describe('emitOnceForAudit', () => {
  let stderrOutput: string
  let originalWrite: typeof process.stderr.write

  beforeEach(() => {
    stderrOutput = ''
    originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrOutput += typeof chunk === 'string' ? chunk : chunk.toString()
      return true
    }
  })
  afterEach(() => {
    process.stderr.write = originalWrite
  })

  it('writes to stderr on first call for a key', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'hello\n')
    expect(stderrOutput).toBe('hello\n')
    expect(set.has('key-a')).toBe(true)
  })

  it('does NOT write on second call with the same key + set', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'first\n')
    emitOnceForAudit(set, 'key-a', 'second\n')
    expect(stderrOutput).toBe('first\n')
  })

  it('writes again for a different key on the same set', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'first\n')
    emitOnceForAudit(set, 'key-b', 'second\n')
    expect(stderrOutput).toBe('first\nsecond\n')
  })

  it('writes again when a different (fresh) Set is passed', () => {
    const setA = new Set<string>()
    const setB = new Set<string>()
    emitOnceForAudit(setA, 'key-a', 'first\n')
    emitOnceForAudit(setB, 'key-a', 'second\n')
    expect(stderrOutput).toBe('first\nsecond\n')
  })
})

import {
  resolveKnowledgeRoot,
  KnowledgeRootCliInvalidError,
} from './knowledge-index.js'

describe('resolveKnowledgeRoot', () => {
  function makeValidKb(): string {
    return makeKbDir({
      'VERSION': '0.1.0\n',
      'core/x.md': '---\nname: x\n---\n',
    })
  }

  it('returns null with attempts.auto-detect=not-found when no input matches', () => {
    const cwd = makeKbDir({})  // no yaml file, no scaffold install above
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBeNull()
    expect(result.index).toBeNull()
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('not-found')
  })

  it('returns the CLI override path when valid', () => {
    const kb = makeValidKb()
    const cwd = makeKbDir({})
    const result = resolveKnowledgeRoot({ override: kb, cwd })
    expect(result.root).toBe(kb)
    expect(result.index?.has('x')).toBe(true)
    const cliAttempt = result.attempts.find(a => a.source === 'cli')
    expect(cliAttempt?.outcome).toBe('used')
  })

  it('throws KnowledgeRootCliInvalidError when override is invalid', () => {
    const cwd = makeKbDir({})
    expect(() =>
      resolveKnowledgeRoot({ override: '/tmp/definitely-nope-99999', cwd })
    ).toThrow(KnowledgeRootCliInvalidError)
  })

  it('reads yaml tier when no override and yaml is present and valid', () => {
    const kb = makeValidKb()
    const cwd = makeKbDir({
      '.scaffold/observability.yaml':
        `lenses:\n  I-knowledge-gaps:\n    knowledge_root: ${kb}\n`,
    })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBe(kb)
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('used')
  })

  it('falls through to auto-detect when yaml path is invalid', () => {
    const cwd = makeKbDir({
      '.scaffold/observability.yaml':
        `lenses:\n  I-knowledge-gaps:\n    knowledge_root: /tmp/bogus-99999\n`,
    })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBeNull()
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('invalid')
    expect(yamlAttempt?.reason).toMatch(/path does not exist/i)
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('not-found')
  })

  it('records yaml as not-provided when cwd is omitted', () => {
    const result = resolveKnowledgeRoot({})
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('not-provided')
  })

  it('auto-detects when scaffold install is above cwd', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'content/knowledge/VERSION': '0.1.0\n',
      'content/knowledge/x.md': '---\nname: x\n---\n',
    })
    const cwd = path.join(root, 'src')
    fs.mkdirSync(cwd, { recursive: true })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBe(path.join(root, 'content', 'knowledge'))
    expect(result.index?.has('x')).toBe(true)
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('used')
  })
})
