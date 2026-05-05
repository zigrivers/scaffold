import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import type { Test } from '../types.js'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.scaffold', '.beads', '.mmr', 'coverage'])

interface DiscoveryRule {
  framework: Test['framework']
  fileMatcher: (filename: string) => boolean
  extractTestNames: (content: string) => string[]
}

const RULES: DiscoveryRule[] = [
  {
    framework: 'vitest',
    fileMatcher: (f) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f),
    extractTestNames: (c) => Array.from(c.matchAll(/\b(?:it|test)\s*\(\s*['"`](.+?)['"`]/g), (m) => m[1]),
  },
  {
    framework: 'jest',
    fileMatcher: (f) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f),
    extractTestNames: (c) => Array.from(c.matchAll(/\b(?:it|test)\s*\(\s*['"`](.+?)['"`]/g), (m) => m[1]),
  },
  {
    framework: 'pytest',
    fileMatcher: (f) => /^test_.+\.py$/.test(f) || /_test\.py$/.test(f),
    extractTestNames: (c) => Array.from(c.matchAll(/^def\s+(test_[\w]+)\s*\(/gm), (m) => m[1]),
  },
  {
    framework: 'go-test',
    fileMatcher: (f) => /_test\.go$/.test(f),
    extractTestNames: (c) => Array.from(c.matchAll(/^func\s+(Test[\w]+)\s*\(/gm), (m) => m[1]),
  },
]

function chooseRule(cwd: string, file: string): DiscoveryRule | null {
  const candidates = RULES.filter((r) => r.fileMatcher(file))
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const scripts = JSON.stringify(pkg.scripts ?? {})
    if (/\bvitest\b/.test(scripts)) return candidates.find((r) => r.framework === 'vitest') ?? candidates[0]
    if (/\bjest\b/.test(scripts)) return candidates.find((r) => r.framework === 'jest') ?? candidates[0]
  } catch { /* ignore */ }
  return candidates[0]
}

function* walk(dir: string, base: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const abs = join(dir, entry)
    let s
    try { s = statSync(abs) } catch { continue }
    if (s.isDirectory()) {
      yield* walk(abs, base)
    } else if (s.isFile()) {
      yield relative(base, abs).split(sep).join('/')
    }
  }
}

export async function discoverTests(cwd: string): Promise<Test[]> {
  const out: Test[] = []
  if (!existsSync(cwd)) return out

  for (const rel of walk(cwd, cwd)) {
    const filename = rel.split('/').pop() ?? ''
    const rule = chooseRule(cwd, filename)
    if (!rule) continue
    let content: string
    try { content = readFileSync(join(cwd, rel), 'utf8') } catch { continue }
    for (const name of rule.extractTestNames(content)) {
      const idHash = createHash('sha256').update(`${rel}::${name}`).digest('hex').slice(0, 12)
      out.push({
        id: `test:${rel}::${idHash}`,
        name,
        file_path: rel,
        framework: rule.framework,
      })
    }
  }
  return out
}
