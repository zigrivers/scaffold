import fs from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from '../utils/fs.js'

const GEMINI_MD_FILE = 'GEMINI.md'
const MANAGED_START = '<!-- >>> scaffold managed -->'
const MANAGED_END = '<!-- <<< scaffold managed -->'
const MANAGED_IMPORTS = [
  '@./.agents/skills/scaffold-runner/SKILL.md',
  '@./.agents/skills/scaffold-pipeline/SKILL.md',
]

export class GeminiMdManager {
  private geminiMdPath: string

  constructor(projectRoot: string) {
    this.geminiMdPath = path.join(projectRoot, GEMINI_MD_FILE)
  }

  syncManagedBlock(): void {
    const currentContent = fs.existsSync(this.geminiMdPath)
      ? fs.readFileSync(this.geminiMdPath, 'utf8')
      : ''

    const nextContent = renderManagedContent(currentContent)
    if (nextContent === currentContent) return

    fs.mkdirSync(path.dirname(this.geminiMdPath), { recursive: true })
    atomicWriteFile(this.geminiMdPath, nextContent)
  }
}

export function renderManagedContent(existingContent: string): string {
  return upsertManagedBlock(existingContent, buildManagedBlock())
}

function buildManagedBlock(): string {
  return [
    MANAGED_START,
    ...MANAGED_IMPORTS,
    MANAGED_END,
  ].join('\n')
}

function upsertManagedBlock(content: string, managedBlock: string): string {
  const normalized = content.replace(/\r\n/g, '\n')
  const blockPattern = new RegExp(`${escapeRegex(MANAGED_START)}[\\s\\S]*?${escapeRegex(MANAGED_END)}\\n?`, 'gm')
  let keptFirstBlock = false

  if (blockPattern.test(normalized)) {
    return normalized.replace(blockPattern, () => {
      if (keptFirstBlock) return ''
      keptFirstBlock = true
      return `${managedBlock}\n`
    })
  }

  if (normalized.length === 0) {
    return `${managedBlock}\n`
  }

  return normalized.endsWith('\n')
    ? `${normalized}\n${managedBlock}\n`
    : `${normalized}\n\n${managedBlock}\n`
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
