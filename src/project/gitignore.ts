import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldWarning } from '../types/index.js'
import { atomicWriteFile } from '../utils/fs.js'

const GITIGNORE_FILE = '.gitignore'
const MANAGED_START = '# >>> scaffold managed'
const MANAGED_END = '# <<< scaffold managed'
const MANAGED_LINES = [
  '.scaffold/generated/',
  '.scaffold/lock.json',
  '.scaffold/*.tmp',
  '.scaffold/**/*.tmp',
]

const DANGEROUS_RULES = new Set([
  '.scaffold/',
  '.scaffold/*',
  '.scaffold/**',
])

export interface EnsureScaffoldGitignoreResult {
  created: boolean
  updated: boolean
  warnings: ScaffoldWarning[]
}

export function ensureScaffoldGitignore(projectRoot: string): EnsureScaffoldGitignoreResult {
  const gitignorePath = path.join(projectRoot, GITIGNORE_FILE)
  const existed = fs.existsSync(gitignorePath)
  const currentContent = existed ? fs.readFileSync(gitignorePath, 'utf8') : ''
  const warnings = findDangerousScaffoldRules(currentContent)
  const managedBlock = buildManagedBlock()
  const nextContent = upsertManagedBlock(currentContent, managedBlock)

  if (!existed || nextContent !== currentContent) {
    atomicWriteFile(gitignorePath, nextContent)
  }

  return {
    created: !existed,
    updated: !existed || nextContent !== currentContent,
    warnings,
  }
}

export function findLegacyGeneratedOutputs(projectRoot: string): string[] {
  const legacyOutputs: Array<{ relativePath: string; isDirectory?: boolean }> = [
    { relativePath: 'commands', isDirectory: true },
    { relativePath: 'prompts', isDirectory: true },
    { relativePath: 'codex-prompts', isDirectory: true },
  ]

  const found = legacyOutputs
    .filter(({ relativePath, isDirectory }) => {
      const fullPath = path.join(projectRoot, relativePath)
      if (!fs.existsSync(fullPath)) return false
      if (isDirectory === undefined) return true
      return isDirectory ? fs.statSync(fullPath).isDirectory() : fs.statSync(fullPath).isFile()
    })
    .map(({ relativePath, isDirectory }) => isDirectory ? `${relativePath}/` : relativePath)

  if (isLegacyGeneratedAgentsFile(path.join(projectRoot, 'AGENTS.md'))) {
    found.push('AGENTS.md')
  }

  return found
}

function buildManagedBlock(): string {
  return [
    MANAGED_START,
    ...MANAGED_LINES,
    MANAGED_END,
  ].join('\n')
}

function upsertManagedBlock(content: string, managedBlock: string): string {
  const normalized = content.replace(/\r\n/g, '\n')
  const blockPattern = new RegExp(`${escapeRegex(MANAGED_START)}[\\s\\S]*?${escapeRegex(MANAGED_END)}\\n?`, 'm')

  if (blockPattern.test(normalized)) {
    return normalized.replace(blockPattern, `${managedBlock}\n`)
  }

  if (normalized.length === 0) {
    return `${managedBlock}\n`
  }

  return normalized.endsWith('\n')
    ? `${normalized}\n${managedBlock}\n`
    : `${normalized}\n\n${managedBlock}\n`
}

function findDangerousScaffoldRules(content: string): ScaffoldWarning[] {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .filter(line => DANGEROUS_RULES.has(line))
    .map((line) => ({
      code: 'GITIGNORE_SCAFFOLD_STATE_HIDDEN',
      message: `User .gitignore rule '${line}' hides committed Scaffold state. Remove it manually.`,
      context: { rule: line },
    }))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isLegacyGeneratedAgentsFile(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false

  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return (
      content.includes('# Scaffold Pipeline')
      || content.includes('Run each step using: `scaffold run <step-slug>`')
    )
  } catch {
    return false
  }
}
