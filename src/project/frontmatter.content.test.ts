import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseAndValidate } from './frontmatter.js'

const PIPELINE_DIR = path.join(process.cwd(), 'content', 'pipeline')

function allPipelineFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...allPipelineFiles(full))
    else if (entry.name.endsWith('.md')) files.push(full)
  }
  return files
}

describe('shipped pipeline frontmatter (detect: rollout, D4)', () => {
  it('every pipeline file parses with zero errors', () => {
    for (const file of allPipelineFiles(PIPELINE_DIR)) {
      const { errors } = parseAndValidate(file)
      expect(errors, `frontmatter errors in ${file}`).toEqual([])
    }
  })

  it('the eight rollout steps carry their exact detect contracts', () => {
    const expectations: Record<string, unknown> = {
      'foundation/beads.md': { all: [{ path: '.beads/' }, { cmd: 'bd info' }] },
      'foundation/github-setup.md': { all: [{ cmd: 'git remote get-url origin' }] },
      'foundation/tdd.md': { all: [{ path: 'docs/tdd-standards.md' }] },
      'environment/git-workflow.md': {
        all: [{ path: 'docs/git-workflow.md' }, { path: 'scripts/setup-agent-worktree.sh' }],
      },
      'environment/merge-throughput.md': { all: [{ path: 'docs/merge-queue.md' }] },
      'environment/ai-memory-setup.md': { any: [{ path: '.claude/rules/' }, { path: 'docs/ai-memory-setup.md' }] },
      'environment/dev-env-setup.md': { all: [{ path: 'docs/dev-setup.md' }] },
      'integration/add-e2e-testing.md': {
        any: [{ path: 'playwright.config.ts' }, { path: 'playwright.config.js' }, { path: 'maestro/' }],
      },
    }
    for (const [rel, expected] of Object.entries(expectations)) {
      const { frontmatter, errors } = parseAndValidate(path.join(PIPELINE_DIR, rel))
      expect(errors, rel).toEqual([])
      expect(frontmatter.detect, rel).toEqual(expected)
    }
  })
})
