import fs from 'node:fs'
import path from 'node:path'
import { resolveContainedArtifactPath } from '../utils/artifact-path.js'
import { fileExists } from '../utils/fs.js'

/**
 * Incumbent-artifact inventory (brownfield R3, D10b). Generalizes the R2
 * gate-seed parsing surface: one scan, consumed by map-candidate proposals,
 * the adoption plan, and the D7 gate component's ingestion-lite parser.
 */
export interface IncumbentInventory {
  lintConfigs: string[]
  testConfigs: string[]
  ciWorkflows: string[]
  composeFiles: string[]
  docs: string[]
}

const LINT_CONFIG_NAMES = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml',
  'eslint.config.js', 'eslint.config.mjs', 'biome.json', 'biome.jsonc',
  '.prettierrc', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js',
  'ruff.toml', '.ruff.toml', '.flake8', '.golangci.yml', 'rustfmt.toml', 'clippy.toml',
]

const TEST_CONFIG_NAMES = [
  'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts',
  'jest.config.js', 'jest.config.ts', 'playwright.config.ts', 'playwright.config.js',
  'pytest.ini', '.mocharc.json', 'karma.conf.js',
]

const COMPOSE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

const DOC_NAMES = [
  'CONTRIBUTING.md', 'ARCHITECTURE.md', 'SECURITY.md',
  'DEVELOPMENT.md', 'TESTING.md', 'STYLEGUIDE.md',
]

/**
 * True when `rel` resolves to an existing file that stays within
 * `projectRoot` — symlink escapes are rejected. Mirrors the
 * resolveContainedArtifactPath + fileExists pattern already used by
 * src/state/completion.ts for artifact_map lookups.
 */
function isContainedAndPresent(projectRoot: string, rel: string): boolean {
  const full = resolveContainedArtifactPath(projectRoot, rel)
  return full !== null && fileExists(full)
}

export function scanIncumbents(projectRoot: string): IncumbentInventory {
  const existing = (names: readonly string[], dir = ''): string[] =>
    names
      .map(n => (dir === '' ? n : path.join(dir, n)))
      .filter(rel => isContainedAndPresent(projectRoot, rel))

  const ciWorkflows: string[] = []
  const workflowsRel = path.join('.github', 'workflows')
  const workflowsDir = resolveContainedArtifactPath(projectRoot, workflowsRel)
  if (workflowsDir !== null) {
    try {
      for (const entry of fs.readdirSync(workflowsDir)) {
        if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
          ciWorkflows.push(path.join(workflowsRel, entry))
        }
      }
    } catch {
      // no workflows directory
    }
  }

  return {
    lintConfigs: existing(LINT_CONFIG_NAMES),
    testConfigs: existing(TEST_CONFIG_NAMES),
    ciWorkflows: ciWorkflows.sort(),
    composeFiles: [...existing(COMPOSE_NAMES), ...existing(COMPOSE_NAMES, path.join('ops', 'compose'))],
    docs: [...existing(DOC_NAMES), ...existing(DOC_NAMES, 'docs')],
  }
}
